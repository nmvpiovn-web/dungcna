import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '../../../lib/server/auth.js';
import { getAllClassSessions, saveClassSession, deleteClassSession, assignStudentsToClassSession } from '../../../lib/unifiedStore.js';

export const prerender = false;

function formatSessionRow(row) {
  if (!row) return null;
  let studentIds = [];
  try {
    studentIds = typeof row.student_ids === 'string' ? JSON.parse(row.student_ids || '[]') : (row.student_ids || []);
  } catch {
    studentIds = [];
  }
  return {
    ...row,
    student_ids: studentIds
  };
}

export async function GET({ url, request, platform }) {
  // 1. Strict Server Authentication
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập tài khoản hợp lệ'
    }, { status: auth.status || 401 });
  }

  try {
    const classId = url.searchParams.get('class_id');
    const teacherId = url.searchParams.get('teacher_id');

    if (platform?.env?.DB) {
      let query = 'SELECT cs.* FROM class_sessions cs WHERE 1=1';
      const params = [];
      const role = String(auth.user.role || '').toLowerCase();

      // Resource scope is enforced on the server. Query parameters may narrow a
      // result set, but never widen the sessions visible to the signed-in user.
      if (!isManager(auth.user)) {
        if (role === 'teacher') {
          query += ' AND (cs.teacher_id = ? OR cs.assistant_teacher_id = ? OR cs.substitute_teacher_id = ?)';
          params.push(auth.user.id, auth.user.id, auth.user.id);
        } else if (role === 'student') {
          query += ` AND (
            cs.class_id IN (
              SELECT class_id FROM class_enrollments
              WHERE user_id = ? AND status = 'active'
            )
            OR EXISTS (
              SELECT 1 FROM json_each(CASE WHEN json_valid(cs.student_ids) THEN cs.student_ids ELSE '[]' END)
              WHERE value = ?
            )
          )`;
          params.push(auth.user.id, auth.user.id);
        } else if (role === 'parent') {
          query += ` AND (
            cs.class_id IN (
              SELECT ce.class_id
              FROM class_enrollments ce
              JOIN parent_student_links psl ON psl.student_user_id = ce.user_id
              WHERE psl.parent_user_id = ?
                AND psl.verification_status = 'verified'
                AND ce.status = 'active'
            )
            OR EXISTS (
              SELECT 1
              FROM json_each(CASE WHEN json_valid(cs.student_ids) THEN cs.student_ids ELSE '[]' END) ids
              JOIN parent_student_links psl ON psl.student_user_id = ids.value
              WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
            )
          )`;
          params.push(auth.user.id, auth.user.id);
        } else {
          return json({ success: false, error: 'Forbidden: Vai trò này không có quyền xem thời khóa biểu' }, { status: 403 });
        }
      }
      if (classId) {
        query += ' AND cs.class_id = ?';
        params.push(classId);
      }
      if (teacherId) {
        query += ' AND (cs.teacher_id = ? OR cs.assistant_teacher_id = ? OR cs.substitute_teacher_id = ?)';
        params.push(teacherId, teacherId, teacherId);
      }
      query += ' ORDER BY cs.session_date DESC, cs.start_time ASC';

      const d1Res = await platform.env.DB.prepare(query).bind(...params).all();
      const rows = (d1Res?.results || []).map(formatSessionRow);
      return json({
        success: true,
        total: rows.length,
        sessions: rows,
        source: 'cloudflare_d1'
      });
    }

    const sessions = getAllClassSessions();
    let filtered = sessions;
    if (!isManager(auth.user)) {
      const role = String(auth.user.role || '').toLowerCase();
      if (role === 'teacher') {
        filtered = filtered.filter(s => [s.teacher_id, s.assistant_teacher_id, s.substitute_teacher_id].includes(auth.user.id));
      } else if (role === 'student') {
        filtered = filtered.filter(s => Array.isArray(s.student_ids) && s.student_ids.includes(auth.user.id));
      } else {
        // Parent links cannot be verified without D1, so fail closed instead of
        // returning another family's schedule from fixture data.
        return json({ success: false, error: 'DatabaseUnavailable: Không thể xác minh lịch của học sinh liên kết' }, { status: 503 });
      }
    }
    if (classId) filtered = filtered.filter(s => s.class_id === classId);
    if (teacherId) filtered = filtered.filter(s => s.teacher_id === teacherId || s.assistant_teacher_id === teacherId);

    return json({
      success: true,
      total: filtered.length,
      sessions: filtered,
      source: 'local_store'
    });
  } catch (err) {
    console.error('GET /api/schedule error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  // 1. Strict Server Authentication & Staff check
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập tài khoản hợp lệ'
    }, { status: auth.status || 401 });
  }

  if (!isStaffUser(auth.user)) {
    return json({
      success: false,
      error: 'Forbidden: Chỉ Giáo viên hoặc Quản trị viên mới có quyền cập nhật thời khóa biểu'
    }, { status: 403 });
  }

  try {
    const body = await request.json();
    const action = body.action || 'save_session';

    const isMgr = isManager(auth.user);
    const db = platform?.env?.DB;

    // Ownership helper: non-managers may only touch sessions they are in charge of
    // (main / assistant / substitute teacher).
    async function assertOwnSession(sessionId) {
      if (isMgr || !db || !sessionId) return;
      const existing = await db.prepare(
        `SELECT teacher_id, assistant_teacher_id, substitute_teacher_id FROM class_sessions WHERE id = ? LIMIT 1`
      ).bind(sessionId).first();
      if (existing) {
        const mine = [existing.teacher_id, existing.assistant_teacher_id, existing.substitute_teacher_id].includes(auth.user.id);
        if (!mine) {
          throw { status: 403, message: 'Forbidden: Bạn chỉ được sửa lịch mình phụ trách' };
        }
      }
    }

    if (action === 'assign_students') {
      await assertOwnSession(body.session_id);
      const res = assignStudentsToClassSession(body.session_id, body.student_ids);
      if (db) {
        await db.prepare(`
          UPDATE class_sessions SET student_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(JSON.stringify(body.student_ids || []), body.session_id).run();
      }
      return json(res);
    }

    if (!body.class_name || !body.start_time) {
      return json({ success: false, error: 'Thiếu thông tin tên lớp hoặc thời gian bắt đầu buổi học' }, { status: 400 });
    }

    await assertOwnSession(body.id);
    // Non-managers cannot create sessions assigned to other teachers
    if (!isMgr && body.teacher_id && body.teacher_id !== auth.user.id) {
      return json({ success: false, error: 'Forbidden: Bạn chỉ được tạo lịch cho chính mình' }, { status: 403 });
    }

    const id = body.id || `sess_${crypto.randomUUID()}`;
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = body.day_name || (body.day_of_week !== undefined && dayNames[body.day_of_week] ? dayNames[body.day_of_week] : 'Thứ Năm');
    const studentIdsStr = Array.isArray(body.student_ids) ? JSON.stringify(body.student_ids) : (body.student_ids || '[]');

    let savedSession = {
      ...body,
      id,
      day_name: dayName
    };

    if (platform?.env?.DB) {
      await platform.env.DB.prepare(`
        INSERT INTO class_sessions (
          id, class_id, class_name, teacher_id, teacher_name, substitute_teacher_id,
          session_date, start_time, end_time, room, topic, status, grade_level,
          day_of_week, day_name, student_ids, assistant_teacher_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          class_id = excluded.class_id,
          class_name = excluded.class_name,
          teacher_id = excluded.teacher_id,
          teacher_name = excluded.teacher_name,
          substitute_teacher_id = excluded.substitute_teacher_id,
          session_date = excluded.session_date,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          room = excluded.room,
          topic = excluded.topic,
          status = excluded.status,
          grade_level = excluded.grade_level,
          day_of_week = excluded.day_of_week,
          day_name = excluded.day_name,
          student_ids = excluded.student_ids,
          assistant_teacher_id = excluded.assistant_teacher_id,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(
        id,
        body.class_id || '',
        body.class_name,
        body.teacher_id || auth.user.id,
        body.teacher_name || auth.user.name || '',
        body.substitute_teacher_id || null,
        body.session_date || new Date().toISOString().split('T')[0],
        body.start_time,
        body.end_time || '',
        body.room || '',
        body.topic || '',
        body.status || 'scheduled',
        body.grade_level || '',
        body.day_of_week !== undefined ? body.day_of_week : null,
        dayName,
        studentIdsStr,
        body.assistant_teacher_id || null
      ).run();
    }

    try {
      saveClassSession(savedSession);
    } catch {}

    return json({
      success: true,
      message: `Đã lưu thời khóa biểu buổi học "${savedSession.class_name}" (${savedSession.day_name} ${savedSession.start_time})`,
      session: savedSession
    });
  } catch (err) {
    console.error('POST /api/schedule error:', err?.message || err);
    if (err && typeof err.status === 'number') {
      return json({ success: false, error: err.message }, { status: err.status });
    }
    return json({ success: false, error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE({ url, request, platform }) {
  // 1. Strict Server Authentication & Staff check
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập tài khoản hợp lệ'
    }, { status: auth.status || 401 });
  }

  if (!isStaffUser(auth.user)) {
    return json({
      success: false,
      error: 'Forbidden: Chỉ Giáo viên hoặc Quản trị viên mới có quyền xóa buổi học'
    }, { status: 403 });
  }

  try {
    const id = url.searchParams.get('id');
    if (!id) return json({ success: false, error: 'Thiếu session ID' }, { status: 400 });

    // Non-managers can only delete sessions they are in charge of
    if (!isManager(auth.user) && platform?.env?.DB) {
      const existing = await platform.env.DB.prepare(
        `SELECT teacher_id, assistant_teacher_id, substitute_teacher_id FROM class_sessions WHERE id = ? LIMIT 1`
      ).bind(id).first();
      if (existing) {
        const mine = [existing.teacher_id, existing.assistant_teacher_id, existing.substitute_teacher_id].includes(auth.user.id);
        if (!mine) {
          return json({ success: false, error: 'Forbidden: Bạn chỉ được xóa lịch mình phụ trách' }, { status: 403 });
        }
      }
    }

    if (platform?.env?.DB) {
      await platform.env.DB.prepare('DELETE FROM class_sessions WHERE id = ?').bind(id).run();
    }
    const ok = deleteClassSession(id);
    return json({ success: true, message: 'Đã xóa buổi học khỏi thời khóa biểu' });
  } catch (err) {
    console.error('DELETE /api/schedule error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

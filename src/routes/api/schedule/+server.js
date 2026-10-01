import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '$lib/server/auth.js';
import { getAllClassSessions, saveClassSession, deleteClassSession, assignStudentsToClassSession } from '$lib/unifiedStore';

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

      // Scope records from the authenticated actor. Query-string filters may only
      // narrow this result; they never grant access to another class or teacher.
      if (role === 'student') {
        query += ` AND (
          EXISTS (SELECT 1 FROM class_enrollments ce WHERE ce.class_id = cs.class_id AND ce.user_id = ? AND ce.status = 'active')
          OR EXISTS (SELECT 1 FROM json_each(COALESCE(cs.student_ids, '[]')) WHERE value = ?)
        )`;
        params.push(auth.user.id, auth.user.id);
      } else if (role === 'parent') {
        query += ` AND EXISTS (
          SELECT 1 FROM parent_student_links psl
          LEFT JOIN class_enrollments ce ON ce.user_id = psl.student_user_id AND ce.status = 'active'
          WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
            AND (ce.class_id = cs.class_id OR EXISTS (
              SELECT 1 FROM json_each(COALESCE(cs.student_ids, '[]')) WHERE value = psl.student_user_id
            ))
        )`;
        params.push(auth.user.id);
      } else if (role === 'teacher') {
        query += ' AND (cs.teacher_id = ? OR cs.assistant_teacher_id = ? OR cs.substitute_teacher_id = ?)';
        params.push(auth.user.id, auth.user.id, auth.user.id);
      } else if (!isManager(auth.user)) {
        return json({ success: false, error: 'Forbidden: Vai trò không có quyền xem thời khóa biểu.' }, { status: 403 });
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
    const role = String(auth.user.role || '').toLowerCase();
    let filtered = sessions;
    if (role === 'student') {
      filtered = filtered.filter((s) => Array.isArray(s.student_ids) && s.student_ids.includes(auth.user.id));
    } else if (role === 'teacher') {
      filtered = filtered.filter((s) => s.teacher_id === auth.user.id || s.assistant_teacher_id === auth.user.id || s.substitute_teacher_id === auth.user.id);
    } else if (!isManager(auth.user)) {
      filtered = [];
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

    const role = String(auth.user.role || '').toLowerCase();
    const manager = isManager(auth.user);

    async function assertCanMutateSession(sessionId) {
      if (manager) return true;
      if (role !== 'teacher' || !platform?.env?.DB || !sessionId) return false;
      const owned = await platform.env.DB.prepare(`
        SELECT id FROM class_sessions
        WHERE id = ? AND (teacher_id = ? OR assistant_teacher_id = ? OR substitute_teacher_id = ?)
        LIMIT 1
      `).bind(sessionId, auth.user.id, auth.user.id, auth.user.id).first();
      return Boolean(owned);
    }

    if (action === 'assign_students') {
      if (!(await assertCanMutateSession(body.session_id))) {
        return json({ success: false, error: 'Forbidden: Bạn không phụ trách buổi học này.' }, { status: 403 });
      }
      const res = assignStudentsToClassSession(body.session_id, body.student_ids);
      if (platform?.env?.DB) {
        await platform.env.DB.prepare(`
          UPDATE class_sessions SET student_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(JSON.stringify(body.student_ids || []), body.session_id).run();
      }
      return json(res);
    }

    if (!body.class_name || !body.start_time) {
      return json({ success: false, error: 'Thiếu thông tin tên lớp hoặc thời gian bắt đầu buổi học' }, { status: 400 });
    }

    const id = body.id || `sess_${crypto.randomUUID()}`;
    if (body.id && !(await assertCanMutateSession(body.id))) {
      return json({ success: false, error: 'Forbidden: Bạn không phụ trách buổi học này.' }, { status: 403 });
    }
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = body.day_name || (body.day_of_week !== undefined && dayNames[body.day_of_week] ? dayNames[body.day_of_week] : 'Thứ Năm');
    const studentIdsStr = Array.isArray(body.student_ids) ? JSON.stringify(body.student_ids) : (body.student_ids || '[]');

    const effectiveTeacherId = manager ? (body.teacher_id || auth.user.id) : auth.user.id;
    const effectiveTeacherName = manager ? (body.teacher_name || auth.user.name || '') : (auth.user.name || '');
    let savedSession = {
      ...body,
      id,
      teacher_id: effectiveTeacherId,
      teacher_name: effectiveTeacherName,
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
        effectiveTeacherId,
        effectiveTeacherName,
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
    console.error('POST /api/schedule error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
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

    if (platform?.env?.DB && !isManager(auth.user)) {
      const owned = await platform.env.DB.prepare(`
        SELECT id FROM class_sessions
        WHERE id = ? AND (teacher_id = ? OR assistant_teacher_id = ? OR substitute_teacher_id = ?)
        LIMIT 1
      `).bind(id, auth.user.id, auth.user.id, auth.user.id).first();
      if (!owned) return json({ success: false, error: 'Forbidden: Bạn không phụ trách buổi học này.' }, { status: 403 });
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

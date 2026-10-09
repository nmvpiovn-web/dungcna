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
    student_ids: studentIds,
    // Two-way field name compatibility: DB columns <-> form field names
    subject_topic: row.topic ?? row.subject_topic ?? '',
    room_notes: row.room ?? row.room_notes ?? ''
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

    // Bước 2: session_date bắt buộc (ô lịch tuần phải gửi day.iso)
    if (!body.session_date) {
      return json({ success: false, error: 'Thiếu ngày học (session_date). Vui lòng chọn ngày trên lịch.' }, { status: 400 });
    }

    // Bước 2: end_time phải sau start_time
    if (body.end_time && body.start_time >= body.end_time) {
      return json({ success: false, error: 'Giờ kết thúc phải sau giờ bắt đầu' }, { status: 400 });
    }

    await assertOwnSession(body.id);
    // Non-managers cannot create sessions assigned to other teachers
    if (!isMgr && body.teacher_id && body.teacher_id !== auth.user.id) {
      return json({ success: false, error: 'Forbidden: Bạn chỉ được tạo lịch cho chính mình' }, { status: 403 });
    }

    // Bước 2: chặn trùng lịch (409) — cùng session_date, giờ overlap,
    // cho teacher_id, assistant_teacher_id, student_ids, room
    // BUG-2 fix: bắt buộc end_time, không skip check khi thiếu
    if (!body.end_time) {
      return json({ success: false, error: 'Thiếu giờ kết thúc' }, { status: 400 });
    }
    // BUG-1 fix: map room từ body.room ?? body.room_notes để check trùng đúng
    const roomVal = body.room ?? body.room_notes ?? '';
    if (db) {
      const newStudentIds = Array.isArray(body.student_ids) ? body.student_ids : [];
      const conflicts = await db.prepare(`
        SELECT id, class_name, teacher_id, assistant_teacher_id, student_ids, room, start_time, end_time
        FROM class_sessions
        WHERE session_date = ?
          AND id != ?
          AND start_time < ?
          AND end_time > ?
          AND status != 'cancelled'
        LIMIT 50
      `).bind(
        body.session_date,
        body.id || '',
        body.end_time,
        body.start_time
      ).all();
      const rows = conflicts?.results || [];
      const teacherIds = [body.teacher_id || auth.user.id, body.assistant_teacher_id].filter(Boolean);
      for (const r of rows) {
        let rStudentIds = [];
        try { rStudentIds = typeof r.student_ids === 'string' ? JSON.parse(r.student_ids || '[]') : (r.student_ids || []); } catch {}
        const teacherOverlap = teacherIds.some(t => [r.teacher_id, r.assistant_teacher_id].includes(t));
        const studentOverlap = newStudentIds.some(s => rStudentIds.includes(s));
        // BUG-1 fix: dùng roomVal đã map (body.room ?? body.room_notes), không dùng body.room trực tiếp
        const roomOverlap = roomVal && r.room && String(roomVal).trim() === String(r.room).trim();
        if (teacherOverlap || studentOverlap || roomOverlap) {
          const reason = teacherOverlap ? 'giáo viên' : studentOverlap ? 'học sinh' : 'phòng học';
          return json({
            success: false,
            error: `Trùng lịch ${reason} với ca "${r.class_name}" (${r.start_time}–${r.end_time} ngày ${body.session_date})`
          }, { status: 409 });
        }
      }
    }

    const id = body.id || `sess_${crypto.randomUUID()}`;
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = body.day_name || (body.day_of_week !== undefined && dayNames[body.day_of_week] ? dayNames[body.day_of_week] : 'Thứ Năm');
    const studentIdsStr = Array.isArray(body.student_ids) ? JSON.stringify(body.student_ids) : (body.student_ids || '[]');
    // Map form field names to DB columns (two-way compatibility)
    const topicVal = body.topic ?? body.subject_topic ?? '';
    // roomVal đã định nghĩa ở trên (dùng cho check trùng lịch)

    let savedSession = {
      ...body,
      id,
      day_name: dayName,
      topic: topicVal,
      subject_topic: topicVal,
      room: roomVal,
      room_notes: roomVal
    };

    if (platform?.env?.DB) {
      const isNew = !body.id;
      if (isNew) {
        await platform.env.DB.prepare(`
          INSERT INTO class_sessions (
            id, class_id, class_name, teacher_id, teacher_name,
            session_date, start_time, end_time, room, topic, status, grade_level,
            day_of_week, day_name, student_ids, assistant_teacher_id,
            location, notify_minutes_before, assistant_teacher_name, teacher_role, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          id,
          body.class_id || '',
          body.class_name,
          body.teacher_id || auth.user.id,
          body.teacher_name || auth.user.name || '',
          body.session_date || new Date().toISOString().split('T')[0],
          body.start_time,
          body.end_time || '',
          roomVal,
          topicVal,
          'scheduled',
          body.grade_level || '',
          body.day_of_week !== undefined ? body.day_of_week : null,
          dayName,
          studentIdsStr,
          body.assistant_teacher_id || null,
          body.location || '',
          Number(body.notify_minutes_before ?? 10),
          body.assistant_teacher_name || '',
          body.teacher_role || 'lead'
        ).run();
        savedSession.status = 'scheduled';
      } else {
        // UPDATE: only touch columns the form submits.
        // Never touch substitute_* / attendance_taken / payroll_* and never reset status.
        await platform.env.DB.prepare(`
          UPDATE class_sessions SET
            class_id = ?,
            class_name = ?,
            teacher_id = ?,
            teacher_name = ?,
            session_date = ?,
            start_time = ?,
            end_time = ?,
            room = ?,
            topic = ?,
            grade_level = ?,
            day_of_week = ?,
            day_name = ?,
            student_ids = ?,
            assistant_teacher_id = ?,
            location = ?,
            notify_minutes_before = ?,
            assistant_teacher_name = ?,
            teacher_role = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          body.class_id || '',
          body.class_name,
          body.teacher_id || auth.user.id,
          body.teacher_name || auth.user.name || '',
          body.session_date || new Date().toISOString().split('T')[0],
          body.start_time,
          body.end_time || '',
          roomVal,
          topicVal,
          body.grade_level || '',
          body.day_of_week !== undefined ? body.day_of_week : null,
          dayName,
          studentIdsStr,
          body.assistant_teacher_id || null,
          body.location || '',
          Number(body.notify_minutes_before ?? 10),
          body.assistant_teacher_name || '',
          body.teacher_role || 'lead',
          id
        ).run();
        // Keep the existing status from DB (don't reset)
        const kept = await platform.env.DB.prepare('SELECT status FROM class_sessions WHERE id = ? LIMIT 1').bind(id).first();
        if (kept) savedSession.status = kept.status;
      }
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

import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
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
      let query = 'SELECT * FROM class_sessions WHERE 1=1';
      const params = [];
      if (classId) {
        query += ' AND class_id = ?';
        params.push(classId);
      }
      if (teacherId) {
        query += ' AND (teacher_id = ? OR assistant_teacher_id = ? OR substitute_teacher_id = ?)';
        params.push(teacherId, teacherId, teacherId);
      }
      query += ' ORDER BY session_date DESC, start_time ASC';

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

    if (action === 'assign_students') {
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

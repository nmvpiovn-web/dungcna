import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { getAllClassSessions, saveClassSession, deleteClassSession, assignStudentsToClassSession, logSnapshot } from '$lib/unifiedStore';

export const prerender = false;

export async function GET({ url }) {
  try {
    const classId = url.searchParams.get('class_id');
    const teacherId = url.searchParams.get('teacher_id');
    const sessions = getAllClassSessions();

    let filtered = sessions;
    if (classId) filtered = filtered.filter(s => s.class_id === classId);
    if (teacherId) filtered = filtered.filter(s => s.teacher_id === teacherId || s.assistant_teacher_id === teacherId);

    return json({
      success: true,
      total: filtered.length,
      sessions: filtered
    });
  } catch (err) {
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
      return json(res);
    }

    if (!body.class_name || !body.start_time) {
      return json({ success: false, error: 'Thiếu thông tin tên lớp hoặc thời gian bắt đầu buổi học' }, { status: 400 });
    }

    const saved = saveClassSession(body);
    return json({
      success: true,
      message: `Đã lưu thời khóa biểu buổi học "${saved.class_name}" (${saved.day_name} ${saved.start_time})`,
      session: saved
    });
  } catch (err) {
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

    const ok = deleteClassSession(id);
    return json({ success: ok, message: 'Đã xóa buổi học khỏi thời khóa biểu' });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

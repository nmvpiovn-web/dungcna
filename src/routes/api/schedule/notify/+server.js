import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { triggerScheduleNotification } from '$lib/unifiedStore';

export const prerender = false;

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }
  // P2 FIX (2026-10-01): restrict bot dispatch to staff — any authenticated
  // user (incl. students) could trigger notification spam.
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ giáo viên hoặc quản trị viên mới được gửi thông báo lịch học' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const sessionId = body.session_id;
    const minutesBefore = body.minutes_before || 10;

    if (!sessionId) {
      return json({ success: false, error: 'Thiếu session_id' }, { status: 400 });
    }

    const res = await triggerScheduleNotification(sessionId, minutesBefore);
    return json(res);
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

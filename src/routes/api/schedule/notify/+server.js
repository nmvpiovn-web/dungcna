import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';
import { triggerScheduleNotification } from '$lib/unifiedStore';

export const prerender = false;

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
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

// src/routes/api/auth/logout/+server.js
import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';

export const prerender = false;

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized' }, {
      status: auth.status || 401,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const sid = auth.tokenPayload?.sid;
  if (platform?.env?.DB && sid) {
    try {
      await platform.env.DB.prepare(`
        UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(sid).run();
    } catch (e) {
      console.error('Error revoking auth session:', e);
      return json({ success: false, error: 'DatabaseError: Không thể thu hồi phiên' }, {
        status: 500,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
  }

  return json({
    success: true,
    message: 'Đăng xuất và thu hồi phiên thành công.'
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

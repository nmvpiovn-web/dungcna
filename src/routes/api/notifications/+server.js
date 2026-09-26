import { json } from '@sveltejs/kit';
import { verifyServerAuth, SUPERADMIN_USERNAMES } from '$lib/server/auth';

export const prerender = false;

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng' }, { status: 500 });
  }

  const db = platform.env.DB;
  const user = auth.user;
  const isLeader = user.role === 'superadmin' || user.role === 'leader' || SUPERADMIN_USERNAMES.includes(user.username);

  try {
    let sql = `
      SELECT * FROM system_notifications 
      WHERE (target_user_id = ?) 
         OR (target_user_id IS NULL AND (target_role = ? OR target_role = 'all'))
    `;
    const params = [user.id, user.role];

    if (isLeader) {
      sql = `
        SELECT * FROM system_notifications 
        WHERE (target_user_id = ?)
           OR (target_user_id IS NULL AND (target_role = ? OR target_role = 'leader' OR target_role = 'all'))
      `;
    }

    sql += ` ORDER BY created_at DESC LIMIT 50;`;

    const res = await db.prepare(sql).bind(...params).all();
    const notifications = res.results || [];
    const unreadCount = notifications.filter(n => n.is_read === 0).length;

    return json({
      success: true,
      unread_count: unreadCount,
      notifications
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return json({ success: false, error: 'DatabaseError: Lỗi khi lấy thông báo' }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng' }, { status: 500 });
  }

  const db = platform.env.DB;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu JSON' }, { status: 400 });
  }

  const action = body.action || 'mark_read';

  if (action === 'mark_read') {
    const { notification_id, mark_all } = body;
    try {
      if (mark_all) {
        await db.prepare(`
          UPDATE system_notifications 
          SET is_read = 1 
          WHERE target_user_id = ? OR target_role = ?;
        `).bind(auth.user.id, auth.user.role).run();
      } else if (notification_id) {
        await db.prepare(`
          UPDATE system_notifications 
          SET is_read = 1 
          WHERE id = ?;
        `).bind(notification_id).run();
      }
      return json({ success: true, message: 'Đã đánh dấu đã đọc' });
    } catch (e) {
      return json({ success: false, error: `Lỗi cập nhật: ${e.message}` }, { status: 500 });
    }
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}

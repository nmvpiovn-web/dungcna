import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth';

export const prerender = false;

async function ensureNotificationSchema(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS system_notifications (
      id TEXT PRIMARY KEY,
      target_role TEXT,
      target_user_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT,
      reference_id TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS system_notification_reads (
      notification_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notification_id, user_id)
    );
  `).run();
}

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
  const isLeader = user.role === 'superadmin' || user.role === 'leader';

  try {
    await ensureNotificationSchema(db);

    let sql = `
      SELECT n.id, n.target_role, n.target_user_id, n.title, n.body, n.category, n.reference_id, n.created_at,
             CASE 
               WHEN nr.user_id IS NOT NULL THEN 1 
               WHEN n.target_user_id = ? THEN n.is_read 
               ELSE 0 
             END AS is_read
      FROM system_notifications n
      LEFT JOIN system_notification_reads nr 
        ON n.id = nr.notification_id AND nr.user_id = ?
      WHERE (n.target_user_id = ?) 
         OR (n.target_user_id IS NULL AND (n.target_role = ? OR n.target_role = 'all'))
    `;
    let params = [user.id, user.id, user.id, user.role];

    if (isLeader) {
      sql = `
        SELECT n.id, n.target_role, n.target_user_id, n.title, n.body, n.category, n.reference_id, n.created_at,
               CASE 
                 WHEN nr.user_id IS NOT NULL THEN 1 
                 WHEN n.target_user_id = ? THEN n.is_read 
                 ELSE 0 
               END AS is_read
        FROM system_notifications n
        LEFT JOIN system_notification_reads nr 
          ON n.id = nr.notification_id AND nr.user_id = ?
        WHERE (n.target_user_id = ?)
           OR (n.target_user_id IS NULL AND (n.target_role = ? OR n.target_role = 'leader' OR n.target_role = 'all'))
      `;
      params = [user.id, user.id, user.id, user.role];
    }

    sql += ` ORDER BY n.created_at DESC LIMIT 50;`;

    const res = await db.prepare(sql).bind(...params).all();
    const notifications = res.results || [];
    const unreadCount = notifications.filter(n => Number(n.is_read) === 0).length;

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
  const isLeader = auth.user.role === 'superadmin' || auth.user.role === 'leader';

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
      await ensureNotificationSchema(db);
      if (mark_all) {
        // Mark all eligible notifications read for this specific user
        const targetRoleCond = isLeader ? "(n.target_role = ? OR n.target_role = 'leader' OR n.target_role = 'all')" : "(n.target_role = ? OR n.target_role = 'all')";
        
        await db.prepare(`
          INSERT INTO system_notification_reads (notification_id, user_id, read_at)
          SELECT n.id, ?, CURRENT_TIMESTAMP
          FROM system_notifications n
          WHERE (n.target_user_id = ? OR (n.target_user_id IS NULL AND ${targetRoleCond}))
          ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP;
        `).bind(auth.user.id, auth.user.id, auth.user.role).run();

        // Also update personal ones
        await db.prepare(`
          UPDATE system_notifications 
          SET is_read = 1 
          WHERE target_user_id = ?;
        `).bind(auth.user.id).run();

        return json({ success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
      } else if (notification_id) {
        // Enforce strict ownership: Check target_user_id and target_role
        const notif = await db.prepare('SELECT id, target_user_id, target_role FROM system_notifications WHERE id = ?').bind(notification_id).first();
        if (!notif) {
          return json({ success: false, error: 'NotFound: Không tìm thấy thông báo' }, { status: 404 });
        }

        // Strict Personal Privacy: ONLY the recipient can mark their own personal notification
        if (notif.target_user_id && notif.target_user_id !== auth.user.id) {
          return json({ success: false, error: 'Forbidden: Bạn không có quyền đánh dấu thông báo cá nhân của người khác' }, { status: 403 });
        }

        // Role-based notification: User must belong to the target role (or 'all', or isLeader)
        if (notif.target_role && notif.target_role !== 'all' && notif.target_role !== auth.user.role && !isLeader) {
          return json({ success: false, error: 'Forbidden: Thông báo này không thuộc nhóm vai trò được phân quyền của bạn' }, { status: 403 });
        }

        // Record per-user read state
        await db.prepare(`
          INSERT INTO system_notification_reads (notification_id, user_id, read_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP;
        `).bind(notification_id, auth.user.id).run();

        // If it's a personal notification, update the main record as well
        if (notif.target_user_id === auth.user.id) {
          await db.prepare(`
            UPDATE system_notifications 
            SET is_read = 1 
            WHERE id = ?;
          `).bind(notification_id).run();
        }

        return json({ success: true, message: 'Đã đánh dấu đã đọc thành công' });
      } else {
        return json({ success: false, error: 'Thiếu notification_id hoặc cờ mark_all' }, { status: 400 });
      }
    } catch (e) {
      return json({ success: false, error: `Lỗi cập nhật: ${e.message}` }, { status: 500 });
    }
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}

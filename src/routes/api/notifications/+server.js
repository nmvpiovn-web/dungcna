import { json } from '@sveltejs/kit';
import { verifyServerAuth, isManager } from '../../../lib/server/auth.js';
import { buildNotificationAuthFilter } from '../../../lib/server/notificationPolicy.js';

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
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS class_enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active',
      UNIQUE(user_id, class_id)
    );
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS homework_assignments (
      id TEXT PRIMARY KEY, session_id TEXT, class_id TEXT, class_name TEXT,
      teacher_id TEXT, teacher_name TEXT, campus_id TEXT, skill_type TEXT,
      title TEXT, description TEXT, obsidian_note_id TEXT, obsidian_note_title TEXT,
      assigned_date TEXT, deadline_date TEXT, deadline_time TEXT,
      max_score INTEGER DEFAULT 10, star_reward_on_time INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS homework_submissions (
      id TEXT PRIMARY KEY, assignment_id TEXT, student_id TEXT, student_name TEXT,
      content TEXT, file_url TEXT, submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      score REAL, teacher_feedback TEXT, graded_at TEXT, status TEXT DEFAULT 'submitted'
    );
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS parent_student_links (
      id TEXT PRIMARY KEY, parent_user_id TEXT NOT NULL, student_user_id TEXT NOT NULL,
      verification_status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT
    );
  `).run();
}

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng (Fail-Closed)' }, { status: 503 });
  }

  const db = platform.env.DB;
  const user = auth.user;

  try {
    await ensureNotificationSchema(db);

    const filter = buildNotificationAuthFilter({ role: user.role, userId: user.id });
    const sql = `
      SELECT n.id, n.target_role, n.target_user_id, n.title, n.body, n.category, n.reference_id, n.created_at,
             CASE 
               WHEN nr.user_id IS NOT NULL THEN 1 
               WHEN n.target_user_id = ? THEN n.is_read 
               ELSE 0 
             END AS is_read
      FROM system_notifications n
      LEFT JOIN system_notification_reads nr 
        ON n.id = nr.notification_id AND nr.user_id = ?
      WHERE ${filter.whereSql}
      ORDER BY n.created_at DESC LIMIT 50;
    `;
    const params = [user.id, user.id, ...filter.params];

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
    return json({ success: false, error: 'DatabaseError: Lỗi khi lấy thông báo' }, { status: 503 });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng (Fail-Closed)' }, { status: 503 });
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
      await ensureNotificationSchema(db);
      const filter = buildNotificationAuthFilter({ role: auth.user.role, userId: auth.user.id });

      if (mark_all) {
        await db.prepare(`
          INSERT INTO system_notification_reads (notification_id, user_id, read_at)
          SELECT n.id, ?, CURRENT_TIMESTAMP
          FROM system_notifications n
          WHERE ${filter.whereSql}
          ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP;
        `).bind(auth.user.id, ...filter.params).run();

        await db.prepare(`
          UPDATE system_notifications SET is_read = 1
          WHERE id IN (
            SELECT n.id FROM system_notifications n
            WHERE n.target_user_id = ? AND (${filter.whereSql})
          );
        `).bind(auth.user.id, ...filter.params).run();

        return json({ success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
      } else if (notification_id) {
        const authorized = await db.prepare(`
          SELECT n.id, n.target_user_id FROM system_notifications n
          WHERE n.id = ? AND (${filter.whereSql})
        `).bind(notification_id, ...filter.params).first();

        if (!authorized) {
          const exists = await db.prepare('SELECT id FROM system_notifications WHERE id = ?').bind(notification_id).first();
          if (!exists) {
            return json({ success: false, error: 'NotFound: Không tìm thấy thông báo' }, { status: 404 });
          }
          return json({ success: false, error: 'Forbidden: Bạn không có quyền truy cập hoặc đánh dấu thông báo này' }, { status: 403 });
        }

        await db.prepare(`
          INSERT INTO system_notification_reads (notification_id, user_id, read_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP;
        `).bind(notification_id, auth.user.id).run();

        if (authorized.target_user_id === auth.user.id) {
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
      console.error('Error updating notification read state:', e);
      return json({ success: false, error: `DatabaseError: Lỗi cập nhật: ${e.message}` }, { status: 503 });
    }
  }

  if (action === 'create') {
    if (!isManager(auth.user)) {
      return json({ success: false, error: 'Forbidden: Chỉ quản lý mới được gửi thông báo hệ thống' }, { status: 403 });
    }
    const { title, body: notifBody, target_role, category } = body;
    if (!title?.trim() || !notifBody?.trim()) {
      return json({ success: false, error: 'Thiếu tiêu đề hoặc nội dung thông báo' }, { status: 400 });
    }
    try {
      await ensureNotificationSchema(db);
      const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, is_read)
        VALUES (?, ?, NULL, ?, ?, ?, 0)
      `).bind(id, target_role || 'all', title.trim(), notifBody.trim(), category || 'general').run();
      return json({ success: true, message: 'Đã gửi thông báo', id });
    } catch (e) {
      return json({ success: false, error: `DatabaseError: ${e.message}` }, { status: 503 });
    }
  }

  if (action === 'delete' || action === 'delete_notification') {
    if (!isManager(auth.user)) {
      return json({ success: false, error: 'Forbidden: Chỉ Quản lý / Admin mới được xóa thông báo hệ thống' }, { status: 403 });
    }
    const notifId = String(body.notification_id || body.id || '').trim();
    if (!notifId) {
      return json({ success: false, error: 'Thiếu notification_id cần xóa' }, { status: 400 });
    }
    try {
      await ensureNotificationSchema(db);
      await db.prepare('DELETE FROM system_notification_reads WHERE notification_id = ?').bind(notifId).run().catch(() => {});
      await db.prepare('DELETE FROM system_notifications WHERE id = ?').bind(notifId).run();
      return json({ success: true, id: notifId, message: '🗑️ Đã xóa thông báo hệ thống khỏi Cloudflare D1!' });
    } catch (e) {
      return json({ success: false, error: `DatabaseError: ${e.message}` }, { status: 503 });
    }
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}

export async function DELETE({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }
  if (!isManager(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ Quản lý / Admin mới được xóa thông báo hệ thống' }, { status: 403 });
  }
  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 503 });
  }
  const db = platform.env.DB;
  let body = {};
  try { body = await request.json(); } catch {}
  const notifId = String(url.searchParams.get('id') || url.searchParams.get('notification_id') || body.id || body.notification_id || '').trim();
  if (!notifId) {
    return json({ success: false, error: 'Thiếu id thông báo cần xóa' }, { status: 400 });
  }
  await ensureNotificationSchema(db);
  await db.prepare('DELETE FROM system_notification_reads WHERE notification_id = ?').bind(notifId).run().catch(() => {});
  await db.prepare('DELETE FROM system_notifications WHERE id = ?').bind(notifId).run();
  return json({ success: true, id: notifId, message: '🗑️ Đã xóa thông báo hệ thống khỏi Cloudflare D1!' });
}

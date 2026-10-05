// src/routes/api/app/sync/+server.js
// Unified realtime sync endpoint for mobile app (APK/PWA)
// GET /api/app/sync?since=<ISO timestamp> — returns all changes since timestamp
import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '../../../../lib/server/auth.js';
import { buildNotificationAuthFilter } from '../../../../lib/server/notificationPolicy.js';

export const prerender = false;

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  }

  const db = platform.env.DB;
  const sinceInput = url.searchParams.get('since') || '1970-01-01T00:00:00Z';
  const sinceDate = new Date(sinceInput);
  if (Number.isNaN(sinceDate.getTime())) {
    return json({ success: false, error: 'Invalid since timestamp' }, { status: 400 });
  }
  const since = sinceDate.toISOString();
  const user = auth.user;
  const role = String(user.role || '').toLowerCase();
  const supportedRoles = new Set(['student', 'parent', 'teacher', 'leader', 'admin', 'superadmin']);
  if (!supportedRoles.has(role)) {
    return json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  const now = new Date().toISOString();

  const result = {
    success: true,
    server_time: now,
    since,
    changes: {
      notifications: [],
      schedule: [],
      exams: [],
      quizzes: [],
      site_theme: null
    }
  };

  try {
    // 1. Notifications — dùng chung policy với /api/notifications (issue #2 P1)
    // Không còn dùng filter lỏng lẻo gây rò thông báo teacher/leader sang student/parent
    try {
      const notifFilter = buildNotificationAuthFilter({ role, userId: user.id });
      const notifs = await db.prepare(`
        SELECT n.id, n.title, n.body, n.category, n.reference_id, n.created_at
        FROM system_notifications n
        WHERE datetime(n.created_at) > datetime(?)
          AND ${notifFilter.whereSql}
        ORDER BY n.created_at DESC LIMIT 50
      `).bind(since, ...notifFilter.params).all();
      result.changes.notifications = notifs.results || [];
    } catch {}

    // 2. Schedule changes (role-scoped, fail-closed cho role lạ)
    try {
      let schedQuery = `SELECT id, class_id, class_name, subject_topic, session_date, start_time, end_time, teacher_name, location, updated_at FROM class_sessions WHERE datetime(updated_at) > datetime(?)`;
      const params = [since];
      if (role === 'teacher') {
        schedQuery += ` AND (teacher_id = ? OR assistant_teacher_id = ? OR substitute_teacher_id = ?)`;
        params.push(user.id, user.id, user.id);
      } else if (role === 'student') {
        schedQuery += ` AND class_id IN (SELECT class_id FROM class_enrollments WHERE user_id = ? AND status = 'active')`;
        params.push(user.id);
      } else if (role === 'parent') {
        schedQuery += ` AND class_id IN (
          SELECT ce.class_id FROM class_enrollments ce
          JOIN parent_student_links psl ON psl.student_user_id = ce.user_id
          WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified' AND ce.status = 'active'
        )`;
        params.push(user.id);
      } else if (role === 'leader' || role === 'admin' || role === 'superadmin') {
        // manager: không filter
      } else {
        // Role lạ: fail-closed, không trả lịch
        schedQuery += ` AND 1 = 0`;
      }
      schedQuery += ` ORDER BY updated_at DESC LIMIT 100`;
      const sched = await db.prepare(schedQuery).bind(...params).all();
      result.changes.schedule = sched.results || [];
    } catch {}

    // 3. New/updated exams — lọc theo since (trước đây không lọc)
    try {
      const exams = await db.prepare(`
        SELECT id, title, grade, format_type, duration_minutes, created_at
        FROM exams WHERE is_published = 1 AND datetime(created_at) > datetime(?)
        ORDER BY created_at DESC LIMIT 20
      `).bind(since).all();
      result.changes.exams = exams.results || [];
    } catch {}

    // 4. Published Quiz Menu changes for authenticated app sync.
    try {
      const quizzes = await db.prepare(`
        SELECT id, title, description, creator_name, time_limit_minutes, status, created_at, updated_at
        FROM quizzes
        WHERE status = 'published' AND datetime(updated_at) > datetime(?)
        ORDER BY updated_at DESC LIMIT 50
      `).bind(since).all();
      result.changes.quizzes = quizzes.results || [];
    } catch {}

    // 5. Current site theme — chỉ trả khi có thay đổi sau since
    try {
      const row = await db.prepare(`
        SELECT value, updated_at FROM site_settings
        WHERE key = 'theme' AND (updated_at IS NULL OR datetime(updated_at) > datetime(?))
        LIMIT 1
      `).bind(since).first();
      if (row) {
        try { result.changes.site_theme = JSON.parse(row.value); } catch {}
      }
    } catch {}

    return json(result, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

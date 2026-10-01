import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';
import { bangkokDate } from '$lib/server/bangkokTime.js';

export const prerender = false;

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (String(auth.user.role || '').toLowerCase() !== 'student') {
    return json({ success: false, error: 'Chỉ học sinh được gửi đơn xin nghỉ.' }, { status: 403 });
  }
  if (!platform?.env?.DB) return json({ success: false, error: 'Cloudflare D1 chưa sẵn sàng.' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const sessionId = String(body.session_id || '').trim();
  const reason = String(body.reason || '').trim().slice(0, 500);
  if (!sessionId || reason.length < 3) return json({ success: false, error: 'Cần chọn buổi học và nhập lý do.' }, { status: 400 });

  const db = platform.env.DB;
  const session = await db.prepare('SELECT * FROM class_sessions WHERE id = ? LIMIT 1').bind(sessionId).first();
  if (!session || session.session_date !== bangkokDate()) {
    return json({ success: false, error: 'Chỉ có thể xin nghỉ cho buổi học hôm nay.' }, { status: 409 });
  }
  const enrollment = await db.prepare(`SELECT 1 FROM class_enrollments WHERE user_id = ? AND class_id = ? AND status = 'active' LIMIT 1`).bind(auth.user.id, session.class_id).first();
  if (!enrollment) return json({ success: false, error: 'Bạn không thuộc lớp của buổi học này.' }, { status: 403 });

  const requestId = `absence_${sessionId}_${session.session_date}_${auth.user.id}`;
  const idem = `absence:${sessionId}:${session.session_date}:${auth.user.id}`;
  const recipients = [...new Set([session.teacher_id, session.assistant_teacher_id, session.substitute_teacher_id].filter(Boolean))];
  const leaders = await db.prepare(`SELECT id FROM users WHERE role IN ('leader', 'admin', 'superadmin') AND status = 'active'`).all();
  recipients.push(...(leaders.results || []).map((row) => row.id).filter(Boolean));

  const statements = [db.prepare(`
    INSERT INTO student_absence_requests (id, student_id, session_id, session_date, reason, status, idempotency_key)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
    ON CONFLICT(idempotency_key) DO UPDATE SET reason = excluded.reason, updated_at = CURRENT_TIMESTAMP
  `).bind(requestId, auth.user.id, sessionId, session.session_date, reason, idem)];

  for (const recipientId of new Set(recipients)) {
    statements.push(db.prepare(`
      INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
      VALUES (?, 'staff', ?, ?, ?, 'attendance', ?)
      ON CONFLICT(id) DO UPDATE SET body = excluded.body, is_read = 0
    `).bind(`notif_${requestId}_${recipientId}`, recipientId, `Xin nghỉ: ${auth.user.name || auth.user.username || 'Học sinh'}`, `${reason} · ${session.class_name} · ${session.start_time || ''}`, requestId));
  }
  await db.batch(statements);
  return json({ success: true, request: { id: requestId, session_id: sessionId, status: 'pending' }, notified: new Set(recipients).size });
}

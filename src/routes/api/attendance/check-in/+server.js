import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';
import { bangkokDate, bangkokMinutes, parseClockMinutes } from '$lib/server/bangkokTime.js';

export const prerender = false;

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (String(auth.user.role || '').toLowerCase() !== 'student') {
    return json({ success: false, error: 'Chỉ học sinh được tự điểm danh.' }, { status: 403 });
  }
  if (!platform?.env?.DB) return json({ success: false, error: 'Cloudflare D1 chưa sẵn sàng.' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const sessionId = String(body.session_id || '').trim();
  if (!sessionId) return json({ success: false, error: 'Thiếu session_id.' }, { status: 400 });

  const db = platform.env.DB;
  const session = await db.prepare('SELECT * FROM class_sessions WHERE id = ? LIMIT 1').bind(sessionId).first();
  if (!session) return json({ success: false, error: 'Không tìm thấy buổi học.' }, { status: 404 });

  const today = bangkokDate();
  if (session.session_date !== today || !['scheduled', 'in_progress', 'active'].includes(session.status || 'scheduled')) {
    return json({ success: false, error: 'Buổi học không mở điểm danh hôm nay.' }, { status: 409 });
  }
  const enrollment = await db.prepare(`
    SELECT 1 FROM class_enrollments WHERE user_id = ? AND class_id = ? AND status = 'active' LIMIT 1
  `).bind(auth.user.id, session.class_id).first();
  if (!enrollment) return json({ success: false, error: 'Bạn không thuộc lớp của buổi học này.' }, { status: 403 });

  const start = parseClockMinutes(session.start_time);
  const end = parseClockMinutes(session.end_time);
  const nowMinutes = bangkokMinutes();
  if (start === null || nowMinutes < start - 30 || nowMinutes > (end ?? start + 90) + 15) {
    return json({ success: false, error: 'Ngoài khung giờ điểm danh của buổi học.' }, { status: 409 });
  }

  const status = nowMinutes > start + 10 ? 'late' : 'present';
  const attendanceId = `att_${sessionId}_${today}_${auth.user.id}`;
  const reward = status === 'present' ? 5 : 0;
  const rewardKey = `attendance:${sessionId}:${today}:${auth.user.id}`;
  const ledgerId = `ledger_${attendanceId}`;

  const results = await db.batch([
    db.prepare(`
      INSERT INTO attendance_records (
        id, session_id, session_date, student_id, student_name, class_id, status,
        notes, in_class_attitude, instant_stars_rewarded, marked_by_teacher_id,
        marked_by_teacher_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Học sinh tự điểm danh', '', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO NOTHING
    `).bind(attendanceId, sessionId, today, auth.user.id, auth.user.name || auth.user.username || 'Học sinh', session.class_id, status, reward, auth.user.id, auth.user.name || auth.user.username || 'Học sinh'),
    db.prepare(`
      INSERT INTO student_stars (student_id, stars_balance, total_earned_stars, stars_redeemed, star_debt, last_updated)
      SELECT ?, ?, ?, 0, 0, CURRENT_TIMESTAMP
      WHERE ? > 0 AND NOT EXISTS (SELECT 1 FROM student_star_ledger WHERE idempotency_key = ?)
      ON CONFLICT(student_id) DO UPDATE SET
        stars_balance = student_stars.stars_balance + excluded.stars_balance,
        total_earned_stars = student_stars.total_earned_stars + excluded.total_earned_stars,
        last_updated = CURRENT_TIMESTAMP
    `).bind(auth.user.id, reward, reward, reward, rewardKey),
    db.prepare(`
      INSERT INTO student_star_ledger (
        id, student_id, reference_id, delta_stars, amount, balance_after,
        action_type, reason, note, idempotency_key
      )
      SELECT ?, ?, ?, ?, ?, COALESCE((SELECT stars_balance FROM student_stars WHERE student_id = ?), 0),
             'attendance_reward', 'Điểm danh đúng giờ', 'Tự điểm danh theo thời khóa biểu', ?
      WHERE ? > 0
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(ledgerId, auth.user.id, sessionId, reward, reward, auth.user.id, rewardKey, reward)
  ]);

  const created = Number(results[0]?.meta?.changes || 0) > 0;
  return json({ success: true, check_in: { session_id: sessionId, session_date: today, status, stars_awarded: created ? reward : 0 }, idempotent_replay: !created });
}

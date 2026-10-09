import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '../../../../lib/server/auth.js';

export const prerender = false;

/**
 * GET /api/quiz-menu/children-results?child_id=
 * Phụ huynh xem kết quả quiz của con.
 * - Bắt buộc login, role = parent
 * - child_id phải thuộc parent qua parent_student_links.verification_status = 'verified', ngược lại 403
 * - Chỉ trả attempt đã nộp (submitted / review_pending / graded)
 * - Không trả answers_json, correct_answer, answer key
 */
export async function GET({ request, platform, url }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  const role = String(auth.user?.role || '').toLowerCase();
  if (role !== 'parent') {
    return json({ success: false, error: 'Forbidden: Chỉ phụ huynh xem được kết quả của con' }, { status: 403 });
  }
  const childId = String(url.searchParams.get('child_id') || '').trim();
  if (!childId) return json({ success: false, error: 'Thiếu child_id' }, { status: 400 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  try {
    // Verify: child thuộc parent và link đã verified
    const link = await db.prepare(
      `SELECT id FROM parent_student_links WHERE parent_user_id = ? AND student_user_id = ? AND verification_status = 'verified' LIMIT 1`
    ).bind(auth.user.id, childId).first();
    if (!link) {
      return json({ success: false, error: 'Forbidden: Học sinh này không thuộc tài khoản phụ huynh của bạn' }, { status: 403 });
    }

    const child = await db.prepare(`SELECT id, name, username FROM users WHERE id = ? LIMIT 1`).bind(childId).first();

    const rows = await db.prepare(`
      SELECT
        a.id AS attempt_id,
        a.quiz_id,
        q.title AS quiz_title,
        a.status,
        a.auto_score,
        a.final_score,
        a.max_score,
        a.duration_seconds,
        a.submitted_at
      FROM quiz_attempts a
      JOIN quizzes q ON q.id = a.quiz_id
      WHERE a.user_id = ?
        AND a.status IN ('submitted', 'review_pending', 'graded')
      ORDER BY a.submitted_at DESC
      LIMIT 100
    `).bind(childId).all();

    return json({
      success: true,
      child: child ? { id: child.id, name: child.name, username: child.username } : { id: childId },
      results: (rows.results || []).map((r) => ({
        attempt_id: r.attempt_id,
        quiz_id: r.quiz_id,
        quiz_title: r.quiz_title,
        status: r.status,
        auto_score: r.auto_score,
        final_score: r.final_score,
        max_score: r.max_score,
        duration_seconds: r.duration_seconds,
        submitted_at: r.submitted_at
      }))
    });
  } catch (e) {
    return json({ success: false, error: 'Không đọc được kết quả', message: e.message }, { status: 500 });
  }
}

import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../../lib/server/auth.js';
import { canManageQuiz, parseStoredJson, publicQuestion, sha256 } from '../../../../../lib/server/quizMenu.js';

export const prerender = false;

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

export async function GET({ params, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const attempt = await db.prepare(`
    SELECT a.*, q.title AS quiz_title, q.created_by
    FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.id = ? LIMIT 1
  `).bind(params.id).first();
  if (!attempt) return json({ success: false, error: 'AttemptNotFound' }, { status: 404 });

  const auth = await optionalAuth(request, platform);
  let allowed = false;
  let staff = false;
  if (attempt.user_id) {
    allowed = !!auth && String(auth.user.id) === String(attempt.user_id);
  } else {
    const token = request.headers.get('x-quiz-attempt-token') || '';
    allowed = !!token && await sha256(token) === attempt.guest_token_hash;
  }
  if (auth && isStaffUser(auth.user) && canManageQuiz(auth.user, attempt)) {
    allowed = true;
    staff = true;
  }
  if (!allowed) {
    const hasCredential = !!auth || !!request.headers.get('x-quiz-attempt-token');
    return json({ success: false, error: hasCredential ? 'AttemptNotFound' : 'Unauthorized' }, { status: hasCredential ? 404 : 401 });
  }

  const [reviewResult, questionResult] = await Promise.all([
    db.prepare(`
      SELECT id, reviewer_name, feedback_json, score_override, created_at
      FROM quiz_reviews WHERE attempt_id = ? ORDER BY datetime(created_at), id
    `).bind(attempt.id).all(),
    db.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order, id`).bind(attempt.quiz_id).all()
  ]);
  const revealAnswers = staff || attempt.status === 'graded';
  return json({
    success: true,
    attempt: {
      id: attempt.id,
      quiz_id: attempt.quiz_id,
      quiz_title: attempt.quiz_title,
      user_id: attempt.user_id || null,
      guest_name: attempt.guest_name || null,
      guest_class: attempt.guest_class || null,
      answers: parseStoredJson(attempt.answers_json, {}),
      deferred_question_ids: parseStoredJson(attempt.deferred_question_ids_json, []),
      saved_for_later_at: attempt.saved_for_later_at || null,
      auto_score: attempt.auto_score,
      final_score: attempt.final_score,
      max_score: attempt.max_score,
      status: attempt.status,
      duration_seconds: attempt.duration_seconds,
      started_at: attempt.started_at,
      submitted_at: attempt.submitted_at,
      questions: (questionResult.results || []).map((row) => publicQuestion(row, revealAnswers)),
      reviews: (reviewResult.results || []).map((review) => ({
        id: review.id,
        reviewer_name: review.reviewer_name || null,
        feedback: parseStoredJson(review.feedback_json, {}),
        score_override: review.score_override,
        created_at: review.created_at
      }))
    }
  });
}

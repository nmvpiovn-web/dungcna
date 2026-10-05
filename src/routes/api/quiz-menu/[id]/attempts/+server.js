import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../../lib/server/auth.js';
import { canManageQuiz, parseStoredJson, publicQuestion } from '../../../../../lib/server/quizMenu.js';

export const prerender = false;

export async function GET({ params, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });

  const quiz = await db.prepare(`SELECT * FROM quizzes WHERE id = ? LIMIT 1`).bind(params.id).first();
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  if (!canManageQuiz(auth.user, quiz)) return json({ success: false, error: 'Forbidden' }, { status: 403 });

  const [attemptResult, questionResult] = await Promise.all([
    db.prepare(`
      SELECT id, quiz_id, user_id, guest_name, answers_json, auto_score, final_score, max_score,
             status, duration_seconds, started_at, deadline_at, submitted_at,
             deferred_question_ids_json, saved_for_later_at
      FROM quiz_attempts WHERE quiz_id = ? ORDER BY datetime(started_at) DESC, id DESC
    `).bind(params.id).all(),
    db.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order, id`).bind(params.id).all()
  ]);
  const attempts = await Promise.all((attemptResult.results || []).map(async (attempt) => {
    const reviews = await db.prepare(`
      SELECT id, reviewer_id, reviewer_name, feedback_json, score_override, created_at
      FROM quiz_reviews WHERE attempt_id = ? ORDER BY datetime(created_at), id
    `).bind(attempt.id).all();
    return {
      ...attempt,
      answers: parseStoredJson(attempt.answers_json, {}),
      deferred_question_ids: parseStoredJson(attempt.deferred_question_ids_json, []),
      answers_json: undefined,
      deferred_question_ids_json: undefined,
      reviews: (reviews.results || []).map((review) => ({
        ...review,
        feedback: parseStoredJson(review.feedback_json, {}) ,
        feedback_json: undefined
      }))
    };
  }));

  return json({
    success: true,
    quiz: { id: quiz.id, title: quiz.title, created_by: quiz.created_by },
    questions: (questionResult.results || []).map((row) => publicQuestion(row, true)),
    attempts
  });
}

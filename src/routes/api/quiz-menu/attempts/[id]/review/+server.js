import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../../../lib/server/auth.js';
import { canManageQuiz, makeId, parseStoredJson } from '../../../../../../lib/server/quizMenu.js';

export const prerender = false;

function validateFeedback(input, subjectiveQuestions) {
  const source = typeof input === 'string' ? { summary: input, questions: [] } : input;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return { error: 'FeedbackInvalid' };
  const summary = String(source.summary || '').trim();
  if (summary.length > 5000) return { error: 'FeedbackTooLong' };
  const items = source.questions ?? [];
  if (!Array.isArray(items) || items.length > 200) return { error: 'FeedbackInvalid' };
  const byId = new Map(subjectiveQuestions.map((q) => [String(q.id), q]));
  const seen = new Set();
  const questions = [];
  for (const item of items) {
    const questionId = String(item?.question_id || '');
    const question = byId.get(questionId);
    if (!question || seen.has(questionId)) return { error: 'FeedbackQuestionInvalid' };
    const awarded = Number(item.awarded_points);
    const maxPoints = Number(question.points || 0);
    const comment = String(item.comment || '').trim();
    if (!Number.isFinite(awarded) || awarded < 0 || awarded > maxPoints) return { error: 'AwardedPointsInvalid' };
    if (comment.length > 2000) return { error: 'FeedbackTooLong' };
    seen.add(questionId);
    questions.push({ question_id: questionId, awarded_points: awarded, max_points: maxPoints, comment });
  }
  if (subjectiveQuestions.length && seen.size !== subjectiveQuestions.length) return { error: 'SubjectiveScoresIncomplete' };
  return { value: { summary, questions } };
}

export async function POST({ params, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const attempt = await db.prepare(`
    SELECT a.*, q.created_by, q.title AS quiz_title
    FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.id = ? LIMIT 1
  `).bind(params.id).first();
  if (!attempt) return json({ success: false, error: 'AttemptNotFound' }, { status: 404 });
  if (!canManageQuiz(auth.user, attempt)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  if (!['review_pending', 'graded'].includes(attempt.status)) return json({ success: false, error: 'AttemptNotReviewable' }, { status: 409 });

  const questionResult = await db.prepare(`SELECT id, type, points FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order, id`).bind(attempt.quiz_id).all();
  const subjective = (questionResult.results || []).filter((q) => q.type === 'paragraph' || q.type === 'rewrite');
  const feedback = validateFeedback(body.feedback, subjective);
  if (feedback.error) return json({ success: false, error: feedback.error }, { status: 400 });

  const maxScore = Number(attempt.max_score);
  const autoScore = Number(attempt.auto_score || 0);
  if (!Number.isFinite(maxScore) || maxScore < 0 || !Number.isFinite(autoScore)) {
    return json({ success: false, error: 'AttemptScoreInvalid' }, { status: 409 });
  }
  const computedScore = autoScore + feedback.value.questions.reduce((sum, item) => sum + item.awarded_points, 0);
  const hasOverride = body.score_override !== undefined && body.score_override !== null && body.score_override !== '';
  const scoreOverride = hasOverride ? Number(body.score_override) : null;
  if (hasOverride && (!Number.isFinite(scoreOverride) || scoreOverride < 0 || scoreOverride > maxScore)) {
    return json({ success: false, error: 'ScoreOverrideOutOfRange' }, { status: 400 });
  }
  if (computedScore < 0 || computedScore > maxScore) return json({ success: false, error: 'ComputedScoreOutOfRange' }, { status: 409 });
  const finalScore = hasOverride ? scoreOverride : computedScore;
  const reviewId = makeId('qrv');
  const auditFeedback = {
    ...feedback.value,
    computed_score: computedScore,
    previous_final_score: attempt.final_score == null ? null : Number(attempt.final_score)
  };
  const reviewerName = String(auth.user.name || auth.user.username || auth.user.id).slice(0, 150);
  await db.batch([
    db.prepare(`
      INSERT INTO quiz_reviews (id, attempt_id, reviewer_id, reviewer_name, feedback_json, score_override)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(reviewId, attempt.id, auth.user.id, reviewerName, JSON.stringify(auditFeedback), scoreOverride),
    db.prepare(`UPDATE quiz_attempts SET final_score = ?, status = 'graded' WHERE id = ?`).bind(finalScore, attempt.id)
  ]);

  return json({
    success: true,
    review: {
      id: reviewId,
      attempt_id: attempt.id,
      reviewer_id: auth.user.id,
      reviewer_name: reviewerName,
      feedback: auditFeedback,
      score_override: scoreOverride
    },
    attempt: { id: attempt.id, status: 'graded', auto_score: autoScore, final_score: finalScore, max_score: maxScore }
  }, { status: 201 });
}

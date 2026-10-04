import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '../../../../../lib/server/auth.js';
import { gradeAnswers, makeId, requestIp, sanitizeGuestName, sha256 } from '../../../../../lib/server/quizMenu.js';

export const prerender = false;

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

export async function POST({ params, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  const auth = await optionalAuth(request, platform);
  const action = body.action || (body.attempt_id ? 'submit' : 'start');
  const quiz = await db.prepare(`SELECT id, title, time_limit_minutes, status FROM quizzes WHERE id = ? LIMIT 1`).bind(params.id).first();
  if (!quiz || quiz.status !== 'published') return json({ success: false, error: 'QuizNotFound' }, { status: 404 });

  if (action === 'start') {
    const guestName = auth ? null : sanitizeGuestName(body.guest_name);
    if (!auth && !guestName) return json({ success: false, error: 'Vui lòng nhập tên' }, { status: 400 });
    const ipHash = await sha256(requestIp(request));
    const recent = await db.prepare(`
      SELECT COUNT(*) AS count FROM quiz_attempts
      WHERE client_ip_hash = ? AND datetime(started_at) >= datetime('now', '-1 minute')
    `).bind(ipHash).first();
    if (Number(recent?.count || 0) >= 10) return json({ success: false, error: 'RateLimitExceeded' }, { status: 429 });
    const id = makeId('qat');
    const guestToken = auth ? null : `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const guestTokenHash = guestToken ? await sha256(guestToken) : null;
    const limit = Number(quiz.time_limit_minutes);
    await db.prepare(`
      INSERT INTO quiz_attempts (id, quiz_id, user_id, guest_name, guest_token_hash, client_ip_hash, status, deadline_at)
      VALUES (?, ?, ?, ?, ?, ?, 'in_progress', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))
    `).bind(id, quiz.id, auth?.user?.id || null, guestName, guestTokenHash, ipHash, `+${limit} minutes`).run();
    const attempt = await db.prepare(`SELECT started_at, deadline_at FROM quiz_attempts WHERE id = ?`).bind(id).first();
    return json({ success: true, attempt_id: id, attempt_token: guestToken, started_at: attempt.started_at, deadline_at: attempt.deadline_at, time_limit_minutes: limit }, { status: 201 });
  }

  if (action !== 'submit') return json({ success: false, error: 'ActionNotSupported' }, { status: 400 });
  const attemptId = String(body.attempt_id || '');
  const attempt = await db.prepare(`SELECT * FROM quiz_attempts WHERE id = ? AND quiz_id = ? LIMIT 1`).bind(attemptId, quiz.id).first();
  if (!attempt) return json({ success: false, error: 'AttemptNotFound' }, { status: 404 });
  if (attempt.status !== 'in_progress') return json({ success: false, error: 'AttemptAlreadyClosed' }, { status: 409 });
  if (attempt.user_id) {
    if (!auth || auth.user.id !== attempt.user_id) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  } else {
    const suppliedHash = await sha256(String(body.attempt_token || ''));
    if (!body.attempt_token || suppliedHash !== attempt.guest_token_hash) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  const now = Date.now();
  const deadline = Date.parse(attempt.deadline_at);
  if (!Number.isFinite(deadline) || now > deadline + 5000) {
    await db.prepare(`UPDATE quiz_attempts SET status = 'expired', submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(attempt.id).run();
    return json({ success: false, error: 'TimeLimitExceeded' }, { status: 409 });
  }
  const answers = body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return json({ success: false, error: 'AnswersInvalid' }, { status: 400 });
  const serializedAnswers = JSON.stringify(answers);
  if (serializedAnswers.length > 500_000) return json({ success: false, error: 'AnswersTooLarge' }, { status: 413 });
  const questionResult = await db.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order, id`).bind(quiz.id).all();
  const questions = questionResult.results || [];
  if (!questions.length) return json({ success: false, error: 'QuizHasNoQuestions' }, { status: 409 });
  const score = gradeAnswers(questions, answers);
  const started = Date.parse(attempt.started_at);
  const duration = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null;
  const status = score.needsReview ? 'review_pending' : 'graded';
  const finalScore = score.needsReview ? null : score.autoScore;
  const committed = await db.prepare(`
    UPDATE quiz_attempts
    SET answers_json = ?, auto_score = ?, final_score = ?, max_score = ?, status = ?, duration_seconds = ?, submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND status = 'in_progress'
  `).bind(serializedAnswers, score.autoScore, finalScore, score.maxScore, status, duration, attempt.id).run();
  const changed = committed?.meta?.changes ?? committed?.changes;
  if (changed === 0) return json({ success: false, error: 'AttemptAlreadyClosed' }, { status: 409 });
  return json({
    success: true,
    attempt: { id: attempt.id, status, auto_score: score.autoScore, final_score: finalScore, max_score: score.maxScore, duration_seconds: duration },
    grading: score.grading
  });
}

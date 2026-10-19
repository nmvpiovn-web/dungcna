import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../../lib/server/auth.js';
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
    // Student isolation: chỉ được làm quiz được giao cho lớp mình
    if (auth?.authenticated && !isStaffUser(auth.user) && String(auth.user.role || '').toLowerCase() === 'student') {
      const assigned = await db.prepare(`
        SELECT 1 FROM homework_assignments ha
        JOIN class_enrollments ce ON ce.class_id = ha.class_id
        WHERE ha.source_quiz_id = ? AND ha.status = 'published'
          AND ce.user_id = ? AND ce.status = 'active'
        LIMIT 1
      `).bind(params.id, auth.user.id).first();
      if (!assigned) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
    }
    const guestName = auth ? null : sanitizeGuestName(body.guest_name);
    const guestClass = auth ? null : sanitizeGuestName(body.guest_class);
    if (!auth && !guestClass) return json({ success: false, error: 'Vui lòng nhập lớp' }, { status: 400 });
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
      INSERT INTO quiz_attempts (id, quiz_id, user_id, guest_name, guest_class, guest_token_hash, client_ip_hash, status, deadline_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))
    `).bind(id, quiz.id, auth?.user?.id || null, guestName, guestClass, guestTokenHash, ipHash, `+${limit} minutes`).run();
    const attempt = await db.prepare(`SELECT started_at, deadline_at FROM quiz_attempts WHERE id = ?`).bind(id).first();
    return json({ success: true, attempt_id: id, attempt_token: guestToken, started_at: attempt.started_at, deadline_at: attempt.deadline_at, time_limit_minutes: limit }, { status: 201 });
  }

  if (!['submit', 'save_for_later'].includes(action)) return json({ success: false, error: 'ActionNotSupported' }, { status: 400 });
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
  const questionIds = new Set(questions.map((question) => String(question.id)));
  const deferred = [...new Set([
    ...(Array.isArray(body.deferred_question_ids) ? body.deferred_question_ids : []),
    ...Object.entries(answers).filter(([, value]) => value?.state === 'not_understood').map(([id]) => id)
  ].map(String).filter((id) => questionIds.has(id)))];
  if (action === 'save_for_later') {
    const saved = await db.prepare(`
      UPDATE quiz_attempts
      SET answers_json = ?, deferred_question_ids_json = ?, saved_for_later_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND status = 'in_progress'
    `).bind(serializedAnswers, JSON.stringify(deferred), attempt.id).run();
    const changed = saved?.meta?.changes ?? saved?.changes;
    if (changed === 0) return json({ success: false, error: 'AttemptAlreadyClosed' }, { status: 409 });
    return json({
      success: true,
      saved_for_later: true,
      attempt: { id: attempt.id, status: 'in_progress', deferred_question_ids: deferred, deadline_at: attempt.deadline_at }
    });
  }
  if (deferred.length) {
    return json({ success: false, error: 'DeferredQuestionsRemain', deferred_question_ids: deferred }, { status: 409 });
  }
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

  // Auto-sync into homework_submissions if this quiz is linked to homework assignments for the student
  let syncedHomeworkCount = 0;
  if (attempt.user_id) {
    try {
      const linkedHwRes = await db.prepare(`
        SELECT ha.id, ha.title, ha.max_score, ha.teacher_id, ha.teacher_name
        FROM homework_assignments ha
        JOIN class_enrollments ce ON ce.class_id = ha.class_id
        WHERE ha.source_quiz_id = ? AND ha.status = 'published'
          AND ce.user_id = ? AND ce.status = 'active'
      `).bind(quiz.id, attempt.user_id).all();
      const linkedAssignments = linkedHwRes?.results || [];
      const studentName = auth?.user?.name || auth?.user?.username || 'Học sinh';
      for (const hw of linkedAssignments) {
        const hwMax = Number(hw.max_score) || 10;
        const normalizedScore = score.maxScore > 0
          ? Number(((Number(score.autoScore || 0) / Number(score.maxScore)) * hwMax).toFixed(2))
          : 0;
        const hwStatus = score.needsReview ? 'submitted' : 'graded';
        const summaryText = `Đã hoàn thành bài Quiz "${quiz.title}" (${score.autoScore}/${score.maxScore} điểm câu hỏi • Quy đổi: ${normalizedScore}/${hwMax})`;
        const existingSub = await db.prepare(
          `SELECT id FROM homework_submissions WHERE assignment_id = ? AND student_id = ? LIMIT 1`
        ).bind(hw.id, attempt.user_id).first();
        if (existingSub?.id) {
          await db.prepare(`
            UPDATE homework_submissions
            SET content_text = ?, score = ?, status = ?, submitted_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(summaryText, score.needsReview ? null : normalizedScore, hwStatus, existingSub.id).run();
        } else {
          const subId = `sub_qz_${hw.id}_${attempt.user_id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          await db.prepare(`
            INSERT INTO homework_submissions (
              id, assignment_id, student_id, student_name, submission_type, content_text,
              submitted_at, is_on_time, graded_by_teacher_id, graded_by_teacher_name, graded_at,
              score, teacher_feedback, status
            ) VALUES (?, ?, ?, ?, 'text', ?, CURRENT_TIMESTAMP, 1, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
          `).bind(
            subId,
            hw.id,
            attempt.user_id,
            studentName,
            summaryText,
            score.needsReview ? null : (hw.teacher_id || 'system_auto'),
            score.needsReview ? null : (hw.teacher_name || 'Chấm tự động Quiz'),
            score.needsReview ? null : normalizedScore,
            score.needsReview ? 'Đang chờ giáo viên chấm câu tự luận trong Quiz' : 'Hệ thống tự động đồng bộ điểm từ bài Quiz đính kèm.',
            hwStatus
          ).run();
        }
        syncedHomeworkCount++;
      }
    } catch {}
  }

  // Guests only learn correct/wrong per question — never the answer key or
  // explanations (prevents submit-once-to-harvest-answers, then retake).
  const isGuestSubmit = !attempt.user_id;
  const grading = isGuestSubmit
    ? score.grading.map(g => ({
        question_id: g.question_id,
        type: g.type,
        correct: g.correct,
        awarded_points: g.awarded_points,
        max_points: g.max_points
      }))
    : score.grading;
  return json({
    success: true,
    attempt: { id: attempt.id, status, auto_score: score.autoScore, final_score: finalScore, max_score: score.maxScore, duration_seconds: duration },
    synced_homework_count: syncedHomeworkCount,
    grading
  });
}

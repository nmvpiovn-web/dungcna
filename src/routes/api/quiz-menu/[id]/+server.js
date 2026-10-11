import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../lib/server/auth.js';
import { publicQuestion, validateQuestion, canManageQuiz } from '../../../../lib/server/quizMenu.js';

export const prerender = false;

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

async function getQuiz(db, id) {
  return db.prepare(`SELECT * FROM quizzes WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function GET({ params, url, request, platform }) {
  if (!platform?.env?.DB) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const db = platform.env.DB;
  const quiz = await getQuiz(db, params.id);
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  const auth = await optionalAuth(request, platform);
  const staff = !!(auth && isStaffUser(auth.user));
  if (quiz.status !== 'published' && !staff) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  // Student isolation: chỉ được xem quiz published ĐƯỢC GIAO cho lớp mình
  if (auth?.authenticated && !staff && String(auth.user.role || '').toLowerCase() === 'student') {
    const assigned = await db.prepare(`
      SELECT 1 FROM homework_assignments ha
      JOIN class_enrollments ce ON ce.class_id = ha.class_id
      WHERE ha.source_quiz_id = ? AND ha.status = 'published'
        AND ce.user_id = ? AND ce.status = 'active'
      LIMIT 1
    `).bind(params.id, auth.user.id).first();
    if (!assigned) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  }
  const reqUrl = url || (request?.url ? new URL(request.url) : null);
  const includeAnswers = staff && reqUrl?.searchParams?.get('include_answers') === '1';
  const rows = await db.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order, id`).bind(params.id).all();
  return json({
    success: true,
    quiz: {
      id: quiz.id, title: quiz.title, description: quiz.description, creator_name: quiz.creator_name,
      time_limit_minutes: quiz.time_limit_minutes, status: quiz.status,
      created_at: quiz.created_at, updated_at: quiz.updated_at,
      questions: (rows.results || []).map((row) => publicQuestion(row, includeAnswers))
    }
  });
}

export async function PUT({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  const existing = await getQuiz(db, params.id);
  if (!existing) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  // Ownership check: teacher chỉ sửa quiz của mình, leader/admin/superadmin sửa được tất cả
  if (!canManageQuiz(auth.user, existing)) return json({ success: false, error: 'Forbidden: bạn chỉ sửa được quiz do mình tạo' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  const title = String(body.title ?? existing.title).trim();
  const description = String(body.description ?? existing.description ?? '').trim();
  const status = String(body.status ?? existing.status);
  const timeLimit = Number(body.time_limit_minutes ?? existing.time_limit_minutes);
  if (!title || title.length > 150 || description.length > 2000) return json({ success: false, error: 'Nội dung quiz không hợp lệ' }, { status: 400 });
  if (!['draft', 'published', 'archived'].includes(status)) return json({ success: false, error: 'Trạng thái không hợp lệ' }, { status: 400 });
  if (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 180) return json({ success: false, error: 'Thời gian phải từ 1-180 phút' }, { status: 400 });
  const questions = body.questions;
  const validated = [];
  if (questions !== undefined) {
    if (!Array.isArray(questions) || questions.length > 200) return json({ success: false, error: 'Danh sách câu hỏi không hợp lệ' }, { status: 400 });
    for (let i = 0; i < questions.length; i++) {
      const result = validateQuestion(questions[i], i);
      if (result.error) return json({ success: false, error: result.error }, { status: 400 });
      validated.push(result.value);
    }
    if (new Set(validated.map((q) => q.id)).size !== validated.length) {
      return json({ success: false, error: 'ID câu hỏi bị trùng' }, { status: 400 });
    }
  }
  if (status === 'published') {
    const count = questions === undefined
      ? await db.prepare(`SELECT COUNT(*) AS count FROM quiz_questions WHERE quiz_id = ?`).bind(params.id).first()
      : { count: validated.length };
    if (!Number(count?.count)) return json({ success: false, error: 'Không thể xuất bản quiz chưa có câu hỏi' }, { status: 400 });
  }
  try {
    const mergeStrategy = body.merge_strategy === 'append' ? 'append' : 'replace';
    let startOrder = 0;
    let existingPrompts = new Set();
    let existingIds = new Set();
    if (questions !== undefined && mergeStrategy === 'append') {
      const existingRows = await db.prepare(`SELECT id, prompt FROM quiz_questions WHERE quiz_id = ?`).bind(params.id).all();
      existingPrompts = new Set((existingRows?.results || []).map((r) => r.prompt?.trim().toLowerCase()));
      existingIds = new Set((existingRows?.results || []).map((r) => r.id));
      const currentCount = (existingRows?.results || []).length;
      const trulyNewCount = validated.filter((q) => !existingPrompts.has(q.prompt?.trim().toLowerCase())).length;
      if (currentCount + trulyNewCount > 200) {
        return json({ success: false, error: 'Tổng số câu hỏi không được vượt quá 200' }, { status: 400 });
      }
      const maxRow = await db.prepare(`SELECT COALESCE(MAX(q_order), -1) AS max_order FROM quiz_questions WHERE quiz_id = ?`).bind(params.id).first();
      startOrder = (Number(maxRow?.max_order) ?? -1) + 1;
    }

    let hasSourcesTable = false;
    let hasSourceCols = false;
    try {
      await db.prepare(`SELECT 1 FROM quiz_question_sources LIMIT 1`).first();
      hasSourcesTable = true;
    } catch {
      hasSourcesTable = false;
    }
    try {
      await db.prepare(`SELECT source_type, source_id FROM quiz_questions LIMIT 1`).first();
      hasSourceCols = true;
    } catch {
      hasSourceCols = false;
    }

    const statements = [db.prepare(`
      UPDATE quizzes SET title = ?, description = ?, time_limit_minutes = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?
    `).bind(title, description || null, timeLimit, status, params.id)];

    if (questions !== undefined) {
      if (mergeStrategy !== 'append') {
        statements.push(db.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(params.id));
        if (hasSourcesTable) {
          statements.push(db.prepare(`DELETE FROM quiz_question_sources WHERE quiz_id = ?`).bind(params.id));
        }
      }
      let appendedIndex = 0;
      for (let i = 0; i < validated.length; i++) {
        const q = validated[i];
        if (mergeStrategy === 'append' && existingPrompts.has(q.prompt?.trim().toLowerCase())) {
          // Deduplicate identical prompt already present in this quiz
          continue;
        }
        let qId = q.id;
        if (existingIds.has(qId)) {
          qId = makeId('qq');
        }
        existingIds.add(qId);

        const order = mergeStrategy === 'append' ? startOrder + appendedIndex : q.q_order;
        appendedIndex++;

        if (hasSourceCols) {
          statements.push(db.prepare(`
            INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order, source_type, source_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(qId, params.id, q.type, q.prompt, q.prompt_image_url, q.options_json, q.correct_answer, q.explanation, q.points, order, q.source_type || null, q.source_id || null));
        } else {
          statements.push(db.prepare(`
            INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(qId, params.id, q.type, q.prompt, q.prompt_image_url, q.options_json, q.correct_answer, q.explanation, q.points, order));
        }

        if (hasSourcesTable && q.source_type && q.source_id) {
          const qqsId = 'qqs_' + params.id + '_' + qId + '_' + q.source_type + '_' + q.source_id + '_' + (q.source_sub_id || 0);
          statements.push(db.prepare(`
            INSERT OR REPLACE INTO quiz_question_sources (id, quiz_id, question_id, source_type, source_id, source_sub_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(qqsId, params.id, qId, q.source_type, q.source_id, q.source_sub_id || null));
        }
      }
    }
    await db.batch(statements);
    return json({ success: true, quiz: { id: params.id, title, description, time_limit_minutes: timeLimit, status, question_count: questions === undefined ? undefined : validated.length } });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE({ params, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const quiz = await getQuiz(platform.env.DB, params.id);
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  // Ownership check: teacher chỉ xóa quiz của mình, leader/admin/superadmin xóa được tất cả
  if (!canManageQuiz(auth.user, quiz)) return json({ success: false, error: 'Forbidden: bạn chỉ xóa được quiz do mình tạo' }, { status: 403 });
  await platform.env.DB.prepare(`DELETE FROM quizzes WHERE id = ?`).bind(params.id).run();
  return json({ success: true });
}

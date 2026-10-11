import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../../lib/server/auth.js';
import { canManageQuiz } from '../../../../../lib/server/quizMenu.js';
import { mapBankQuestionToQuizQuestion } from '../../../../../lib/server/quizBankBridge.js';

export const prerender = false;

async function getQuiz(db, id) {
  return db.prepare(`SELECT * FROM quizzes WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function POST({ params, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Yêu cầu quyền giáo viên hoặc quản trị' }, { status: 403 });

  const quiz = await getQuiz(db, params.id);
  if (!quiz) return json({ success: false, error: 'QuizNotFound' }, { status: 404 });
  if (!canManageQuiz(auth.user, quiz)) return json({ success: false, error: 'Forbidden: Bạn chỉ sửa được quiz do mình tạo' }, { status: 403 });
  if (quiz.status !== 'draft') return json({ success: false, error: 'Chỉ có thể nhập câu hỏi vào quiz ở trạng thái nháp (draft)' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const questionIds = Array.isArray(body.question_ids) ? body.question_ids.map((id) => String(id).trim()).filter(Boolean) : null;
  const countParam = Number.parseInt(body.count || '10', 10);
  const count = Math.min(Math.max(Number.isFinite(countParam) ? countParam : 10, 1), 50);
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};
  const mergeStrategy = body.merge_strategy === 'replace' ? 'replace' : 'append';

  // Fetch candidate bank rows
  let bankRows = [];
  if (questionIds && questionIds.length > 0) {
    if (questionIds.length > 50) {
      return json({ success: false, error: 'Số lượng câu hỏi chọn trực tiếp không được vượt quá 50' }, { status: 400 });
    }
    const placeholders = questionIds.map(() => '?').join(', ');
    const notExistsSql = mergeStrategy === 'replace' ? '' : `
      AND NOT EXISTS (
        SELECT 1 FROM quiz_questions qq
        WHERE qq.quiz_id = ?
          AND (
            (qq.source_type = 'question_bank' AND qq.source_id = qb.id)
            OR qq.id = ('qq_' || ? || '_' || qb.id)
          )
      )`;
    const bindings = mergeStrategy === 'replace' ? [...questionIds] : [...questionIds, params.id, params.id];
    const res = await db.prepare(
      `SELECT qb.* FROM question_bank qb
       WHERE qb.id IN (${placeholders})
         AND qb.status = 'published'
         ${notExistsSql}
       ORDER BY qb.id ASC`
    ).bind(...bindings).all();
    bankRows = res.results || [];
  } else {
    // Filter-based import: fetch next batch of matching questions
    const whereConditions = ["qb.status = 'published'"];
    const bindings = [];

    const gradeLevel = filters.grade_level?.trim();
    if (gradeLevel) {
      if (gradeLevel === '7' || gradeLevel === 'lop_7') {
        whereConditions.push("(qb.grade_level = '7' OR qb.grade_level = 'lop_7')");
      } else {
        whereConditions.push('qb.grade_level = ?');
        bindings.push(gradeLevel);
      }
    }
    if (filters.curriculum_id?.trim()) {
      whereConditions.push('qb.curriculum_id = ?');
      bindings.push(filters.curriculum_id.trim());
    }
    if (filters.topic?.trim()) {
      whereConditions.push('qb.topic = ?');
      bindings.push(filters.topic.trim());
    }
    if (filters.skill_category?.trim()) {
      whereConditions.push('qb.skill_category = ?');
      bindings.push(filters.skill_category.trim());
    }
    if (filters.cognitive_level?.trim()) {
      whereConditions.push('qb.cognitive_level = ?');
      bindings.push(filters.cognitive_level.trim());
    }
    if (filters.question_type?.trim()) {
      whereConditions.push('qb.question_type = ?');
      bindings.push(filters.question_type.trim());
    }

    if (mergeStrategy !== 'replace') {
      whereConditions.push(`
        NOT EXISTS (
          SELECT 1 FROM quiz_questions qq
          WHERE qq.quiz_id = ?
            AND (
              (qq.source_type = 'question_bank' AND qq.source_id = qb.id)
              OR qq.id = ('qq_' || ? || '_' || qb.id)
              OR TRIM(qq.prompt) = TRIM(qb.question_text)
            )
        )
      `);
      bindings.push(params.id, params.id);
    }

    const whereSql = whereConditions.join(' AND ');
    bindings.push(count);
    const res = await db.prepare(
      `SELECT qb.* FROM question_bank qb
       WHERE ${whereSql}
       ORDER BY qb.id ASC LIMIT ?`
    ).bind(...bindings).all();
    bankRows = res.results || [];
  }

  if (!bankRows.length) {
    if (questionIds && questionIds.length > 0) {
      // Check if those question IDs exist in question_bank
      const placeholders = questionIds.map(() => '?').join(', ');
      const qbCheck = await db.prepare(
        `SELECT COUNT(*) as c FROM question_bank WHERE id IN (${placeholders})`
      ).bind(...questionIds).first();

      if (qbCheck && qbCheck.c > 0) {
        const totalCount = (await db.prepare('SELECT COUNT(*) as c FROM quiz_questions WHERE quiz_id = ?').bind(params.id).first())?.c || 0;
        return json({
          success: true,
          imported_count: 0,
          total_questions: totalCount,
          message: 'Tất cả câu hỏi được chọn đã có trong quiz này (tránh trùng lặp).'
        });
      }
    }
    return json({ success: false, error: 'Không tìm thấy câu hỏi nào phù hợp từ kho câu hỏi' }, { status: 400 });
  }

  // Fetch current questions for deduplication and ordering
  let hasSourcesTable = false;
  try {
    await db.prepare(`SELECT 1 FROM quiz_question_sources LIMIT 1`).first();
    hasSourcesTable = true;
  } catch {
    hasSourcesTable = false;
  }

  const isReplace = mergeStrategy === 'replace';
  const existingQuestionsRes = isReplace
    ? { results: [] }
    : await db.prepare(
        `SELECT id, prompt, q_order, source_id FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order ASC`
      ).bind(params.id).all();
  const existingQuestions = existingQuestionsRes.results || [];
  const existingIds = new Set(existingQuestions.map((q) => q.id));
  const existingSourceIds = new Set(existingQuestions.map((q) => q.source_id).filter(Boolean));
  const existingPrompts = new Set(existingQuestions.map((q) => q.prompt.trim()));

  let nextOrder = (!isReplace && existingQuestions.length > 0)
    ? Math.max(...existingQuestions.map((q) => Number(q.q_order || 0))) + 1
    : 0;

  const toInsert = [];
  for (const row of bankRows) {
    const candidate = mapBankQuestionToQuizQuestion(row, params.id, nextOrder);
    // Extra guard against duplication
    if (!isReplace && (existingIds.has(candidate.id) || existingSourceIds.has(row.id) || existingPrompts.has(candidate.prompt.trim()))) {
      continue;
    }
    toInsert.push(candidate);
    existingIds.add(candidate.id);
    existingSourceIds.add(row.id);
    existingPrompts.add(candidate.prompt.trim());
    nextOrder++;
  }

  if (!toInsert.length) {
    return json({
      success: true,
      imported_count: 0,
      total_questions: isReplace ? 0 : existingQuestions.length,
      message: 'Tất cả câu hỏi được chọn đã có trong quiz này (tránh trùng lặp).'
    });
  }

  const finalCount = isReplace ? toInsert.length : (existingQuestions.length + toInsert.length);
  if (finalCount > 200) {
    return json({
      success: false,
      error: `Tổng số câu hỏi của quiz không được vượt quá 200 (hiện tại: ${existingQuestions.length}, muốn thêm: ${toInsert.length})`
    }, { status: 400 });
  }

  try {
    const statements = [];
    if (isReplace) {
      statements.push(db.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(params.id));
      if (hasSourcesTable) {
        statements.push(db.prepare(`DELETE FROM quiz_question_sources WHERE quiz_id = ?`).bind(params.id));
      }
    }

    for (const q of toInsert) {
      statements.push(db.prepare(`
        INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order, source_type, source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(q.id, q.quiz_id, q.type, q.prompt, q.prompt_image_url, q.options_json, q.correct_answer, q.explanation, q.points, q.q_order, q.source_type, q.source_id));

      if (hasSourcesTable && q.source_type && q.source_id) {
        const qqsId = 'qqs_' + params.id + '_' + q.id + '_' + q.source_type + '_' + q.source_id + '_0';
        statements.push(db.prepare(`
          INSERT OR REPLACE INTO quiz_question_sources (id, quiz_id, question_id, source_type, source_id, source_sub_id)
          VALUES (?, ?, ?, ?, ?, NULL)
        `).bind(qqsId, params.id, q.id, q.source_type, q.source_id));
      }
    }

    statements.push(
      db.prepare(`UPDATE quizzes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(params.id)
    );

    await db.batch(statements);

    return json({
      success: true,
      imported_count: toInsert.length,
      total_questions: finalCount,
      imported_questions: toInsert.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        options: JSON.parse(q.options_json),
        points: q.points,
        q_order: q.q_order,
        source_type: q.source_type,
        source_id: q.source_id
      }))
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

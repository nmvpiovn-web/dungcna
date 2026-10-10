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

  // Fetch candidate bank rows
  let bankRows = [];
  if (questionIds && questionIds.length > 0) {
    if (questionIds.length > 50) {
      return json({ success: false, error: 'Số lượng câu hỏi chọn trực tiếp không được vượt quá 50' }, { status: 400 });
    }
    const placeholders = questionIds.map(() => '?').join(', ');
    const res = await db.prepare(
      `SELECT * FROM question_bank WHERE id IN (${placeholders}) AND status = 'published' ORDER BY id ASC`
    ).bind(...questionIds).all();
    bankRows = res.results || [];
  } else {
    // Filter-based import
    const whereConditions = ["status = 'published'"];
    const bindings = [];

    const gradeLevel = filters.grade_level?.trim();
    if (gradeLevel) {
      if (gradeLevel === '7' || gradeLevel === 'lop_7') {
        whereConditions.push("(grade_level = '7' OR grade_level = 'lop_7')");
      } else {
        whereConditions.push('grade_level = ?');
        bindings.push(gradeLevel);
      }
    }
    if (filters.curriculum_id?.trim()) {
      whereConditions.push('curriculum_id = ?');
      bindings.push(filters.curriculum_id.trim());
    }
    if (filters.topic?.trim()) {
      whereConditions.push('topic = ?');
      bindings.push(filters.topic.trim());
    }
    if (filters.skill_category?.trim()) {
      whereConditions.push('skill_category = ?');
      bindings.push(filters.skill_category.trim());
    }
    if (filters.cognitive_level?.trim()) {
      whereConditions.push('cognitive_level = ?');
      bindings.push(filters.cognitive_level.trim());
    }
    if (filters.question_type?.trim()) {
      whereConditions.push('question_type = ?');
      bindings.push(filters.question_type.trim());
    }

    const whereSql = whereConditions.join(' AND ');
    const res = await db.prepare(
      `SELECT * FROM question_bank WHERE ${whereSql} ORDER BY id ASC LIMIT ?`
    ).bind(...bindings, count).all();
    bankRows = res.results || [];
  }

  if (!bankRows.length) {
    return json({ success: false, error: 'Không tìm thấy câu hỏi nào phù hợp từ kho câu hỏi' }, { status: 400 });
  }

  // Fetch current questions for deduplication and ordering
  const existingQuestionsRes = await db.prepare(
    `SELECT id, prompt, q_order FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order ASC`
  ).bind(params.id).all();
  const existingQuestions = existingQuestionsRes.results || [];
  const existingIds = new Set(existingQuestions.map((q) => q.id));
  const existingPrompts = new Set(existingQuestions.map((q) => q.prompt.trim()));

  let nextOrder = existingQuestions.length > 0
    ? Math.max(...existingQuestions.map((q) => Number(q.q_order || 0))) + 1
    : 0;

  const toInsert = [];
  for (const row of bankRows) {
    const candidate = mapBankQuestionToQuizQuestion(row, params.id, nextOrder);
    // Deduplication by deterministic ID and trimmed prompt
    if (existingIds.has(candidate.id) || existingPrompts.has(candidate.prompt.trim())) {
      continue;
    }
    toInsert.push(candidate);
    existingIds.add(candidate.id);
    existingPrompts.add(candidate.prompt.trim());
    nextOrder++;
  }

  if (!toInsert.length) {
    return json({
      success: true,
      imported_count: 0,
      total_questions: existingQuestions.length,
      message: 'Tất cả câu hỏi được chọn đã có trong quiz này (tránh trùng lặp).'
    });
  }

  if (existingQuestions.length + toInsert.length > 200) {
    return json({
      success: false,
      error: `Tổng số câu hỏi của quiz không được vượt quá 200 (hiện tại: ${existingQuestions.length}, muốn thêm: ${toInsert.length})`
    }, { status: 400 });
  }

  try {
    const statements = toInsert.map((q) =>
      db.prepare(`
        INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(q.id, q.quiz_id, q.type, q.prompt, q.prompt_image_url, q.options_json, q.correct_answer, q.explanation, q.points, q.q_order)
    );

    statements.push(
      db.prepare(`UPDATE quizzes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(params.id)
    );

    await db.batch(statements);

    return json({
      success: true,
      imported_count: toInsert.length,
      total_questions: existingQuestions.length + toInsert.length,
      imported_questions: toInsert.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        options: JSON.parse(q.options_json),
        points: q.points,
        q_order: q.q_order
      }))
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

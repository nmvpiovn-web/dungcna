import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../lib/server/auth.js';
import { safePublicBankQuestion } from '../../../../lib/server/quizBankBridge.js';

export const prerender = false;

export async function GET({ url, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Yêu cầu quyền giáo viên hoặc quản trị' }, { status: 403 });

  const gradeLevel = url.searchParams.get('grade_level')?.trim();
  const curriculumId = url.searchParams.get('curriculum_id')?.trim();
  const topic = url.searchParams.get('topic')?.trim();
  const skillCategory = url.searchParams.get('skill_category')?.trim();
  const cognitiveLevel = url.searchParams.get('cognitive_level')?.trim();
  const questionType = url.searchParams.get('question_type')?.trim();
  const q = url.searchParams.get('q')?.trim();

  const limitParam = Number.parseInt(url.searchParams.get('limit') || '20', 10);
  const offsetParam = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1), 100);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

  const whereConditions = ["status = 'published'"];
  const bindings = [];

  if (gradeLevel) {
    // Support matching both '7' and 'lop_7' or explicit grade
    if (gradeLevel === '7' || gradeLevel === 'lop_7') {
      whereConditions.push("(grade_level = '7' OR grade_level = 'lop_7')");
    } else {
      whereConditions.push('grade_level = ?');
      bindings.push(gradeLevel);
    }
  }

  if (curriculumId) {
    whereConditions.push('curriculum_id = ?');
    bindings.push(curriculumId);
  }

  if (topic) {
    whereConditions.push('topic = ?');
    bindings.push(topic);
  }

  if (skillCategory) {
    whereConditions.push('skill_category = ?');
    bindings.push(skillCategory);
  }

  if (cognitiveLevel) {
    whereConditions.push('cognitive_level = ?');
    bindings.push(cognitiveLevel);
  }

  if (questionType) {
    whereConditions.push('question_type = ?');
    bindings.push(questionType);
  }

  if (q) {
    whereConditions.push('(question_text LIKE ? OR topic LIKE ?)');
    bindings.push(`%${q}%`, `%${q}%`);
  }

  const whereSql = whereConditions.join(' AND ');

  try {
    // 1. Get filtered total count
    const countResult = await db.prepare(
      `SELECT COUNT(*) AS total FROM question_bank WHERE ${whereSql}`
    ).bind(...bindings).first();
    const total = Number(countResult?.total || 0);

    // 2. Fetch paginated questions (WITHOUT correct_option_id and explanation)
    const itemsResult = await db.prepare(
      `SELECT id, grade_level, curriculum_id, topic, skill_category, cognitive_level, question_type,
              question_text, options_json, reading_passage, created_at
       FROM question_bank
       WHERE ${whereSql}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset).all();

    // 3. Facets for filter dropdowns (computed across all published question_bank rows)
    const [grades, skills, cognitives, curricula, topics] = await Promise.all([
      db.prepare(`SELECT grade_level, COUNT(*) as count FROM question_bank WHERE status = 'published' GROUP BY grade_level ORDER BY grade_level`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT skill_category, COUNT(*) as count FROM question_bank WHERE status = 'published' GROUP BY skill_category ORDER BY count DESC`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT cognitive_level, COUNT(*) as count FROM question_bank WHERE status = 'published' GROUP BY cognitive_level ORDER BY count DESC`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT curriculum_id, COUNT(*) as count FROM question_bank WHERE status = 'published' AND curriculum_id IS NOT NULL GROUP BY curriculum_id ORDER BY count DESC`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT topic, COUNT(*) as count FROM question_bank WHERE status = 'published' AND topic IS NOT NULL AND topic != '' GROUP BY topic ORDER BY count DESC LIMIT 30`).all().catch(() => ({ results: [] }))
    ]);

    return json({
      success: true,
      total,
      limit,
      offset,
      facets: {
        grade_level: grades.results || [],
        skill_category: skills.results || [],
        cognitive_level: cognitives.results || [],
        curriculum_id: curricula.results || [],
        topic: topics.results || []
      },
      questions: (itemsResult.results || []).map(safePublicBankQuestion)
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

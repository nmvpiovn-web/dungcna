import { json } from '@sveltejs/kit';

export const prerender = false;

export async function GET({ url, platform }) {
  const grade = url.searchParams.get('grade');
  const search = url.searchParams.get('search');

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  let sql = `SELECT id, topic, grade_level, curriculum_unit, category, cefr_level,
    summary, formula, usage, signal_words, phonics_rules, common_mistakes,
    examples, practice_questions FROM grammar_topics WHERE 1=1`;
  const params = [];

  if (grade && grade !== 'all') {
    sql += ` AND LOWER(grade_level) LIKE LOWER(?)`;
    params.push(`%${grade}%`);
  }
  if (search && search.trim()) {
    sql += ` AND (LOWER(topic) LIKE LOWER(?) OR LOWER(curriculum_unit) LIKE LOWER(?))`;
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }
  sql += ` ORDER BY topic ASC`;

  const res = await db.prepare(sql).bind(...params).all();
  const rows = (res.results || []).map(r => {
    // Parse JSON columns back to objects
    for (const k of ['formula', 'usage', 'signal_words', 'phonics_rules', 'common_mistakes', 'examples', 'practice_questions']) {
      if (typeof r[k] === 'string') {
        try { r[k] = JSON.parse(r[k]); } catch { /* keep raw */ }
      }
    }
    return r;
  });

  return json({ success: true, total: rows.length, source: 'd1', data: rows });
}

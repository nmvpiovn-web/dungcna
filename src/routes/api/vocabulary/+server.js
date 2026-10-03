import { json } from '@sveltejs/kit';

export const prerender = false;

export async function GET({ url, platform }) {
  const grade = url.searchParams.get('grade');
  const unit = url.searchParams.get('unit');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const level = url.searchParams.get('level');
  const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);

  // D1-only: khong fallback file tinh
  let results = [];

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  try {
    let sql = `SELECT id, word as term, ipa, pos, cefr_level as cambridge_level, meaning_vi, example_en, example_vi, grade_suitability as grade FROM cambridge_vocabulary WHERE 1=1`;
    const params = [];

    if (level && level !== 'all') {
      sql += ` AND LOWER(cefr_level) = LOWER(?)`;
      params.push(level);
    }
    if (search && search.trim()) {
      sql += ` AND (LOWER(word) LIKE LOWER(?) OR LOWER(meaning_vi) LIKE LOWER(?))`;
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    sql += ` ORDER BY word ASC LIMIT ?`;
    params.push(limit);

    const res = await db.prepare(sql).bind(...params).all();
    results = (res.results || []).map(r => ({
      id: r.id,
      term: r.term,
      ipa: r.ipa,
      pos: r.pos,
      meaning_vi: r.meaning_vi,
      example_en: r.example_en,
      example_vi: r.example_vi,
      cambridge_level: r.cambridge_level,
      grade: r.grade
    }));
  } catch (e) {
    console.error('[vocabulary] D1 error:', e.message);
    return json({ success: false, error: 'Database query failed' }, { status: 500 });
  }

  return json({
    success: true,
    total: results.length,
    source: 'd1',
    data: results
  });
}

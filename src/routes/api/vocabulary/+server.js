import { json } from '@sveltejs/kit';

export const prerender = false;

export async function GET({ url, platform }) {
  const grade = url.searchParams.get('grade');
  const unit = url.searchParams.get('unit');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const level = url.searchParams.get('level');
  const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);

  // Ưu tiên D1, fallback file tĩnh nếu DB không khả dụng
  let results = [];

  if (platform?.env?.DB) {
    try {
      const db = platform.env.DB;
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
    }
  }

  // Fallback: file tĩnh nếu D1 trống hoặc lỗi
  if (results.length === 0) {
    const { default: vocabularyData } = await import('$lib/data/vocabulary_db.json');
    results = [...vocabularyData];

    if (level && level !== 'all') {
      results = results.filter(w => (w.cambridge_level || '').toLowerCase() === level.toLowerCase());
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(w =>
        (w.term && w.term.toLowerCase().includes(q)) ||
        (w.meaning_vi && w.meaning_vi.toLowerCase().includes(q))
      );
    }
    results = results.slice(0, limit);
  }

  return json({
    success: true,
    total: results.length,
    source: platform?.env?.DB ? 'd1' : 'static',
    data: results
  });
}

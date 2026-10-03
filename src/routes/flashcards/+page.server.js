// Flashcards: load truc tiep tu D1 (khong qua HTTP API de tranh van de network)
// Chay tren server (Cloudflare Pages Function), co platform.env.DB
import { getStaticWords, getStaticUnits } from '$lib/staticDb.js';

export const prerender = false;

export async function load({ platform }) {
  let words = [];

  try {
    const db = platform?.env?.DB;
    if (db) {
      const res = await db.prepare(
        `SELECT id, word as term, ipa, pos, cefr_level as cambridge_level,
                meaning_vi, example_en, example_vi,
                grade_suitability as grade
         FROM cambridge_vocabulary
         ORDER BY word ASC
         LIMIT 500`
      ).all();
      words = (res.results || []).map(r => ({
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
    }
  } catch (e) {
    console.error('[flashcards] D1 error:', e.message);
  }

  // Fallback: static neu D1 trong
  let source = 'd1';
  if (words.length === 0) {
    words = getStaticWords();
    source = 'static';
  }

  return {
    words,
    units: getStaticUnits(),
    source
  };
}

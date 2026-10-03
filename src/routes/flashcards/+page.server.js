// Test: copy pattern tu second-brain
export const prerender = false;

export async function load({ platform }) {
  let words = [];
  try {
    const db = platform?.env?.DB;
    if (db) {
      const res = await db.prepare(
        `SELECT id, word as term, ipa, pos, meaning_vi, example_en, example_vi
         FROM cambridge_vocabulary ORDER BY word ASC LIMIT 500`
      ).all();
      words = res.results || [];
    }
  } catch (e) {
    console.error('[flashcards] D1 error:', e.message);
  }
  return { words, units: [], source: words.length > 0 ? 'd1' : 'empty' };
}

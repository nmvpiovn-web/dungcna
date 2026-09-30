import { json } from '@sveltejs/kit';

export const prerender = false;

// Public site stats — real counts from D1 (used by homepage "Con số biết nói").
// No auth required: only aggregate counts, no personal data.
export async function GET({ platform }) {
  const fallback = { totalQuestions: 0, totalWords: 0, totalCurricula: 0 };
  try {
    const db = platform?.env?.DB;
    if (!db) return json({ success: true, stats: fallback });

    const [q, w, c] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM question_bank').first(),
      db.prepare('SELECT COUNT(*) AS n FROM cambridge_vocabulary').first(),
      db.prepare('SELECT COUNT(*) AS n FROM curricula').first()
    ]);

    return json({
      success: true,
      stats: {
        totalQuestions: q?.n ?? 0,
        totalWords: w?.n ?? 0,
        totalCurricula: c?.n ?? 0
      }
    });
  } catch {
    return json({ success: true, stats: fallback });
  }
}

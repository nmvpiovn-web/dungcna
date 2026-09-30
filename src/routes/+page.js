import { getCurricula, getExams, getAllEvaluations } from '$lib/unifiedStore';
import { getStaticStats, getStaticUnits, getStaticWords } from '$lib/staticDb';

export const prerender = false;
export const ssr = false;

export async function load({ fetch }) {
  const stats = getStaticStats();

  // Override with real D1 counts when the API is reachable (keeps count-up animation).
  try {
    const res = await fetch('/api/stats');
    if (res.ok) {
      const data = await res.json();
      const live = data?.stats;
      if (live) {
        if (Number.isFinite(live.totalQuestions) && live.totalQuestions > 0) {
          stats.totalQuestions = live.totalQuestions;
        }
        if (Number.isFinite(live.totalWords) && live.totalWords > 0) {
          stats.totalWords = live.totalWords;
        }
        if (Number.isFinite(live.totalCurricula) && live.totalCurricula > 0) {
          stats.totalCurricula = live.totalCurricula;
        }
      }
    }
  } catch {
    // Offline / API down: keep static fallback numbers.
  }

  return {
    curricula: getCurricula(),
    exams: getExams(),
    evaluations: getAllEvaluations(),
    stats,
    units: getStaticUnits(),
    sampleWords: getStaticWords({ limit: 6, shuffle: true })
  };
}

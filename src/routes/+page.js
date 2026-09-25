import { getCurricula, getExams, getAllEvaluations } from '$lib/unifiedStore';
import { getStaticStats, getStaticUnits, getStaticWords } from '$lib/staticDb';

export const prerender = false;
export const ssr = false;

export function load() {
  return {
    curricula: getCurricula(),
    exams: getExams(),
    evaluations: getAllEvaluations(),
    stats: getStaticStats(),
    units: getStaticUnits(),
    sampleWords: getStaticWords({ limit: 6, shuffle: true })
  };
}

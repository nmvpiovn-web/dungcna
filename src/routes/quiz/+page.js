import { getStaticWords, getStaticUnits, getStaticQuestions } from '$lib/staticDb.js';

export function load() {
  return {
    words: getStaticWords({ shuffle: true }),
    units: getStaticUnits(),
    vocabQuestions: getStaticQuestions({ section: 'VOCABULARY' })
  };
}

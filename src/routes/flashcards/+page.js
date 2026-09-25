import { getStaticWords, getStaticUnits } from '$lib/staticDb.js';

export function load() {
  return {
    words: getStaticWords(),
    units: getStaticUnits()
  };
}

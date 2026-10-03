import { getStaticUnits, getStaticWords } from '$lib/staticDb.js';

// SSR chi tra static fallback (52 tu). Client se fetch /vocabulary_d1.json (235 tu)
// trong onMount vi SSR fetch bi treo tren Cloudflare Pages.
export const prerender = false;

export async function load() {
  return {
    words: getStaticWords(),
    units: getStaticUnits(),
    source: 'static'
  };
}

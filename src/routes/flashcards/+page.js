import { getStaticUnits, getStaticWords } from '$lib/staticDb.js';

// SSR chi tra static fallback (52 tu). Client se fetch /vocabulary_d1.json (235 tu)
// trong onMount vi SSR fetch bi treo tren Cloudflare Pages.
export const prerender = false;

export async function load() {
  return {
    seo: {"title": "Flashcards 10.000+ Từ Vựng Tiếng Anh", "description": "Học từ vựng tiếng Anh qua flashcards: phát âm IPA, ví dụ minh họa, ôn tập ngắt quãng hiệu quả."},
    words: getStaticWords(),
    units: getStaticUnits(),
    source: 'static'
  };
}

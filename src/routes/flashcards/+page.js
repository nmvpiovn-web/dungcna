import { getStaticUnits, getStaticWords } from '$lib/staticDb.js';

// Trang flashcards: SSR tra static fallback (nhanh), client se fetch batch tu D1
// API /api/vocabulary bi treo voi limit lon khi request tu Cloudflare,
// nen client chia nho thanh nhieu batch 50.
export const prerender = false;

export async function load() {
  const words = getStaticWords();
  return {
    words,
    units: getStaticUnits()
  };
}

import { getStaticUnits, getStaticWords } from '$lib/staticDb.js';

// Trang flashcards: fetch tu vung tu D1 qua API
// API /api/vocabulary bi treo voi limit lon (>50) khi request tu Cloudflare,
// nen chia nho thanh nhieu batch 50 de dam bao hoan tat.
export const prerender = false;

async function fetchBatch(fetchFn, limit, offset) {
  try {
    const res = await fetchFn(`/api/vocabulary?limit=${limit}&offset=${offset}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.data)) return data.data;
  } catch {}
  return [];
}

export async function load({ fetch }) {
  let words = [];

  // Fetch song song 5 batch x 50 = 250 (du cho 235 tu hien tai)
  const batches = await Promise.all([
    fetchBatch(fetch, 50, 0),
    fetchBatch(fetch, 50, 50),
    fetchBatch(fetch, 50, 100),
    fetchBatch(fetch, 50, 150),
    fetchBatch(fetch, 50, 200)
  ]);
  words = batches.flat();

  // Fallback: static neu API trong
  if (words.length === 0) {
    words = getStaticWords();
  }

  return {
    words,
    units: getStaticUnits()
  };
}

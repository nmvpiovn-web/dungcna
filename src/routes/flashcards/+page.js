import { getStaticUnits } from '$lib/staticDb.js';

// Trang này fetch API runtime (D1) nên không prerender được —
// prerender sẽ khiến SvelteKit từ chối gọi /api/vocabulary (prerender=false) và fail build.
export const prerender = false;
export const ssr = false;

export async function load({ fetch }) {
  // Lấy từ vựng thật từ D1 qua API (fallback file tĩnh nếu lỗi)
  let words = [];
  try {
    const res = await fetch('/api/vocabulary?limit=500');
    const data = await res.json();
    if (data.success && data.data) {
      words = data.data;
    }
  } catch (e) {
    console.error('[flashcards] API error:', e.message);
  }

  // Fallback: dùng static nếu API trống
  if (words.length === 0) {
    const { getStaticWords } = await import('$lib/staticDb.js');
    words = getStaticWords();
  }

  return {
    words,
    units: getStaticUnits()
  };
}

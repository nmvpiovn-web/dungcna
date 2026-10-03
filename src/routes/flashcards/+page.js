import { getStaticUnits, getStaticWords } from '$lib/staticDb.js';

// Trang flashcards: dung du lieu D1 da export san (235 tu) tu static folder
// File static/vocabulary_d1.json duoc export tu D1 cambridge_vocabulary.
// Ly do khong fetch /api/vocabulary runtime: API bi treo (readyState=3)
// khi request tu Cloudflare Pages (ca server-side lan client-side).
// De cap nhat: curl "https://timbk.io.vn/api/vocabulary?limit=500" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['data'], ensure_ascii=False))" > static/vocabulary_d1.json
export const prerender = false;

export async function load({ fetch }) {
  let words = getStaticWords(); // fallback 52 tu
  try {
    const res = await fetch('/vocabulary_d1.json');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > words.length) {
        words = data;
      }
    }
  } catch {}
  return {
    words,
    units: getStaticUnits(),
    source: words.length > 52 ? 'd1-export' : 'static'
  };
}

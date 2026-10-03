import { getStaticUnits } from '$lib/staticDb.js';
import vocabularyD1 from '$lib/data/vocabulary_d1.json';

// Trang flashcards: dung du lieu D1 da export san (235 tu)
// File vocabulary_d1.json duoc export tu D1 cambridge_vocabulary.
// Ly do khong fetch runtime: API /api/vocabulary bi treo (readyState=3)
// khi request tu Cloudflare Pages (ca server-side lan client-side),
// chi tru khi limit <= 50 va chi 1 request don le.
// De cap nhat du lieu, chay: curl "https://timbk.io.vn/api/vocabulary?limit=500" -o src/lib/data/vocabulary_d1.json (lay .data)
export const prerender = false;

export async function load() {
  return {
    words: vocabularyD1,
    units: getStaticUnits(),
    source: 'd1-export'
  };
}

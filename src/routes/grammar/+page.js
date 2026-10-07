import { getStaticGrammarTopics } from '$lib/staticDb.js';

export function load() {
  return {
    seo: {"title": "Ngữ Pháp Tiếng Anh Toàn Diện | Tiếng Anh Cô Dung", "description": "Học ngữ pháp tiếng Anh từ cơ bản đến nâng cao: thì, câu điều kiện, câu bị động."},
    topics: getStaticGrammarTopics()
  };
}

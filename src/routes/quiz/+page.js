import { getStaticWords, getStaticUnits, getStaticQuestions } from '$lib/staticDb.js';

export function load() {
  return {
    seo: {"title": "Ngân Hàng Đề Thi & Quiz Tiếng Anh", "description": "Luyện quiz tiếng Anh theo chủ điểm: ngữ pháp, từ vựng, đọc hiểu. Có đáp án và giải thích chi tiết."},
    words: getStaticWords({ shuffle: true }),
    units: getStaticUnits(),
    vocabQuestions: getStaticQuestions({ section: 'VOCABULARY' })
  };
}

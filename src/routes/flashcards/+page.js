import { getStaticUnits, getStaticWords, getStaticVocabularyDB } from '$lib/staticDb.js';

export const prerender = false;

function buildPhoneticsFromIpa(word) {
  const ipa = String(word.ipa || '').trim();
  const term = String(word.term || '').trim();
  let vowelsDetail = word.vowels_detail;
  let consonantsDetail = word.consonants_detail;
  let phonicsNote = word.phonics_note;
  let syllables = word.syllables;

  const vowelTokens = ipa.match(/(?:iː|uː|ɑː|ɔː|ɜː|eɪ|aɪ|ɔɪ|aʊ|əʊ|ɪə|eə|ʊə|ɪ|e|æ|ʌ|ɒ|ʊ|ə|i|u)/g) || [];
  const consonantTokens = ipa.match(/(?:tʃ|dʒ|θ|ð|ʃ|ʒ|ŋ|p|b|t|d|k|ɡ|g|f|v|s|z|h|m|n|l|r|j|w)/g) || [];

  if (!vowelsDetail || vowelsDetail === 'Nguyên âm chuẩn IPA' || vowelsDetail.includes('Đang cập nhật')) {
    const uniqV = [...new Set(vowelTokens)];
    vowelsDetail = uniqV.length > 0
      ? `Tổ hợp nguyên âm IPA: /${uniqV.join('/, /')}/ — mở khẩu hình rõ ở âm tiết mang dấu trọng âm chính (ˈ).`
      : `Nguyên âm chuẩn Cambridge IPA cho "${term}" (${ipa || '/.../'}).`;
  }

  if (!consonantsDetail || consonantsDetail === 'Phụ âm chuẩn IPA' || consonantsDetail.includes('Đang cập nhật')) {
    const uniqC = [...new Set(consonantTokens)];
    consonantsDetail = uniqC.length > 0
      ? `Phụ âm cấu thành: /${uniqC.join('/, /')}/ — bật rõ phụ âm đầu và giữ âm đuôi (ending sound) chuẩn bản xứ.`
      : `Phụ âm đầu và âm cuối chuẩn Cambridge cho "${term}".`;
  }

  if (!phonicsNote) {
    if (ipa.includes('ˈ')) {
      phonicsNote = `Chú ý nhấn trọng âm chính tại vị trí dấu (ˈ) trong phiên âm ${ipa}.`;
    } else {
      phonicsNote = `Phát âm liền mạch các âm tiết theo chuẩn Cambridge (${ipa || term}).`;
    }
  }

  if (!syllables) {
    const wordCount = term.split(/\s+/).filter(Boolean).length;
    syllables = wordCount > 1 ? `${term} (Cụm ${wordCount} từ)` : `${term} (${Math.max(1, vowelTokens.length)} âm tiết)`;
  }

  return {
    ...word,
    grade: word.grade || 'Lớp 7',
    cambridge_level: word.cambridge_level || 'KET_A2',
    unit_id: word.unit_id || 'unit1',
    category: word.category || 'Vocabulary',
    vowels_detail: vowelsDetail,
    consonants_detail: consonantsDetail,
    phonics_note: phonicsNote,
    syllables,
    status: word.status || 'new'
  };
}

export async function load() {
  const staticWords = getStaticWords() || [];
  const vocabDb = getStaticVocabularyDB() || [];

  const byTerm = new Map();
  for (const w of [...staticWords, ...vocabDb]) {
    if (!w || !w.term) continue;
    const key = String(w.term).toLowerCase().trim();
    const existing = byTerm.get(key);
    if (!existing) {
      byTerm.set(key, buildPhoneticsFromIpa(w));
    } else {
      byTerm.set(
        key,
        buildPhoneticsFromIpa({
          ...existing,
          ...w,
          vowels_detail:
            existing.vowels_detail && existing.vowels_detail !== 'Nguyên âm chuẩn IPA'
              ? existing.vowels_detail
              : w.vowels_detail,
          consonants_detail:
            existing.consonants_detail && existing.consonants_detail !== 'Phụ âm chuẩn IPA'
              ? existing.consonants_detail
              : w.consonants_detail
        })
      );
    }
  }

  const mergedWords = Array.from(byTerm.values());
  const baseUnits = getStaticUnits() || [];
  const extraUnits = [
    { id: 'unit_school', name: 'School Life & Facilities', description: 'Trường lớp, Dụng cụ & Phòng chức năng', icon: '🏫' },
    { id: 'unit_environment', name: 'Environment & Energy', description: 'Môi trường, Năng lượng & Sinh thái', icon: '🌿' },
    { id: 'unit_tech', name: 'Technology, AI & Science', description: 'Trí tuệ nhân tạo, An ninh mạng & Công nghệ', icon: '🤖' },
    { id: 'unit_urban', name: 'Cities & Modern Life', description: 'Đô thị bền vững & Giao thông hiện đại', icon: '🏙️' },
    { id: 'unit_culture', name: 'Culture, Crafts & Career', description: 'Bản sắc văn hóa, Làng nghề & Hướng nghiệp', icon: '🏺' }
  ];

  const existingIds = new Set(baseUnits.map((u) => u.id));
  const units = [...baseUnits, ...extraUnits.filter((u) => !existingIds.has(u.id))];

  return {
    seo: {
      title: 'Flashcards 10.000+ Từ Vựng Tiếng Anh K12 & IELTS — Tiếng Anh Cô Dung',
      description: 'Học từ vựng tiếng Anh qua flashcards 3D theo từng khối lớp (Lớp 1-12 & IELTS): phát âm IPA, nguyên âm, phụ âm, ví dụ minh họa.'
    },
    words: mergedWords,
    units,
    source: 'static_merged_d1'
  };
}

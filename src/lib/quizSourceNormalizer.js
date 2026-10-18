/**
 * Chuẩn hóa Tiếng Việt đầy đủ dấu và phân nhóm nguồn dữ liệu cho Quiz Builder
 * (Google Drive, Kho tri thức D1, Kho câu hỏi D1, và Danh mục Quiz).
 */

const EXACT_DRIVE_TITLE_MAP = new Map([
  ['00_google_drive_index', 'Danh mục Tổng hợp Kho Tài liệu Google Drive'],
  ['1000 cau trac nghiem ngu phap hsg', '1000 Câu Trắc Nghiệm Ngữ Pháp Học Sinh Giỏi'],
  ['1000 word formation', '1000 Bài Tập Cấu Tạo Từ (Word Formation)'],
  ['22000 tu toefl ielts harold levine', '22.000 Từ Vựng TOEFL & IELTS – Harold Levine'],
  ['31. viet lai cau - thi hsg lop 10 11 12', 'Chuyên Đề 31: Viết Lại Câu Ôn Thi HSG Lớp 10 – 11 – 12'],
  ['although despite key', 'Chuyên Đề Ngữ Pháp: Although / Despite / In Spite Of (Có Đáp Án)'],
  ['because because of key', 'Chuyên Đề Ngữ Pháp: Because & Because Of (Có Đáp Án)'],
  ['becoming independent vocab', 'Từ Vựng Chủ Đề: Becoming Independent (Sống Tự Lập)'],
  ['chuyen de ngu phap', 'Tổng Hợp Chuyên Đề Ngữ Pháp Tiếng Anh Trọng Tâm'],
  ['chuyen de so 1 viet lai cau - thi hsg lop 10 11 12', 'Chuyên Đề Số 1: Viết Lại Câu Ôn Thi HSG Lớp 10 – 11 – 12'],
  ['key- chuyen de so 1 viet lai cau thi hsg 10 11 12', 'Đáp Án Chuyên Đề Số 1: Viết Lại Câu Ôn Thi HSG Lớp 10 – 11 – 12'],
  ['cities urbanisation vocab', 'Từ Vựng Chủ Đề: Cities & Urbanisation (Đô Thị Hóa)'],
  ['conditional sentences key', 'Chuyên Đề Câu Điều Kiện – Conditional Sentences (Có Đáp Án)'],
  ['đề hsg anh 8 số 23', 'Đề Thi Học Sinh Giỏi Tiếng Anh Lớp 8 – Đề Số 23'],
  ['đề hsg anh 8 số 24', 'Đề Thi Học Sinh Giỏi Tiếng Anh Lớp 8 – Đề Số 24'],
  ['g3 ck1 test', 'Đề Kiểm Tra Cuối Học Kỳ 1 – Tiếng Anh Lớp 3'],
  ['g4 ck1 test', 'Đề Kiểm Tra Cuối Học Kỳ 1 – Tiếng Anh Lớp 4'],
  ['g5 ck1 test', 'Đề Kiểm Tra Cuối Học Kỳ 1 – Tiếng Anh Lớp 5'],
  ['g7 hsg de2', 'Đề Thi Học Sinh Giỏi Tiếng Anh Lớp 7 – Đề Số 2'],
  ['grade 6- u8- global success', 'Tiếng Anh Lớp 6 Global Success – Unit 8: Sports and Games'],
  ['hsg lop 11', 'Đề Bồi Dưỡng Học Sinh Giỏi Tiếng Anh Lớp 11'],
  ['hsg lop 12 quang nam', 'Đề Thi Học Sinh Giỏi Tiếng Anh Lớp 12 – Tỉnh Quảng Nam'],
  ['ioe lop 5 tron bo', 'Trọn Bộ Đề Luyện Thi Olympic Tiếng Anh (IOE) Lớp 5'],
  ['nhóm 7. chuyên đề phối hợp thì thpt hương khê', 'Chuyên Đề Nhóm 7: Phối Hợp Thì Ôn Thi THPT (THPT Hương Khê)'],
  ['nhóm  7. chuyên đề phối hợp thì thpt hương khê', 'Chuyên Đề Nhóm 7: Phối Hợp Thì Ôn Thi THPT (THPT Hương Khê)'],
  ['our heritage vocab', 'Từ Vựng Chủ Đề: Our Heritage (Di Sản Văn Hóa)'],
  ['photo quiz reading-giaoandethitienganh.info', 'Bài Tập Đọc Hiểu Minh Họa (Photo Quiz Reading)'],
  ['phrasal verbs', 'Chuyên Đề Cụm Động Từ Tiếng Anh (Phrasal Verbs)'],
  ['phrasal verbs key', 'Bài Tập Cụm Động Từ – Phrasal Verbs (Có Đáp Án)'],
  ['relative clause key', 'Chuyên Đề Mệnh Đề Quan Hệ – Relative Clauses (Có Đáp Án)'],
  ['reported speech key', 'Chuyên Đề Câu Tường Thuật – Reported Speech (Có Đáp Án)'],
  ['so that in order to key', 'Cấu Trúc Chỉ Mục Đích: So That / In Order To (Có Đáp Án)'],
  ['speaking test 4  units 9-10', 'Đề Kiểm Tra Kỹ Năng Nói (Speaking Test 4 – Units 9 & 10)'],
  ['speaking test 4 units 9-10', 'Đề Kiểm Tra Kỹ Năng Nói (Speaking Test 4 – Units 9 & 10)'],
  ['unit 5 - lesson 5d - speaking - page 73', 'Bài Học Unit 5 – Lesson 5d: Kỹ Năng Nói (Trang 73)'],
  ['unit 5 - lesson 5f - skills reading - page 76', 'Bài Học Unit 5 – Lesson 5f: Kỹ Năng Đọc Hiểu (Trang 76)'],
  ['viet lai cau 1 100', '100 Câu Bài Tập Viết Lại Câu Tiếng Anh Thông Dụng'],
  ['yen lap g7', 'Đề Giao Lưu Học Sinh Giỏi Tiếng Anh Lớp 7 – Yên Lập'],
  ['1509_bai_tap_trac_nghiem_tieng_anh', '1509 Bài Tập Trắc Nghiệm Tiếng Anh Tổng Hợp'],
  ['1509 bai tap trac nghiem tieng anh', '1509 Bài Tập Trắc Nghiệm Tiếng Anh Tổng Hợp'],
  ['global success - grade 7 - hk i', 'Đề Cương Ôn Tập Tiếng Anh Lớp 7 Global Success – Học Kỳ 1']
]);

const VIETNAMESE_PHRASE_REPLACEMENTS = [
  [/\bBaÌ€i taÌ£Ì‚p traÌ†Ì c nghieÌ£Ì‚m\b/gi, 'Bài tập trắc nghiệm'],
  [/\b1000 cau trac nghiem ngu phap hsg\b/gi, '1000 Câu Trắc Nghiệm Ngữ Pháp Học Sinh Giỏi'],
  [/\b22000 tu toefl ielts\b/gi, '22.000 Từ Vựng TOEFL & IELTS'],
  [/\bchuyen de so (\d+)\b/gi, 'Chuyên Đề Số $1'],
  [/\bchuyen de ngu phap\b/gi, 'Chuyên Đề Ngữ Pháp'],
  [/\bchuyen de\b/gi, 'Chuyên Đề'],
  [/\bviet lai cau\b/gi, 'Viết Lại Câu'],
  [/\btrac nghiem\b/gi, 'Trắc Nghiệm'],
  [/\bngu phap\b/gi, 'Ngữ Pháp'],
  [/\btu vung\b/gi, 'Từ Vựng'],
  [/\bngu am\b/gi, 'Ngữ Âm'],
  [/\btrong am\b/gi, 'Trọng Âm'],
  [/\bphat am\b/gi, 'Phát Âm'],
  [/\bnguyen am\b/gi, 'Nguyên Âm'],
  [/\bdong tu khuyet thieu\b/gi, 'Động Từ Khuyết Thiếu'],
  [/\bmao tu\b/gi, 'Mạo Từ'],
  [/\bgioi tu\b/gi, 'Giới Từ'],
  [/\bcau bi dong\b/gi, 'Câu Bị Động'],
  [/\bcau hoi duoi\b/gi, 'Câu Hỏi Đuôi'],
  [/\bthuc gia dinh\b/gi, 'Thức Giả Định'],
  [/\bso sanh hon\b/gi, 'So Sánh Hơn'],
  [/\bmenh de quan he\b/gi, 'Mệnh Đề Quan Hệ'],
  [/\btinh huong giao tiep\b/gi, 'Tình Huống Giao Tiếp'],
  [/\bthi hsg lop\b/gi, 'Ôn Thi HSG Lớp'],
  [/\bhsg lop (\d+)/gi, 'Học Sinh Giỏi Lớp $1'],
  [/\bioe lop (\d+) tron bo\b/gi, 'Trọn Bộ Luyện Thi IOE Lớp $1'],
  [/\btron bo\b/gi, 'Trọn Bộ'],
  [/\bquang nam\b/gi, 'Quảng Nam'],
  [/\byen lap\b/gi, 'Yên Lập'],
  [/\bbai tap bo tro\b/gi, 'Bài Tập Bổ Trợ'],
  [/\bluyen viet doan van\b/gi, 'Luyện Viết Đoạn Văn'],
  [/\btieng anh (\d+)/gi, 'Tiếng Anh Lớp $1'],
  [/\bTA\s*(\d{1,2})\b/g, 'Tiếng Anh Lớp $1'],
  [/\bNHOM\s+(\d+)\b/gi, 'Nhóm $1'],
  [/\bde thi thu\b/gi, 'Đề Thi Thử'],
  [/\bde thi\b/gi, 'Đề Thi'],
  [/\bde kiem tra\b/gi, 'Đề Kiểm Tra'],
  [/\bquoc gia\b/gi, 'Quốc Gia'],
  [/\bma de\b/gi, 'Mã Đề'],
  [/\bhoc ky\b/gi, 'Học Kỳ'],
  [/\bdap an\b/gi, 'Đáp Án'],
  [/\bĐỀ sô (\d+)\b/gi, 'Đề Luyện Tập Số $1'],
  [/\bĐỀ SỐ (\d+)\b/gi, 'Đề Luyện Tập Số $1'],
  [/\bĐề số (\d+)\b/gi, 'Đề Luyện Tập Số $1'],
  [/^(?:(\d+)\.\s*)?PRACTICE TEST\s+0*(\d+)(?:\.(\d{4}))?$/i, (_, prefix, num, yr) => `Đề Luyện Tập Tiếng Anh Số ${num}${yr ? ` (Năm ${yr})` : ''}`]
];

/**
 * Chuẩn hóa tên tệp / tiêu đề bài học từ Google Drive hoặc Kho tri thức sang Tiếng Việt có dấu.
 */
export function normalizeVietnameseSourceTitle(rawName, fallbackId = '') {
  let text = String(rawName || fallbackId || '').trim();
  if (!text) return 'Tài liệu Tiếng Anh';

  try {
    text = text.normalize('NFC');
  } catch {}

  // Strip file extension for clean display
  const extMatch = text.match(/\.(docx|doc|pdf|txt|md|rar|zip|mp3|png|jpg|jpeg|webp)$/i);
  const ext = extMatch ? extMatch[1].toUpperCase() : '';
  let base = text.replace(/\.(docx|doc|pdf|txt|md|rar|zip|mp3|png|jpg|jpeg|webp)$/i, '').trim();

  // Strip noisy watermarks
  base = base
    .replace(/\s*[-_]*\s*giaoandethitienganh[\s._-]*info\b/gi, '')
    .replace(/^📁\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const lowerKey = base.toLowerCase().replace(/\s+/g, ' ').trim();
  if (EXACT_DRIVE_TITLE_MAP.has(lowerKey)) {
    return EXACT_DRIVE_TITLE_MAP.get(lowerKey);
  }

  // Also check underscore-separated slug
  const spaceKey = lowerKey.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (EXACT_DRIVE_TITLE_MAP.has(spaceKey)) {
    return EXACT_DRIVE_TITLE_MAP.get(spaceKey);
  }

  let normalized = base;
  for (const [pattern, replacement] of VIETNAMESE_PHRASE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Clean underscores if filename was snake_case
  if (normalized.includes('_') && !normalized.includes(' ')) {
    normalized = normalized.replace(/_/g, ' ');
  }

  normalized = normalized.replace(/\s{2,}/g, ' ').trim();

  // Capitalize first letter if all lowercase
  if (normalized && normalized === normalized.toLowerCase()) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return normalized || text;
}

/**
 * Phân nhóm tài liệu Google Drive thành các nhóm Tiếng Việt chuẩn hóa.
 */
export function classifyDriveFileGroup(rawName, id = '') {
  const combined = `${rawName || ''} ${id || ''}`.toLowerCase();
  const titleVi = normalizeVietnameseSourceTitle(rawName, id).toLowerCase();
  const searchStr = `${combined} ${titleVi}`;

  if (/(lớp\s*[1-5](?!\d)|\blop\s*[1-5]\b|\bg[1-5]\b|\bta[1-5]\b|tiếng anh\s*[1-5](?!\d)|\bprimary\b|ioe\s*l[oớ]p\s*5|starters|movers|flyers)/i.test(searchStr)) {
    const label = '📘 Khối Tiểu học (Lớp 1 – Lớp 5)';
    const short = 'Tiểu học (Lớp 1–5)';
    return { key: 'tieu_hoc', label, short, group_key: 'tieu_hoc', group_label: label, group_short: short };
  }

  if (/(lớp\s*[6-9](?!\d)|\blop\s*[6-9]\b|\bg[6-9]\b|\bta[6-9]\b|tiếng anh\s*[6-9](?!\d)|\banh\s*[6-9]\b|\bgrade\s*[6-9]\b|\bthcs\b|\bket\b|\bpet\b)/i.test(searchStr)) {
    const label = '📗 Khối THCS (Lớp 6 – Lớp 9)';
    const short = 'THCS (Lớp 6–9)';
    return { key: 'thcs', label, short, group_key: 'thcs', group_label: label, group_short: short };
  }

  if (/(lớp\s*1[0-2]|\blop\s*1[0-2]\b|10\s*11\s*12|\bta1[0-2]\b|tiếng anh\s*1[0-2]|\bgr1[0-2]\b|\bthpt\b|\bhsg\b|học sinh giỏi|tốt nghiệp)/i.test(searchStr)) {
    const label = '📙 Khối THPT & Bồi dưỡng HSG (Lớp 10 – 12)';
    const short = 'THPT & HSG';
    return { key: 'thpt_hsg', label, short, group_key: 'thpt_hsg', group_label: label, group_short: short };
  }

  if (/(ngữ pháp|ngu phap|conditional|relative|reported|although|because|so that|phrasal verb|mệnh đề|câu bị động|câu hỏi đuôi|giả định|so sánh|mạo từ|giới từ|modal verb|khuyết thiếu|phối hợp thì|thì động từ|tìm lỗi sai|sửa lỗi sai|viết lại câu|sentence transformation|tenses|gerund|infinitive|đảo ngữ|liên từ|từ loại)/i.test(searchStr)) {
    const label = '📐 Chuyên đề Ngữ pháp & Cấu trúc câu';
    const short = 'Chuyên đề Ngữ pháp';
    return { key: 'ngu_phap', label, short, group_key: 'ngu_phap', group_label: label, group_short: short };
  }

  if (/(ielts|toefl|toeic|vocab|từ vựng|word form|reading|đọc hiểu|cloze text|speaking|giao tiếp|kỹ năng nói|ngữ âm|trọng âm|phát âm|đồng nghĩa|trái nghĩa|idiom|collocation)/i.test(searchStr)) {
    const label = '🌍 Từ vựng, Kỹ năng & Chứng chỉ Quốc tế (IELTS / TOEFL)';
    const short = 'Từ vựng & IELTS';
    return { key: 'tu_vung_ky_nang', label, short, group_key: 'tu_vung_ky_nang', group_label: label, group_short: short };
  }

  const label = '📝 Bộ Đề Luyện Tập & Tài Liệu Tổng Hợp';
  const short = 'Đề luyện tập tổng hợp';
  return { key: 'de_luyen_tap', label, short, group_key: 'de_luyen_tap', group_label: label, group_short: short };
}

/**
 * Chuẩn hóa danh mục Kho tri thức (knowledge_vault) sang Tiếng Việt đầy đủ dấu.
 */
export const KNOWLEDGE_VAULT_GROUPS = [
  { key: 'all', label: 'Tất cả nguồn tri thức', icon: '📚' },
  { key: 'ngu_phap', label: 'Chuyên đề Ngữ pháp Tiếng Anh', icon: '📐' },
  { key: 'tu_vung_ngu_am', label: 'Từ vựng, Ngữ âm & Collocations', icon: '🔤' },
  { key: 'de_thi_hsg', label: 'Ngân hàng Đề thi & Bồi dưỡng HSG', icon: '📝' },
  { key: 'gdpt_tieu_hoc', label: 'Chương trình Tiểu học (Lớp 1 – 5)', icon: '📘' },
  { key: 'gdpt_thcs_thpt', label: 'Chương trình THCS & THPT (Lớp 6 – 12)', icon: '📗' },
  { key: 'tai_lieu_bo_tro', label: 'Đọc hiểu, Nghe hiểu & Tài liệu Bổ trợ', icon: '🎧' },
  { key: 'su_pham_sop', label: 'Phương pháp Sư phạm & Giáo án 5512', icon: '👩‍🏫' }
];

export function classifyKnowledgeVaultArticle(article = {}) {
  const cat = String(article.category || '').trim();
  const folder = String(article.folder || '').trim();
  const title = String(article.title || '').trim();
  const lowerCat = cat.toLowerCase();
  const lowerFolder = folder.toLowerCase();

  if (cat === 'Chuyên Đề Ngữ Pháp Master' || lowerCat === 'grammar' || lowerFolder.includes('grammar')) {
    return {
      group_key: 'ngu_phap',
      category_vi: 'Chuyên đề Ngữ pháp Tiếng Anh',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }

  if (cat === 'Bản Đồ Từ Vựng & Phonics' || lowerCat === 'vocabulary' || lowerCat === 'phonics' || lowerFolder.includes('vocab')) {
    return {
      group_key: 'tu_vung_ngu_am',
      category_vi: 'Từ vựng, Ngữ âm & Collocations',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }

  if (
    cat === 'Ngân Hàng Đề Thi & Kỹ Năng' ||
    lowerCat === 'exam' ||
    lowerCat === 'question' ||
    lowerCat === 'hsg' ||
    lowerFolder.includes('exam') ||
    lowerFolder.includes('hsg')
  ) {
    return {
      group_key: 'de_thi_hsg',
      category_vi: 'Ngân hàng Đề thi & Bồi dưỡng HSG',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }

  if (/^Tiếng Anh Lớp [1-5]$/i.test(cat)) {
    return {
      group_key: 'gdpt_tieu_hoc',
      category_vi: `${cat} (Tiểu học)`,
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }

  if (/^Tiếng Anh Lớp ([6-9]|1[0-2])$/i.test(cat) || cat === 'Chương Trình GDPT 2018' || lowerCat === 'curriculum' || lowerFolder.includes('curriculum')) {
    return {
      group_key: 'gdpt_thcs_thpt',
      category_vi: /^Tiếng Anh Lớp/i.test(cat) ? `${cat} (GDPT 2018)` : 'Chương trình GDPT THCS & THPT',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }

  if (cat === 'Sư Phạm & Vận Hành SOP' || cat === 'Mạng Nơ-ron & Tương Tác' || cat === 'Bản Đồ Tổng MOC' || lowerFolder.includes('pedagogy') || lowerFolder.includes('sop')) {
    return {
      group_key: 'su_pham_sop',
      category_vi: 'Phương pháp Sư phạm & Giáo án 5512',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }

  // For Drive or general documents inside knowledge_vault, also check if title indicates grammar/vocab/grade
  const driveGroup = classifyDriveFileGroup(title, article.id);
  if (driveGroup.group_key === 'ngu_phap') {
    return {
      group_key: 'ngu_phap',
      category_vi: 'Chuyên đề Ngữ pháp Tiếng Anh',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }
  if (driveGroup.group_key === 'tieu_hoc') {
    return {
      group_key: 'gdpt_tieu_hoc',
      category_vi: 'Chương trình Tiểu học (Lớp 1 – 5)',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }
  if (driveGroup.group_key === 'thcs' || driveGroup.group_key === 'thpt_hsg') {
    return {
      group_key: 'de_thi_hsg',
      category_vi: 'Ngân hàng Đề thi & Bồi dưỡng HSG',
      title_vi: normalizeVietnameseSourceTitle(title, article.id)
    };
  }

  return {
    group_key: 'tai_lieu_bo_tro',
    category_vi: 'Đọc hiểu, Nghe hiểu & Tài liệu Bổ trợ',
    title_vi: normalizeVietnameseSourceTitle(title, article.id)
  };
}

/**
 * Chuẩn hóa nhãn Kho câu hỏi D1 (Question Bank) sang Tiếng Việt đầy đủ dấu.
 */
const QB_GRADE_LABELS = {
  '0': 'Chứng chỉ Quốc tế (IELTS / TOEFL)',
  'ielts_academic': 'Chứng chỉ IELTS Academic',
  '1': 'Lớp 1 (Tiểu học)',
  'lop_1': 'Lớp 1 (Tiểu học)',
  '2': 'Lớp 2 (Tiểu học)',
  'lop_2': 'Lớp 2 (Tiểu học)',
  '3': 'Lớp 3 (Tiểu học)',
  'lop_3': 'Lớp 3 (Tiểu học)',
  '4': 'Lớp 4 (Tiểu học)',
  'lop_4': 'Lớp 4 (Tiểu học)',
  '5': 'Lớp 5 (Tiểu học)',
  'lop_5': 'Lớp 5 (Tiểu học)',
  '6': 'Lớp 6 (THCS)',
  'lop_6': 'Lớp 6 (THCS)',
  '7': 'Lớp 7 (THCS)',
  'lop_7': 'Lớp 7 (THCS)',
  '8': 'Lớp 8 (THCS)',
  'lop_8': 'Lớp 8 (THCS)',
  '9': 'Lớp 9 (THCS)',
  'lop_9': 'Lớp 9 (THCS)',
  '10': 'Lớp 10 (THPT)',
  'lop_10': 'Lớp 10 (THPT)',
  '11': 'Lớp 11 (THPT)',
  'lop_11': 'Lớp 11 (THPT)',
  '12': 'Lớp 12 & Ôn thi THPT Quốc gia',
  'lop_12': 'Lớp 12 & Ôn thi THPT Quốc gia'
};

const QB_SKILL_LABELS = {
  grammar: 'Ngữ pháp & Cấu trúc câu',
  vocabulary: 'Từ vựng & Từ loại',
  reading: 'Đọc hiểu văn bản',
  phonics: 'Ngữ âm & Trọng âm',
  phonetics: 'Ngữ âm & Trọng âm',
  listening: 'Nghe hiểu',
  speaking: 'Giao tiếp & Kỹ năng Nói',
  writing: 'Kỹ năng Viết'
};

const QB_COGNITIVE_LABELS = {
  nhan_biet: 'Nhận biết (Cơ bản)',
  thong_hieu: 'Thông hiểu (Trung bình)',
  van_dung: 'Vận dụng (Khá – Giỏi)',
  van_dung_cao: 'Vận dụng cao (HSG / Chuyên)',
  easy: 'Nhận biết (Cơ bản)',
  medium: 'Thông hiểu (Trung bình)',
  hard: 'Vận dụng (Nâng cao)'
};

const QB_TOPIC_LABELS = {
  phonics: 'Ngữ âm cơ bản (Phonics)',
  phonics_stress: 'Phát âm & Trọng âm từ',
  vocabulary: 'Từ vựng trọng tâm theo chủ đề',
  academic_vocab: 'Từ vựng học thuật (Academic Vocabulary)',
  reading_vocab: 'Từ vựng trong bài Đọc hiểu',
  communication: 'Tình huống Giao tiếp thực tế',
  grammar: 'Ngữ pháp Tiếng Anh tổng hợp',
  advanced_grammar: 'Chuyên đề Ngữ pháp nâng cao',
  lexico_grammar: 'Từ vựng – Ngữ pháp tổng hợp',
  error_identification: 'Nhận diện & Sửa lỗi sai',
  tenses: 'Hệ thống Thì động từ (Tenses)',
  past_perfect_cont: 'Thì Quá khứ hoàn thành tiếp diễn',
  future_perf_cont: 'Thì Tương lai hoàn thành tiếp diễn',
  modals: 'Động từ khuyết thiếu (Modal Verbs)',
  participle_clauses: 'Mệnh đề phân từ (Participle Clauses)',
  participle: 'Rút gọn mệnh đề bằng Phân từ',
  culture: 'Văn hóa & Kiến thức liên môn',
  collocations: 'Cụm từ cố định (Collocations)',
  collocation: 'Cụm từ cố định (Collocations)',
  phrasal_verbs: 'Cụm động từ thông dụng (Phrasal Verbs)',
  sentence_transformation: 'Viết lại câu tương đương',
  inversion: 'Cấu trúc Đảo ngữ (Inversion)',
  reading: 'Đọc hiểu đoạn văn Tiếng Anh',
  general_knowledge: 'Kiến thức Tiếng Anh tổng quát',
  structures: 'Cấu trúc câu thông dụng',
  ellipsis: 'Cấu trúc Tỉnh lược (Ellipsis)',
  double_comp: 'Cấu trúc So sánh kép (Double Comparatives)',
  subjunctive: 'Thức Giả định (Subjunctive Mood)',
  tags: 'Câu hỏi đuôi (Tag Questions)',
  academic_writing: 'Kỹ năng Viết học thuật (Academic Writing)',
  word_form: 'Cấu tạo từ & Từ loại (Word Formation)',
  word_formation: 'Cấu tạo từ & Từ loại (Word Formation)',
  conditional: 'Câu điều kiện (If)'
};

export function formatGradeLevelVi(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return 'Chưa phân khối';
  if (QB_GRADE_LABELS[key]) return QB_GRADE_LABELS[key];
  const m = key.match(/^lop_(\d+)$/);
  if (m) return `Lớp ${m[1]}`;
  return `Lớp ${raw}`;
}

export function formatSkillCategoryVi(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return 'Tổng hợp';
  return QB_SKILL_LABELS[key] || raw;
}

export function formatCognitiveLevelVi(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return 'Thông hiểu';
  return QB_COGNITIVE_LABELS[key] || raw;
}

export function formatTopicVi(raw) {
  const key = String(raw ?? '').trim();
  if (!key) return 'Chủ đề tổng hợp';
  const lower = key.toLowerCase();
  if (QB_TOPIC_LABELS[lower]) return QB_TOPIC_LABELS[lower];
  return key
    .replace(/^Phonetics\s*-\s*/i, 'Ngữ âm: ')
    .replace(/^Stress pattern\s*-\s*/i, 'Trọng âm: ')
    .replace(/^Social Communication\s*-\s*/i, 'Giao tiếp: ')
    .replace(/^Passive Voice\s*-\s*/i, 'Câu bị động: ')
    .replace(/^Part of Speech\s*-\s*/i, 'Từ loại: ');
}

export function formatQuestionTypeVi(type) {
  const map = {
    multiple_choice: 'Trắc nghiệm 4 lựa chọn',
    true_false: 'Đúng / Sai',
    fill_blank: 'Điền từ vào chỗ trống',
    word_guess: 'Đoán từ vựng có gợi ý',
    matching: 'Nối cột tương ứng',
    memory_match: 'Ghép cặp khái niệm',
    rewrite: 'Viết lại câu',
    paragraph: 'Tự luận / Đọc hiểu',
    picture_guess: 'Nhìn hình đoán chữ',
    ordering: 'Sắp xếp từ thành câu'
  };
  return map[type] || 'Trắc nghiệm';
}

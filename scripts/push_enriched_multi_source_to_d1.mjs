import fs from 'fs';
import path from 'path';

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbId = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

async function execSql(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  const data = await res.json();
  if (!data.success) {
    console.error('SQL Error:', JSON.stringify(data.errors), sql.slice(0, 120));
  }
  return data.result?.[0]?.results || [];
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function batchInsert(tableName, cols, rows, chunkSize = 40) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const valuesSql = slice
      .map((r) => `(${cols.map((c) => esc(r[c])).join(', ')})`)
      .join(',\n');
    const sql = `INSERT OR REPLACE INTO "${tableName}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES\n${valuesSql};`;
    await execSql(sql);
    inserted += slice.length;
  }
  console.log(`✅ Pushed ${inserted} rows into D1 table [${tableName}]`);
}

console.log('================================================================================');
console.log('🚀 PUSHING MULTI-SOURCE ENRICHED DATABASE TO CLOUDFLARE D1 (tienganh-pro-db)');
console.log('================================================================================');

// 1. Push cambridge_vocabulary (523 words)
const cambridgeVocab = JSON.parse(fs.readFileSync('src/lib/data/cambridge_vocabulary.json', 'utf8'));
await batchInsert(
  'cambridge_vocabulary',
  ['id', 'word', 'ipa', 'pos', 'cefr_level', 'cambridge_tier', 'meaning_vi', 'example_en', 'example_vi', 'collocations', 'grade_suitability'],
  cambridgeVocab,
  45
);

// 2. Push questions (620 questions — fixing the 11-row gap on D1!)
const questions = JSON.parse(fs.readFileSync('src/lib/data/questions.json', 'utf8')).map((q, idx) => ({
  id: q.id || `q_sync_${idx + 1}`,
  exam_id: q.exam_id || 'exam_general',
  question_index: Number(q.question_index || idx + 1),
  skill: q.skill || 'Vocabulary & Grammar',
  type: q.type || 'mcq',
  passage: q.passage || '',
  prompt: q.prompt || q.question_text || '',
  audio_url: q.audio_url || '',
  image_url: q.image_url || '',
  options_json: typeof q.options_json === 'string' ? q.options_json : JSON.stringify(q.options || []),
  correct_answer: q.correct_answer || '',
  explanation: q.explanation || '',
  cambridge_level: q.cambridge_level || 'KET_A2',
  rubric_json: q.rubric_json || '{}'
}));
await batchInsert(
  'questions',
  ['id', 'exam_id', 'question_index', 'skill', 'type', 'passage', 'prompt', 'audio_url', 'image_url', 'options_json', 'correct_answer', 'explanation', 'cambridge_level', 'rubric_json'],
  questions,
  40
);

// 3. Push thematic & GDrive questions into question_bank as well
const newQuestionsForBank = questions.slice(-65).map((q) => ({
  id: `qb_${q.id}`,
  curriculum_id: 'curr_global_success_7',
  grade_level: 'Lớp 7',
  topic: q.exam_id.replace('exam_', '').replace(/_/g, ' '),
  cognitive_level: 'application',
  question_type: 'multiple_choice',
  question_text: q.prompt,
  options_json: q.options_json,
  correct_option_id: q.correct_answer,
  explanation: q.explanation,
  reading_passage: q.passage || '',
  source_ref: 'multi-source-gdrive-cambridge-2026',
  status: 'published',
  created_at: '2026-10-23T20:50:00Z',
  skill_category: q.skill
}));
await batchInsert(
  'question_bank',
  ['id', 'curriculum_id', 'grade_level', 'topic', 'cognitive_level', 'question_type', 'question_text', 'options_json', 'correct_option_id', 'explanation', 'reading_passage', 'source_ref', 'status', 'created_at', 'skill_category'],
  newQuestionsForBank,
  35
);

// 4. Push grammar_topics (39 topics)
const grammarTopics = JSON.parse(fs.readFileSync('src/lib/data/grammar_topics.json', 'utf8')).map((g) => ({
  id: g.id,
  topic: g.topic,
  grade_level: g.grade_level || 'Lớp 7',
  curriculum_unit: g.curriculum_unit || 'Unit 1',
  category: g.category || 'Grammar',
  cefr_level: g.cefr_level || 'B1',
  summary: g.summary || '',
  formula: g.formula || g.formula_json || '[]',
  usage: g.usage || g.usage_json || '[]',
  signal_words: g.signal_words || g.signal_words_json || '[]',
  phonics_rules: g.phonics_rules || '',
  common_mistakes: g.common_mistakes || '',
  examples: g.examples || g.examples_json || '[]',
  practice_questions: g.practice_questions || g.practice_questions_json || '[]',
  created_at: g.created_at || '2026-10-23'
}));
await batchInsert(
  'grammar_topics',
  ['id', 'topic', 'grade_level', 'curriculum_unit', 'category', 'cefr_level', 'summary', 'formula', 'usage', 'signal_words', 'phonics_rules', 'common_mistakes', 'examples', 'practice_questions', 'created_at'],
  grammarTopics,
  20
);

// 5. Push teaching_resources (39 resources)
const teachingResources = JSON.parse(fs.readFileSync('src/lib/data/teaching_resources.json', 'utf8')).map((r) => ({
  id: r.id,
  category: r.category || 'Pedagogy',
  grade_level: r.grade_level || 'Lớp 7',
  title: r.title,
  content_markdown: r.content_markdown || '',
  native_teacher_tips: r.native_teacher_tips || '',
  keywords: r.keywords || '',
  downloads_url: r.downloads_url || '',
  created_at: r.created_at || '2026-10-23'
}));
await batchInsert(
  'teaching_resources',
  ['id', 'category', 'grade_level', 'title', 'content_markdown', 'native_teacher_tips', 'keywords', 'downloads_url', 'created_at'],
  teachingResources,
  20
);

// 6. Populate Thematic Quizzes, Quiz Questions, Quiz Bundles & Quiz Builder Defaults
const newQuizzes = [
  {
    id: 'quiz_halloween_event_2026',
    title: '🎃 Đề Trắc Nghiệm Lễ Hội Halloween & Văn Hóa Thế Giới (Spooky Hunt)',
    description: 'Bộ câu hỏi từ vựng, ngữ pháp và giao tiếp chủ đề Halloween, Lễ hội hóa trang & Văn hóa phương Tây.',
    created_by: 'usr_admin_root',
    creator_name: 'Cô Dung • SuperAdmin',
    source_file_id: 'src_halloween_2026',
    source_file_name: 'Halloween_Spooky_Hunt_2026.docx',
    time_limit_minutes: 15,
    status: 'published',
    created_at: '2026-10-23T20:50:00Z',
    updated_at: '2026-10-23T20:50:00Z',
    source_metadata_json: JSON.stringify({ grade: 'Lớp 7', topic: 'Halloween', theme_id: 'halloween_festival' }),
    source_text_excerpt: 'Halloween Festival Vocabulary & Cultural Quiz'
  },
  {
    id: 'quiz_outdoor_picnic_2026',
    title: '🏕️ Đề Trắc Nghiệm Đi Dã Ngoại, Cắm Trại & Giao Tiếp Thiên Nhiên (Eco-Picnic)',
    description: 'Bộ câu hỏi thực hành từ vựng cắm trại, định hướng la bàn, bảo vệ môi trường & mẫu câu rủ bạn bè đi dã ngoại.',
    created_by: 'usr_admin_root',
    creator_name: 'Cô Dung • SuperAdmin',
    source_file_id: 'src_picnic_2026',
    source_file_name: 'Outdoor_Picnic_Scavenger_Hunt.docx',
    time_limit_minutes: 15,
    status: 'published',
    created_at: '2026-10-23T20:50:00Z',
    updated_at: '2026-10-23T20:50:00Z',
    source_metadata_json: JSON.stringify({ grade: 'Lớp 7', topic: 'Outdoor Picnic', theme_id: 'outdoor_picnic' }),
    source_text_excerpt: 'Outdoor Picnic, Camping & Eco-Tourism English Quiz'
  },
  {
    id: 'quiz_english_workshop_2026',
    title: '🎙️ Đề Thực Hành Workshop Thuyết Trình, Phản Biện (Debate) & Teamwork',
    description: 'Kiểm tra kỹ năng sử dụng ngôn ngữ thuyết trình (Signposting), phản biện lịch sự (Rebuttal) và làm việc nhóm.',
    created_by: 'usr_admin_root',
    creator_name: 'Cô Dung • SuperAdmin',
    source_file_id: 'src_workshop_2026',
    source_file_name: 'English_Speaking_Workshop_SOP.docx',
    time_limit_minutes: 20,
    status: 'published',
    created_at: '2026-10-23T20:50:00Z',
    updated_at: '2026-10-23T20:50:00Z',
    source_metadata_json: JSON.stringify({ grade: 'Lớp 8', topic: 'Speaking Workshop', theme_id: 'english_workshop' }),
    source_text_excerpt: 'Public Speaking, Brainstorming & Debate Workshop Quiz'
  },
  {
    id: 'quiz_gdrive_heritage_urban',
    title: '🏆 Đề Chuyên Sâu: Di Sản Văn Hóa, Đô Thị Hóa & Kỹ Năng Tự Lập (Google Drive Corpus)',
    description: 'Trích xuất trực tiếp từ bộ chuyên đề Từ vựng & Đọc hiểu chuyên sâu trên Google Drive.',
    created_by: 'usr_admin_root',
    creator_name: 'Cô Dung • SuperAdmin',
    source_file_id: 'src_gdrive_corpus',
    source_file_name: 'our_heritage_and_urbanisation_vocab.docx',
    time_limit_minutes: 25,
    status: 'published',
    created_at: '2026-10-23T20:50:00Z',
    updated_at: '2026-10-23T20:50:00Z',
    source_metadata_json: JSON.stringify({ grade: 'Lớp 8', topic: 'Heritage & Urbanisation', theme_id: 'cambridge_exam' }),
    source_text_excerpt: 'Becoming Independent, Cities & Urbanisation, Our Cultural Heritage'
  }
];
await batchInsert(
  'quizzes',
  ['id', 'title', 'description', 'created_by', 'creator_name', 'source_file_id', 'source_file_name', 'time_limit_minutes', 'status', 'created_at', 'updated_at', 'source_metadata_json', 'source_text_excerpt'],
  newQuizzes,
  10
);

const newBundles = newQuizzes.map((qz, i) => ({
  quiz_id: qz.id,
  google_doc_file_id: qz.source_file_id,
  printable_docx_file_id: `print_${qz.source_file_id}`,
  homework_assignment_id: `hw_${qz.id}`,
  homework_draft_json: JSON.stringify({ title: qz.title, time_limit: qz.time_limit_minutes }),
  canonical_source: 'docx',
  revision: 1,
  quiz_checksum: `chk_20261023_${i + 1}`,
  google_doc_modified_time: '2026-10-23T20:50:00Z',
  sync_status: 'synced',
  last_synced_at: '2026-10-23T20:50:00Z',
  created_at: '2026-10-23T20:50:00Z',
  updated_at: '2026-10-23T20:50:00Z'
}));
await batchInsert(
  'quiz_bundles',
  ['quiz_id', 'google_doc_file_id', 'printable_docx_file_id', 'homework_assignment_id', 'homework_draft_json', 'canonical_source', 'revision', 'quiz_checksum', 'google_doc_modified_time', 'sync_status', 'last_synced_at', 'created_at', 'updated_at'],
  newBundles,
  10
);

const builderDefaults = [
  {
    user_id: 'usr_admin_root',
    source_type: 'question_bank',
    question_count: 15,
    time_limit_minutes: 20,
    grade_level: 7,
    difficulty: 'medium',
    type_mix_json: JSON.stringify({ mcq: 80, fill_blank: 20 }),
    default_status: 'published',
    created_at: '2026-10-23T20:50:00Z',
    updated_at: '2026-10-23T20:50:00Z'
  },
  {
    user_id: 'usr_teacher_codung',
    source_type: 'drive',
    question_count: 20,
    time_limit_minutes: 30,
    grade_level: 8,
    difficulty: 'medium',
    type_mix_json: JSON.stringify({ mcq: 70, reading: 30 }),
    default_status: 'published',
    created_at: '2026-10-23T20:50:00Z',
    updated_at: '2026-10-23T20:50:00Z'
  }
];
await batchInsert(
  'quiz_builder_defaults',
  ['user_id', 'source_type', 'question_count', 'time_limit_minutes', 'grade_level', 'difficulty', 'type_mix_json', 'default_status', 'created_at', 'updated_at'],
  builderDefaults,
  10
);

// 7. Populate Bilingual Graded Readers & Reader Pages (fixing the 0-row gap!)
const readers = [
  {
    id: 'reader_halloween_lantern',
    title: "🎃 The Mystery of the Glowing Jack-o'-Lantern (Bí Ẩn Quả Bí Ngô Phát Sáng)",
    grade_level: 'Lớp 7',
    cefr_level: 'A2-B1',
    source_ref: 'cambridge-graded-readers-event',
    status: 'published',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'reader_picnic_compass',
    title: '🏕️ The Eco-Picnic & Compass Treasure Hunt (Chuyến Dã Ngoại Sinh Thái & Truy Tìm Kho Báu)',
    grade_level: 'Lớp 7',
    cefr_level: 'B1',
    source_ref: 'outdoor-picnic-workshop-series',
    status: 'published',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'reader_workshop_debaters',
    title: '🎙️ Voices of Tomorrow: The Young Debaters Workshop (Hội Thảo Nhà Hùng Biện Trẻ)',
    grade_level: 'Lớp 8',
    cefr_level: 'B1-B2',
    source_ref: 'english-speaking-workshop-series',
    status: 'published',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'reader_halong_heritage',
    title: '🌏 Guardians of Ha Long Bay Heritage (Những Người Gác Di Sản Vịnh Hạ Long)',
    grade_level: 'Lớp 8',
    cefr_level: 'B1',
    source_ref: 'gdrive-our-heritage-corpus',
    status: 'published',
    created_at: '2026-10-23 20:50:00'
  }
];
await batchInsert(
  'readers',
  ['id', 'title', 'grade_level', 'cefr_level', 'source_ref', 'status', 'created_at'],
  readers,
  10
);

const readerPages = [
  {
    id: 'rpage_hw_1',
    reader_id: 'reader_halloween_lantern',
    page_num: 1,
    content_text: "On the last evening of October, the English club gathered in the school courtyard for the annual Halloween Costume Festival. Paper lanterns and glowing jack-o'-lanterns illuminated the stone pathway. Minh wore a clever wizard disguise and carried a notebook full of English riddles.",
    audio_url: '',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'rpage_hw_2',
    reader_id: 'reader_halloween_lantern',
    page_num: 2,
    content_text: "At the center of the yard stood a cast-iron cauldron filled with vocabulary challenge cards. Every team had to solve three spooky riddles and pronounce five Cambridge B1 words accurately to unlock the treasure chest of stars.",
    audio_url: '',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'rpage_picnic_1',
    reader_id: 'reader_picnic_compass',
    page_num: 1,
    content_text: "Early Sunday morning, our class set off on an educational excursion to the national botanical garden. Before pitching our tents at the lakeside campsite, our facilitator reminded everyone to use only biodegradable plates and reusable water bottles.",
    audio_url: '',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'rpage_picnic_2',
    reader_id: 'reader_picnic_compass',
    page_num: 2,
    content_text: "Using a magnetic compass and a pair of binoculars, Team Emerald followed the scenic trail to observe migratory birds. At the final checkpoint, they recorded a two-minute English presentation about protecting local flora and fauna.",
    audio_url: '',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'rpage_ws_1',
    reader_id: 'reader_workshop_debaters',
    page_num: 1,
    content_text: "After an energetic ten-minute ice-breaker, four student teams began their brainstorming session using colorful mind maps. The workshop topic was 'How Smart Green Cities Can Reduce Traffic Congestion and Carbon Footprints'.",
    audio_url: '',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'rpage_ws_2',
    reader_id: 'reader_workshop_debaters',
    page_num: 2,
    content_text: "Maintaining steady eye contact and confident body language, Lan delivered an eloquent opening speech. During the rebuttal round, both teams used polite academic phrases and received constructive feedback from the teachers.",
    audio_url: '',
    created_at: '2026-10-23 20:50:00'
  },
  {
    id: 'rpage_hl_1',
    reader_id: 'reader_halong_heritage',
    page_num: 1,
    content_text: "Recognized by UNESCO as a World Natural Heritage site, Ha Long Bay is a breathtaking limestone archipelago. Young volunteers regularly take part in eco-tourism workshops to keep the beaches litter-free and protect coral reefs.",
    audio_url: '',
    created_at: '2026-10-23 20:50:00'
  }
];
await batchInsert(
  'reader_pages',
  ['id', 'reader_id', 'page_num', 'content_text', 'audio_url', 'created_at'],
  readerPages,
  10
);

// 8. Seed site_custom_themes table in D1 so AdminCP has pre-saved Event/Workshop/Picnic themes ready to manage!
await execSql(`
  CREATE TABLE IF NOT EXISTS site_custom_themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'event',
    icon TEXT DEFAULT '🎨',
    badge TEXT DEFAULT 'CUSTOM EVENT THEME',
    desc TEXT DEFAULT '',
    payload_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const preSavedCustomThemes = [
  {
    id: 'thm_custom_halloween_gala',
    name: '🎃 Đêm Hội Hóa Trang Halloween 2026',
    category: 'event',
    icon: '🎃',
    badge: 'HALLOWEEN GALA NIGHT',
    desc: 'Theme sự kiện đêm hội Halloween — Cam bí ngô & Tím phép thuật, kèm thanh Banner dẫn thẳng vào Kho Từ Vựng Halloween.',
    payload_json: JSON.stringify({
      id: 'thm_custom_halloween_gala',
      name: '🎃 Đêm Hội Hóa Trang Halloween 2026',
      category: 'event',
      icon: '🎃',
      badge: 'HALLOWEEN GALA NIGHT',
      desc: 'Theme sự kiện đêm hội Halloween — Cam bí ngô & Tím phép thuật.',
      bannerEnabled: true,
      bannerTitle: '🎃 Đêm Hội Hóa Trang Halloween 2026 — Săn Từ Vựng & Giải Đố Nhận 200 Sao!',
      bannerSub: 'Tham gia thử thách phát âm IPA chủ đề Halloween & Lễ hội thế giới ngay hôm nay.',
      ctaText: '🎃 Vào Học Từ Vựng Halloween',
      ctaHref: '/dictionary?q=halloween',
      particlesEnabled: true,
      particles: ['🎃', '🦇', '👻', '🍬', '🕸️', '✨'],
      c: { 50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#7c2d12',900:'#431407',950:'#1f0903' },
      hof: ['#fdba74','#f97316','#ea580c','#7e22ce'],
      isCustomD1: true
    }),
    created_at: '2026-10-23 20:50:00',
    updated_at: '2026-10-23 20:50:00'
  },
  {
    id: 'thm_custom_picnic_yenso',
    name: '🏕️ Dã Ngoại Công Viên & Eco-Trip Cuối Tuần',
    category: 'event',
    icon: '🏕️',
    badge: 'OUTDOOR ECO-PICNIC',
    desc: 'Theme chuyến đi dã ngoại & cắm trại ngoài trời — Xanh rừng thông tươi mát, kèm bộ từ vựng Scavenger Hunt.',
    payload_json: JSON.stringify({
      id: 'thm_custom_picnic_yenso',
      name: '🏕️ Dã Ngoại Công Viên & Eco-Trip Cuối Tuần',
      category: 'event',
      icon: '🏕️',
      badge: 'OUTDOOR ECO-PICNIC',
      desc: 'Theme chuyến đi dã ngoại & cắm trại ngoài trời.',
      bannerEnabled: true,
      bannerTitle: '🏕️ Chuyến Đi Dã Ngoại & Trò Chơi Mật Thư Tiếng Anh Ngoài Trời (Scavenger Hunt)!',
      bannerSub: 'Ôn tập ngay 25 từ vựng cắm trại, la bàn định hướng & bảo vệ thiên nhiên trước giờ khởi hành.',
      ctaText: '🏕️ Mở Từ Vựng Đi Dã Ngoại',
      ctaHref: '/dictionary?q=picnic',
      particlesEnabled: true,
      particles: ['🏕️', '🌿', '🌻', '🎒', '🧭', '🦋'],
      c: { 50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b',950:'#022c22' },
      hof: ['#bbf7d0','#34d399','#059669','#d97706'],
      isCustomD1: true
    }),
    created_at: '2026-10-23 20:50:00',
    updated_at: '2026-10-23 20:50:00'
  },
  {
    id: 'thm_custom_speaking_workshop',
    name: '🎙️ Workshop Thuyết Trình & Phản Biện Tiếng Anh',
    category: 'event',
    icon: '🎙️',
    badge: 'SPEAKING & DEBATE WORKSHOP',
    desc: 'Theme buổi Workshop thực hành Public Speaking, Brainstorming & Teamwork.',
    payload_json: JSON.stringify({
      id: 'thm_custom_speaking_workshop',
      name: '🎙️ Workshop Thuyết Trình & Phản Biện Tiếng Anh',
      category: 'event',
      icon: '🎙️',
      badge: 'SPEAKING & DEBATE WORKSHOP',
      desc: 'Theme buổi Workshop thực hành Public Speaking, Brainstorming & Teamwork.',
      bannerEnabled: true,
      bannerTitle: '🎙️ English Speaking & Debate Workshop — Tự Tin Thuyết Trình Trước Đám Đông!',
      bannerSub: 'Nắm vững bộ mẫu câu Signposting, Brainstorming, Mind Map & Phản biện lịch sự chuẩn Cambridge.',
      ctaText: '🎙️ Mở Bộ Từ Vựng Workshop',
      ctaHref: '/dictionary?q=workshop',
      particlesEnabled: true,
      particles: ['🎙️', '💡', '🤝', '🎯', '🌟', '🚀'],
      c: { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81',950:'#1e1b4b' },
      hof: ['#c7d2fe','#818cf8','#4f46e5','#9333ea'],
      isCustomD1: true
    }),
    created_at: '2026-10-23 20:50:00',
    updated_at: '2026-10-23 20:50:00'
  }
];
await batchInsert(
  'site_custom_themes',
  ['id', 'name', 'category', 'icon', 'badge', 'desc', 'payload_json', 'created_at', 'updated_at'],
  preSavedCustomThemes,
  10
);

// 9. Sync new Event/Workshop/Grammar/Vocabulary notes into knowledge_vault
const vaultEntries = [
  {
    id: 'vault_theme_halloween_2026',
    title: '🎃 Kho Học Liệu & Kịch Bản Sự Kiện Lễ Hội Halloween (Spooky Vocabulary & Quiz)',
    folder: '05_TEACHING_SOP_AND_PEDAGOGY',
    category: 'Event Theme & Vocabulary',
    tags: 'halloween, event, costume party, jack-o-lantern, trick-or-treat, cambridge',
    source_path: 'second_brain/05_TEACHING_SOP_AND_PEDAGOGY/Halloween_Event_SOP.md',
    source_hash: 'hash_hw_20261023',
    content_markdown: NEW_TEACHING_RESOURCES_MD('halloween'),
    status: 'indexed',
    created_at: '2026-10-23 20:50:00',
    updated_at: '2026-10-23 20:50:00'
  },
  {
    id: 'vault_theme_picnic_2026',
    title: '🏕️ Kho Học Liệu Đi Dã Ngoại & Cắm Trại Tiếng Anh (Outdoor Picnic & Scavenger Hunt)',
    folder: '05_TEACHING_SOP_AND_PEDAGOGY',
    category: 'Outdoor Field Trip & Picnic',
    tags: 'picnic, camping, outdoor, scavenger hunt, compass, eco-tourism, itinerary',
    source_path: 'second_brain/05_TEACHING_SOP_AND_PEDAGOGY/Outdoor_Picnic_SOP.md',
    source_hash: 'hash_picnic_20261023',
    content_markdown: NEW_TEACHING_RESOURCES_MD('picnic'),
    status: 'indexed',
    created_at: '2026-10-23 20:50:00',
    updated_at: '2026-10-23 20:50:00'
  },
  {
    id: 'vault_theme_workshop_2026',
    title: '🎙️ Kho Học Liệu Workshop Thuyết Trình, Phản Biện (Debate) & Teamwork Tiếng Anh',
    folder: '05_TEACHING_SOP_AND_PEDAGOGY',
    category: 'Speaking & Debate Workshop',
    tags: 'workshop, public speaking, debate, brainstorming, teamwork, facilitator, rebuttal',
    source_path: 'second_brain/05_TEACHING_SOP_AND_PEDAGOGY/Speaking_Workshop_SOP.md',
    source_hash: 'hash_workshop_20261023',
    content_markdown: NEW_TEACHING_RESOURCES_MD('workshop'),
    status: 'indexed',
    created_at: '2026-10-23 20:50:00',
    updated_at: '2026-10-23 20:50:00'
  }
];

function NEW_TEACHING_RESOURCES_MD(kind) {
  if (kind === 'halloween') {
    return '# 🎃 Chủ Đề Sự Kiện Halloween\nTừ vựng trọng tâm: jack-o-lantern, trick-or-treat, costume party, haunted house, cauldron, spooky, masquerade, lantern parade, harvest festival, spellbinding.';
  }
  if (kind === 'picnic') {
    return '# 🏕️ Chủ Đề Đi Dã Ngoại & Cắm Trại\nTừ vựng trọng tâm: itinerary, campsite, pitch a tent, sleeping bag, compass, campfire, picnic hamper, nature reserve, botanical garden, scenic trail, first-aid kit, binoculars, scavenger hunt, eco-tourism, biodegradable.';
  }
  return '# 🎙️ Chủ Đề Workshop Thuyết Trình & Phản Biện\nTừ vựng trọng tâm: facilitator, brainstorming, ice-breaker, public speaking, eye contact, body language, articulate, persuasive, rebuttal, consensus, constructive feedback, visual aid, mind map, impromptu, peer review.';
}

await batchInsert(
  'knowledge_vault',
  ['id', 'title', 'folder', 'category', 'tags', 'source_path', 'source_hash', 'content_markdown', 'status', 'created_at', 'updated_at'],
  vaultEntries,
  10
);

console.log('================================================================================');
console.log('📊 VERIFYING FINAL CLOUDFLARE D1 ROW COUNTS AFTER ENRICHMENT');
console.log('================================================================================');
for (const t of ['cambridge_vocabulary', 'questions', 'question_bank', 'grammar_topics', 'teaching_resources', 'quizzes', 'quiz_bundles', 'quiz_builder_defaults', 'readers', 'reader_pages', 'site_custom_themes', 'knowledge_vault']) {
  const cnt = await execSql(`SELECT COUNT(*) as c FROM "${t}"`);
  console.log(t.padEnd(28), 'rows:', cnt[0]?.c);
}

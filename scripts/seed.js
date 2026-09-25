import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = path.resolve(__dirname, '../data');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'tienganh7.db');
const db = new DatabaseSync(dbPath);

// Create schema
db.exec(`
  PRAGMA foreign_keys = OFF;
  DROP TABLE IF EXISTS user_progress;
  DROP TABLE IF EXISTS words;
  DROP TABLE IF EXISTS questions;
  DROP TABLE IF EXISTS units;
  DROP TABLE IF EXISTS game_scores;
  PRAGMA foreign_keys = ON;

  CREATE TABLE units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT
  );

  CREATE TABLE words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL,
    ipa TEXT NOT NULL,
    pos TEXT NOT NULL,
    meaning_vi TEXT NOT NULL,
    vowels_detail TEXT,       -- Mô tả chi tiết nguyên âm
    consonants_detail TEXT,   -- Mô tả chi tiết phụ âm
    phonics_note TEXT,        -- Ghi chú phát âm & trọng âm
    syllables TEXT,           -- Phân tách âm tiết
    example_en TEXT NOT NULL, -- Câu ví dụ tiếng Anh
    example_vi TEXT NOT NULL, -- Dịch câu ví dụ
    unit_id TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    category TEXT DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(unit_id) REFERENCES units(id)
  );

  CREATE TABLE questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id TEXT NOT NULL,
    section TEXT NOT NULL,
    section_title TEXT NOT NULL,
    qnum INTEGER NOT NULL,
    passage TEXT,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    explanation TEXT,
    unit_id TEXT
  );

  CREATE TABLE user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER UNIQUE,
    status TEXT DEFAULT 'new', -- 'new', 'learning', 'mastered'
    review_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    last_reviewed DATETIME,
    FOREIGN KEY(word_id) REFERENCES words(id)
  );

  CREATE TABLE game_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_mode TEXT NOT NULL,
    player_name TEXT DEFAULT 'Học sinh',
    score INTEGER NOT NULL,
    time_seconds REAL,
    correct_answers INTEGER,
    total_questions INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('Tables initialized successfully.');

// Seed Units
const unitsData = [
  { id: 'unit1', name: 'Unit 1: Hobbies', description: 'Sở thích & Thời gian rảnh', icon: '🎨' },
  { id: 'unit2', name: 'Unit 2: Healthy Living', description: 'Sống khỏe & Thói quen lành mạnh', icon: '🥗' },
  { id: 'unit3', name: 'Unit 3: Community Service', description: 'Hoạt động vì cộng đồng & Tình nguyện', icon: '🤝' },
  { id: 'phonics', name: 'Ngữ âm & Trọng âm', description: 'Phát âm -ed, trọng âm 2 âm tiết', icon: '🔊' },
  { id: 'grammar', name: 'Ngữ pháp & Giao tiếp', description: 'Thì HTĐ, QKĐ, Câu ghép and/or/but/so', icon: '📚' }
];

const insertUnit = db.prepare('INSERT INTO units (id, name, description, icon) VALUES (?, ?, ?, ?)');
for (const u of unitsData) {
  insertUnit.run(u.id, u.name, u.description, u.icon);
}

// Vocabulary data with rich Phonics analysis (vowels, consonants, phonics notes, examples)
const vocabularyData = [
  // UNIT 1: HOBBIES
  {
    term: 'hobby',
    ipa: '/ˈhɒbi/',
    pos: 'noun',
    meaning_vi: 'sở thích, thú vui lúc rảnh rỗi',
    syllables: 'hob-by (2 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ɒ/ (âm "o" ngắn, tròn môi) ở âm tiết 1; nguyên âm ngắn /i/ (âm "i" ngắn nhẹ) ở âm tiết 2.',
    consonants_detail: 'Phụ âm bật môi /h/, phụ âm kép "bb" phát âm thành 1 âm hữu thanh /b/.',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ nhất (âm 1: HOB-by).',
    example_en: 'What is your hobby? - I enjoy collecting stamps.',
    example_vi: 'Sở thích của bạn là gì? - Mình rất thích sưu tầm tem thư.',
    unit_id: 'unit1',
    difficulty: 'easy',
    category: 'hobbies'
  },
  {
    term: 'creative',
    ipa: '/kriˈeɪtɪv/',
    pos: 'adjective',
    meaning_vi: 'sáng tạo, có óc tưởng tượng phong phú',
    syllables: 'cre-a-tive (3 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /i/, nguyên âm đôi /eɪ/ (trọng âm chính), nguyên âm ngắn /ɪ/.',
    consonants_detail: 'Cụm phụ âm đầu /kr/, phụ âm vô thanh /t/, phụ âm răng môi hữu thanh /v/ ở cuối.',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ hai: /kriˈeɪtɪv/. Đuôi "-ive" thường không nhận trọng âm.',
    example_en: 'My daughter is very creative. She can make new things easily.',
    example_vi: 'Con gái tôi rất sáng tạo. Bé có thể tự làm những món đồ mới rất dễ dàng.',
    unit_id: 'unit1',
    difficulty: 'medium',
    category: 'personality'
  },
  {
    term: 'gardening',
    ipa: '/ˈɡɑːdnɪŋ/',
    pos: 'noun',
    meaning_vi: 'việc làm vườn, sở thích trồng trọt',
    syllables: 'gar-den-ing (3 âm tiết)',
    vowels_detail: 'Nguyên âm dài /ɑː/ (mở rộng miệng, kéo dài), nguyên âm ngắn /ɪ/ ở đuôi "-ing".',
    consonants_detail: 'Phụ âm hữu thanh /ɡ/, /d/, /n/, âm mũi ngạc mềm /ŋ/ ở cuối đuôi "-ing".',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ nhất: /ˈɡɑːdnɪŋ/. Chữ "r" trong tiếng Anh-Anh thường câm khi đi sau /ɑː/.',
    example_en: 'Gardening gives us plants, flowers and fresh vegetables.',
    example_vi: 'Làm vườn mang lại cho chúng ta cây xanh, hoa tươi và rau sạch.',
    unit_id: 'unit1',
    difficulty: 'medium',
    category: 'hobbies'
  },
  {
    term: 'dollhouse',
    ipa: '/ˈdɒlhaʊs/',
    pos: 'noun',
    meaning_vi: 'ngôi nhà búp bê (mô hình nhà nhỏ)',
    syllables: 'doll-house (2 âm tiết ghép)',
    vowels_detail: 'Nguyên âm ngắn /ɒ/ trong "doll"; nguyên âm đôi /aʊ/ (từ "a" trượt sang "u") trong "house".',
    consonants_detail: 'Phụ âm đầu /d/, âm bên /l/, âm bật hơi /h/, âm vô thanh /s/ kết thúc (chú ý chữ "se" phát âm là /s/).',
    phonics_note: 'Từ ghép (compound noun) nên trọng âm chính nhấn vào từ đầu tiên: DOLL-house.',
    example_en: 'She enjoys building dollhouses in her free time.',
    example_vi: 'Cô ấy thích tự lắp ráp những ngôi nhà búp bê vào thời gian rảnh.',
    unit_id: 'unit1',
    difficulty: 'medium',
    category: 'hobbies'
  },
  {
    term: 'collect',
    ipa: '/kəˈlekt/',
    pos: 'verb',
    meaning_vi: 'sưu tầm, gom nhặt, thu thập',
    syllables: 'col-lect (2 âm tiết)',
    vowels_detail: 'Nguyên âm trung tính /ə/ (schwa lướt nhẹ) ở âm 1; nguyên âm ngắn /e/ ở âm 2 nhận trọng âm.',
    consonants_detail: 'Phụ âm đầu /k/ (chữ "c"), âm /l/, kết thúc bằng cụm phụ âm đôi /kt/.',
    phonics_note: 'Trọng âm nhấn vào âm tiết 2: /kəˈlekt/. Chữ cái "o" biến thành âm schwa /ə/ do không mang trọng âm.',
    example_en: 'She loves collecting old comic books.',
    example_vi: 'Cô bé rất yêu thích việc sưu tầm những cuốn truyện tranh cổ.',
    unit_id: 'unit1',
    difficulty: 'easy',
    category: 'verbs'
  },
  {
    term: 'enjoy',
    ipa: '/ɪnˈdʒɔɪ/',
    pos: 'verb',
    meaning_vi: 'thích thú, thưởng thức, tận hưởng',
    syllables: 'en-joy (2 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ɪ/ ở âm 1; nguyên âm đôi /ɔɪ/ ("o" trượt sang "i") ở âm 2.',
    consonants_detail: 'Phụ âm mũi /n/, phụ âm tắc xát hữu thanh /dʒ/ (bật tròn môi).',
    phonics_note: 'Động từ 2 âm tiết có trọng âm rơi vào âm tiết thứ 2: /ɪnˈdʒɔɪ/. Sau enjoy luôn là V-ing.',
    example_en: 'She enjoys listening to English songs after school.',
    example_vi: 'Bạn ấy thích nghe nhạc tiếng Anh sau giờ tan trường.',
    unit_id: 'unit1',
    difficulty: 'easy',
    category: 'verbs'
  },
  {
    term: 'cartoon',
    ipa: '/kɑːˈtuːn/',
    pos: 'noun',
    meaning_vi: 'phim hoạt hình',
    syllables: 'car-toon (2 âm tiết)',
    vowels_detail: 'Nguyên âm dài /ɑː/ ở âm 1; nguyên âm dài chu môi /uː/ ở âm 2.',
    consonants_detail: 'Phụ âm bật hơi vô thanh /k/, /t/, phụ âm mũi /n/.',
    phonics_note: 'Từ mượn có đuôi "-oon" nhận trọng âm chính ở âm tiết thứ 2: /kɑːˈtuːn/.',
    example_en: 'Children like watching funny cartoons on Saturday morning.',
    example_vi: 'Trẻ nhỏ rất thích xem phim hoạt hình hài hước vào sáng thứ Bảy.',
    unit_id: 'unit1',
    difficulty: 'easy',
    category: 'entertainment'
  },
  {
    term: 'delicious',
    ipa: '/dɪˈlɪʃəs/',
    pos: 'adjective',
    meaning_vi: 'ngon miệng, thơm ngon',
    syllables: 'de-li-cious (3 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ɪ/ ở âm 1 và 2; nguyên âm lướt nhẹ /ə/ ở âm 3.',
    consonants_detail: 'Phụ âm đầu /d/, /l/, âm xát vô thanh /ʃ/ (chu môi "sh" từ nhóm "-ci-"), phụ âm /s/ cuối.',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ 2: /dɪˈlɪʃəs/ (từ có đuôi "-ious" trọng âm rơi vào âm tiết liền trước nó).',
    example_en: 'Emily makes delicious cookies every Sunday.',
    example_vi: 'Emily nướng những chiếc bánh quy thơm phức vào mỗi Chủ nhật.',
    unit_id: 'unit1',
    difficulty: 'medium',
    category: 'food'
  },

  // UNIT 2: HEALTHY LIVING
  {
    term: 'keep fit',
    ipa: '/kiːp fɪt/',
    pos: 'verb phrase',
    meaning_vi: 'giữ vóc dáng cân đối, duy trì cơ thể khỏe mạnh',
    syllables: 'keep fit (2 từ đơn âm)',
    vowels_detail: 'Nguyên âm dài /iː/ (cười căng khóe miệng) trong "keep"; đối lập với nguyên âm ngắn /ɪ/ trong "fit".',
    consonants_detail: 'Phụ âm đầu /k/, /f/; hai phụ âm vô thanh bật hơi ở cuối /p/ và /t/.',
    phonics_note: 'Luyện tập phân biệt cặp nguyên âm /iː/ (dài) và /ɪ/ (ngắn). Cả hai từ đều có thanh điệu rõ.',
    example_en: 'My mum does exercise every day to keep fit.',
    example_vi: 'Mẹ tôi tập thể dục mỗi ngày để giữ vóc dáng thon gọn và khỏe mạnh.',
    unit_id: 'unit2',
    difficulty: 'medium',
    category: 'health'
  },
  {
    term: 'suncream',
    ipa: '/ˈsʌnkriːm/',
    pos: 'noun',
    meaning_vi: 'kem chống nắng',
    syllables: 'sun-cream (2 âm tiết ghép)',
    vowels_detail: 'Nguyên âm ngắn /ʌ/ (âm á ngực mở) trong "sun"; nguyên âm dài /iː/ trong "cream".',
    consonants_detail: 'Phụ âm xát /s/, phụ âm mũi /n/, cụm phụ âm /kr/, phụ âm môi khép /m/.',
    phonics_note: 'Từ ghép danh từ nhấn trọng âm vào âm tiết đầu tiên: /ˈsʌnkriːm/.',
    example_en: 'Wear a hat and use suncream when you go out in hot weather.',
    example_vi: 'Hãy đội mũ và thoa kem chống nắng khi đi ra ngoài trời nắng gắt.',
    unit_id: 'unit2',
    difficulty: 'medium',
    category: 'health'
  },
  {
    term: 'sunburn',
    ipa: '/ˈsʌnbɜːn/',
    pos: 'noun',
    meaning_vi: 'cháy nắng, vết bỏng rát do nắng',
    syllables: 'sun-burn (2 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ʌ/ ở âm tiết 1; nguyên âm dài /ɜː/ (âm "ơ" dài mở miệng hơi hờ) ở âm tiết 2.',
    consonants_detail: 'Phụ âm /s/, /n/, /b/, phụ âm cuối /n/.',
    phonics_note: 'Trọng âm rơi vào âm tiết đầu: /ˈsʌnbɜːn/. Lưu ý âm /ɜː/ của "burn" xuất hiện trong câu 1 đề thi!',
    example_en: 'Looking after your skin prevents painful sunburn.',
    example_vi: 'Chăm sóc làn da sẽ giúp bạn tránh bị bỏng rát do cháy nắng.',
    unit_id: 'unit2',
    difficulty: 'medium',
    category: 'health'
  },
  {
    term: 'overweight',
    ipa: '/ˌəʊvəˈweɪt/',
    pos: 'adjective',
    meaning_vi: 'thừa cân, béo phì',
    syllables: 'o-ver-weight (3 âm tiết)',
    vowels_detail: 'Nguyên âm đôi /əʊ/ ở âm 1; nguyên âm ngắn /ə/ ở âm 2; nguyên âm đôi /eɪ/ ở âm 3 mang trọng âm chính.',
    consonants_detail: 'Phụ âm răng môi /v/, phụ âm môi ngạc /w/, kết thúc bằng âm bật vô thanh /t/ (chữ "gh" câm).',
    phonics_note: 'Trọng âm chính rơi vào âm 3: /ˌəʊvəˈweɪt/. Nhóm chữ "-eigh-" được phát âm là /eɪ/.',
    example_en: 'Eating too much fried food and doing little exercise can make you overweight.',
    example_vi: 'Ăn quá nhiều đồ chiên và lười vận động có thể khiến bạn bị thừa cân.',
    unit_id: 'unit2',
    difficulty: 'medium',
    category: 'health'
  },
  {
    term: 'disease',
    ipa: '/dɪˈziːz/',
    pos: 'noun',
    meaning_vi: 'bệnh tật, căn bệnh',
    syllables: 'dis-ease (2 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ɪ/ ở âm 1; nguyên âm dài /iː/ ở âm 2 mang trọng âm chính.',
    consonants_detail: 'Phụ âm tắc /d/, phụ âm xát hữu thanh /z/ (chú ý cả 2 chữ "s" trong từ này đều phát âm là /z/).',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ 2: /dɪˈziːz/ (rất hay gặp trong đề thi lớp 7 câu 9!).',
    example_en: 'A healthy lifestyle helps prevent heart diseases.',
    example_vi: 'Lối sống lành mạnh giúp phòng ngừa các bệnh về tim mạch.',
    unit_id: 'unit2',
    difficulty: 'hard',
    category: 'health'
  },
  {
    term: 'energy',
    ipa: '/ˈenədʒi/',
    pos: 'noun',
    meaning_vi: 'năng lượng, sức lực dồi dào',
    syllables: 'en-er-gy (3 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /e/ ở âm 1; nguyên âm ngắn /ə/ ở âm 2; nguyên âm ngắn /i/ ở âm 3.',
    consonants_detail: 'Phụ âm mũi /n/, phụ âm tắc xát hữu thanh /dʒ/ (chữ "g" phát âm thành /dʒ/).',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ nhất: /ˈenədʒi/.',
    example_en: 'Breakfast gives your body energy for school and other activities.',
    example_vi: 'Bữa sáng cung cấp năng lượng dồi dào cho cơ thể để học tập và sinh hoạt.',
    unit_id: 'unit2',
    difficulty: 'medium',
    category: 'health'
  },
  {
    term: 'skip breakfast',
    ipa: '/skɪp ˈbrekfəst/',
    pos: 'verb phrase',
    meaning_vi: 'bỏ bữa sáng, nhịn ăn sáng',
    syllables: 'skip break-fast (3 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ɪ/ trong "skip"; nguyên âm ngắn /e/ trong "break" (/brek/); nguyên âm ngắn /ə/ trong "-fast" (/fəst/).',
    consonants_detail: 'Cụm phụ âm /sk/, /br/, kết thúc bằng cụm phụ âm /st/.',
    phonics_note: 'Chú ý: Chữ "break" khi đứng riêng đọc là /breɪk/, nhưng trong "breakfast" đọc là âm ngắn /e/: /ˈbrekfəst/.',
    example_en: 'Students who skip breakfast often feel tired and cannot concentrate.',
    example_vi: 'Học sinh bỏ bữa sáng thường cảm thấy mỏi mệt và khó tập trung.',
    unit_id: 'unit2',
    difficulty: 'medium',
    category: 'lifestyle'
  },
  {
    term: 'dim light',
    ipa: '/dɪm laɪt/',
    pos: 'noun phrase',
    meaning_vi: 'ánh sáng yếu, ánh sáng mờ lờ nhờ',
    syllables: 'dim light (2 từ đơn âm)',
    vowels_detail: 'Nguyên âm ngắn /ɪ/ trong "dim"; nguyên âm đôi /aɪ/ trong "light".',
    consonants_detail: 'Phụ âm /d/, /m/, /l/, kết thúc bằng âm /t/ (chữ "gh" câm).',
    phonics_note: 'Đọc nối âm tự nhiên "dim light". Đọc sách dưới dim light gây hại cho thị lực.',
    example_en: 'Do not read books in dim light because it hurts your eyes.',
    example_vi: 'Đừng đọc sách trong ánh sáng lờ mờ vì sẽ làm tổn hại đến mắt bạn.',
    unit_id: 'unit2',
    difficulty: 'hard',
    category: 'health'
  },
  {
    term: 'stay up late',
    ipa: '/steɪ ʌp leɪt/',
    pos: 'verb phrase',
    meaning_vi: 'thức khuya, đi ngủ muộn',
    syllables: 'stay up late (3 từ)',
    vowels_detail: 'Nguyên âm đôi /eɪ/ trong "stay" và "late"; nguyên âm ngắn /ʌ/ trong "up".',
    consonants_detail: 'Cụm phụ âm /st/, phụ âm /p/, /l/, /t/.',
    phonics_note: 'Nối âm: "stay up" (/steɪ-j-ʌp/), "up late" (/ʌp-leɪt/).',
    example_en: 'It is not good to stay up late before school days.',
    example_vi: 'Thức khuya trước những ngày đi học là thói quen không tốt.',
    unit_id: 'unit2',
    difficulty: 'easy',
    category: 'lifestyle'
  },
  {
    term: 'vegetable',
    ipa: '/ˈvedʒtəbl/',
    pos: 'noun',
    meaning_vi: 'rau củ quả',
    syllables: 'veg-ta-ble (3 âm tiết - âm "e" thứ 2 câm)',
    vowels_detail: 'Nguyên âm ngắn /e/ ở âm 1; nguyên âm ngắn /ə/ ở âm 2 và 3.',
    consonants_detail: 'Phụ âm /v/, /dʒ/ (chữ "g"), âm vô thanh /t/, âm bên /b/, /l/.',
    phonics_note: 'Rất nhiều học sinh phát âm nhầm thành 4 âm tiết. Chuẩn chỉ có 3 âm tiết: /ˈvedʒtəbl/, trọng âm âm 1!',
    example_en: 'Carrots and tomatoes are vegetables that are rich in vitamins.',
    example_vi: 'Cà rốt và cà chua là những loại rau củ chứa nhiều vitamin bổ dưỡng.',
    unit_id: 'unit2',
    difficulty: 'easy',
    category: 'food'
  },
  {
    term: 'regularly',
    ipa: '/ˈreɡjələli/',
    pos: 'adverb',
    meaning_vi: 'đều đặn, thường xuyên theo cữ',
    syllables: 'reg-u-lar-ly (4 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /e/ ở âm 1 mang trọng âm; âm lướt /jə/ ở âm 2; âm /ə/ ở âm 3; âm /i/ ở âm 4.',
    consonants_detail: 'Phụ âm /r/, /ɡ/, âm bán nguyên âm /j/, phụ âm /l/.',
    phonics_note: 'Trọng âm rơi vào âm tiết đầu tiên: /ˈreɡjələli/.',
    example_en: 'To stay healthy, do exercise regularly.',
    example_vi: 'Để giữ gìn sức khỏe dẻo dai, hãy tập thể dục đều đặn.',
    unit_id: 'unit2',
    difficulty: 'medium',
    category: 'adverbs'
  },

  // UNIT 3: COMMUNITY SERVICE
  {
    term: 'community service',
    ipa: '/kəˈmjuːnəti ˈsɜːvɪs/',
    pos: 'noun phrase',
    meaning_vi: 'hoạt động phục vụ cộng đồng, công tác tình nguyện xã hội',
    syllables: 'com-mu-ni-ty ser-vice',
    vowels_detail: 'Nguyên âm /ə/, nguyên âm dài /uː/, nguyên âm /ə/, /i/; nguyên âm dài /ɜː/ trong "service".',
    consonants_detail: 'Phụ âm /k/, /m/, /n/, /t/, /s/, /v/, /s/ (chữ "c" trong "service" phát âm là /s/).',
    phonics_note: 'Cụm từ chủ điểm Unit 3 Tiếng Anh 7. "community" nhấn âm 2, "service" nhấn âm 1.',
    example_en: 'Community service is unpaid work that helps other people.',
    example_vi: 'Phục vụ cộng đồng là công việc thiện nguyện không lương nhằm giúp đỡ người khác.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'benefit',
    ipa: '/ˈbenɪfɪt/',
    pos: 'noun',
    meaning_vi: 'lợi ích, điều tốt đẹp đem lại',
    syllables: 'ben-e-fit (3 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /e/ ở âm 1; nguyên âm ngắn /ɪ/ ở âm 2 và 3.',
    consonants_detail: 'Phụ âm /b/, /n/, /f/, âm bật vô thanh /t/ ở cuối.',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ nhất: /ˈbenɪfɪt/. Cụm hay thi: "for the benefit of...".',
    example_en: 'Community service is the work you do for the benefit of the community.',
    example_vi: 'Công việc vì cộng đồng là những việc làm vì lợi ích chung của xã hội.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'organization',
    ipa: '/ˌɔːɡənaɪˈzeɪʃn/',
    pos: 'noun',
    meaning_vi: 'tổ chức, hội, cơ quan đoàn thể',
    syllables: 'or-gan-i-za-tion (5 âm tiết)',
    vowels_detail: 'Nguyên âm dài /ɔː/, các nguyên âm ngắn /ə/, nguyên âm đôi /aɪ/, nguyên âm đôi /eɪ/ mang trọng âm chính.',
    consonants_detail: 'Phụ âm /ɡ/, /n/, /z/, âm xát vô thanh /ʃ/ (trong đuôi "-tion").',
    phonics_note: 'Trọng âm chính rơi vào âm 4 (âm tiết trước đuôi -tion): /ˌɔːɡənaɪˈzeɪʃn/.',
    example_en: 'Our organization helps homeless children by giving them food and clothes.',
    example_vi: 'Tổ chức của chúng tôi giúp đỡ trẻ em vô gia cư bằng việc trao tặng thức ăn và quần áo.',
    unit_id: 'unit3',
    difficulty: 'hard',
    category: 'community'
  },
  {
    term: 'homeless',
    ipa: '/ˈhəʊmləs/',
    pos: 'adjective',
    meaning_vi: 'vô gia cư, không có nhà cửa nơi ở',
    syllables: 'home-less (2 âm tiết)',
    vowels_detail: 'Nguyên âm đôi /əʊ/ ở âm 1 mang trọng âm; nguyên âm lướt nhẹ /ə/ ở hậu tố "-less".',
    consonants_detail: 'Phụ âm bật hơi /h/, phụ âm mũi /m/, phụ âm bên /l/, phụ âm xát /s/ ở cuối.',
    phonics_note: 'Hậu tố "-less" không bao giờ nhận trọng âm. Trọng âm nhấn âm 1: /ˈhəʊmləs/.',
    example_en: 'The volunteers provide warm shelter for homeless people in winter.',
    example_vi: 'Các tình nguyện viên đem lại nơi ở ấm áp cho những người vô gia cư vào mùa đông.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'environment',
    ipa: '/ɪnˈvaɪrənmənt/',
    pos: 'noun',
    meaning_vi: 'môi trường sống tự nhiên',
    syllables: 'en-vi-ron-ment (4 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ɪ/, nguyên âm đôi /aɪ/ nhận trọng âm chính, hai nguyên âm /ə/ lướt nhẹ.',
    consonants_detail: 'Phụ âm /n/, /v/, /r/, /n/, /m/, kết thúc bằng cụm phụ âm /nt/.',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ 2: /ɪnˈvaɪrənmənt/. Chữ "iron" đọc là /ˈaɪərn/ hoặc /ˈaɪrən/.',
    example_en: 'This youth group plants trees and protects the local environment.',
    example_vi: 'Nhóm thanh niên này trồng thêm cây xanh và tích cực bảo vệ môi trường địa phương.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'nature'
  },
  {
    term: 'donate',
    ipa: '/dəʊˈneɪt/',
    pos: 'verb',
    meaning_vi: 'quyên góp, ủng hộ, hiến tặng (tiền, máu, vật phẩm)',
    syllables: 'do-nate (2 âm tiết)',
    vowels_detail: 'Nguyên âm đôi /əʊ/ ở âm 1; nguyên âm đôi /eɪ/ ở âm 2 nhận trọng âm chính.',
    consonants_detail: 'Phụ âm đầu /d/, phụ âm mũi /n/, âm bật vô thanh /t/ ở cuối.',
    phonics_note: 'Động từ 2 âm tiết có trọng âm rơi vào âm tiết 2: /dəʊˈneɪt/ (xuất hiện trong câu 7 đề kiểm tra!).',
    example_en: 'My brother goes to the hospital to donate blood every six months.',
    example_vi: 'Anh trai tôi đến bệnh viện hiến máu định kỳ 6 tháng một lần.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'nursing home',
    ipa: '/ˈnɜːsɪŋ həʊm/',
    pos: 'noun phrase',
    meaning_vi: 'viện dưỡng lão, nhà an dưỡng người cao tuổi',
    syllables: 'nur-sing home',
    vowels_detail: 'Nguyên âm dài /ɜː/ trong "nursing"; nguyên âm đôi /əʊ/ trong "home".',
    consonants_detail: 'Phụ âm /n/, /s/, âm mũi ngạc /ŋ/ (đuôi -ing); phụ âm /h/, /m/ trong "home".',
    phonics_note: 'Cụm danh từ nhấn trọng âm vào từ đầu tiên: /ˈnɜːsɪŋ həʊm/.',
    example_en: 'We visited the nursing home to help elderly people last Sunday.',
    example_vi: 'Chủ nhật tuần trước chúng tôi đã ghé thăm viện dưỡng lão để chăm sóc các cụ già.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'elderly',
    ipa: '/ˈeldəli/',
    pos: 'adjective',
    meaning_vi: 'cao tuổi, lớn tuổi (cách nói lịch sự thay cho old)',
    syllables: 'el-der-ly (3 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /e/ ở âm 1; nguyên âm ngắn /ə/ ở âm 2; nguyên âm ngắn /i/ ở âm 3.',
    consonants_detail: 'Phụ âm bên /l/, phụ âm bật /d/, phụ âm /l/.',
    phonics_note: 'Trọng âm rơi vào âm tiết thứ nhất: /ˈeldəli/.',
    example_en: 'Students help elderly neighbors carry heavy shopping bags.',
    example_vi: 'Học sinh giúp đỡ những người hàng xóm cao tuổi xách túi đồ nặng.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'volunteer',
    ipa: '/ˌvɒlənˈtɪə(r)/',
    pos: 'verb / noun',
    meaning_vi: 'làm tình nguyện; người tình nguyện viên',
    syllables: 'vol-un-teer (3 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ɒ/ ở âm 1; nguyên âm ngắn /ə/ ở âm 2; nguyên âm đôi /ɪə/ ở âm 3 nhận trọng âm chính.',
    consonants_detail: 'Phụ âm /v/, /l/, /n/, /t/, phụ âm /r/ ở cuối.',
    phonics_note: 'Từ có đuôi "-eer" nhận trọng âm chính ở âm tiết cuối cùng: /ˌvɒlənˈtɪə(r)/.',
    example_en: 'At Green School, students volunteer every Saturday morning.',
    example_vi: 'Tại trường Green School, các bạn học sinh đi làm tình nguyện vào mỗi sáng thứ Bảy.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'orphanage',
    ipa: '/ˈɔːfənɪdʒ/',
    pos: 'noun',
    meaning_vi: 'trại trẻ mồ côi',
    syllables: 'or-phan-age (3 âm tiết)',
    vowels_detail: 'Nguyên âm dài /ɔː/ ở âm 1; nguyên âm ngắn /ə/ ở âm 2; nguyên âm ngắn /ɪ/ ở âm 3.',
    consonants_detail: 'Nhóm chữ "ph" phát âm thành phụ âm xát răng môi vô thanh /f/; đuôi "-ge" phát âm thành /dʒ/.',
    phonics_note: 'Trọng âm rơi vào âm tiết đầu tiên: /ˈɔːfənɪdʒ/.',
    example_en: 'Did you visit an orphanage last summer to teach English to children?',
    example_vi: 'Mùa hè năm ngoái bạn có đến trại mồ côi để dạy tiếng Anh cho các em nhỏ không?',
    unit_id: 'unit3',
    difficulty: 'hard',
    category: 'places'
  },
  {
    term: 'mountain village',
    ipa: '/ˈmaʊntɪn ˈvɪlɪdʒ/',
    pos: 'noun phrase',
    meaning_vi: 'bản làng miền núi, thôn xóm vùng cao',
    syllables: 'moun-tain vil-lage',
    vowels_detail: 'Nguyên âm đôi /aʊ/ trong "mountain"; các nguyên âm ngắn /ɪ/ trong "-tain", "vil-" và "-lage" (/ɪdʒ/).',
    consonants_detail: 'Phụ âm /m/, /nt/, /n/, /v/, /l/, /dʒ/.',
    phonics_note: 'Chú ý chữ "mountain" đọc là /ˈmaʊntɪn/, đuôi "-age" trong "village" đọc là /ɪdʒ/.',
    example_en: 'They collected books and warm clothes for children in a remote mountain village.',
    example_vi: 'Các bạn đã quyên góp sách vở và áo ấm cho trẻ em tại một bản làng miền núi xa xôi.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'places'
  },
  {
    term: 'plant',
    ipa: '/plɑːnt/',
    pos: 'verb / noun',
    meaning_vi: 'trồng (cây); thực vật, cây cảnh',
    syllables: 'plant (1 âm tiết)',
    vowels_detail: 'Nguyên âm dài /ɑː/ (theo chuẩn Anh-Anh) hoặc /æ/ (theo chuẩn Anh-Mỹ).',
    consonants_detail: 'Cụm phụ âm đầu /pl/, cụm phụ âm cuối /nt/. Khi thêm đuôi "-ed" (planted) phát âm là /ɪd/.',
    phonics_note: 'Từ có kết thúc là âm /t/ nên khi thêm -ed đọc là /ɪd/: planted /ˈplɑːntɪd/.',
    example_en: 'We planted trees in the school garden last Friday.',
    example_vi: 'Chúng tôi đã trồng thêm nhiều cây xanh trong khuôn viên trường vào thứ Sáu vừa rồi.',
    unit_id: 'unit3',
    difficulty: 'easy',
    category: 'nature'
  },
  {
    term: 'unpaid work',
    ipa: '/ʌnˈpeɪd wɜːk/',
    pos: 'noun phrase',
    meaning_vi: 'công việc không nhận thù lao (công việc tình nguyện)',
    syllables: 'un-paid work',
    vowels_detail: 'Nguyên âm ngắn /ʌ/ (tiền tố un-); nguyên âm đôi /eɪ/ trong "paid"; nguyên âm dài /ɜː/ trong "work".',
    consonants_detail: 'Phụ âm /n/, /p/, /d/, /w/, /k/.',
    phonics_note: 'Âm /ɜː/ trong "work" giống âm /ɜː/ trong "burn", "hurt", "surfing" ở câu 1!',
    example_en: 'Community service is unpaid work that brings immense happiness to others.',
    example_vi: 'Lao động cộng đồng là công việc không nhận lương mang lại niềm vui to lớn cho mọi người.',
    unit_id: 'unit3',
    difficulty: 'medium',
    category: 'community'
  },
  {
    term: 'rubbish',
    ipa: '/ˈrʌbɪʃ/',
    pos: 'noun',
    meaning_vi: 'rác thải, đồ bỏ đi',
    syllables: 'rub-bish (2 âm tiết)',
    vowels_detail: 'Nguyên âm ngắn /ʌ/ ở âm 1 mang trọng âm; nguyên âm ngắn /ɪ/ ở âm 2.',
    consonants_detail: 'Phụ âm /r/, /b/, phụ âm xát chu môi vô thanh /ʃ/ (nhóm "sh" ở đuôi).',
    phonics_note: 'Trọng âm rơi vào âm tiết đầu: /ˈrʌbɪʃ/. Đồng nghĩa với "garbage", "trash".',
    example_en: 'Please put the rubbish into the bin to keep our playground clean.',
    example_vi: 'Xin vui lòng bỏ rác vào thùng để giữ sân chơi luôn sạch đẹp.',
    unit_id: 'unit3',
    difficulty: 'easy',
    category: 'environment'
  }
];

// Insert vocabulary
const insertWord = db.prepare(`
  INSERT INTO words (
    term, ipa, pos, meaning_vi, vowels_detail, consonants_detail,
    phonics_note, syllables, example_en, example_vi, unit_id, difficulty, category
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertProgress = db.prepare(`
  INSERT INTO user_progress (word_id, status, review_count, correct_count, wrong_count)
  VALUES (?, 'new', 0, 0, 0)
`);

for (const w of vocabularyData) {
  const result = insertWord.run(
    w.term, w.ipa, w.pos, w.meaning_vi, w.vowels_detail, w.consonants_detail,
    w.phonics_note, w.syllables, w.example_en, w.example_vi, w.unit_id, w.difficulty, w.category
  );
  insertProgress.run(result.lastInsertRowid);
}

console.log(`Inserted ${vocabularyData.length} enriched vocabulary items.`);

// Also insert the 60 questions
const questionsData = [
  // PHONICS 1-10
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 1,
    question_text: 'Chọn từ có phần gạch chân phát âm khác: h<u>ur</u>t, s<u>ur</u>prise, s<u>ur</u>fing, b<u>ur</u>n',
    option_a: 'hurt', option_b: 'surprise', option_c: 'surfing', option_d: 'burn', correct_option: 'B',
    explanation: 'Đáp án B: "surprise" phát âm là /ə/ (səˈpraɪz), còn "hurt", "surfing", "burn" phát âm là /ɜː/.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 2,
    question_text: 'Chọn từ có phần gạch chân phát âm khác: play<u>ed</u>, help<u>ed</u>, work<u>ed</u>, cook<u>ed</u>',
    option_a: 'played', option_b: 'helped', option_c: 'worked', option_d: 'cooked', correct_option: 'A',
    explanation: 'Đáp án A: "played" có đuôi -ed phát âm là /d/. "helped", "worked", "cooked" tận cùng bằng âm vô thanh /p/, /k/ nên -ed phát âm là /t/.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 3,
    question_text: 'Chọn từ có phần gạch chân phát âm khác: want<u>ed</u>, need<u>ed</u>, visit<u>ed</u>, clean<u>ed</u>',
    option_a: 'wanted', option_b: 'needed', option_c: 'visited', option_d: 'cleaned', correct_option: 'D',
    explanation: 'Đáp án D: "cleaned" có đuôi -ed phát âm là /d/. "wanted", "needed", "visited" tận cùng bằng âm /t/, /d/ nên -ed phát âm là /ɪd/.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 4,
    question_text: 'Chọn từ có phần gạch chân phát âm khác: lea<u>f</u>, <u>f</u>lower, o<u>f</u>, <u>f</u>lu',
    option_a: 'leaf', option_b: 'flower', option_c: 'of', option_d: 'flu', correct_option: 'C',
    explanation: 'Đáp án C: Giới từ "of" phát âm là /əv/ hoặc /ɒv/ (âm /v/). Các từ còn lại phát âm là âm /f/.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 5,
    question_text: 'Chọn từ có phần gạch chân phát âm khác: <u>c</u>ake, <u>c</u>ity, <u>c</u>ollect, <u>c</u>ommunity',
    option_a: 'cake', option_b: 'city', option_c: 'collect', option_d: 'community', correct_option: 'B',
    explanation: 'Đáp án B: "city" phát âm là /s/. Các từ "cake", "collect", "community" phát âm là /k/.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 6,
    question_text: 'Chọn từ có trọng âm chính khác: enjoy, hobby, healthy, picture',
    option_a: 'enjoy', option_b: 'hobby', option_c: 'healthy', option_d: 'picture', correct_option: 'A',
    explanation: 'Đáp án A: "enjoy" trọng âm 2 (/ɪnˈdʒɔɪ/). "hobby", "healthy", "picture" trọng âm 1.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 7,
    question_text: 'Chọn từ có trọng âm chính khác: donate, collect, enjoy, children',
    option_a: 'donate', option_b: 'collect', option_c: 'enjoy', option_d: 'children', correct_option: 'D',
    explanation: 'Đáp án D: "children" /ˈtʃɪldrən/ trọng âm 1. Các từ donate, collect, enjoy đều trọng âm 2.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 8,
    question_text: 'Chọn từ có trọng âm chính khác: always, active, cartoon, boring',
    option_a: 'always', option_b: 'active', option_c: 'cartoon', option_d: 'boring', correct_option: 'C',
    explanation: 'Đáp án C: "cartoon" /kɑːˈtuːn/ trọng âm 2. "always", "active", "boring" trọng âm 1.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 9,
    question_text: 'Chọn từ có trọng âm chính khác: healthy, disease, sunburn, sweeten',
    option_a: 'healthy', option_b: 'disease', option_c: 'sunburn', option_d: 'sweeten', correct_option: 'B',
    explanation: 'Đáp án B: "disease" /dɪˈziːz/ trọng âm 2. Các từ healthy, sunburn, sweeten trọng âm 1.'
  },
  {
    test_id: 'TEST_01', section: 'PHONICS', section_title: 'I. NGỮ ÂM (Câu 1 đến 10)', qnum: 10,
    question_text: 'Chọn từ có trọng âm chính khác: tomorrow, opposite, wonderful, programme',
    option_a: 'tomorrow', option_b: 'opposite', option_c: 'wonderful', option_d: 'programme', correct_option: 'A',
    explanation: 'Đáp án A: "tomorrow" /təˈmɒrəʊ/ trọng âm 2. "opposite", "wonderful", "programme" trọng âm 1.'
  },

  // VOCABULARY 11-25
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 11,
    question_text: 'Community service is the work you do for the ______ of the community.',
    option_a: 'problems', option_b: 'causes', option_c: 'mistakes', option_d: 'benefits', correct_option: 'D',
    explanation: 'Cụm từ: "for the benefit of..." (vì lợi ích của...).'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 12,
    question_text: 'Our ______ helps homeless children by giving them food and clothes.',
    option_a: 'lesson', option_b: 'garden', option_c: 'organization', option_d: 'hobby', correct_option: 'C',
    explanation: 'organization: tổ chức xã hội thiện nguyện.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 13,
    question_text: 'This group plants trees and protects the ______.',
    option_a: 'medicine', option_b: 'environment', option_c: 'homework', option_d: 'temperature', correct_option: 'B',
    explanation: 'protect the environment: bảo vệ môi trường.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 14,
    question_text: 'My classmates ______ old books for poor children last week.',
    option_a: 'collected', option_b: 'cooked', option_c: 'grew', option_d: 'painted', correct_option: 'A',
    explanation: 'collected old books: quyên góp, thu gom sách cũ.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 15,
    question_text: 'My brother goes to the hospital to ______ blood.',
    option_a: 'collect', option_b: 'raise', option_c: 'grow', option_d: 'donate', correct_option: 'D',
    explanation: 'donate blood: hiến máu nhân đạo.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 16,
    question_text: 'We visited the ______ to help elderly people last Sunday.',
    option_a: 'bookshop', option_b: 'playground', option_c: 'nursing home', option_d: 'cinema', correct_option: 'C',
    explanation: 'nursing home: viện dưỡng lão.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 17,
    question_text: 'You need a camera if your hobby is taking ______.',
    option_a: 'dolls', option_b: 'photos', option_c: 'models', option_d: 'stamps', correct_option: 'B',
    explanation: 'taking photos: chụp ảnh.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 18,
    question_text: 'My daughter is very ______. She can make new things easily.',
    option_a: 'creative', option_b: 'tired', option_c: 'careless', option_d: 'ill', correct_option: 'A',
    explanation: 'creative: có óc sáng tạo.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 19,
    question_text: '______ gives us plants, flowers and fresh vegetables.',
    option_a: 'Swimming', option_b: 'Reading', option_c: 'Cycling', option_d: 'Gardening', correct_option: 'D',
    explanation: 'Gardening: việc làm vườn.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 20,
    question_text: 'Please put the ______ into the bin.',
    option_a: 'food', option_b: 'books', option_c: 'rubbish', option_d: 'flowers', correct_option: 'C',
    explanation: 'rubbish: rác thải (put the rubbish into the bin).'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 21,
    question_text: 'My mum does exercise every day to keep ______.',
    option_a: 'quiet', option_b: 'fit', option_c: 'late', option_d: 'busy', correct_option: 'B',
    explanation: 'keep fit: giữ gìn thể trạng thon gọn, cân đối.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 22,
    question_text: 'Wear a hat and use ______ when you go out in hot weather.',
    option_a: 'suncream', option_b: 'soap', option_c: 'toothpaste', option_d: 'shampoo', correct_option: 'A',
    explanation: 'suncream: kem chống nắng.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 23,
    question_text: 'Eating too much and doing little exercise can make you ______.',
    option_a: 'homeless', option_b: 'creative', option_c: 'helpful', option_d: 'overweight', correct_option: 'D',
    explanation: 'overweight: thừa cân, béo phì.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 24,
    question_text: 'Looking at a screen for too long can hurt your ______.',
    option_a: 'feet', option_b: 'knees', option_c: 'eyes', option_d: 'hands', correct_option: 'C',
    explanation: 'hurt your eyes: làm mỏi, đau hại mắt.'
  },
  {
    test_id: 'TEST_01', section: 'VOCABULARY', section_title: 'II. TỪ VỰNG (Câu 11 đến 25)', qnum: 25,
    question_text: 'Carrots and tomatoes are ______.',
    option_a: 'seafood', option_b: 'vegetables', option_c: 'drinks', option_d: 'meat', correct_option: 'B',
    explanation: 'vegetables: các loại rau củ.'
  },

  // GRAMMAR 26-40
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 26,
    question_text: 'She enjoys ______ dollhouses in her free time.',
    option_a: 'building', option_b: 'build', option_c: 'built', option_d: 'builds', correct_option: 'A',
    explanation: 'enjoy + V-ing -> building.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 27,
    question_text: 'Peter likes ______ to English songs after school.',
    option_a: 'listen', option_b: 'listens', option_c: 'listened', option_d: 'listening', correct_option: 'D',
    explanation: 'like + V-ing -> listening.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 28,
    question_text: 'My father ______ for a walk every morning.',
    option_a: 'went', option_b: 'going', option_c: 'goes', option_d: 'go', correct_option: 'C',
    explanation: 'Dấu hiệu "every morning" -> Hiện tại đơn với chủ ngữ số ít "My father" chia "goes".'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 29,
    question_text: '______ your brother want to be a singer?',
    option_a: 'Are', option_b: 'Does', option_c: 'Do', option_d: 'Is', correct_option: 'B',
    explanation: 'Trợ động từ câu hỏi Hiện tại đơn cho chủ ngữ "your brother" (số ít) là "Does".'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 30,
    question_text: 'Emily ______ delicious cookies every Sunday.',
    option_a: 'makes', option_b: 'make', option_c: 'made', option_d: 'making', correct_option: 'A',
    explanation: '"every Sunday" -> Hiện tại đơn với Emily chia "makes".'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 31,
    question_text: 'Plants ______ water and sunlight to grow.',
    option_a: 'needs', option_b: 'needed', option_c: 'needing', option_d: 'need', correct_option: 'D',
    explanation: 'Chân lý hiển nhiên. Chủ ngữ số nhiều "Plants" động từ giữ nguyên mẫu "need".'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 32,
    question_text: 'We ______ trees in the school garden last Friday.',
    option_a: 'plants', option_b: 'planting', option_c: 'planted', option_d: 'plant', correct_option: 'C',
    explanation: '"last Friday" -> Quá khứ đơn: planted.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 33,
    question_text: 'Arti and her husband ______ in Singapore five years ago.',
    option_a: 'living', option_b: 'lived', option_c: 'live', option_d: 'lives', correct_option: 'B',
    explanation: '"five years ago" -> Quá khứ đơn: lived.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 34,
    question_text: 'I ______ to the zoo with my family yesterday.',
    option_a: 'went', option_b: 'go', option_c: 'goes', option_d: 'going', correct_option: 'A',
    explanation: '"yesterday" -> Quá khứ đơn của go là went.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 35,
    question_text: 'They did not ______ computer games last night.',
    option_a: 'played', option_b: 'plays', option_c: 'playing', option_d: 'play', correct_option: 'D',
    explanation: 'Sau "did not" là động từ nguyên thể không "to" -> play.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 36,
    question_text: '______ you visit an orphanage last summer?',
    option_a: 'Does', option_b: 'Are', option_c: 'Did', option_d: 'Do', correct_option: 'C',
    explanation: '"last summer" -> Câu hỏi thì Quá khứ đơn dùng trợ động từ "Did".'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 37,
    question_text: 'You should ______ less time watching TV.',
    option_a: 'spending', option_b: 'spend', option_c: 'spends', option_d: 'spent', correct_option: 'B',
    explanation: 'should + V nguyên mẫu -> spend.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 38,
    question_text: 'You should not ______ your face with dirty hands.',
    option_a: 'touch', option_b: 'touches', option_c: 'touched', option_d: 'touching', correct_option: 'A',
    explanation: 'should not + V nguyên mẫu -> touch.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 39,
    question_text: 'I ate too much fried food, ______ I gained weight.',
    option_a: 'but', option_b: 'or', option_c: 'because', option_d: 'so', correct_option: 'D',
    explanation: 'Liên từ "so" (vì vậy, cho nên) diễn tả kết quả.'
  },
  {
    test_id: 'TEST_01', section: 'GRAMMAR', section_title: 'III. NGỮ PHÁP (Câu 26 đến 40)', qnum: 40,
    question_text: 'She is tired, ______ she still helps her mother cook dinner.',
    option_a: 'or', option_b: 'because', option_c: 'but', option_d: 'so', correct_option: 'C',
    explanation: 'Liên từ "but" (nhưng) thể hiện sự tương phản đối lập.'
  },

  // COMMUNICATION 41-45
  {
    test_id: 'TEST_01', section: 'COMMUNICATION', section_title: 'IV. GIAO TIẾP (Câu 41 đến 45)', qnum: 41,
    question_text: 'Lan: “My eyes are tired.” Hoa: “______”',
    option_a: 'Stay up all night.', option_b: 'You should rest your eyes.', option_c: 'Watch more TV.', option_d: 'Read in dim light.',
    correct_option: 'B', explanation: 'Lời khuyên hợp lý khi mắt mỏi: "You should rest your eyes."'
  },
  {
    test_id: 'TEST_01', section: 'COMMUNICATION', section_title: 'IV. GIAO TIẾP (Câu 41 đến 45)', qnum: 42,
    question_text: 'Nam: “What is your hobby?” Mai: “______”',
    option_a: 'I enjoy collecting stamps.', option_b: 'I am twelve years old.', option_c: 'I am at school now.', option_d: 'I went there yesterday.',
    correct_option: 'A', explanation: 'Hỏi sở thích trả lời bằng "I enjoy collecting stamps."'
  },
  {
    test_id: 'TEST_01', section: 'COMMUNICATION', section_title: 'IV. GIAO TIẾP (Câu 41 đến 45)', qnum: 43,
    question_text: '“Would you like to help clean the park?” — “______”',
    option_a: 'It is very far away.', option_b: 'I am fine, thank you.', option_c: 'It is a big park.', option_d: 'Yes, I would love to.',
    correct_option: 'D', explanation: 'Đồng ý lời mời: "Yes, I would love to."'
  },
  {
    test_id: 'TEST_01', section: 'COMMUNICATION', section_title: 'IV. GIAO TIẾP (Câu 41 đến 45)', qnum: 44,
    question_text: '“Thank you for helping me.” — “______”',
    option_a: 'I am twelve.', option_b: 'See you tomorrow.', option_c: 'You are welcome.', option_d: 'Good night.',
    correct_option: 'C', explanation: 'Đáp lại lời cảm ơn: "You are welcome."'
  },
  {
    test_id: 'TEST_01', section: 'COMMUNICATION', section_title: 'IV. GIAO TIẾP (Câu 41 đến 45)', qnum: 45,
    question_text: '“How often do you exercise?” — “______”',
    option_a: 'To stay healthy.', option_b: 'Every morning.', option_c: 'At the sports centre.', option_d: 'With my best friend.',
    correct_option: 'B', explanation: 'Hỏi "How often" trả lời tần suất: "Every morning."'
  },

  // EQUIVALENT SENTENCES 46-50
  {
    test_id: 'TEST_01', section: 'EQUIVALENT_SENTENCES', section_title: 'V. CÂU TƯƠNG ĐƯƠNG (Câu 46 đến 50)', qnum: 46,
    question_text: 'Chọn câu đồng nghĩa: "She loves collecting old comic books."',
    option_a: 'She enjoys collecting old comic books.', option_b: 'She hates collecting old comic books.',
    option_c: 'She never collects old comic books.', option_d: 'She sells all her old comic books.',
    correct_option: 'A', explanation: 'loves = enjoys + V-ing.'
  },
  {
    test_id: 'TEST_01', section: 'EQUIVALENT_SENTENCES', section_title: 'V. CÂU TƯƠNG ĐƯƠNG (Câu 46 đến 50)', qnum: 47,
    question_text: 'Chọn câu đồng nghĩa: "My school has fifty classrooms."',
    option_a: 'There is a classroom near my school.', option_b: 'My school has fifteen classrooms.',
    option_c: 'Fifty students are in my classroom.', option_d: 'There are fifty classrooms in my school.',
    correct_option: 'D', explanation: 'My school has fifty classrooms = There are fifty classrooms in my school.'
  },
  {
    test_id: 'TEST_01', section: 'EQUIVALENT_SENTENCES', section_title: 'V. CÂU TƯƠNG ĐƯƠNG (Câu 46 đến 50)', qnum: 48,
    question_text: 'Chọn câu đồng nghĩa: "James is not a fast swimmer."',
    option_a: 'James always swims fast.', option_b: 'James does not like swimming.',
    option_c: 'James does not swim fast.', option_d: 'James cannot swim at all.',
    correct_option: 'C', explanation: 'is not a fast swimmer = does not swim fast.'
  },
  {
    test_id: 'TEST_01', section: 'EQUIVALENT_SENTENCES', section_title: 'V. CÂU TƯƠNG ĐƯƠNG (Câu 46 đến 50)', qnum: 49,
    question_text: 'Chọn câu đồng nghĩa: "She is good at English. She is good at history."',
    option_a: 'She is good at neither subject.', option_b: 'She is good at English and history.',
    option_c: 'She is only good at English.', option_d: 'She is not good at history.',
    correct_option: 'B', explanation: 'Ghép hai câu bằng liên từ "and": She is good at English and history.'
  },
  {
    test_id: 'TEST_01', section: 'EQUIVALENT_SENTENCES', section_title: 'V. CÂU TƯƠNG ĐƯƠNG (Câu 46 đến 50)', qnum: 50,
    question_text: 'Chọn câu đồng nghĩa: "It is not good to stay up late."',
    option_a: 'You should not stay up late.', option_b: 'You should stay up late.',
    option_c: 'You must never sleep early.', option_d: 'You need to sleep very late.',
    correct_option: 'A', explanation: 'It is not good to do something = You should not do something.'
  },

  // READING COMPREHENSION 51-60
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 51,
    passage: 'Community service is unpaid work that helps other people. At Green School, students volunteer every Saturday morning. Last month, they collected books and warm clothes for children in a mountain village. They also cleaned a local park. Mai likes these activities because she can make new friends and learn useful skills. Next Saturday, the group plans to plant trees near the school. Everyone can help, even by doing small things.',
    question_text: 'What is the passage mainly about?',
    option_a: 'A holiday in the mountains', option_b: 'How to buy warm clothes',
    option_c: 'A new school building', option_d: 'Students and community service',
    correct_option: 'D', explanation: 'Bài đọc nói về học sinh và các hoạt động vì cộng đồng (Students and community service).'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 52,
    passage: 'Community service is unpaid work that helps other people. At Green School, students volunteer every Saturday morning. Last month, they collected books and warm clothes for children in a mountain village. They also cleaned a local park. Mai likes these activities because she can make new friends and learn useful skills. Next Saturday, the group plans to plant trees near the school. Everyone can help, even by doing small things.',
    question_text: 'When do the students usually volunteer?',
    option_a: 'On Friday afternoons', option_b: 'On Sunday nights',
    option_c: 'On Saturday mornings', option_d: 'On Monday evenings',
    correct_option: 'C', explanation: 'Chi tiết bài: "students volunteer every Saturday morning".'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 53,
    passage: 'Community service is unpaid work that helps other people. At Green School, students volunteer every Saturday morning. Last month, they collected books and warm clothes for children in a mountain village. They also cleaned a local park. Mai likes these activities because she can make new friends and learn useful skills. Next Saturday, the group plans to plant trees near the school. Everyone can help, even by doing small things.',
    question_text: 'Who received the books and warm clothes?',
    option_a: 'Visitors to the local park', option_b: 'Children in a mountain village',
    option_c: 'Teachers at Green School', option_d: 'People in a city hospital',
    correct_option: 'B', explanation: 'Chi tiết: "collected books and warm clothes for children in a mountain village".'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 54,
    passage: 'Community service is unpaid work that helps other people. At Green School, students volunteer every Saturday morning. Last month, they collected books and warm clothes for children in a mountain village. They also cleaned a local park. Mai likes these activities because she can make new friends and learn useful skills. Next Saturday, the group plans to plant trees near the school. Everyone can help, even by doing small things.',
    question_text: 'Why does Mai like volunteering?',
    option_a: 'She can make friends and learn skills.', option_b: 'She earns a lot of money.',
    option_c: 'She can miss her school lessons.', option_d: 'She does not need to work.',
    correct_option: 'A', explanation: 'Chi tiết: "Mai likes these activities because she can make new friends and learn useful skills."'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 55,
    passage: 'Community service is unpaid work that helps other people. At Green School, students volunteer every Saturday morning. Last month, they collected books and warm clothes for children in a mountain village. They also cleaned a local park. Mai likes these activities because she can make new friends and learn useful skills. Next Saturday, the group plans to plant trees near the school. Everyone can help, even by doing small things.',
    question_text: 'What does the group plan to do next Saturday?',
    option_a: 'Sell books', option_b: 'Build a hospital',
    option_c: 'Visit a museum', option_d: 'Plant trees',
    correct_option: 'D', explanation: 'Chi tiết: "Next Saturday, the group plans to plant trees near the school."'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 56,
    passage: 'Breakfast is an important meal of the day. It gives your body (56) ______ for school and other activities. Students who skip breakfast often feel (57) ______ and cannot study well. A healthy breakfast can include bread, eggs and fruit. You should also (58) ______ enough water during the day. To stay healthy, eat a variety of foods (59) ______ do exercise regularly. These simple habits help you (60) ______ fit.',
    question_text: 'Điền vào ô trống số (56):',
    option_a: 'homework', option_b: 'medicine', option_c: 'energy', option_d: 'rubbish',
    correct_option: 'C', explanation: 'gives your body energy: cung cấp năng lượng cho cơ thể.'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 57,
    passage: 'Breakfast is an important meal of the day. It gives your body (56) ______ for school and other activities. Students who skip breakfast often feel (57) ______ and cannot study well. A healthy breakfast can include bread, eggs and fruit. You should also (58) ______ enough water during the day. To stay healthy, eat a variety of foods (59) ______ do exercise regularly. These simple habits help you (60) ______ fit.',
    question_text: 'Điền vào ô trống số (57):',
    option_a: 'helpful', option_b: 'tired', option_c: 'excited', option_d: 'creative',
    correct_option: 'B', explanation: 'skip breakfast often feel tired: bỏ bữa sáng thường cảm thấy mệt mỏi.'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 58,
    passage: 'Breakfast is an important meal of the day. It gives your body (56) ______ for school and other activities. Students who skip breakfast often feel (57) ______ and cannot study well. A healthy breakfast can include bread, eggs and fruit. You should also (58) ______ enough water during the day. To stay healthy, eat a variety of foods (59) ______ do exercise regularly. These simple habits help you (60) ______ fit.',
    question_text: 'Điền vào ô trống số (58):',
    option_a: 'drink', option_b: 'eat', option_c: 'cook', option_d: 'grow',
    correct_option: 'A', explanation: 'drink enough water: uống đủ nước.'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 59,
    passage: 'Breakfast is an important meal of the day. It gives your body (56) ______ for school and other activities. Students who skip breakfast often feel (57) ______ and cannot study well. A healthy breakfast can include bread, eggs and fruit. You should also (58) ______ enough water during the day. To stay healthy, eat a variety of foods (59) ______ do exercise regularly. These simple habits help you (60) ______ fit.',
    question_text: 'Điền vào ô trống số (59):',
    option_a: 'but', option_b: 'or', option_c: 'because', option_d: 'and',
    correct_option: 'D', explanation: 'Liên từ kết hợp "and": eat a variety of foods AND do exercise regularly.'
  },
  {
    test_id: 'TEST_01', section: 'READING_COMPREHENSION', section_title: 'VI. ĐỌC HIỂU (Câu 51 đến 60)', qnum: 60,
    passage: 'Breakfast is an important meal of the day. It gives your body (56) ______ for school and other activities. Students who skip breakfast often feel (57) ______ and cannot study well. A healthy breakfast can include bread, eggs and fruit. You should also (58) ______ enough water during the day. To stay healthy, eat a variety of foods (59) ______ do exercise regularly. These simple habits help you (60) ______ fit.',
    question_text: 'Điền vào ô trống số (60):',
    option_a: 'take', option_b: 'give', option_c: 'keep', option_d: 'make',
    correct_option: 'C', explanation: 'Cụm từ "keep fit": giữ dáng, duy trì thể trạng khỏe mạnh.'
  }
];

const insertQuestion = db.prepare(`
  INSERT INTO questions (
    test_id, section, section_title, qnum, passage, question_text,
    option_a, option_b, option_c, option_d, correct_option, explanation, unit_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const q of questionsData) {
  insertQuestion.run(
    q.test_id, q.section, q.section_title, q.qnum, q.passage || null, q.question_text,
    q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.unit_id || 'unit2'
  );
}

console.log(`Inserted ${questionsData.length} test questions.`);
db.close();
console.log('Database updated successfully.');

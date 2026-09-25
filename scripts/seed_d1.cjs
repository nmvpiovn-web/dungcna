const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218'; // tienganh-pro-db

async function queryD1(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbUuid}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 query error: ${JSON.stringify(data.errors)} | SQL: ${sql}`);
  }
  return data.result;
}

async function runSeed() {
  console.log('Seeding Cloudflare D1 with comprehensive educational data...');

  // 1. Users & Superadmins
  const users = [
    {
      id: 'usr_super_1',
      email: 'nmvpiovn@gmail.com',
      name: 'Nguyễn Minh Vũ (SuperAdmin Owner)',
      role: 'superadmin',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      status: 'active',
      metadata: JSON.stringify({ permissions: ['all'], phone: '0901234567', title: 'System Architect & Owner' })
    },
    {
      id: 'usr_super_2',
      email: 'msdung@timbk.io.vn',
      name: 'Ms. Dung (SuperAdmin Leader)',
      role: 'superadmin',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
      status: 'active',
      metadata: JSON.stringify({ permissions: ['all'], phone: '0912345678', title: 'Academic Director' })
    },
    {
      id: 'usr_teach_1',
      email: 'teacher.john@timbk.io.vn',
      name: 'Mr. Johnathan Miller',
      role: 'teacher',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      status: 'active',
      metadata: JSON.stringify({ nationality: 'British / Native', role_title: 'Senior Native ESL Trainer & IELTS Examiner', certs: 'CELTA, DELTA' })
    },
    {
      id: 'usr_teach_2',
      email: 'nguyen.huong@timbk.io.vn',
      name: 'Cô Nguyễn Hương',
      role: 'teacher',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
      status: 'active',
      metadata: JSON.stringify({ school: 'THPT Chuyên', role_title: 'Tổ Trưởng Chuyên Môn Tiếng Anh K12', certs: 'Thạc Sĩ Phương Pháp Giảng Dạy TESOL' })
    },
    {
      id: 'usr_teach_3',
      email: 'tran.mai@timbk.io.vn',
      name: 'Thầy Trần Mai',
      role: 'teacher',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      status: 'active',
      metadata: JSON.stringify({ role_title: 'Chuyên gia Luyện Thi TOEIC 990 & IELTS 8.5', certs: 'IELTS 8.5, VSTEP C1' })
    },
    {
      id: 'usr_student_demo',
      email: 'hocsinh.demo@timbk.io.vn',
      name: 'Lê Bảo Anh (Học viên tiêu biểu)',
      role: 'student',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      status: 'active',
      metadata: JSON.stringify({ grade: 12, target: 'IELTS 7.5 & ĐH Ngoại Thương', points: 1450 })
    }
  ];

  for (const u of users) {
    await queryD1(
      `INSERT OR REPLACE INTO users (id, email, name, role, avatar, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id, u.email, u.name, u.role, u.avatar, u.status, u.metadata]
    );
  }
  console.log(`Seeded ${users.length} users with Superadmins & Teachers.`);

  // 2. Curricula (Grades 1-12, THPT QG, IELTS, TOEIC, TOEFL, B1/B2, Cambridge Vocab, Native Pedagogy)
  const curricula = [
    { id: 'curr_g1', code: 'grade-1', category: 'primary', title: 'Tiếng Anh Lớp 1', description: 'Chương trình làm quen Tiếng Anh tiểu học chuẩn 2026 Bộ GD&ĐT (Phonics, Từ vựng hình ảnh, TPR)', icon: '🎒', order_num: 1 },
    { id: 'curr_g2', code: 'grade-2', category: 'primary', title: 'Tiếng Anh Lớp 2', description: 'Phát triển phản xạ nghe nói tự nhiên, nhận diện mặt chữ và phát âm chuẩn bản ngữ', icon: '🎨', order_num: 2 },
    { id: 'curr_g3', code: 'grade-3', category: 'primary', title: 'Tiếng Anh Lớp 3', description: 'Bắt đầu chương trình chính khóa Global Success / Family and Friends, cấu trúc câu căn bản', icon: '✏️', order_num: 3 },
    { id: 'curr_g4', code: 'grade-4', category: 'primary', title: 'Tiếng Anh Lớp 4', description: 'Mở rộng vốn từ vựng gia đình, trường học, sở thích và kỹ năng đọc hiểu mẩu chuyện ngắn', icon: '📘', order_num: 4 },
    { id: 'curr_g5', code: 'grade-5', category: 'primary', title: 'Tiếng Anh Lớp 5', description: 'Hoàn thiện khối Tiểu học, chuẩn bị chuyển cấp THCS, luyện kỹ năng viết đoạn văn ngắn', icon: '🏆', order_num: 5 },
    { id: 'curr_g6', code: 'grade-6', category: 'secondary', title: 'Tiếng Anh Lớp 6', description: 'Bước đệm THCS: Global Success, Friends Plus, i-Learn Smart World với 12 Unit chủ điểm', icon: '🌱', order_num: 6 },
    { id: 'curr_g7', code: 'grade-7', category: 'secondary', title: 'Tiếng Anh Lớp 7', description: 'Củng cố ngữ pháp thời hiện tại, quá khứ, tương lai, so sánh hơn và từ vựng giao tiếp thực tế', icon: '🚀', order_num: 7 },
    { id: 'curr_g8', code: 'grade-8', category: 'secondary', title: 'Tiếng Anh Lớp 8', description: 'Nâng cao khả năng thuyết trình, mệnh đề quan hệ, câu bị động và phong cách sống hiện đại', icon: '💡', order_num: 8 },
    { id: 'curr_g9', code: 'grade-9', category: 'secondary', title: 'Tiếng Anh Lớp 9 & Thi Vào 10', description: 'Chinh phục kỳ thi chuyển cấp vào lớp 10 THPT công lập & trường chuyên toàn quốc', icon: '🎯', order_num: 9 },
    { id: 'curr_g10', code: 'grade-10', category: 'high_school', title: 'Tiếng Anh Lớp 10', description: 'Chương trình GDPT 2018 mới: Dự án cộng đồng, môi trường số, phát triển tư duy phản biện', icon: '🏢', order_num: 10 },
    { id: 'curr_g11', code: 'grade-11', category: 'high_school', title: 'Tiếng Anh Lớp 11', description: 'Tích hợp liên môn STEM, cấu trúc câu phức, đọc báo chí và rèn luyện kỹ năng tự học', icon: '🔬', order_num: 11 },
    { id: 'curr_g12', code: 'grade-12', category: 'high_school', title: 'Tiếng Anh Lớp 12', description: 'Hoàn thiện chương trình phổ thông 12 năm, chuẩn bị các kỳ thi quan trọng bậc nhất', icon: '🎓', order_num: 12 },
    { id: 'curr_thptqg', code: 'thpt_qg', category: 'exam_prep', title: 'Ôn Thi Đại Học & THPT QG 2026', description: 'Kho đề thi tốt nghiệp THPT chuẩn format mới 2026, ma trận đề, bẫy trắc nghiệm và ĐGNL ĐHQG', icon: '🔥', order_num: 13 },
    { id: 'curr_ielts', code: 'ielts', category: 'certificate', title: 'Luyện Thi IELTS Academic & General', description: 'Format 4 kỹ năng Nghe - Nói - Đọc - Viết từ Band 5.0 lên 8.0+, chấm điểm chuẩn Cambridge', icon: '🌍', order_num: 14 },
    { id: 'curr_toeic', code: 'toeic', category: 'certificate', title: 'Luyện Thi TOEIC 450 - 990', description: 'TOEIC Listening & Reading format ETS mới nhất + chuyên đề Speaking & Writing doanh nghiệp', icon: '💼', order_num: 15 },
    { id: 'curr_toefl', code: 'toefl', category: 'certificate', title: 'Luyện Thi TOEFL iBT', description: 'Bài thi khảo thí chuẩn Mỹ: Đọc học thuật, Nghe bài giảng đại học, Viết tích hợp & Độc lập', icon: '🇺🇸', order_num: 16 },
    { id: 'curr_vstep', code: 'vstep_b1_b2', category: 'certificate', title: 'Luyện Thi B1 - B2 VSTEP / CEFR', description: 'Khung năng lực ngoại ngữ 6 bậc Việt Nam chuẩn Bộ GD&ĐT cho sinh viên & giáo viên', icon: '📜', order_num: 17 },
    { id: 'curr_cambridge', code: 'cambridge_vocab', category: 'pedagogy', title: 'Từ Vựng Cambridge CEFR A1 - C1', description: 'Hệ thống từ vựng phân tầng Starters, Movers, Flyers, KET, PET, FCE tra cứu tức thì', icon: '📖', order_num: 18 },
    { id: 'curr_native_pedagogy', code: 'native_pedagogy', category: 'pedagogy', title: 'Phương Pháp Dạy Bản Ngữ & Kế Hoạch 5512', description: 'Cẩm nang giáo viên: Phối hợp giáo viên bản ngữ, phương pháp TPR, CLT, giáo án số hóa nội bộ', icon: '👨‍🏫', order_num: 19 }
  ];

  for (const c of curricula) {
    await queryD1(
      `INSERT OR REPLACE INTO curricula (id, code, category, title, description, icon, order_num) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.code, c.category, c.title, c.description, c.icon, c.order_num]
    );
  }
  console.log(`Seeded ${curricula.length} curricula categories.`);

  // 3. Exams
  const exams = [
    {
      id: 'ex_quick_15m_g7',
      curriculum_id: 'curr_g7',
      title: 'Kiểm Tra 15 Phút Nhanh - Unit 1: Hobbies & Health (Lớp 7)',
      description: 'Bài kiểm tra 15 phút đầu giờ: Trắc nghiệm ngữ pháp thời hiện tại đơn, từ vựng sở thích và phát âm âm /ə/ và /ɜː/.',
      grade: 7,
      format_type: 'quick_15m',
      skill_category: 'mixed',
      duration_minutes: 15,
      total_questions: 10,
      pass_percentage: 60,
      created_by: 'Cô Nguyễn Hương'
    },
    {
      id: 'ex_std_45m_g7',
      curriculum_id: 'curr_g7',
      title: 'Đề Kiểm Tra 1 Tiết 45 Phút - Giữa Học Kỳ 1 (Lớp 7 Global Success)',
      description: 'Format chuẩn 45 phút hiện hành: Nghe hiểu, Ngữ âm, Từ vựng - Ngữ pháp, Đọc hiểu văn bản và Viết lại câu.',
      grade: 7,
      format_type: 'standard_45m',
      skill_category: 'mixed',
      duration_minutes: 45,
      total_questions: 25,
      pass_percentage: 65,
      created_by: 'Cô Nguyễn Hương'
    },
    {
      id: 'ex_thptqg_45m_g12',
      curriculum_id: 'curr_thptqg',
      title: 'Đề Khảo Sát Ôn Thi Tốt Nghiệp THPT QG 2026 - Chuẩn Format Mới',
      description: 'Bộ đề trắc nghiệm chuẩn cấu trúc đổi mới 2026: Ngữ cảnh thực tế, từ đồng nghĩa/trái nghĩa, điền từ đoạn văn và suy luận logic.',
      grade: 12,
      format_type: 'standard_45m',
      skill_category: 'mixed',
      duration_minutes: 50,
      total_questions: 40,
      pass_percentage: 70,
      created_by: 'Cô Nguyễn Hương'
    },
    {
      id: 'ex_ielts_reading_acad',
      curriculum_id: 'curr_ielts',
      title: 'IELTS Academic Reading Test: The Future of Renewable Energy & AI in Education',
      description: 'Format chuẩn thi thật Cambridge IELTS: Split-view bài đọc học thuật, dạng bài True/False/Not Given, Multiple Choice, Matching Headings.',
      grade: 0,
      format_type: 'ielts_academic',
      skill_category: 'reading',
      duration_minutes: 60,
      total_questions: 15,
      pass_percentage: 65,
      created_by: 'Thầy Trần Mai'
    },
    {
      id: 'ex_ielts_writing_task2',
      curriculum_id: 'curr_ielts',
      title: 'IELTS Writing Task 2 & Task 1: Academic Argumentative Essay',
      description: 'Luyện viết trực tiếp trên nền tảng với bộ đếm từ tự động, tiêu chí Band Descriptors (Task Response, Cohesion, Lexical Resource, Grammar) và chấm điểm tự động.',
      grade: 0,
      format_type: 'ielts_academic',
      skill_category: 'writing',
      duration_minutes: 60,
      total_questions: 2,
      pass_percentage: 60,
      created_by: 'Mr. Johnathan Miller'
    },
    {
      id: 'ex_ielts_speaking_mock',
      curriculum_id: 'curr_ielts',
      title: 'IELTS Speaking Full Mock Exam (Part 1, 2, 3) với Giảng Viên Bản Ngữ',
      description: 'Luyện thi nói trực tiếp với ghi âm giọng nói Web Speech API, gợi ý câu trả lời Band 8.0, phân tích phát âm và lưu trữ bài thu âm.',
      grade: 0,
      format_type: 'ielts_academic',
      skill_category: 'speaking',
      duration_minutes: 15,
      total_questions: 3,
      pass_percentage: 65,
      created_by: 'Mr. Johnathan Miller'
    },
    {
      id: 'ex_toeic_full_test',
      curriculum_id: 'curr_toeic',
      title: 'TOEIC Mini Simulation Test (Listening & Reading 450 - 850)',
      description: 'Đề thi rút gọn đánh giá nhanh năng lực giao tiếp thương mại quốc tế, hình ảnh câu hỏi mô tả tranh Part 1 và hoàn thành câu Part 5.',
      grade: 0,
      format_type: 'toeic_lr',
      skill_category: 'mixed',
      duration_minutes: 30,
      total_questions: 20,
      pass_percentage: 60,
      created_by: 'Thầy Trần Mai'
    },
    {
      id: 'ex_toefl_ibt_test',
      curriculum_id: 'curr_toefl',
      title: 'TOEFL iBT Academic Listening & Reading Diagnostic',
      description: 'Định dạng câu hỏi trắc nghiệm học thuật ETS chuẩn Mỹ, luyện kỹ năng nghe bài giảng giảng đường (lectures) và suy luận ngữ cảnh.',
      grade: 0,
      format_type: 'toefl_ibt',
      skill_category: 'mixed',
      duration_minutes: 35,
      total_questions: 15,
      pass_percentage: 65,
      created_by: 'Mr. Johnathan Miller'
    },
    {
      id: 'ex_vstep_b1_b2',
      curriculum_id: 'curr_vstep',
      title: 'VSTEP B1 - B2 Đọc Hiểu & Viết Luận (Khung 6 Bậc Ngoại Ngữ VN)',
      description: 'Đề thi mô phỏng kỳ thi chứng chỉ ngoại ngữ B1, B2 định dạng Bộ Giáo Dục và Đào Tạo, phục vụ chuẩn đầu ra đại học và nâng ngạch giáo viên.',
      grade: 0,
      format_type: 'vstep_b1_b2',
      skill_category: 'mixed',
      duration_minutes: 40,
      total_questions: 15,
      pass_percentage: 60,
      created_by: 'Cô Nguyễn Hương'
    }
  ];

  for (const ex of exams) {
    await queryD1(
      `INSERT OR REPLACE INTO exams (id, curriculum_id, title, description, grade, format_type, skill_category, duration_minutes, total_questions, pass_percentage, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ex.id, ex.curriculum_id, ex.title, ex.description, ex.grade, ex.format_type, ex.skill_category, ex.duration_minutes, ex.total_questions, ex.pass_percentage, ex.created_by]
    );
  }
  console.log(`Seeded ${exams.length} exams.`);

  // 4. Questions
  const questions = [
    // Questions for ex_quick_15m_g7
    {
      id: 'q_q15_1',
      exam_id: 'ex_quick_15m_g7',
      question_index: 1,
      skill: 'phonetics',
      type: 'multiple_choice',
      prompt: 'Find the word which has a different sound in the part underlined.',
      options_json: JSON.stringify(['A. bird /ɜː/', 'B. first /ɜː/', 'C. answer /ə/', 'D. girl /ɜː/']),
      correct_answer: 'C',
      explanation: 'Trong từ "answer", âm được phát âm là /ə/ (âm ơ ngắn), còn lại "bird", "first", "girl" đều có nguyên âm dài /ɜː/.',
      cambridge_level: 'KET_A2'
    },
    {
      id: 'q_q15_2',
      exam_id: 'ex_quick_15m_g7',
      question_index: 2,
      skill: 'grammar_vocab',
      type: 'multiple_choice',
      prompt: 'My brother enjoys __________ models of vintage cars in his free time.',
      options_json: JSON.stringify(['A. build', 'B. building', 'C. to build', 'D. built']),
      correct_answer: 'B',
      explanation: 'Sau động từ chỉ sở thích "enjoy" ta luôn sử dụng danh động từ V-ing (enjoy doing something). Do đó chọn "building".',
      cambridge_level: 'KET_A2'
    },
    {
      id: 'q_q15_3',
      exam_id: 'ex_quick_15m_g7',
      question_index: 3,
      skill: 'grammar_vocab',
      type: 'multiple_choice',
      prompt: 'If you want to maintain good health, you should eat __________ junk food and exercise regularly.',
      options_json: JSON.stringify(['A. more', 'B. much', 'C. less', 'D. fewer']),
      correct_answer: 'C',
      explanation: '"Junk food" (đồ ăn vặt/đồ ăn nhanh) là danh từ không đếm được, dùng "less" mang nghĩa ăn ít đồ ăn nhanh hơn để giữ gìn sức khỏe.',
      cambridge_level: 'KET_A2'
    },
    {
      id: 'q_q15_4',
      exam_id: 'ex_quick_15m_g7',
      question_index: 4,
      skill: 'grammar_vocab',
      type: 'multiple_choice',
      prompt: 'We __________ trees in the local community park last Sunday morning.',
      options_json: JSON.stringify(['A. plant', 'B. planted', 'C. are planting', 'D. will plant']),
      correct_answer: 'B',
      explanation: 'Dấu hiệu thời gian "last Sunday morning" (sáng Chủ nhật tuần trước) chỉ một sự việc đã diễn ra và chấm dứt trong quá khứ -> Dùng quá khứ đơn "planted".',
      cambridge_level: 'KET_A2'
    },
    {
      id: 'q_q15_5',
      exam_id: 'ex_quick_15m_g7',
      question_index: 5,
      skill: 'reading',
      type: 'multiple_choice',
      passage: 'Community service is very important in secondary education. Students can participate in picking up litter, tutoring younger kids, or donating old books to rural schools. These activities not only improve social awareness but also build teamwork and empathy.',
      prompt: 'According to the passage, what is ONE benefit of participating in community service?',
      options_json: JSON.stringify([
        'A. Earning a high salary',
        'B. Building teamwork and empathy',
        'C. Getting free textbooks for college',
        'D. Avoiding examination tests'
      ]),
      correct_answer: 'B',
      explanation: 'Thông tin nằm ở câu cuối: "These activities not only improve social awareness but also build teamwork and empathy."',
      cambridge_level: 'PET_B1'
    },

    // Questions for IELTS Reading Academic
    {
      id: 'q_ielts_r_1',
      exam_id: 'ex_ielts_reading_acad',
      question_index: 1,
      skill: 'reading',
      type: 'multiple_choice',
      passage: `The Integration of Artificial Intelligence in Contemporary Classrooms

Artificial Intelligence (AI) has rapidly transformed the educational landscape, offering personalized learning pathways tailored to individual student velocity and comprehension levels. Unlike traditional static curricula where educators deliver standardized instruction to heterogeneous groups, AI-driven adaptive software continuously assesses cognitive performance, dynamically recalibrating exercises in real time.

Critics, however, raise valid concerns regarding algorithmic bias, data privacy, and the risk of diminished interpersonal communication skills among students. Educational psychologists emphasize that while automated platforms excel at quantitative drill and content delivery, human instructors remain irreplaceable in cultivating empathy, moral reasoning, and creative discourse. As pedagogical models evolve, the most triumphant methodology appears to be a blended paradigm: AI handling diagnostic analytics and baseline skill acquisition, while skilled teachers orchestrate deep critical inquiries and collaborative problem-solving.`,
      prompt: 'According to paragraph 1, how does AI-driven adaptive software differ from traditional static curricula?',
      options_json: JSON.stringify([
        'A. It forces students to learn at the fastest peer pace.',
        'B. It dynamically recalibrates learning exercises based on real-time cognitive assessment.',
        'C. It removes the necessity of examination grading entirely.',
        'D. It replaces all reading textbooks with virtual reality headsets.'
      ]),
      correct_answer: 'B',
      explanation: 'Paragraph 1 specifies: "AI-driven adaptive software continuously assesses cognitive performance, dynamically recalibrating exercises in real time."',
      cambridge_level: 'FCE_B2'
    },
    {
      id: 'q_ielts_r_2',
      exam_id: 'ex_ielts_reading_acad',
      question_index: 2,
      skill: 'reading',
      type: 'multiple_choice',
      prompt: 'The word "heterogeneous" in paragraph 1 is closest in meaning to:',
      options_json: JSON.stringify([
        'A. Identical and uniform',
        'B. Highly gifted and advanced',
        'C. Diverse and varied in nature',
        'D. Reluctant to participate'
      ]),
      correct_answer: 'C',
      explanation: '"Heterogeneous" có gốc từ tiếng Hy Lạp nghĩa là không đồng nhất, đa dạng (diverse, consisting of dissimilar parts).',
      cambridge_level: 'CAE_C1'
    },

    // IELTS Writing Task 2
    {
      id: 'q_ielts_w_1',
      exam_id: 'ex_ielts_writing_task2',
      question_index: 1,
      skill: 'writing',
      type: 'essay',
      prompt: 'WRITING TASK 2: You should spend about 40 minutes on this task. Write about the following topic:\n\n"Some people believe that artificial intelligence will eventually replace human school teachers in the near future. Others argue that human teachers will always be essential in the classroom.\n\nDiscuss both views and give your own opinion."\n\nWrite at least 250 words. Give reasons for your answer and include any relevant examples from your own knowledge or experience.',
      explanation: 'Tiêu chí chấm điểm IELTS Writing: Task Response (trả lời trọn vẹn cả 2 quan điểm và nêu lập trường cá nhân), Coherence and Cohesion (bố cục 4 đoạn mở bài - thân bài 1 - thân bài 2 - kết bài logic), Lexical Resource (từ vựng học thuật C1), Grammatical Range and Accuracy (câu phức, đảo ngữ, bị động).',
      rubric_json: JSON.stringify({
        task_response: 'Fully addresses all parts with well-developed ideas',
        coherence_cohesion: 'Sequences information logically with clear progression',
        lexical_resource: 'Uses a wide range of academic vocabulary with rare minor errors',
        grammatical_accuracy: 'Uses a wide range of structures with full flexibility and accuracy'
      }),
      cambridge_level: 'CAE_C1'
    },

    // IELTS Speaking Part 2
    {
      id: 'q_ielts_spk_1',
      exam_id: 'ex_ielts_speaking_mock',
      question_index: 1,
      skill: 'speaking',
      type: 'speaking_prompt',
      prompt: 'SPEAKING PART 2 (Cue Card):\n\nDescribe a skill you learned that you found extremely useful.\nYou should say:\n- What the skill was\n- When and where you learned it\n- How you learned it\nAnd explain why you think this skill is particularly valuable to your daily life or career.',
      audio_url: 'speech_prompt: Describe a skill you learned that you found extremely useful. You have one minute to prepare and up to two minutes to speak.',
      explanation: 'Gợi ý cấu trúc trả lời 2 phút: Mở đầu trực tiếp (I would like to talk about mastering conversational English...), hoàn cảnh bắt đầu học, thử thách gặp phải và giải pháp, ứng dụng thực tế hiện nay và cảm xúc cá nhân.',
      rubric_json: JSON.stringify({
        fluency_coherence: 'Speaks fluently with rare repetition or self-correction',
        lexical_resource: 'Uses idiomatic expressions and colloquial language naturally',
        grammatical_range: 'Uses a variety of complex structures with flexibility',
        pronunciation: 'Uses a full range of phonological features to convey subtle meaning'
      }),
      cambridge_level: 'FCE_B2'
    },

    // TOEIC Part 5
    {
      id: 'q_toeic_1',
      exam_id: 'ex_toeic_full_test',
      question_index: 1,
      skill: 'grammar_vocab',
      type: 'multiple_choice',
      prompt: 'The board of directors unanimously decided to __________ the launch of the new product until market conditions become more favorable.',
      options_json: JSON.stringify([
        'A. postpone',
        'B. postponeable',
        'C. postponement',
        'D. postponer'
      ]),
      correct_answer: 'A',
      explanation: 'Cấu trúc "decide to + V-infinitive". Sau "to" cần một động từ nguyên thể -> Chọn "postpone" (trì hoãn).',
      cambridge_level: 'PET_B1'
    },
    {
      id: 'q_toeic_2',
      exam_id: 'ex_toeic_full_test',
      question_index: 2,
      skill: 'grammar_vocab',
      type: 'multiple_choice',
      prompt: 'All employees travelling on company business must keep their receipts in order to receive _________ for authorized expenditures.',
      options_json: JSON.stringify([
        'A. reimbursement',
        'B. reimbursed',
        'C. reimbursing',
        'D. reimbursements'
      ]),
      correct_answer: 'A',
      explanation: 'Sau ngoại động từ "receive" cần một danh từ tân ngữ. "Reimbursement" (khoản tiền hoàn lại/chi trả) là danh từ chính xác phù hợp với ngữ cảnh.',
      cambridge_level: 'FCE_B2'
    }
  ];

  for (const q of questions) {
    await queryD1(
      `INSERT OR REPLACE INTO questions (id, exam_id, question_index, skill, type, passage, prompt, audio_url, options_json, correct_answer, explanation, cambridge_level, rubric_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [q.id, q.exam_id, q.question_index, q.skill, q.type, q.passage || null, q.prompt, q.audio_url || null, q.options_json || null, q.correct_answer || null, q.explanation || null, q.cambridge_level || null, q.rubric_json || null]
    );
  }
  console.log(`Seeded ${questions.length} question items.`);

  // 5. Cambridge Vocabulary Database
  const vocabItems = [
    {
      id: 'voc_1',
      word: 'perseverance',
      ipa: '/ˌpɜː.sɪˈvɪə.rəns/',
      pos: 'noun',
      cefr_level: 'B2',
      cambridge_tier: 'FCE',
      meaning_vi: 'sự kiên trì, bền bỉ vượt khó',
      example_en: 'Through sheer perseverance, she managed to master English and achieve an 8.0 in IELTS.',
      example_vi: 'Bằng sự kiên trì bền bỉ phi thường, cô ấy đã làm chủ được tiếng Anh và đạt 8.0 IELTS.',
      collocations: 'sheer perseverance, remarkable perseverance, perseverance pays off',
      grade_suitability: 'Lớp 10-12, IELTS, THPT QG'
    },
    {
      id: 'voc_2',
      word: 'articulate',
      ipa: '/ɑːˈtɪk.jə.lət/',
      pos: 'adjective / verb',
      cefr_level: 'C1',
      cambridge_tier: 'CAE',
      meaning_vi: 'ăn nói lưu loát, diễn đạt rõ ràng mạch lạc',
      example_en: 'An articulate speaker can convey complex academic notions with impressive clarity.',
      example_vi: 'Một người nói lưu loát có thể truyền đạt các khái niệm học thuật phức tạp một cách rõ ràng ấn tượng.',
      collocations: 'articulate speech, articulate arguments, articulate thoughts clearly',
      grade_suitability: 'IELTS, TOEFL, VSTEP C1'
    },
    {
      id: 'voc_3',
      word: 'indispensable',
      ipa: '/ˌɪn.dɪˈspen.sə.bəl/',
      pos: 'adjective',
      cefr_level: 'B2',
      cambridge_tier: 'FCE',
      meaning_vi: 'không thể thiếu được, thiết yếu tối quan trọng',
      example_en: 'Digital literacy has become an indispensable competency in the 21st century.',
      example_vi: 'Năng lực số đã trở thành một kỹ năng không thể thiếu trong thế kỷ 21.',
      collocations: 'indispensable tool, prove indispensable, indispensable component',
      grade_suitability: 'Lớp 9-12, THPT QG, IELTS'
    },
    {
      id: 'voc_4',
      word: 'resilient',
      ipa: '/rɪˈzɪl.jənt/',
      pos: 'adjective',
      cefr_level: 'B2',
      cambridge_tier: 'FCE',
      meaning_vi: 'kiên cường, có khả năng phục hồi nhanh chóng sau biến cố',
      example_en: 'Young learners are often surprisingly resilient when adapting to immersive linguistic environments.',
      example_vi: 'Học sinh nhỏ tuổi thường kiên cường bất ngờ khi thích nghi với môi trường ngôn ngữ bản ngữ hoàn toàn.',
      collocations: 'resilient economy, highly resilient, resilient mindset',
      grade_suitability: 'Lớp 8-12, IELTS'
    },
    {
      id: 'voc_5',
      word: 'collaborate',
      ipa: '/kəˈlæb.ə.reɪt/',
      pos: 'verb',
      cefr_level: 'B1',
      cambridge_tier: 'PET',
      meaning_vi: 'hợp tác, cộng tác cùng làm việc',
      example_en: 'Vietnamese teachers frequently collaborate with native English educators to co-teach pronunciation.',
      example_vi: 'Giáo viên Việt Nam thường xuyên hợp tác cùng giáo viên bản ngữ để cùng giảng dạy phát âm chuẩn.',
      collocations: 'collaborate closely with, collaborate on a project',
      grade_suitability: 'Lớp 6-12, TOEIC, B1'
    }
  ];

  for (const v of vocabItems) {
    await queryD1(
      `INSERT OR REPLACE INTO cambridge_vocabulary (id, word, ipa, pos, cefr_level, cambridge_tier, meaning_vi, example_en, example_vi, collocations, grade_suitability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.id, v.word, v.ipa, v.pos, v.cefr_level, v.cambridge_tier, v.meaning_vi, v.example_en, v.example_vi, v.collocations, v.grade_suitability]
    );
  }
  console.log(`Seeded ${vocabItems.length} Cambridge vocabulary records.`);

  // 6. Teaching Resources & Native Pedagogy
  const pedagogyResources = [
    {
      id: 'res_pedagogy_1',
      category: 'native_methodology',
      grade_level: 'all',
      title: 'Mô hình Đồng giảng dạy (Co-Teaching Model) Giữa Giáo viên Việt Nam và Bản ngữ',
      content_markdown: `### Chiến Lược Co-Teaching Đạt Hiệu Quả Tối Đa
1. **Phân chia vai trò (Role Clarity):**
   - **Giáo viên bản ngữ (Native Speaker):** Chịu trách nhiệm phát âm chuẩn IPA, ngữ điệu (intonation), ngữ cảnh tự nhiên (collocations & idioms) và tổ chức hoạt động tương tác nói 100% tiếng Anh.
   - **Giáo viên Việt Nam (Local Co-teacher):** Quản lý trật tự lớp, giải thích ngữ pháp cốt lõi bằng tiếng Việt khi học sinh gặp rào cản nhận thức, kết nối nội dung bài học với yêu cầu thi cử của Bộ GD&ĐT.
2. **Kỹ thuật TPR (Total Physical Response) ứng dụng ở Tiểu học:**
   - Dùng chuyển động cơ thể, cử chỉ tay để diễn đạt hành động thay vì dịch nghĩa từ vựng.
3. **Kỹ thuật "Prompt & Paraphrase" ở THCS & THPT:**
   - Thay vì sửa lỗi ngắt quãng khi học sinh đang nói, giáo viên ghi chú và mô phỏng lại cách diễn đạt chuẩn sau khi học sinh kết thúc câu.`,
      native_teacher_tips: 'Always maintain an encouraging environment. Do not interrupt student flow when speaking; give delayed feedback.',
      keywords: 'co-teaching, native speaker, giao vien ban ngu, phuong phap giang day, TPR, phan am, intonation',
      downloads_url: 'https://tienganh7-pro.pages.dev/resources/co-teaching-guide.pdf'
    },
    {
      id: 'res_pedagogy_2',
      category: 'lesson_plan_5512',
      grade_level: 'secondary',
      title: 'Khung Kế Hoạch Bài Dạy Tiếng Anh 5512 Chuẩn 4 Bước Hiện Hành 2026',
      content_markdown: `### Cấu Trúc Giáo Án Chuẩn Công Văn 5512/BGDĐT
- **Hoạt động 1: Xác định vấn đề / Khởi động (Warm-up / Lead-in):** Tạo hứng thú, liên hệ kiến thức cũ với chủ đề mới (3-5 phút).
- **Hoạt động 2: Hình thành kiến thức mới (Knowledge Formation):** Giới thiệu từ vựng, ngữ pháp thông qua ngữ cảnh thực tế (12-15 phút).
- **Hoạt động 3: Luyện tập (Controlled & Semi-controlled Practice):** Bài tập điền từ, matching, đặt câu có phản hồi ngay (15 phút).
- **Hoạt động 4: Vận dụng (Production / Application):** Dự án nhóm, thảo luận, thuyết trình hoặc viết ngắn (10 phút).`,
      native_teacher_tips: 'Make sure warm-up involves 100% active physical or verbal engagement to stimulate brain energy.',
      keywords: 'giao an 5512, ke hoach bai day, lesson plan, warming up, production, tieu chuan bo giao duc',
      downloads_url: 'https://tienganh7-pro.pages.dev/resources/lesson-plan-5512-template.docx'
    }
  ];

  for (const r of pedagogyResources) {
    await queryD1(
      `INSERT OR REPLACE INTO teaching_resources (id, category, grade_level, title, content_markdown, native_teacher_tips, keywords, downloads_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.category, r.grade_level, r.title, r.content_markdown, r.native_teacher_tips, r.keywords, r.downloads_url]
    );
  }
  console.log(`Seeded ${pedagogyResources.length} teaching pedagogy resources.`);

  // 7. Webhook & Snapshots Audit Initial Record
  const initialWebhook = {
    id: 'wh_bot_reporting',
    name: 'Telegram & Zalo Central Bot Reporter',
    url: 'https://api.timbk.io.vn/api/webhook',
    secret: 'wh_sec_tienganh_2026_superadmin_fomo',
    event_types: 'test_submitted, teacher_added, daily_report, system_alert',
    is_active: 1,
    last_status: 200
  };

  await queryD1(
    `INSERT OR REPLACE INTO webhooks (id, name, url, secret, event_types, is_active, last_status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [initialWebhook.id, initialWebhook.name, initialWebhook.url, initialWebhook.secret, initialWebhook.event_types, initialWebhook.is_active, initialWebhook.last_status]
  );

  const initialSnapshot = {
    id: 'snap_init_001',
    actor_email: 'nmvpiovn@gmail.com',
    actor_role: 'superadmin',
    action: 'SYSTEM_UPGRADE_K12_OVERHAUL',
    entity_type: 'system',
    entity_id: 'd1_tienganh_pro_db',
    data_before: JSON.stringify({ version: '1.0.0', scope: 'Grade 7 Only' }),
    data_after: JSON.stringify({
      version: '2.0.0',
      scope: 'K-12 (Grades 1-12), THPT QG, IELTS, TOEIC, TOEFL, B1/B2 VSTEP, Cambridge CEFR, Native Pedagogy',
      superadmins: ['nmvpiovn@gmail.com', 'msdung@timbk.io.vn'],
      database: 'Cloudflare D1 tienganh-pro-db (APAC)',
      features: ['15m/45m test engines', 'Speaking WebSpeech API', 'Writing Live Evaluation', 'Full Audit Snapshots', 'Bot Webhooks', 'PWA / Mobile']
    }),
    ip_address: '127.0.0.1'
  };

  await queryD1(
    `INSERT OR REPLACE INTO snapshots (id, actor_email, actor_role, action, entity_type, entity_id, data_before, data_after, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [initialSnapshot.id, initialSnapshot.actor_email, initialSnapshot.actor_role, initialSnapshot.action, initialSnapshot.entity_type, initialSnapshot.entity_id, initialSnapshot.data_before, initialSnapshot.data_after, initialSnapshot.ip_address]
  );

  console.log('Seeded webhooks and initial system audit snapshot!');
  console.log('=== All seed data successfully loaded to Cloudflare D1! ===');
}

runSeed().catch(console.error);

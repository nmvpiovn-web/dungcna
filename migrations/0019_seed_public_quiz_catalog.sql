-- ============================================================================
-- MIGRATION 0019: SEED PUBLIC QUIZ CATALOG (GRADES 1-12 + IELTS)
-- Target: Cloudflare D1 / SQLite
-- Idempotent: Safe to re-run without duplicate rows or data corruption
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 1 · Khởi Động & Làm Quen (lop_1)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_1',
  'Tiếng Anh Lớp 1 · Khởi Động & Làm Quen',
  'Luyện tập làm quen bảng chữ cái, màu sắc và đồ dùng học tập cơ bản.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_214',
  'quiz_pub_grade_1',
  'multiple_choice',
  'What colour is the apple? It is ________.',
  NULL,
  '["A. red","B. pen","C. book","D. cat"]',
  'A. red',
  'Quả táo màu đỏ -> ''red'' (màu đỏ).',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_215',
  'quiz_pub_grade_1',
  'multiple_choice',
  'Which letter comes first in the alphabet?',
  NULL,
  '["A. B","B. A","C. C","D. D"]',
  'B. A',
  'Chữ cái đầu tiên trong bảng chữ cái tiếng Anh là chữ ''A''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_216',
  'quiz_pub_grade_1',
  'multiple_choice',
  'Choose the correct word for số 1:',
  NULL,
  '["A. two","B. three","C. one","D. four"]',
  'C. one',
  'Số 1 trong tiếng Anh là ''one''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_217',
  'quiz_pub_grade_1',
  'multiple_choice',
  'What is this? It is a ________. (🐱)',
  NULL,
  '["A. dog","B. bird","C. fish","D. cat"]',
  'D. cat',
  'Con mèo là ''cat''.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_218',
  'quiz_pub_grade_1',
  'multiple_choice',
  'What colour is the sky? It is ________.',
  NULL,
  '["A. yellow","B. blue","C. green","D. red"]',
  'B. blue',
  'Bầu trời màu xanh dương -> ''blue''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_219',
  'quiz_pub_grade_1',
  'multiple_choice',
  'I write with a ________.',
  NULL,
  '["A. dog","B. ball","C. pen","D. chair"]',
  'C. pen',
  'Tôi viết bằng cây bút -> ''pen''.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_220',
  'quiz_pub_grade_1',
  'multiple_choice',
  'How many fingers on one hand? -> ________.',
  NULL,
  '["A. three","B. four","C. six","D. five"]',
  'D. five',
  'Một bàn tay có 5 ngón -> ''five''.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_221',
  'quiz_pub_grade_1',
  'multiple_choice',
  'Open your ________, please!',
  NULL,
  '["A. book","B. cat","C. sun","D. fish"]',
  'A. book',
  'Xin mời mở sách ra -> ''Open your book''.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_222',
  'quiz_pub_grade_1',
  'multiple_choice',
  'What colour is a banana? It is ________.',
  NULL,
  '["A. red","B. blue","C. yellow","D. black"]',
  'C. yellow',
  'Quả chuối có màu vàng -> ''yellow''.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_223',
  'quiz_pub_grade_1',
  'multiple_choice',
  'This is my ________. (🐶)',
  NULL,
  '["A. cat","B. bird","C. duck","D. dog"]',
  'D. dog',
  'Con chó là ''dog''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_224',
  'quiz_pub_grade_1',
  'multiple_choice',
  'Two + Three = ________.',
  NULL,
  '["A. five","B. four","C. six","D. seven"]',
  'A. five',
  '2 + 3 = 5 (''five'').',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_1_qb_225',
  'quiz_pub_grade_1',
  'multiple_choice',
  'Stand ________, please!',
  NULL,
  '["A. down","B. up","C. in","D. on"]',
  'B. up',
  'Đứng lên là ''Stand up''.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 2 · Từ Vựng & Mẫu Câu Quen Thuộc (lop_2)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_2',
  'Tiếng Anh Lớp 2 · Từ Vựng & Mẫu Câu Quen Thuộc',
  'Thực hành các từ vựng gia đình, động vật và hoạt động hàng ngày.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_244',
  'quiz_pub_grade_2',
  'multiple_choice',
  'Touch your ________! (Đầu)',
  NULL,
  '["A. head","B. hand","C. foot","D. arm"]',
  'A. head',
  'Cái đầu là ''head''.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_245',
  'quiz_pub_grade_2',
  'multiple_choice',
  'I can see with my two ________.',
  NULL,
  '["A. ears","B. eyes","C. hands","D. feet"]',
  'B. eyes',
  'Nhìn bằng đôi mắt -> ''eyes''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_246',
  'quiz_pub_grade_2',
  'multiple_choice',
  'Which word begins with the /b/ sound?',
  NULL,
  '["A. cat","B. dog","C. ball","D. apple"]',
  'C. ball',
  'Từ ''ball'' bắt đầu bằng âm /b/.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_247',
  'quiz_pub_grade_2',
  'multiple_choice',
  'Choose the missing number: 10, 11, ________, 13.',
  NULL,
  '["A. fourteen","B. fifteen","C. sixteen","D. twelve"]',
  'D. twelve',
  'Số 12 là ''twelve''.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_248',
  'quiz_pub_grade_2',
  'multiple_choice',
  'Can you swim? -> Yes, I ________.',
  NULL,
  '["A. do","B. can","C. am","D. have"]',
  'B. can',
  'Trả lời câu hỏi Can you: ''Yes, I can.''',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_249',
  'quiz_pub_grade_2',
  'multiple_choice',
  'I like to drink fresh ________.',
  NULL,
  '["A. bread","B. rice","C. milk","D. meat"]',
  'C. milk',
  'Đồ uống là sữa -> ''milk''.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_250',
  'quiz_pub_grade_2',
  'multiple_choice',
  'The rabbit likes eating ________.',
  NULL,
  '["A. fish","B. bones","C. meat","D. carrots"]',
  'D. carrots',
  'Thỏ thích ăn cà rốt -> ''carrots''.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_251',
  'quiz_pub_grade_2',
  'multiple_choice',
  'Birds can ________ in the sky.',
  NULL,
  '["A. fly","B. swim","C. read","D. write"]',
  'A. fly',
  'Chim có thể bay -> ''fly''.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_252',
  'quiz_pub_grade_2',
  'multiple_choice',
  'Do you like ice cream? -> Yes, I ________.',
  NULL,
  '["A. can","B. am","C. do","D. like"]',
  'C. do',
  'Do you like: ''Yes, I do.''',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_253',
  'quiz_pub_grade_2',
  'multiple_choice',
  'How many chairs are there? -> There ________ four chairs.',
  NULL,
  '["A. is","B. am","C. be","D. are"]',
  'D. are',
  'Số nhiều ''four chairs'' đi với ''are''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_254',
  'quiz_pub_grade_2',
  'multiple_choice',
  'Fish can ________ in the river.',
  NULL,
  '["A. swim","B. fly","C. jump","D. run"]',
  'A. swim',
  'Cá bơi trong nước -> ''swim''.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_2_qb_255',
  'quiz_pub_grade_2',
  'multiple_choice',
  'What are these? -> They are my ________.',
  NULL,
  '["A. shirt","B. shoes","C. hat","D. cap"]',
  'B. shoes',
  'They are + danh từ số nhiều -> ''shoes'' (đôi giày).',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 3 · Luyện Tập Nghe & Đọc Khởi Điểm (lop_3)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_3',
  'Tiếng Anh Lớp 3 · Luyện Tập Nghe & Đọc Khởi Điểm',
  'Củng cố cấu trúc câu đơn giản, hỏi đáp cơ bản trong chương trình GDPT.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_18',
  'quiz_pub_grade_3',
  'multiple_choice',
  'Let''s go to the ______ to read interesting fairy tales.',
  NULL,
  '["A. library","B. classroom","C. gym","D. canteen"]',
  'A. library',
  'Đáp án A: ''library'' là thư viện, nơi học sinh đến để đọc sách truyện.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_19',
  'quiz_pub_grade_3',
  'multiple_choice',
  'I keep my pens, pencils and eraser neatly inside my ______.',
  NULL,
  '["A. desk","B. pencil case","C. chair","D. ruler"]',
  'B. pencil case',
  'Đáp án A: ''pencil case'' là hộp đựng bút.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_274',
  'quiz_pub_grade_3',
  'multiple_choice',
  '________ is my new pencil sharpener. (ở gần)',
  NULL,
  '["A. These","B. Those","C. This","D. They"]',
  'C. This',
  'Đồ vật số ít ở gần dùng ''This is''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_275',
  'quiz_pub_grade_3',
  'multiple_choice',
  '________ are my notebooks on the table.',
  NULL,
  '["A. This","B. That","C. It","D. These"]',
  'D. These',
  'Số nhiều ở gần dùng ''These are''.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_276',
  'quiz_pub_grade_3',
  'multiple_choice',
  'Is that your school bag? -> No, it ________.',
  NULL,
  '["A. aren''t","B. isn''t","C. doesn''t","D. don''t"]',
  'B. isn''t',
  'Phủ định số ít: ''No, it isn''t.''',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_277',
  'quiz_pub_grade_3',
  'multiple_choice',
  'What do you do at break time? -> I play ________.',
  NULL,
  '["A. book","B. ruler","C. badminton","D. eraser"]',
  'C. badminton',
  'Chơi cầu lông -> ''play badminton''.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_278',
  'quiz_pub_grade_3',
  'multiple_choice',
  'May I open the book? -> Yes, you ________.',
  NULL,
  '["A. do","B. are","C. have","D. can"]',
  'D. can',
  'Cho phép: ''Yes, you can'' hoặc ''Yes, you may.''',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_279',
  'quiz_pub_grade_3',
  'multiple_choice',
  'Are these your pencil cases? -> Yes, they ________.',
  NULL,
  '["A. are","B. is","C. do","D. have"]',
  'A. are',
  'Câu trả lời số nhiều: ''Yes, they are.''',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_280',
  'quiz_pub_grade_3',
  'multiple_choice',
  'What colour are your school bags? -> ________ are blue.',
  NULL,
  '["A. It","B. He","C. They","D. She"]',
  'C. They',
  'Đại từ thay thế cho school bags là ''They''.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_281',
  'quiz_pub_grade_3',
  'multiple_choice',
  'Nam and Phong play ________ at break time. (⚽)',
  NULL,
  '["A. chess","B. tennis","C. skating","D. football"]',
  'D. football',
  'Đá bóng là ''football''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_282',
  'quiz_pub_grade_3',
  'multiple_choice',
  'Do you like playing hide-and-seek? -> Yes, I ________.',
  NULL,
  '["A. do","B. like","C. can","D. am"]',
  'A. do',
  'Do you like -> ''Yes, I do.''',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_3_qb_283',
  'quiz_pub_grade_3',
  'multiple_choice',
  'Close your ________, please! It is windy outside.',
  NULL,
  '["A. pencil","B. window","C. ruler","D. eraser"]',
  'B. window',
  'Đóng cửa sổ -> ''window''.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 4 · Luyện Tập Tổng Hợp Chủ Điểm (lop_4)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_4',
  'Tiếng Anh Lớp 4 · Luyện Tập Tổng Hợp Chủ Điểm',
  'Ôn tập thì hiện tại đơn, sở thích và miêu tả hoạt động.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_20',
  'quiz_pub_grade_4',
  'multiple_choice',
  'What do you like doing in your free time? - I love ______ shuttlecock with my classmates.',
  NULL,
  '["A. playing","B. play","C. plays","D. played"]',
  'A. playing',
  'Đáp án B: Sau động từ chỉ sở thích ''love/like'' ta dùng danh động từ V-ing -> playing.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_304',
  'quiz_pub_grade_4',
  'multiple_choice',
  'What time is it? -> It is seven ________.',
  NULL,
  '["A. clock","B. o''clock","C. hour","D. time"]',
  'B. o''clock',
  'Chỉ giờ đúng: ''seven o''clock''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_305',
  'quiz_pub_grade_4',
  'multiple_choice',
  'I get up ________ 6:00 in the morning.',
  NULL,
  '["A. on","B. in","C. at","D. to"]',
  'C. at',
  'Giờ giấc đi với giới từ ''at''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_306',
  'quiz_pub_grade_4',
  'multiple_choice',
  'What does your father do? -> He is a ________. He works in a hospital.',
  NULL,
  '["A. farmer","B. driver","C. worker","D. doctor"]',
  'D. doctor',
  'Làm việc ở bệnh viện là bác sĩ -> ''doctor''.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_307',
  'quiz_pub_grade_4',
  'multiple_choice',
  'What is your favourite food? -> I like ________.',
  NULL,
  '["A. orange juice","B. beef","C. water","D. milk"]',
  'B. beef',
  'Thức ăn (food) là thịt bò -> ''beef''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_308',
  'quiz_pub_grade_4',
  'multiple_choice',
  'When is your birthday? -> It is in ________.',
  NULL,
  '["A. Monday","B. morning","C. May","D. clock"]',
  'C. May',
  'Tháng sinh nhật đi với giới từ in: ''in May''.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_309',
  'quiz_pub_grade_4',
  'multiple_choice',
  'Where does a teacher work? -> In a ________.',
  NULL,
  '["A. factory","B. field","C. hospital","D. school"]',
  'D. school',
  'Giáo viên làm việc ở trường học -> ''school''.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_310',
  'quiz_pub_grade_4',
  'multiple_choice',
  'What would you like to drink? -> A glass of ________, please.',
  NULL,
  '["A. orange juice","B. bread","C. chicken","D. pork"]',
  'A. orange juice',
  'Đồ uống là nước cam -> ''orange juice''.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_311',
  'quiz_pub_grade_4',
  'multiple_choice',
  'What does he look like? -> He is tall and ________.',
  NULL,
  '["A. long","B. high","C. slim","D. short time"]',
  'C. slim',
  'Miêu tả ngoại hình: ''tall and slim'' (cao và thon gọn).',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_312',
  'quiz_pub_grade_4',
  'multiple_choice',
  'My brother is ________ than me.',
  NULL,
  '["A. tall","B. more tall","C. tallest","D. taller"]',
  'D. taller',
  'So sánh hơn tính từ ngắn: ''taller than''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_313',
  'quiz_pub_grade_4',
  'multiple_choice',
  'What animal do you want to see? -> I want to see ________. (🐅)',
  NULL,
  '["A. tigers","B. books","C. pens","D. shoes"]',
  'A. tigers',
  'Con hổ là ''tigers''.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_4_qb_314',
  'quiz_pub_grade_4',
  'multiple_choice',
  'Why do you like monkeys? -> Because they are ________.',
  NULL,
  '["A. scary","B. funny","C. fierce","D. dangerous"]',
  'B. funny',
  'Khỉ tinh nghịch vui nhộn -> ''funny''.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 5 · Củng Cố & Chuyển Cấp Tiểu Học (lop_5)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_5',
  'Tiếng Anh Lớp 5 · Củng Cố & Chuyển Cấp Tiểu Học',
  'Luyện tập tổng hợp kiến thức trọng tâm bậc tiểu học.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_21',
  'quiz_pub_grade_5',
  'multiple_choice',
  'Where did you go last summer holiday? - We ______ Phu Quoc Island by plane.',
  NULL,
  '["A. visited","B. visit","C. visiting","D. visits"]',
  'A. visited',
  'Đáp án B: Câu hỏi ở thì quá khứ đơn ''did you go'' -> câu trả lời dùng động từ quá khứ ''visited''.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_334',
  'quiz_pub_grade_5',
  'multiple_choice',
  'What''s your address? -> It''s 105 Hoa Binh ________.',
  NULL,
  '["A. Village","B. Street","C. Floor","D. City"]',
  'B. Street',
  'Số nhà trên đường phố -> ''Hoa Binh Street''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_335',
  'quiz_pub_grade_5',
  'multiple_choice',
  'What''s the village like? -> It''s small and ________.',
  NULL,
  '["A. noisy","B. crowded","C. quiet","D. busy"]',
  'C. quiet',
  'Làng quê nhỏ và yên bình -> ''small and quiet''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_336',
  'quiz_pub_grade_5',
  'multiple_choice',
  'How often do you go to the library? -> I ________ go once a week.',
  NULL,
  '["A. ever","B. already","C. yet","D. usually"]',
  'D. usually',
  'Trạng từ tần suất: ''I usually go once a week.''',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_337',
  'quiz_pub_grade_5',
  'multiple_choice',
  'Where did you go on holiday? -> I went to Ha Long ________.',
  NULL,
  '["A. Island","B. Bay","C. River","D. Lake"]',
  'B. Bay',
  'Vịnh Hạ Long là ''Ha Long Bay''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_338',
  'quiz_pub_grade_5',
  'multiple_choice',
  'How did you get there? -> I went by ________. (✈️)',
  NULL,
  '["A. coach","B. motorbike","C. plane","D. train"]',
  'C. plane',
  'Đi bằng máy bay -> ''by plane''.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_339',
  'quiz_pub_grade_5',
  'multiple_choice',
  'What are you reading? -> I am reading The Story of Mai An ________.',
  NULL,
  '["A. Cam","B. Thach Sanh","C. Cuoi","D. Tiem"]',
  'D. Tiem',
  'Sự tích Mai An Tiêm dưa hấu đỏ.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_340',
  'quiz_pub_grade_5',
  'multiple_choice',
  'What is An Tiem like? -> He is hard-________ and clever.',
  NULL,
  '["A. working","B. work","C. worked","D. worker"]',
  'A. working',
  'Chăm chỉ cần cù là tính từ ghép ''hard-working''.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_341',
  'quiz_pub_grade_5',
  'multiple_choice',
  'What did the tigers do when you were at the zoo? -> They roared ________.',
  NULL,
  '["A. loud","B. loudness","C. loudly","D. slow"]',
  'C. loudly',
  'Gầm to: bổ nghĩa cho động từ roared dùng phó từ ''loudly''.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_342',
  'quiz_pub_grade_5',
  'multiple_choice',
  'Don''t ride your bike too fast! -> OK, I ________.',
  NULL,
  '["A. will","B. don''t","C. am not","D. won''t"]',
  'D. won''t',
  'Đáp lại lời cảnh báo phòng tránh tai nạn: ''OK, I won''t.''',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_343',
  'quiz_pub_grade_5',
  'multiple_choice',
  'Why shouldn''t he climb the tree? -> Because he may ________ and break his leg.',
  NULL,
  '["A. fall","B. fell","C. falling","D. falls"]',
  'A. fall',
  'Sau động từ khuyết thiếu may dùng V nguyên mẫu: ''fall''.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_5_qb_344',
  'quiz_pub_grade_5',
  'multiple_choice',
  'What would you like to be in the future? -> I''d like to be an ________ because I want to design buildings.',
  NULL,
  '["A. artist","B. architect","C. author","D. actor"]',
  'B. architect',
  'Thiết kế nhà cửa công trình là kiến trúc sư -> ''architect''.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 6 · Làm Quen Ngữ Pháp & Giao Tiếp THCS (lop_6)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_6',
  'Tiếng Anh Lớp 6 · Làm Quen Ngữ Pháp & Giao Tiếp THCS',
  'Các chủ điểm trường học, nhà ở, bạn bè và sinh hoạt thường nhật.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_364',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Which word has the final -s pronounced as /ɪz/?',
  NULL,
  '["A. watches","B. books","C. pens","D. cats"]',
  'A. watches',
  'Đuôi ''ch'' phát âm là /ɪz/ trong ''watches''.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_365',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Students wear a school ________ every Monday morning.',
  NULL,
  '["A. compass","B. uniform","C. calculator","D. pencil"]',
  'B. uniform',
  'Mặc đồng phục học sinh là ''school uniform''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_366',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Nam ________ judo in the school gymnasium every Tuesday.',
  NULL,
  '["A. plays","B. makes","C. does","D. takes"]',
  'C. does',
  'Môn võ thuật judo đi với động từ ''do'' -> ''does judo''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_367',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Our new school is surrounded ________ green rice fields.',
  NULL,
  '["A. with","B. at","C. in","D. by"]',
  'D. by',
  'Được bao quanh bởi dùng ''surrounded by''.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_368',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Listen! Someone ________ at the classroom door.',
  NULL,
  '["A. knocks","B. is knocking","C. knocked","D. knock"]',
  'B. is knocking',
  'Dấu hiệu ''Listen!'' dùng thì hiện tại tiếp diễn: ''is knocking''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_369',
  'quiz_pub_grade_6',
  'multiple_choice',
  'There is a large garden ________ front of my house.',
  NULL,
  '["A. at","B. on","C. in","D. to"]',
  'C. in',
  'Cụm giới từ vị trí ''in front of'' (ở phía trước).',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_370',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Phong is very ________. He likes making new friends easily.',
  NULL,
  '["A. shy","B. lazy","C. selfish","D. friendly"]',
  'D. friendly',
  'Thân thiện hòa đồng là ''friendly''.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_371',
  'quiz_pub_grade_6',
  'multiple_choice',
  'An is so ________. She always does her homework without reminder.',
  NULL,
  '["A. hard-working","B. talkative","C. messy","D. clumsy"]',
  'A. hard-working',
  'Chăm chỉ tự giác là ''hard-working''.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_372',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Where is the microwave? -> It''s ________ the cupboard and the fridge.',
  NULL,
  '["A. among","B. in","C. between","D. under"]',
  'C. between',
  'Ở giữa hai vật dùng ''between A and B''.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_373',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Look! The children ________ football on the school playground.',
  NULL,
  '["A. play","B. played","C. plays","D. are playing"]',
  'D. are playing',
  'Dấu hiệu ''Look!'' dùng thì hiện tại tiếp diễn số nhiều: ''are playing''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_374',
  'quiz_pub_grade_6',
  'multiple_choice',
  'She has long straight ________ hair.',
  NULL,
  '["A. black","B. big","C. tall","D. smart"]',
  'A. black',
  'Trật tự tính từ miêu tả tóc: length - shape - colour (''long straight black hair'').',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_6_qb_375',
  'quiz_pub_grade_6',
  'multiple_choice',
  'Ethnic minority groups in the northern mountains live in traditional ________ houses.',
  NULL,
  '["A. flat","B. stilt","C. skyscraper","D. villa"]',
  'B. stilt',
  'Nhà sàn vùng cao là ''stilt houses''.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 7 · Kiểm Tra & Ôn Tập Trọng Tâm (lop_7)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_7',
  'Tiếng Anh Lớp 7 · Kiểm Tra & Ôn Tập Trọng Tâm',
  'Bộ câu hỏi trắc nghiệm ngữ âm, từ vựng và ngữ pháp trọng tâm lớp 7.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_g7_nb_01',
  'quiz_pub_grade_7',
  'multiple_choice',
  'My sister ______ collecting stamps in her free time.',
  NULL,
  '["A. enjoys","B. enjoy","C. enjoying","D. is enjoy"]',
  'A. enjoys',
  'Chủ ngữ số ít ''My sister'' đi với động từ thêm ''s/es'' ở thì Hiện tại đơn: ''enjoys''.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_g7_nb_02',
  'quiz_pub_grade_7',
  'multiple_choice',
  'You ______ drink plenty of water and eat fresh vegetables to stay healthy.',
  NULL,
  '["A. shouldn''t","B. should","C. can''t","D. mustn''t"]',
  'B. should',
  '''should'' dùng để đưa ra lời khuyên tích cực về sức khỏe: Bạn nên uống nhiều nước.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_g7_th_01',
  'quiz_pub_grade_7',
  'multiple_choice',
  'Last summer, our youth club ______ warm clothes and books for homeless children.',
  NULL,
  '["A. collects","B. collecting","C. collected","D. will collect"]',
  'C. collected',
  'Dấu hiệu ''Last summer'' chỉ thì Quá khứ đơn -> dùng động từ ''collected''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_g7_vd_01',
  'quiz_pub_grade_7',
  'multiple_choice',
  'Classical music is not ______ modern pop music among young teenagers.',
  NULL,
  '["A. so more popular","B. more popular as","C. as popularly as","D. as popular as"]',
  'D. as popular as',
  'So sánh bằng trong câu phủ định dùng ''not as + adj + as'': ''not as popular as''.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_g7_vdc_01',
  'quiz_pub_grade_7',
  'multiple_choice',
  'It takes Lan 30 minutes to cycle to school every morning.
Which sentence has the CLOSEST meaning?
A. Lan spends 30 minutes cycling to school every morning.
B. Lan spent 30 minutes to cycle to school every morning.
C. Lan spends 30 minutes to cycling to school every morning.
D. Lan uses 30 minutes for cycle to school every morning.',
  NULL,
  '["A. Lan spent 30 minutes to cycle to school every morning.","B. Lan spends 30 minutes cycling to school every morning.","C. Lan spends 30 minutes to cycling to school every morning.","D. Lan uses 30 minutes for cycle to school every morning."]',
  'B. Lan spends 30 minutes cycling to school every morning.',
  'Cấu trúc tương đương: ''It takes somebody + time + to V'' = ''Somebody spends + time + V-ing''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_g7_vdc_02',
  'quiz_pub_grade_7',
  'multiple_choice',
  'Although the ending of the movie was sad, all the audiences loved it.
Which sentence has the CLOSEST meaning?
A. In spite of the sad ending of the movie, all the audiences loved it.
B. Despite the movie ended sadly, all the audiences loved it.
C. Because the movie had a sad ending, all the audiences loved it.
D. However the ending was sad, but the audiences loved it.',
  NULL,
  '["A. Despite the movie ended sadly, all the audiences loved it.","B. Because the movie had a sad ending, all the audiences loved it.","C. In spite of the sad ending of the movie, all the audiences loved it.","D. However the ending was sad, but the audiences loved it."]',
  'C. In spite of the sad ending of the movie, all the audiences loved it.',
  '''Although + clause'' chuyển đổi thành ''In spite of / Despite + noun phrase'': ''In spite of the sad ending of the movie''.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_g7_vdc_03',
  'quiz_pub_grade_7',
  'multiple_choice',
  'By the year 2050, most of our electricity ______ by solar and wind power plants.
A. will be generated
B. will generate
C. is generating
D. has been generated',
  NULL,
  '["A. will generate","B. is generating","C. has been generated","D. will be generated"]',
  'D. will be generated',
  'Mốc thời gian tương lai ''By 2050'' kết hợp bị động ''electricity will be generated by...''.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_qb_1',
  'quiz_pub_grade_7',
  'multiple_choice',
  'Choose the word whose underlined part is pronounced differently: c<u>oa</u>ch, c<u>a</u>re, d<u>e</u>cide, sc<u>a</u>red',
  NULL,
  '["A. decide","B. coach","C. care","D. scared"]',
  'A. decide',
  'Đáp án C: chữ ''c'' trong ''decide'' phát âm là /s/, trong khi ''coach'', ''care'', ''scared'' đều phát âm là /k/.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_qb_10',
  'quiz_pub_grade_7',
  'multiple_choice',
  'You should pay more ______ in class to understand the lesson thoroughly.',
  NULL,
  '["A. part","B. care","C. attention","D. notice"]',
  'C. attention',
  'Đáp án D: Cụm thành ngữ ''pay attention to'' có nghĩa là chú ý, tập trung.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_qb_11',
  'quiz_pub_grade_7',
  'multiple_choice',
  'My mother worries who will ______ our house when we are away for our summer holidays.',
  NULL,
  '["A. see","B. take after","C. look at","D. take care of"]',
  'D. take care of',
  'Đáp án C: ''take care of'' = chăm sóc, trông nom nhà cửa khi đi vắng.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_qb_12',
  'quiz_pub_grade_7',
  'multiple_choice',
  'Wearing a band over the wrist allows players ______ safely.',
  NULL,
  '["A. to play","B. playing","C. play","D. plays"]',
  'A. to play',
  'Đáp án B: Cấu trúc ''allow somebody TO V'' (cho phép ai làm gì) -> to play.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_7_qb_13',
  'quiz_pub_grade_7',
  'multiple_choice',
  'In my opinion, nuclear power is not only expensive but also ______ to our living environment.',
  NULL,
  '["A. danger","B. dangerous","C. risk","D. disaster"]',
  'B. dangerous',
  'Đáp án B: Sau ''be'' và song hành với tính từ ''expensive'' trong cấu trúc ''not only... but also...'', ta cần tính từ ''dangerous''.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 8 · Phát Triển Kỹ Năng Đọc & Ngữ Pháp (lop_8)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_8',
  'Tiếng Anh Lớp 8 · Phát Triển Kỹ Năng Đọc & Ngữ Pháp',
  'Mở rộng vốn từ vựng xã hội, phong tục, khoa học công nghệ.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_105',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Rewrite: ''Shall we go to the museum this weekend?'' -> ''How about ______?''',
  NULL,
  '["A. going to the museum this weekend?","B. to go to the museum this weekend?","C. we go to the museum this weekend?","D. go to the museum this weekend?"]',
  'A. going to the museum this weekend?',
  'Cấu trúc đề xuất gợi ý: Shall we + V-inf? = How about / What about + V-ing? = Let''s + V-inf.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_116',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 1)',
  NULL,
  '["A. neither does","B. so does","C. so is","D. nor does"]',
  'B. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_117',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 2)',
  NULL,
  '["A. neither does","B. so is","C. so does","D. nor does"]',
  'C. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_118',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 3)',
  NULL,
  '["A. neither does","B. so is","C. nor does","D. so does"]',
  'D. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_119',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 4)',
  NULL,
  '["A. neither does","B. so does","C. so is","D. nor does"]',
  'B. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_120',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 5)',
  NULL,
  '["A. neither does","B. so is","C. so does","D. nor does"]',
  'C. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_163',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Rewrite: ''Shall we go to the museum this weekend?'' -> ''How about ______?''',
  NULL,
  '["A. to go to the museum this weekend?","B. we go to the museum this weekend?","C. go to the museum this weekend?","D. going to the museum this weekend?"]',
  'D. going to the museum this weekend?',
  'Cấu trúc đề xuất gợi ý: Shall we + V-inf? = How about / What about + V-ing? = Let''s + V-inf.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_174',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 1)',
  NULL,
  '["A. so does","B. neither does","C. so is","D. nor does"]',
  'A. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_175',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 2)',
  NULL,
  '["A. neither does","B. so is","C. so does","D. nor does"]',
  'C. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_176',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 3)',
  NULL,
  '["A. neither does","B. so is","C. nor does","D. so does"]',
  'D. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_177',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 4)',
  NULL,
  '["A. so does","B. neither does","C. so is","D. nor does"]',
  'A. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_8_qb_178',
  'quiz_pub_grade_8',
  'multiple_choice',
  'Mai loves playing classical piano, and ______ her brother. (Biến thể 5)',
  NULL,
  '["A. neither does","B. so does","C. so is","D. nor does"]',
  'B. so does',
  'Đồng tình khẳng định với động từ thường chia hiện tại đơn: So does + S.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 9 · Ôn Luyện Thi Vào Lớp 10 (lop_9)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_9',
  'Tiếng Anh Lớp 9 · Ôn Luyện Thi Vào Lớp 10',
  'Tổng ôn ngữ pháp câu điều kiện, câu bị động, câu tường thuật trọng điểm.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_01',
  'quiz_pub_grade_9',
  'multiple_choice',
  'This conical hat making craft has been handed ______ from generation to generation in my village.',
  NULL,
  '["A. down","B. up","C. in","D. on"]',
  'A. down',
  '''hand down'' = truyền lại từ thế hệ này sang thế hệ khác.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_02',
  'quiz_pub_grade_9',
  'multiple_choice',
  'Living in a big metropolitan city is much ______ than living in the quiet countryside.',
  NULL,
  '["A. most expensive","B. more expensive","C. expensiver","D. as expensive"]',
  'B. more expensive',
  'So sánh hơn của tính từ dài ''expensive'' là ''more expensive''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_03',
  'quiz_pub_grade_9',
  'multiple_choice',
  'Lan didn''t know ______ to ask for advice about her exam stress.',
  NULL,
  '["A. what","B. why","C. who","D. when"]',
  'C. who',
  'Hỏi xin lời khuyên từ ai đó: ''who to ask for advice''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_04',
  'quiz_pub_grade_9',
  'multiple_choice',
  'In the past, our grandparents ______ walk barefoot to school every day.',
  NULL,
  '["A. are used to","B. use to","C. were used to","D. used to"]',
  'D. used to',
  '''used to + V-infinitive'' diễn tả thói quen trong quá khứ nay không còn nữa.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_05',
  'quiz_pub_grade_9',
  'multiple_choice',
  'It is ______ that Ha Long Bay is one of the most magnificent natural wonders in the world.',
  NULL,
  '["A. saying","B. said","C. says","D. say"]',
  'B. said',
  'Cấu trúc bị động khách quan: ''It is said/believed/reported that...''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_06',
  'quiz_pub_grade_9',
  'multiple_choice',
  'By the time the electric tram arrived, many passengers ______ at the station for an hour.',
  NULL,
  '["A. waited","B. have waited","C. had waited","D. were waiting"]',
  'C. had waited',
  'Hành động xảy ra trước một mốc quá khứ (''By the time ... arrived'') dùng thì Quá khứ hoàn thành ''had waited''.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_07',
  'quiz_pub_grade_9',
  'multiple_choice',
  'You should add a ______ of salt to the soup to make it more savory.',
  NULL,
  '["A. bunch","B. slice","C. loaf","D. pinch"]',
  'D. pinch',
  '''a pinch of salt'' = một nhúm muối.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_08',
  'quiz_pub_grade_9',
  'multiple_choice',
  'Passengers must go to the ______ desk at least two hours before departure.',
  NULL,
  '["A. check-in","B. check-out","C. stopover","D. checkout"]',
  'A. check-in',
  '''check-in desk'' = quầy làm thủ tục tại sân bay.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_09',
  'quiz_pub_grade_9',
  'multiple_choice',
  'If I ______ fluent in English, I would apply for that international scholarship.',
  NULL,
  '["A. am","B. will be","C. were","D. have been"]',
  'C. were',
  'Câu điều kiện loại 2 giả định không có thật ở hiện tại: If + S + were/V-ed, S + would + V.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_10',
  'quiz_pub_grade_9',
  'multiple_choice',
  'Neil Armstrong was the first astronaut ______ set foot on the Moon in 1969.',
  NULL,
  '["A. which","B. whose","C. whom","D. who"]',
  'D. who',
  'Đại từ quan hệ thay thế cho danh từ chỉ người ''astronaut'' làm chủ ngữ: ''who set foot''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_11',
  'quiz_pub_grade_9',
  'multiple_choice',
  'Choose the word whose underlined part is pronounced differently:
A. passed
B. watched
C. washed
D. played',
  NULL,
  '["A. played","B. passed","C. watched","D. washed"]',
  'A. played',
  '''played'' phát âm là /d/, còn ''passed'', ''watched'', ''washed'' phát âm là /t/.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_9_g9_nb_12',
  'quiz_pub_grade_9',
  'multiple_choice',
  'Choose the word that has different stress position from the others:
A. father
B. mother
C. teacher
D. maintain',
  NULL,
  '["A. father","B. maintain","C. mother","D. teacher"]',
  'B. maintain',
  '''maintain'' trọng âm rơi vào âm tiết thứ 2 /meɪnˈteɪn/, các từ còn lại trọng âm rơi vào âm tiết thứ 1.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 10 · Nền Tảng THPT & Học Thuật (lop_10)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_10',
  'Tiếng Anh Lớp 10 · Nền Tảng THPT & Học Thuật',
  'Khởi động chương trình THPT mới với các chủ đề môi trường và cuộc sống.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_121',
  'quiz_pub_grade_10',
  'multiple_choice',
  'The lights are out and no one answers the door. They ______ out for dinner. (Biến thể 1)',
  NULL,
  '["A. must have gone","B. can''t have gone","C. should have gone","D. needn''t go"]',
  'A. must have gone',
  'Suy đoán chắc chắn xảy ra ở quá khứ: Must have P.P.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_122',
  'quiz_pub_grade_10',
  'multiple_choice',
  'The lights are out and no one answers the door. They ______ out for dinner. (Biến thể 2)',
  NULL,
  '["A. can''t have gone","B. must have gone","C. should have gone","D. needn''t go"]',
  'B. must have gone',
  'Suy đoán chắc chắn xảy ra ở quá khứ: Must have P.P.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_123',
  'quiz_pub_grade_10',
  'multiple_choice',
  'The lights are out and no one answers the door. They ______ out for dinner. (Biến thể 3)',
  NULL,
  '["A. can''t have gone","B. should have gone","C. must have gone","D. needn''t go"]',
  'C. must have gone',
  'Suy đoán chắc chắn xảy ra ở quá khứ: Must have P.P.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_124',
  'quiz_pub_grade_10',
  'multiple_choice',
  'The lights are out and no one answers the door. They ______ out for dinner. (Biến thể 4)',
  NULL,
  '["A. can''t have gone","B. should have gone","C. needn''t go","D. must have gone"]',
  'D. must have gone',
  'Suy đoán chắc chắn xảy ra ở quá khứ: Must have P.P.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_125',
  'quiz_pub_grade_10',
  'multiple_choice',
  'The lights are out and no one answers the door. They ______ out for dinner. (Biến thể 5)',
  NULL,
  '["A. can''t have gone","B. must have gone","C. should have gone","D. needn''t go"]',
  'B. must have gone',
  'Suy đoán chắc chắn xảy ra ở quá khứ: Must have P.P.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_146',
  'quiz_pub_grade_10',
  'multiple_choice',
  'Linda will call us ______ she reaches the conference hall. (Biến thể 1)',
  NULL,
  '["A. while","B. until","C. as soon as","D. by the time"]',
  'C. as soon as',
  'Liên từ ''as soon as'' nối mệnh đề tương lai đơn với hiện tại đơn.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_147',
  'quiz_pub_grade_10',
  'multiple_choice',
  'Linda will call us ______ she reaches the conference hall. (Biến thể 2)',
  NULL,
  '["A. while","B. until","C. by the time","D. as soon as"]',
  'D. as soon as',
  'Liên từ ''as soon as'' nối mệnh đề tương lai đơn với hiện tại đơn.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_148',
  'quiz_pub_grade_10',
  'multiple_choice',
  'Linda will call us ______ she reaches the conference hall. (Biến thể 3)',
  NULL,
  '["A. as soon as","B. while","C. until","D. by the time"]',
  'A. as soon as',
  'Liên từ ''as soon as'' nối mệnh đề tương lai đơn với hiện tại đơn.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_149',
  'quiz_pub_grade_10',
  'multiple_choice',
  'Linda will call us ______ she reaches the conference hall. (Biến thể 4)',
  NULL,
  '["A. while","B. until","C. as soon as","D. by the time"]',
  'C. as soon as',
  'Liên từ ''as soon as'' nối mệnh đề tương lai đơn với hiện tại đơn.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_150',
  'quiz_pub_grade_10',
  'multiple_choice',
  'Linda will call us ______ she reaches the conference hall. (Biến thể 5)',
  NULL,
  '["A. while","B. until","C. by the time","D. as soon as"]',
  'D. as soon as',
  'Liên từ ''as soon as'' nối mệnh đề tương lai đơn với hiện tại đơn.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_179',
  'quiz_pub_grade_10',
  'multiple_choice',
  'The lights are out and no one answers the door. They ______ out for dinner. (Biến thể 1)',
  NULL,
  '["A. must have gone","B. can''t have gone","C. should have gone","D. needn''t go"]',
  'A. must have gone',
  'Suy đoán chắc chắn xảy ra ở quá khứ: Must have P.P.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_10_qb_180',
  'quiz_pub_grade_10',
  'multiple_choice',
  'The lights are out and no one answers the door. They ______ out for dinner. (Biến thể 2)',
  NULL,
  '["A. can''t have gone","B. must have gone","C. should have gone","D. needn''t go"]',
  'B. must have gone',
  'Suy đoán chắc chắn xảy ra ở quá khứ: Must have P.P.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 11 · Phát Triển Ngôn Ngữ Học Thuật (lop_11)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_11',
  'Tiếng Anh Lớp 11 · Phát Triển Ngôn Ngữ Học Thuật',
  'Ngữ pháp nâng cao, mệnh đề quan hệ và đọc hiểu văn bản chuyên sâu.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_103',
  'quiz_pub_grade_11',
  'multiple_choice',
  'Rewrite the sentence: ''It is said that the company lost millions of dollars during the crisis.''',
  NULL,
  '["A. The company is said to have lost millions of dollars during the crisis.","B. The company was said to lose millions of dollars during the crisis.","C. The company is said to lose millions of dollars during the crisis.","D. Millions of dollars are said to lost by the company."]',
  'A. The company is said to have lost millions of dollars during the crisis.',
  'Bị động khách quan khác thì: Mệnh đề chính ở hiện tại (is said), mệnh đề phụ ở quá khứ (lost) -> dùng ''to have + P.P'' (to have lost).',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_104',
  'quiz_pub_grade_11',
  'multiple_choice',
  'Rewrite: ''I''d rather you didn''t smoke in here.'' -> ''I would prefer ______.''',
  NULL,
  '["A. you didn''t smoke in here.","B. you not to smoke in here.","C. you not smoking in here.","D. you haven''t smoked in here."]',
  'B. you not to smoke in here.',
  'Prefer sb (not) to V = Would rather sb + V-ed. ''I would prefer you not to smoke in here''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_106',
  'quiz_pub_grade_11',
  'multiple_choice',
  'He was out of breath because he ______ for half an hour. (Biến thể 1)',
  NULL,
  '["A. was running","B. has run","C. had been running","D. ran"]',
  'C. had been running',
  'Nhấn mạnh quá trình chạy diễn ra liên tục gây nên hậu quả thở dốc.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_107',
  'quiz_pub_grade_11',
  'multiple_choice',
  'He was out of breath because he ______ for half an hour. (Biến thể 2)',
  NULL,
  '["A. was running","B. has run","C. ran","D. had been running"]',
  'D. had been running',
  'Nhấn mạnh quá trình chạy diễn ra liên tục gây nên hậu quả thở dốc.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_108',
  'quiz_pub_grade_11',
  'multiple_choice',
  'He was out of breath because he ______ for half an hour. (Biến thể 3)',
  NULL,
  '["A. was running","B. had been running","C. has run","D. ran"]',
  'B. had been running',
  'Nhấn mạnh quá trình chạy diễn ra liên tục gây nên hậu quả thở dốc.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_109',
  'quiz_pub_grade_11',
  'multiple_choice',
  'He was out of breath because he ______ for half an hour. (Biến thể 4)',
  NULL,
  '["A. was running","B. has run","C. had been running","D. ran"]',
  'C. had been running',
  'Nhấn mạnh quá trình chạy diễn ra liên tục gây nên hậu quả thở dốc.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_110',
  'quiz_pub_grade_11',
  'multiple_choice',
  'He was out of breath because he ______ for half an hour. (Biến thể 5)',
  NULL,
  '["A. was running","B. has run","C. ran","D. had been running"]',
  'D. had been running',
  'Nhấn mạnh quá trình chạy diễn ra liên tục gây nên hậu quả thở dốc.',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_151',
  'quiz_pub_grade_11',
  'multiple_choice',
  'Under no circumstances ______ reveal your account password to strangers. (Biến thể 1)',
  NULL,
  '["A. should you","B. you should","C. you must","D. must you not"]',
  'A. should you',
  'Đảo ngữ với Under no circumstances + should/must + S + V-inf.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_152',
  'quiz_pub_grade_11',
  'multiple_choice',
  'Under no circumstances ______ reveal your account password to strangers. (Biến thể 2)',
  NULL,
  '["A. you should","B. you must","C. should you","D. must you not"]',
  'C. should you',
  'Đảo ngữ với Under no circumstances + should/must + S + V-inf.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_153',
  'quiz_pub_grade_11',
  'multiple_choice',
  'Under no circumstances ______ reveal your account password to strangers. (Biến thể 3)',
  NULL,
  '["A. you should","B. you must","C. must you not","D. should you"]',
  'D. should you',
  'Đảo ngữ với Under no circumstances + should/must + S + V-inf.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_154',
  'quiz_pub_grade_11',
  'multiple_choice',
  'Under no circumstances ______ reveal your account password to strangers. (Biến thể 4)',
  NULL,
  '["A. should you","B. you should","C. you must","D. must you not"]',
  'A. should you',
  'Đảo ngữ với Under no circumstances + should/must + S + V-inf.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_11_qb_155',
  'quiz_pub_grade_11',
  'multiple_choice',
  'Under no circumstances ______ reveal your account password to strangers. (Biến thể 5)',
  NULL,
  '["A. you should","B. should you","C. you must","D. must you not"]',
  'B. should you',
  'Đảo ngữ với Under no circumstances + should/must + S + V-inf.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: Tiếng Anh Lớp 12 · Luyện Đề Tốt Nghiệp THPT Quốc Gia (lop_12)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_grade_12',
  'Tiếng Anh Lớp 12 · Luyện Đề Tốt Nghiệp THPT Quốc Gia',
  'Bộ câu hỏi chuẩn định dạng đề thi tốt nghiệp THPT và kỳ thi đại học.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_01',
  'quiz_pub_grade_12',
  'multiple_choice',
  'She has already finished her assignment, ______?',
  NULL,
  '["A. hasn''t she","B. didn''t she","C. doesn''t she","D. isn''t she"]',
  'A. hasn''t she',
  'Mệnh đề chính dùng thì Hiện tại hoàn thành dạng khẳng định ''has already finished'' -> Câu hỏi đuôi dùng ''hasn''t she''.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_02',
  'quiz_pub_grade_12',
  'multiple_choice',
  'This novel ______ by Charles Dickens in the 19th century.',
  NULL,
  '["A. wrote","B. was written","C. has written","D. is writing"]',
  'B. was written',
  'Chủ ngữ ''This novel'' là vật, hành động diễn ra trong quá khứ có mốc thời gian ''in the 19th century'' -> dùng bị động quá khứ đơn ''was written''.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_03',
  'quiz_pub_grade_12',
  'multiple_choice',
  'The international conference will take place ______ Monday morning.',
  NULL,
  '["A. at","B. in","C. on","D. for"]',
  'C. on',
  'Đứng trước thứ trong tuần hoặc buổi kèm thứ (Monday morning) dùng giới từ ''on''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_04',
  'quiz_pub_grade_12',
  'multiple_choice',
  'The harder you study for the exam, ______ results you will achieve.',
  NULL,
  '["A. better","B. the best","C. the good","D. the better"]',
  'D. the better',
  'Cấu trúc so sánh kép ''The + comparative..., the + comparative...'': ''The harder..., the better...''',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_05',
  'quiz_pub_grade_12',
  'multiple_choice',
  'He bought ______ new laptop yesterday to prepare for his online course.',
  NULL,
  '["A. an","B. a","C. the","D. Ø (no article)"]',
  'B. a',
  'Danh từ đếm được số ít ''new laptop'' nhắc đến lần đầu tiên bắt đầu bằng phụ âm /n/ -> dùng mạo từ ''a''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_06',
  'quiz_pub_grade_12',
  'multiple_choice',
  'My parents always encourage me ______ hard to achieve my future goals.',
  NULL,
  '["A. working","B. work","C. to work","D. worked"]',
  'C. to work',
  'Cấu trúc ''encourage somebody to do something'': khuyến khích ai làm gì.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_07',
  'quiz_pub_grade_12',
  'multiple_choice',
  'While we ______ dinner in the dining room, the phone suddenly rang.',
  NULL,
  '["A. had","B. have had","C. are having","D. were having"]',
  'D. were having',
  'Hành động đang diễn ra trong quá khứ dùng Quá khứ tiếp diễn (were having dinner) thì hành động khác cắt ngang dùng Quá khứ đơn (phone rang).',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_08',
  'quiz_pub_grade_12',
  'multiple_choice',
  'The football match was delayed ______ the torrential rain.',
  NULL,
  '["A. because of","B. because","C. although","D. despite"]',
  'A. because of',
  'Sau chỗ trống là cụm danh từ ''the torrential rain'' và mang ý chỉ nguyên nhân -> dùng ''because of''.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_09',
  'quiz_pub_grade_12',
  'multiple_choice',
  'I will give you a call as soon as I ______ at the airport.',
  NULL,
  '["A. will arrive","B. arrived","C. arrive","D. had arrived"]',
  'C. arrive',
  'Mệnh đề trạng ngữ chỉ thời gian với ''as soon as'' đi kèm mệnh đề chính tương lai đơn thì dùng thì Hiện tại đơn: ''as soon as I arrive''.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_10',
  'quiz_pub_grade_12',
  'multiple_choice',
  'The certificates ______ to outstanding students were signed by the principal.',
  NULL,
  '["A. awarding","B. to award","C. award","D. awarded"]',
  'D. awarded',
  'Rút gọn mệnh đề quan hệ dạng bị động: ''which were awarded'' rút gọn thành quá khứ phân từ ''awarded''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_11',
  'quiz_pub_grade_12',
  'multiple_choice',
  'Social media has become an ______ tool for modern communication.',
  NULL,
  '["A. effective","B. effectively","C. effectiveness","D. effect"]',
  'A. effective',
  'Đứng trước danh từ ''tool'' cần một tính từ bổ nghĩa: ''effective tool'' (công cụ hiệu quả).',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_grade_12_g12_nb_gram_12',
  'quiz_pub_grade_12',
  'multiple_choice',
  'Please remember to ______ the lights before leaving the classroom.',
  NULL,
  '["A. turn on","B. turn off","C. look for","D. take after"]',
  'B. turn off',
  '''turn off'' có nghĩa là tắt thiết bị điện tử / ánh sáng.',
  1,
  11
);

-- ----------------------------------------------------------------------------
-- Quiz: IELTS Academic · Kiểm Tra Từ Vựng & Đọc Hiểu Học Thuật (ielts_academic)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO quizzes (
  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at
) VALUES (
  'quiz_pub_ielts',
  'IELTS Academic · Kiểm Tra Từ Vựng & Đọc Hiểu Học Thuật',
  'Rèn luyện tư duy từ vựng học thuật, đọc hiểu suy luận và collocation IELTS.',
  'usr_system_catalog',
  'Tiếng Anh Cô Dung',
  25,
  'published',
  '2026-10-10T00:00:00.000Z',
  '2026-10-10T00:00:00.000Z'
);

INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_504',
  'quiz_pub_ielts',
  'multiple_choice',
  'Notice: ''Please keep off the grass!'' -> What does this mean?',
  NULL,
  '["A. Do not walk on the grass","B. You can play football on the grass","C. Cut the grass now","D. Water the grass"]',
  'A. Do not walk on the grass',
  'Biển báo ''Keep off the grass'' nghĩa là không được giẫm lên cỏ.',
  1,
  0
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_505',
  'quiz_pub_ielts',
  'multiple_choice',
  'Notice: ''Buy one coffee, get one free before 9:00 AM!'' -> What does this mean?',
  NULL,
  '["A. Coffee is served only at 9:00 AM","B. Morning coffee is cheaper","C. You cannot buy coffee in the morning","D. Coffee is free all day"]',
  'B. Morning coffee is cheaper',
  'Mua 1 tặng 1 trước 9h nghĩa là cà phê buổi sáng rẻ hơn.',
  1,
  1
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_506',
  'quiz_pub_ielts',
  'multiple_choice',
  'I need to buy a return train ________ to Oxford.',
  NULL,
  '["A. book","B. letter","C. ticket","D. stamp"]',
  'C. ticket',
  'Vé tàu khứ hồi: ''return train ticket''.',
  1,
  2
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_507',
  'quiz_pub_ielts',
  'multiple_choice',
  'Can you help me ________ my lost luggage at the airport counter?',
  NULL,
  '["A. look","B. see","C. watch","D. find"]',
  'D. find',
  'Tìm hành lý thất lạc: ''find my lost luggage''.',
  1,
  3
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_508',
  'quiz_pub_ielts',
  'multiple_choice',
  'The museum admission fee is ________ for children under 6 years old.',
  NULL,
  '["A. expensive","B. free","C. costly","D. high"]',
  'B. free',
  'Miễn phí cho trẻ em: ''free''.',
  1,
  4
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_509',
  'quiz_pub_ielts',
  'multiple_choice',
  'Email notice: ''Library renovation: The second floor will remain closed until Friday.'' What does this mean?',
  NULL,
  '["A. The entire library is closed forever.","B. Renovation starts on Friday.","C. Students cannot access second floor books before Friday.","D. The first floor is closed."]',
  'C. Students cannot access second floor books before Friday.',
  'Tầng 2 đóng cửa sửa chữa tới thứ Sáu nghĩa là học sinh không thể vào tầng 2 trước thứ Sáu.',
  1,
  5
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_510',
  'quiz_pub_ielts',
  'multiple_choice',
  'He is really keen ________ learning digital photography and photo editing.',
  NULL,
  '["A. in","B. at","C. with","D. on"]',
  'D. on',
  'Cụm ''keen on + V-ing'' (say mê, thích thú).',
  1,
  6
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_511',
  'quiz_pub_ielts',
  'multiple_choice',
  'Although it rained cats and dogs, the outdoor music concert was not ________ off.',
  NULL,
  '["A. called","B. put","C. taken","D. made"]',
  'A. called',
  'Hủy bỏ buổi hòa nhạc: ''called off''.',
  1,
  7
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_512',
  'quiz_pub_ielts',
  'multiple_choice',
  'The hotel staff apologized for the unexpected delay in ________ our room.',
  NULL,
  '["A. prepare","B. prepared","C. preparing","D. preparation"]',
  'C. preparing',
  'Sau giới từ in dùng V-ing: ''preparing''.',
  1,
  8
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_513',
  'quiz_pub_ielts',
  'multiple_choice',
  'She managed to solve the challenging crossword puzzle entirely on her ________.',
  NULL,
  '["A. self","B. single","C. alone","D. own"]',
  'D. own',
  'Cụm tự mình làm không cần trợ giúp: ''on her own''.',
  1,
  9
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_514',
  'quiz_pub_ielts',
  'multiple_choice',
  'Governments should allocate substantial funding to ________ medical research on infectious diseases.',
  NULL,
  '["A. expedite","B. slow","C. delay","D. hinder"]',
  'A. expedite',
  'Thúc đẩy nhanh tiến độ nghiên cứu: ''expedite medical research''.',
  1,
  10
);
INSERT OR IGNORE INTO quiz_questions (
  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order
) VALUES (
  'qq_quiz_pub_ielts_qb_515',
  'quiz_pub_ielts',
  'multiple_choice',
  'Deforestation contributes significantly to biodiversity loss, thereby ________ vulnerable wildlife populations.',
  NULL,
  '["A. safe","B. jeopardizing","C. securing","D. nurturing"]',
  'B. jeopardizing',
  'Đe dọa, đặt vào vòng hiểm nguy: ''jeopardizing vulnerable populations''.',
  1,
  11
);

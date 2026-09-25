import json
import os
import sys
import sqlite3

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
LIB_DATA_DIR = os.path.join(BASE_DIR, 'src', 'lib', 'data')
DB_PATH = os.path.join(DATA_DIR, 'tienganh7.db')

exams_path = os.path.join(LIB_DATA_DIR, 'exams.json')
questions_path = os.path.join(LIB_DATA_DIR, 'questions.json')

with open(exams_path, 'r', encoding='utf-8') as f:
    exams = json.load(f)

with open(questions_path, 'r', encoding='utf-8') as f:
    questions = json.load(f)

max_q_id = max([int(q.get('id', 0)) for q in questions if str(q.get('id', '')).isdigit()] or [0])

intl_exams = [
    {
        "id": "ex_ket_quick_15m",
        "curriculum_id": "curr_ket",
        "title": "Kiểm Tra 15 Phút: Đọc Hiểu & Giao Tiếp Cambridge KET (A2)",
        "description": "Kiểm tra 15 phút: Đọc hiểu các đoạn tin nhắn ngắn, biển báo thông tin và câu hỏi giao tiếp đời sống thường nhật chuẩn KET A2.",
        "grade": 0,
        "format_type": "quick_15m",
        "skill_category": "reading",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 65,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Notice: 'Swimming pool closed for water treatment from 1:00 PM to 3:00 PM.' What is true?", ["A. You cannot swim between 1:00 PM and 3:00 PM.", "B. The pool is open all day.", "C. The pool is closed at night.", "D. Swimming is free today."], "A", "Hồ bơi đóng cửa xử lý nước từ 1h đến 3h chiều -> không được bơi trong khoảng thời gian này.", "KET_A2", "reading"),
            ("Sign on bus door: 'Have exact change ready before boarding.' What does the driver want?", ["A. Passengers to prepare the correct coins or notes in advance.", "B. Passengers to pay after arriving.", "C. Passengers to buy bus tickets online.", "D. Passengers to travel for free."], "A", "'Exact change' nghĩa là chuẩn bị sẵn tiền lẻ đúng số tiền vé trước khi lên xe.", "KET_A2", "reading"),
            ("What time does the film start? -> ________ 7:30 PM.", ["A. At", "B. In", "C. On", "D. For"], "A", "Giờ giấc đi với giới từ 'At'.", "KET_A2", "grammar"),
            ("I can't go cycling today because my bicycle tire is ________.", ["A. flat", "B. heavy", "C. sharp", "D. sweet"], "A", "Lốp xe đạp bị xẹp/thủng: 'flat tire'.", "KET_A2", "vocabulary"),
            ("Could you please tell me the way to the railway station? -> ________", ["A. Turn right at the traffic lights, it's opposite the post office.", "B. Yes, I do.", "C. No, I am fine.", "D. It is five dollars."], "A", "Chỉ đường lịch sự trong giao tiếp tiếng Anh KET.", "KET_A2", "communication"),
            ("She is really looking forward to ________ her pen pal in London this summer.", ["A. meeting", "B. meet", "C. met", "D. to meet"], "A", "Cấu trúc look forward to + V-ing: 'meeting'.", "KET_A2", "grammar"),
            ("We didn't go on a picnic yesterday ________ the heavy downpour.", ["A. because of", "B. because", "C. although", "D. despite of"], "A", "Because of + cụm danh từ 'the heavy downpour'.", "KET_A2", "grammar"),
            ("Excuse me, how much is this souvenir postcard? -> ________", ["A. It's one pound fifty.", "B. It's blue.", "C. It's on the table.", "D. It's very tall."], "A", "Hỏi giá tiền: 'It's one pound fifty.'", "KET_A2", "communication"),
            ("My brother is fond of ________ old postage stamps and coins.", ["A. collecting", "B. collect", "C. collected", "D. collects"], "A", "Sau cụm tính từ fond of dùng V-ing: 'collecting'.", "KET_A2", "grammar"),
            ("What would you like for dessert? -> A slice of chocolate ________, please.", ["A. cake", "B. meat", "C. soup", "D. rice"], "A", "Món tráng miệng là bánh socola -> 'cake'.", "KET_A2", "vocabulary")
        ]
    },
    {
        "id": "ex_ket_standard_45m",
        "curriculum_id": "curr_ket",
        "title": "Đề Thi Thử Cambridge KET A2 Reading & Writing 45 Phút",
        "description": "Đề thi thử 45 phút định dạng Cambridge A2 Key (KET): Đọc hiểu biển báo, điền từ vào chỗ trống, trắc nghiệm từ vựng và viết câu tương đương.",
        "grade": 0,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Notice in computer lab: 'Do not eat or drink near keyboards.' Why?", ["A. To protect computer equipment from liquid damage.", "B. Keyboards are made of food.", "C. Food is sold in the lab.", "D. Students must eat quickly."], "A", "Bảo vệ bàn phím máy tính khỏi bị đổ nước làm hỏng.", "KET_A2", "reading"),
            ("Sign in museum: 'Photography permitted without flash.' What can visitors do?", ["A. Take photos without using flash.", "B. Take photos with bright flash only.", "C. No cameras allowed at all.", "D. Buy pictures from the gift shop."], "A", "Được phép chụp ảnh nhưng không được dùng đèn flash.", "KET_A2", "reading"),
            ("He ________ English since he was six years old.", ["A. has studied", "B. studied", "C. studies", "D. is studying"], "A", "Dấu hiệu 'since he was six' dùng thì hiện tại hoàn thành: 'has studied'.", "KET_A2", "grammar"),
            ("The weather was warm and sunny, ________ we spent the entire afternoon at the beach.", ["A. so", "B. but", "C. because", "D. although"], "A", "Liên từ chỉ kết quả: 'so' (vì vậy).", "KET_A2", "grammar"),
            ("If it ________ tomorrow, we will stay indoors and play board games.", ["A. rains", "B. will rain", "C. rained", "D. rain"], "A", "Câu điều kiện loại 1: If + hiện tại đơn ngôi thứ 3 số ít: 'rains'.", "KET_A2", "grammar"),
            ("Rewrite test: 'This suitcase is too heavy for me to lift.' -> 'This suitcase isn't...'", ["A. light enough for me to lift.", "B. heavy enough for me to lift.", "C. so light for me to lift.", "D. too light for me to lift."], "A", "Biến đổi cấu trúc: too adj to V -> not adj enough to V.", "KET_A2", "grammar"),
            ("The novel was written ________ a famous young author from Scotland.", ["A. by", "B. with", "C. at", "D. from"], "A", "Câu bị động tác nhân con người: 'written by'.", "KET_A2", "grammar"),
            ("Have you ever ________ to Singapore? -> Yes, twice.", ["A. been", "B. gone", "C. went", "D. be"], "A", "Từng đến đâu rồi trở về: 'Have you ever been to...'.", "KET_A2", "grammar"),
            ("Can I try this shirt on? -> Yes, the changing rooms are over ________.", ["A. there", "B. their", "C. they're", "D. here it"], "A", "Phòng thay đồ ở đằng kia: 'over there'.", "KET_A2", "vocabulary"),
            ("She is much ________ at mathematics than her twin brother.", ["A. better", "B. good", "C. best", "D. more good"], "A", "So sánh hơn của good là 'better than'.", "KET_A2", "grammar"),
            ("You ________ touch that hot stove; you will burn your fingers!", ["A. mustn't", "B. needn't", "C. should", "D. can"], "A", "Cấm chỉ đoán tai nạn nguy hiểm: 'mustn't'.", "KET_A2", "grammar"),
            ("The doctor advised him to take regular exercise and drink plenty of ________.", ["A. water", "B. soda", "C. coffee", "D. wine"], "A", "Uống nhiều nước lọc tốt cho sức khỏe: 'water'.", "KET_A2", "vocabulary"),
            ("There are thirty students in our class, ________ of whom are girls.", ["A. half", "B. two", "C. double", "D. piece"], "A", "Một nửa trong số đó là học sinh nữ: 'half of whom'.", "KET_A2", "grammar"),
            ("Rewrite test: 'I haven't seen Linda for five months.' -> 'The last time I saw Linda was...'", ["A. five months ago.", "B. since five months.", "C. for five months.", "D. in five months ago."], "A", "Chuyển từ hiện tại hoàn thành phủ định sang 'The last time... was... ago'.", "KET_A2", "grammar"),
            ("Would you like a cup of green tea? -> ________, I'd prefer a glass of cold water.", ["A. No, thank you", "B. Yes, please", "C. Sure, why not", "D. Of course"], "A", "Từ chối lời mời lịch sự: 'No, thank you'.", "KET_A2", "communication")
        ]
    },
    {
        "id": "ex_pet_standard_45m",
        "curriculum_id": "curr_pet",
        "title": "Đề Thi Thử Cambridge PET B1 Reading & Writing 45 Phút",
        "description": "Đề thi thử chuẩn cấu trúc B1 Preliminary (PET): Đọc hiểu văn bản dài, điền từ vào chỗ trống (cloze test), viết lại câu biến đổi và từ vựng B1.",
        "grade": 0,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("The university library has a vast collection of academic journals ________ to all enrolled students.", ["A. accessible", "B. access", "C. accessed", "D. accessibility"], "A", "Tính từ 'accessible to' (có thể tiếp cận được đối với).", "PET_B1", "vocabulary"),
            ("If you hadn't reminded me, I ________ forgotten all about the deadline.", ["A. would have", "B. will have", "C. had", "D. would"], "A", "Điều kiện loại 3: If + S + had V3, S + would have + V3.", "PET_B1", "grammar"),
            ("The newly appointed manager decided to ________ changes to the shift schedule.", ["A. introduce", "B. do", "C. take", "D. make up"], "A", "Đưa ra/áp dụng các thay đổi: 'introduce changes'.", "PET_B1", "vocabulary"),
            ("Although she was nervous before the presentation, she ________ it off successfully.", ["A. carried", "B. made", "C. did", "D. brought"], "A", "Cụm thành công vượt qua thử thách khó khăn: 'carry it off'.", "PET_B1", "vocabulary"),
            ("The ancient ruins attracted archaeological experts from all ________ the globe.", ["A. over", "B. across", "C. around", "D. through"], "A", "Cụm 'all over the globe' (khắp toàn cầu).", "PET_B1", "vocabulary"),
            ("Rewrite test: 'They are building a modern sports complex near the university.' -> 'A modern sports complex...'", ["A. is being built near the university.", "B. was built near the university.", "C. is built near the university.", "D. has built near the university."], "A", "Bị động thì hiện tại tiếp diễn: 'is being built'.", "PET_B1", "grammar"),
            ("We should make sure to set off early to avoid getting stuck in the morning rush ________.", ["A. hour", "B. time", "C. period", "D. minute"], "A", "Giờ cao điểm giao thông: 'rush hour'.", "PET_B1", "vocabulary"),
            ("The teacher encouraged her pupils ________ actively in group discussions.", ["A. to participate", "B. participate", "C. participating", "D. participated"], "A", "Cấu trúc encourage someone to V: 'to participate'.", "PET_B1", "grammar"),
            ("Rewrite test: 'I suggest taking a taxi because it's pouring outside.' -> 'Why don't we...'", ["A. take a taxi because it's pouring outside?", "B. taking a taxi because it's pouring outside?", "C. to take a taxi because it's pouring outside?", "D. took a taxi because it's pouring outside?"], "A", "Biến đổi cấu trúc gợi ý: suggest V-ing -> Why don't we + V nguyên mẫu?", "PET_B1", "grammar"),
            ("Unless emergency repairs are carried ________ promptly, the bridge may collapse.", ["A. out", "B. on", "C. off", "D. in"], "A", "Tiến hành thực hiện sửa chữa: 'carried out'.", "PET_B1", "vocabulary"),
            ("The committee consists ________ ten distinguished professors in education.", ["A. of", "B. in", "C. with", "D. for"], "A", "Bao gồm, gồm có: 'consist of'.", "PET_B1", "grammar"),
            ("He apologized to his colleagues ________ having missed the quarterly briefing.", ["A. for", "B. about", "C. with", "D. on"], "A", "Xin lỗi vì điều gì: 'apologize for + V-ing'.", "PET_B1", "grammar"),
            ("The novel was so thrilling that she finished reading it in a single ________.", ["A. sitting", "B. standing", "C. lying", "D. staying"], "A", "Đọc liền một mạch: 'in a single sitting'.", "PET_B1", "vocabulary"),
            ("Rewrite test: 'Nobody in my class speaks Spanish better than Maria.' -> 'Maria speaks Spanish...'", ["A. the best in my class.", "B. better than anyone in my class.", "C. as well as nobody in my class.", "D. good in my class."], "A", "So sánh nhất chuyển từ so sánh hơn phủ định.", "PET_B1", "grammar"),
            ("I really appreciate your helping hand during the school festival! -> ________", ["A. It was my pleasure, anytime!", "B. No thanks.", "C. Yes, please.", "D. Never mind."], "A", "Đáp lại lời cảm ơn một cách thân thiện, nhiệt tình.", "PET_B1", "communication")
        ]
    },
    {
        "id": "ex_ielts_standard_45m",
        "curriculum_id": "curr_ielts",
        "title": "Đề Thi Thử IELTS Academic Reading & Lexicon 45 Phút",
        "description": "Đề thi thử 45 phút định dạng IELTS Academic: Bài đọc học thuật khoa học môi trường, dạng bài True/False/Not Given, Heading Matching và Academic Collocations Band 7.5+.",
        "grade": 0,
        "format_type": "standard_45m",
        "skill_category": "reading",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Passage statement: 'Solar installations expanded by 45% in 2024.' Question: Solar energy saw unprecedented growth recently. -> ________", ["A. TRUE", "B. FALSE", "C. NOT GIVEN", "D. NONE"], "A", "Đoạn văn xác nhận mức tăng 45% chứng minh sự phát triển chưa từng có -> TRUE.", "IELTS_7", "reading"),
            ("Passage statement: 'The researchers examined 50 coral species.' Question: All coral species will recover within a decade. -> ________", ["A. NOT GIVEN", "B. TRUE", "C. FALSE", "D. NONE"], "A", "Bài viết không hề khẳng định toàn bộ loài san hô sẽ phục hồi trong 10 năm -> NOT GIVEN.", "IELTS_7", "reading"),
            ("The policy was introduced with the overarching aim of ________ socio-economic disparities.", ["A. mitigating", "B. increasing", "C. aggravating", "D. celebrating"], "A", "Giảm thiểu, làm nhẹ bớt sự chênh lệch kinh tế xã hội: 'mitigating disparities'.", "IELTS_7", "vocabulary"),
            ("The empirical findings corroborate the initial hypothesis. -> 'Corroborate' is CLOSEST in meaning to: ________", ["A. confirm", "B. contradict", "C. dismiss", "D. reject"], "A", "'corroborate' đồng nghĩa với 'confirm' (chứng thực, củng cố tính đúng đắn).", "IELTS_7", "vocabulary"),
            ("Industrial effluent discharged into marine ecosystems poses a ________ threat to aquatic organisms.", ["A. grave", "B. minor", "C. pleasant", "D. gentle"], "A", "Mối đe dọa nghiêm trọng: 'grave threat'.", "IELTS_7", "vocabulary"),
            ("Governments must impose stringent regulations to curb the rampant ________ of natural resources.", ["A. depletion", "B. creation", "C. generation", "D. production"], "A", "Sự suy kiệt cạn kiệt tài nguyên thiên nhiên: 'depletion'.", "IELTS_7", "vocabulary"),
            ("The sudden influx of tourists placed an unsustainable strain ________ the island's fragile infrastructure.", ["A. on", "B. in", "C. at", "D. with"], "A", "Gây áp lực nặng nề lên điều gì: 'place a strain on'.", "IELTS_7", "grammar"),
            ("Not only ________ carbon emissions, but electric vehicles also significantly reduce noise pollution.", ["A. do they diminish", "B. they diminish", "C. they do diminish", "D. did they diminish"], "A", "Đảo ngữ với 'Not only': trợ động từ 'do' + they + V nguyên mẫu.", "IELTS_7", "grammar"),
            ("The author's tone throughout the academic treatise can best be described as ________.", ["A. objective and analytical", "B. sarcastic and cynical", "C. emotional and biassed", "D. indifferent"], "A", "Văn phong học thuật chuẩn mực luôn khách quan và mang tính phân tích: 'objective and analytical'.", "IELTS_7", "reading"),
            ("Urbanisation has precipitated an unprecedented surge in demand for affordable ________.", ["A. housing", "B. house", "C. housed", "D. houser"], "A", "Nhà ở giá cả phải chăng: 'affordable housing'.", "IELTS_7", "vocabulary"),
            ("The new vaccine demonstrated exceptional efficacy in ________ clinical trials.", ["A. rigorous", "B. careless", "C. superficial", "D. randomless"], "A", "Các thử nghiệm lâm sàng nghiêm ngặt chặt chẽ: 'rigorous clinical trials'.", "IELTS_7", "vocabulary"),
            ("Had the regulatory authorities acted with greater urgency, the ecological catastrophe ________ averted.", ["A. might have been", "B. might be", "C. was", "D. will be"], "A", "Đảo ngữ câu điều kiện loại 3 dạng bị động: 'might have been averted'.", "IELTS_7", "grammar"),
            ("Academic writing requires students to synthesise diverse perspectives and avoid ________ reasoning.", ["A. fallacious", "B. logical", "C. sound", "D. coherent"], "A", "Lập luận ngụy biện, sai lệch: 'fallacious reasoning'.", "IELTS_7", "vocabulary"),
            ("The ubiquitous presence of microplastics in drinking water warrants urgent international ________.", ["A. intervention", "B. neglect", "C. disregard", "D. hesitation"], "A", "Đòi hỏi sự can thiệp cấp thiết quốc tế: 'international intervention'.", "IELTS_7", "vocabulary"),
            ("To recapitulate, addressing climate change necessitates a paradigm ________ in global energy consumption.", ["A. shift", "B. move", "C. turn", "D. step"], "A", "Sự thay đổi căn bản trong nhận thức và phương thức (bước chuyển hình thái): 'paradigm shift'.", "IELTS_7", "vocabulary")
        ]
    }
]

for item in intl_exams:
    ex_id = item['id']
    q_list = item.pop('questions', [])
    existing = next((e for e in exams if e['id'] == ex_id), None)
    if existing:
        existing.update({
            "title": item['title'],
            "description": item['description'],
            "duration_minutes": item['duration_minutes'],
            "format_type": item['format_type'],
            "total_questions": len(q_list),
            "grade": item['grade']
        })
    else:
        exams.append({
            "id": item['id'],
            "curriculum_id": item['curriculum_id'],
            "title": item['title'],
            "description": item['description'],
            "grade": item['grade'],
            "format_type": item['format_type'],
            "skill_category": item['skill_category'],
            "duration_minutes": item['duration_minutes'],
            "total_questions": len(q_list),
            "pass_percentage": item['pass_percentage'],
            "created_by": item['created_by'],
            "is_published": 1,
            "created_at": "2026-09-25 05:40:00"
        })

    questions = [q for q in questions if q.get('exam_id') != ex_id]
    for idx, (prompt, options, correct, expl, level, skill) in enumerate(q_list, start=1):
        max_q_id += 1
        questions.append({
            "exam_id": ex_id,
            "question_index": idx,
            "grade": item['grade'],
            "skill": skill,
            "type": "multiple_choice",
            "prompt": prompt,
            "options_json": json.dumps(options, ensure_ascii=False),
            "correct_answer": correct,
            "explanation": expl,
            "cambridge_level": level,
            "id": max_q_id
        })

with open(exams_path, 'w', encoding='utf-8') as f:
    json.dump(exams, f, ensure_ascii=False, indent=2)

with open(questions_path, 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

# Sync SQLite
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

for e in exams:
    cursor.execute("SELECT id FROM exams WHERE id = ?", (e['id'],))
    row = cursor.fetchone()
    if row:
        cursor.execute("""
            UPDATE exams SET
                title = ?, description = ?, grade = ?, format_type = ?,
                skill_category = ?, duration_minutes = ?, total_questions = ?,
                pass_percentage = ?, created_by = ?, is_published = ?
            WHERE id = ?
        """, (
            e['title'], e['description'], e['grade'], e['format_type'],
            e.get('skill_category', 'mixed'), e['duration_minutes'], e['total_questions'],
            e.get('pass_percentage', 70), e.get('created_by', 'Teacher'), e.get('is_published', 1),
            e['id']
        ))
    else:
        cursor.execute("""
            INSERT INTO exams (
                id, curriculum_id, title, description, grade, format_type,
                skill_category, duration_minutes, total_questions, pass_percentage,
                created_by, is_published, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            e['id'], e.get('curriculum_id', 'curr_general'), e['title'], e['description'],
            e['grade'], e['format_type'], e.get('skill_category', 'mixed'), e['duration_minutes'],
            e['total_questions'], e.get('pass_percentage', 70), e.get('created_by', 'Teacher'),
            e.get('is_published', 1), e.get('created_at', '2026-09-25 05:40:00')
        ))

cursor.execute("DELETE FROM exam_questions")
for idx, q in enumerate(questions, start=1):
    q['id'] = idx
    cursor.execute("""
        INSERT INTO exam_questions (
            id, exam_id, question_index, grade, skill, type,
            prompt, options_json, correct_answer, explanation, cambridge_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        idx, q.get('exam_id', ''), q.get('question_index', 1),
        int(q.get('grade', 0)), str(q.get('skill', 'grammar_vocab')), str(q.get('type', 'multiple_choice')),
        q.get('prompt', ''), q.get('options_json', '[]'),
        q.get('correct_answer', 'A'), q.get('explanation', ''),
        q.get('cambridge_level', 'KET_A2')
    ))

conn.commit()

cursor.execute("SELECT COUNT(*) FROM exams")
sq_exams = cursor.fetchone()[0]
cursor.execute("SELECT COUNT(*) FROM exam_questions")
sq_q = cursor.fetchone()[0]

print(f"--> Done: Total exams: {len(exams)} (SQLite: {sq_exams})")
print(f"--> Done: Total questions: {len(questions)} (SQLite: {sq_q})")
conn.close()

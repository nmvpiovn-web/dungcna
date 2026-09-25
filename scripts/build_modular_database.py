import sqlite3
import json
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("=== STARTING MODULAR DATABASE BUILD & PARTITIONING ===")

# 1. Load Existing Data
def load_json(path):
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

existing_words = load_json('src/lib/data/words.json')
existing_units = load_json('src/lib/data/units.json')
existing_cambridge = load_json('src/lib/data/cambridge_vocabulary.json')
existing_curricula = load_json('src/lib/data/curricula.json')
existing_exams = load_json('src/lib/data/exams.json')
existing_questions = load_json('src/lib/data/questions.json')

print(f"Loaded existing: {len(existing_words)} words, {len(existing_units)} units, {len(existing_exams)} exams, {len(existing_questions)} questions.")

# 2. Enrich Vocabulary Database (Vocabulary DB)
# Adding words from GDPT Grade 3, 4, 5, 7, 11, 12, KET, and IELTS
new_words_list = list(existing_words)

# Helper to check if word exists
existing_terms = {w['term'].lower().strip() for w in new_words_list}

additional_vocab = [
    # Grade 3-5 Primary Vocabulary
    {
        "term": "school bag",
        "ipa": "/ˈskuːl bæɡ/",
        "pos": "noun",
        "meaning_vi": "cặp sách, ba lô đi học",
        "vowels_detail": "Nguyên âm dài /uː/ trong 'school', nguyên âm ngắn /æ/ trong 'bag'.",
        "consonants_detail": "Phụ âm đầu /sk/, phụ âm cuối /l/ và /ɡ/ hữu thanh.",
        "phonics_note": "Trọng âm rơi vào từ đầu: SCHOOL bag.",
        "syllables": "school bag (2 âm tiết)",
        "example_en": "I put my new English book into my school bag.",
        "example_vi": "Em để quyển sách tiếng Anh mới vào cặp sách của mình.",
        "unit_id": "unit_g3_school",
        "grade": "Lớp 3",
        "cambridge_level": "STARTERS",
        "difficulty": "easy",
        "category": "school"
    },
    {
        "term": "pencil case",
        "ipa": "/ˈpensl keɪs/",
        "pos": "noun",
        "meaning_vi": "hộp bút, túi đựng bút",
        "vowels_detail": "Nguyên âm ngắn /e/ trong 'pencil', nguyên âm đôi /eɪ/ trong 'case'.",
        "consonants_detail": "Phụ âm bật hơi /p/, phụ âm xát /s/ ở cuối 'case'.",
        "phonics_note": "Trọng âm rơi vào âm tiết đầu tiên của 'pencil': PEN-cil case.",
        "syllables": "pen-cil case (3 âm tiết)",
        "example_en": "My pencil case has three blue pens and an eraser.",
        "example_vi": "Hộp bút của em có 3 cây bút bi xanh và một cục tẩy.",
        "unit_id": "unit_g3_school",
        "grade": "Lớp 3",
        "cambridge_level": "STARTERS",
        "difficulty": "easy",
        "category": "school"
    },
    {
        "term": "computer room",
        "ipa": "/kəmˈpjuːtə ruːm/",
        "pos": "noun",
        "meaning_vi": "phòng máy tính, phòng tin học",
        "vowels_detail": "Nguyên âm yếu /ə/, nguyên âm dài /uː/ trong 'pu' và 'room'.",
        "consonants_detail": "Âm bán nguyên âm /j/ trong /pjuː/, phụ âm môi /m/.",
        "phonics_note": "Trọng âm từ 'computer' rơi vào âm 2: com-PU-ter room.",
        "syllables": "com-pu-ter room (4 âm tiết)",
        "example_en": "We study IT in the computer room on Thursday.",
        "example_vi": "Chúng em học môn Tin học ở phòng máy tính vào thứ Năm.",
        "unit_id": "unit_g3_school",
        "grade": "Lớp 3",
        "cambridge_level": "STARTERS",
        "difficulty": "easy",
        "category": "school"
    },
    # Grade 7 Vocabulary (From De Cuong HK1)
    {
        "term": "community service",
        "ipa": "/kəˌmjuːnəti ˈsɜːvɪs/",
        "pos": "noun",
        "meaning_vi": "lao động công ích, dịch vụ vì cộng đồng",
        "vowels_detail": "Nguyên âm yếu /ə/, nguyên âm dài /uː/, nguyên âm dài /ɜː/ trong 'service'.",
        "consonants_detail": "Phụ âm xát /s/, phụ âm vô thanh /t/ và răng môi /v/.",
        "phonics_note": "Trọng âm chính ở âm 1 của 'service': community SER-vice.",
        "syllables": "com-mu-ni-ty ser-vice (6 âm tiết)",
        "example_en": "Students do community service by cleaning up local parks.",
        "example_vi": "Học sinh tham gia lao động công ích bằng việc dọn dẹp các công viên địa phương.",
        "unit_id": "unit3",
        "grade": "Lớp 7",
        "cambridge_level": "KET_A2",
        "difficulty": "medium",
        "category": "community"
    },
    {
        "term": "volunteer",
        "ipa": "/ˌvɒlənˈtɪər/",
        "pos": "verb",
        "meaning_vi": "tình nguyện, xung phong làm việc thiện nguyện",
        "vowels_detail": "Nguyên âm ngắn /ɒ/, nguyên âm yếu /ə/, nguyên âm đôi /ɪə/ mang trọng âm.",
        "consonants_detail": "Phụ âm răng môi /v/, phụ âm bên /l/, phụ âm mũi /n/.",
        "phonics_note": "Trọng âm rơi vào âm tiết thứ 3: vol-un-TEER.",
        "syllables": "vol-un-teer (3 âm tiết)",
        "example_en": "Many young people volunteer to teach English to street children.",
        "example_vi": "Nhiều bạn trẻ tình nguyện dạy tiếng Anh cho trẻ em cơ nhỡ.",
        "unit_id": "unit3",
        "grade": "Lớp 7",
        "cambridge_level": "KET_A2",
        "difficulty": "medium",
        "category": "community"
    },
    {
        "term": "sunburn",
        "ipa": "/ˈsʌnbɜːn/",
        "pos": "noun",
        "meaning_vi": "vết cháy nắng, sự rám nắng rát da",
        "vowels_detail": "Nguyên âm ngắn /ʌ/ trong 'sun', nguyên âm dài /ɜː/ trong 'burn'.",
        "consonants_detail": "Phụ âm xát /s/, phụ âm mũi /n/, phụ âm môi /b/.",
        "phonics_note": "Trọng âm rơi vào âm tiết thứ nhất: SUN-burn.",
        "syllables": "sun-burn (2 âm tiết)",
        "example_en": "Wear sunscreen to protect your skin from painful sunburn.",
        "example_vi": "Hãy thoa kem chống nắng để bảo vệ làn da khỏi bị cháy nắng rát buốt.",
        "unit_id": "unit2",
        "grade": "Lớp 7",
        "cambridge_level": "KET_A2",
        "difficulty": "easy",
        "category": "health"
    },
    {
        "term": "acne",
        "ipa": "/ˈækni/",
        "pos": "noun",
        "meaning_vi": "mụn trứng cá (vấn đề da liễu tuổi dậy thì)",
        "vowels_detail": "Nguyên âm bẹt ngắn /æ/ ở đầu, nguyên âm ngắn /i/ ở cuối.",
        "consonants_detail": "Phụ âm ngạc mềm vô thanh /k/, phụ âm mũi /n/.",
        "phonics_note": "Trọng âm rơi vào âm tiết thứ nhất: AC-ne.",
        "syllables": "ac-ne (2 âm tiết)",
        "example_en": "Washing your face twice daily helps prevent acne.",
        "example_vi": "Rửa mặt hai lần mỗi ngày giúp ngăn ngừa mụn trứng cá.",
        "unit_id": "unit2",
        "grade": "Lớp 7",
        "cambridge_level": "KET_A2",
        "difficulty": "medium",
        "category": "health"
    },
    # Grade 11-12 Advanced Vocabulary (From Unit 3 Cities of the Future)
    {
        "term": "pedestrian zone",
        "ipa": "/pəˈdestriən zəʊn/",
        "pos": "noun",
        "meaning_vi": "khu phố đi bộ, tuyến đường cấm xe cơ giới",
        "vowels_detail": "Nguyên âm yếu /ə/, nguyên âm ngắn /e/, nguyên âm đôi /əʊ/ trong 'zone'.",
        "consonants_detail": "Phụ âm tắc /p/, /d/, phụ âm xát hữu thanh /z/.",
        "phonics_note": "Trọng âm của 'pedestrian' rơi vào âm 2: pe-DES-tri-an zone.",
        "syllables": "pe-des-tri-an zone (5 âm tiết)",
        "example_en": "The city center has transformed into a vibrant pedestrian zone.",
        "example_vi": "Trung tâm thành phố đã chuyển đổi thành khu phố đi bộ sôi động.",
        "unit_id": "unit_g11_u3",
        "grade": "Lớp 11",
        "cambridge_level": "PET_B1",
        "difficulty": "medium",
        "category": "urban_life"
    },
    {
        "term": "carbon footprint",
        "ipa": "/ˌkɑːbən ˈfʊtprɪnt/",
        "pos": "noun",
        "meaning_vi": "dấu chân carbon (lượng khí thải nhà kính cá nhân/đô thị)",
        "vowels_detail": "Nguyên âm dài /ɑː/ trong 'carbon', nguyên âm ngắn /ʊ/ và /ɪ/ trong 'footprint'.",
        "consonants_detail": "Cụm phụ âm /pr/, phụ âm vô thanh /t/.",
        "phonics_note": "Trọng âm chính rơi vào từ thứ hai: carbon FOOT-print.",
        "syllables": "car-bon foot-print (4 âm tiết)",
        "example_en": "Using solar power drastically reduces our household carbon footprint.",
        "example_vi": "Sử dụng năng lượng mặt trời giúp giảm đáng kể dấu chân carbon của gia đình chúng ta.",
        "unit_id": "unit_g11_u3",
        "grade": "Lớp 11",
        "cambridge_level": "FCE_B2",
        "difficulty": "hard",
        "category": "environment"
    },
    {
        "term": "infrastructure",
        "ipa": "/ˈɪnfrəstrʌktʃər/",
        "pos": "noun",
        "meaning_vi": "cơ sở hạ tầng (đường xá, cầu cống, mạng lưới điện viễn thông)",
        "vowels_detail": "Nguyên âm ngắn /ɪ/, nguyên âm yếu /ə/, nguyên âm ngắn /ʌ/.",
        "consonants_detail": "Cụm phụ âm phức /nfr/, /str/, âm vô thanh /tʃ/.",
        "phonics_note": "Trọng âm chính rơi vào âm tiết đầu tiên: IN-fra-struc-ture.",
        "syllables": "in-fra-struc-ture (4 âm tiết)",
        "example_en": "The government is investing heavily in modern green transport infrastructure.",
        "example_vi": "Chính phủ đang đầu tư mạnh mẽ vào cơ sở hạ tầng giao thông xanh hiện đại.",
        "unit_id": "unit_g11_u3",
        "grade": "Lớp 11",
        "cambridge_level": "FCE_B2",
        "difficulty": "hard",
        "category": "technology"
    },
    {
        "term": "sustainable",
        "ipa": "/səˈsteɪnəbl/",
        "pos": "adjective",
        "meaning_vi": "bền vững, thân thiện với môi trường và có thể duy trì lâu dài",
        "vowels_detail": "Nguyên âm yếu /ə/, nguyên âm đôi /eɪ/ mang trọng âm chính.",
        "consonants_detail": "Phụ âm xát /s/, phụ âm tắc /t/, phụ âm bên /l/.",
        "phonics_note": "Trọng âm rơi vào âm tiết thứ hai: sus-TAIN-a-ble.",
        "syllables": "sus-tain-a-ble (4 âm tiết)",
        "example_en": "Future smart cities rely on sustainable renewable energy sources.",
        "example_vi": "Các thành phố thông minh tương lai phụ thuộc vào các nguồn năng lượng bền vững và tái tạo.",
        "unit_id": "unit_g11_u3",
        "grade": "Lớp 11",
        "cambridge_level": "IELTS_7",
        "difficulty": "hard",
        "category": "environment"
    },
    {
        "term": "liveable",
        "ipa": "/ˈlɪvəbl/",
        "pos": "adjective",
        "meaning_vi": "đáng sống, tiện nghi và chất lượng sống cao",
        "vowels_detail": "Nguyên âm ngắn /ɪ/ mang trọng âm, nguyên âm yếu /ə/.",
        "consonants_detail": "Phụ âm răng môi hữu thanh /v/, phụ âm bên /l/.",
        "phonics_note": "Trọng âm rơi vào âm tiết thứ nhất: LIV-a-ble.",
        "syllables": "liv-a-ble (3 âm tiết)",
        "example_en": "Da Nang is celebrated as one of the most liveable cities in Vietnam.",
        "example_vi": "Đà Nẵng được tôn vinh là một trong những thành phố đáng sống nhất Việt Nam.",
        "unit_id": "unit_g11_u3",
        "grade": "Lớp 11",
        "cambridge_level": "PET_B1",
        "difficulty": "medium",
        "category": "urban_life"
    }
]

for w in additional_vocab:
    if w['term'].lower().strip() not in existing_terms:
        w['id'] = len(new_words_list) + 1
        new_words_list.append(w)
        existing_terms.add(w['term'].lower().strip())

# Normalize all words with grade and cambridge_level
for w in new_words_list:
    if not w.get('grade'):
        u = w.get('unit_id', '')
        if 'g3' in u:
            w['grade'] = 'Lớp 3'
        elif 'g4' in u:
            w['grade'] = 'Lớp 4'
        elif 'g5' in u:
            w['grade'] = 'Lớp 5'
        elif 'g11' in u:
            w['grade'] = 'Lớp 11'
        elif 'g12' in u:
            w['grade'] = 'Lớp 12'
        else:
            w['grade'] = 'Lớp 7'
    if not w.get('cambridge_level'):
        w['cambridge_level'] = 'KET_A2'
    if not w.get('phonics_note'):
        w['phonics_note'] = f"Trọng âm chính rơi vào âm tiết đầu tiên của từ '{w['term']}'."

print(f"Total vocabulary after enrichment: {len(new_words_list)} words.")

# Save to dedicated vocabulary db
with open('src/lib/data/vocabulary_db.json', 'w', encoding='utf-8') as f:
    json.dump(new_words_list, f, ensure_ascii=False, indent=2)
with open('src/lib/data/words.json', 'w', encoding='utf-8') as f:
    json.dump(new_words_list, f, ensure_ascii=False, indent=2)
print("Saved src/lib/data/vocabulary_db.json and updated words.json")

# 3. Create Grammar Database (Grammar DB)
grammar_db = [
    {
        "id": "gram_present_simple",
        "topic": "Hiện Tại Đơn (Present Simple Tense)",
        "grade_level": "Lớp 6 - Lớp 7",
        "curriculum_unit": "Unit 1, Unit 2",
        "formula": {
            "affirmative": "S + V(s/es) + O / S + am/is/are + adj/noun",
            "negative": "S + do/does + not + V(bare) / S + am/is/are + not + ...",
            "interrogative": "Do/Does + S + V(bare)? / Am/Is/Are + S + ...?"
        },
        "usage": [
            "Diễn tả thói quen, hành động lặp đi lặp lại hàng ngày (daily routines).",
            "Diễn tả chân lý, sự thật hiển nhiên (scientific facts).",
            "Diễn tả lịch trình tàu xe, thời khóa biểu cố định (timetables)."
        ],
        "signal_words": ["always", "usually", "often", "sometimes", "seldom", "never", "every day", "once a week"],
        "phonics_rules": "Phát âm đuôi -s/es: /s/ sau p, t, k, f, th; /ɪz/ sau s, z, ch, sh, x, ge; /z/ các trường hợp còn lại.",
        "common_mistakes": "Quên thêm -s/es cho chủ ngữ ngôi thứ 3 số ít (He, She, It, Danh từ số ít).",
        "examples": [
            {"en": "She always drinks warm lemon water in the morning.", "vi": "Cô ấy luôn uống nước chanh ấm vào buổi sáng."},
            {"en": "The Earth orbits around the Sun.", "vi": "Trái Đất quay xung quanh Mặt Trời."}
        ]
    },
    {
        "id": "gram_past_simple",
        "topic": "Quá Khứ Đơn (Past Simple Tense)",
        "grade_level": "Lớp 7 - Lớp 8",
        "curriculum_unit": "Unit 3: Community Service",
        "formula": {
            "affirmative": "S + V2/ed + O / S + was/were + adj/noun",
            "negative": "S + did + not + V(bare) / S + was/were + not + ...",
            "interrogative": "Did + S + V(bare)? / Was/Were + S + ...?"
        },
        "usage": [
            "Diễn tả hành động đã xảy ra và kết thúc hoàn toàn trong quá khứ.",
            "Chuỗi hành động liên tiếp xảy ra trong quá khứ."
        ],
        "signal_words": ["yesterday", "ago", "last week", "last month", "in 2020", "when I was young"],
        "phonics_rules": "Quy tắc đuôi -ed: /ɪd/ sau /t/, /d/; /t/ sau p, k, f, s, sh, ch; /d/ các trường hợp còn lại.",
        "common_mistakes": "Vẫn chia động từ thêm -ed khi đã có trợ động từ 'did/didn't' trong câu phủ định hoặc nghi vấn.",
        "examples": [
            {"en": "Last weekend, our class donated warm clothes to orphan children.", "vi": "Cuối tuần trước, lớp chúng em đã quyên góp quần áo ấm cho trẻ em mồ côi."},
            {"en": "They didn't visit Ha Long Bay last summer.", "vi": "Hè năm ngoái họ đã không đi thăm Vịnh Hạ Long."}
        ]
    },
    {
        "id": "gram_used_to",
        "topic": "Cấu trúc 'Used to' Chỉ Thói Quen Quá Khứ",
        "grade_level": "Lớp 7 - Lớp 9",
        "curriculum_unit": "Unit 7: Traffic",
        "formula": {
            "affirmative": "S + used to + V(infinitive)",
            "negative": "S + didn't use to + V(infinitive)",
            "interrogative": "Did + S + use to + V(infinitive)?"
        },
        "usage": [
            "Diễn tả thói quen hoặc trạng thái từng xảy ra thường xuyên trong quá khứ nhưng nay không còn nữa."
        ],
        "signal_words": ["when I was small", "in the past", "no longer", "any more"],
        "phonics_rules": "Phát âm /juːst tuː/ với âm /s/ vô thanh, không phát âm /z/.",
        "common_mistakes": "Nhầm lẫn giữa 'used to + V' (thói quen quá khứ) và 'be/get used to + V-ing' (quen với cái gì ở hiện tại).",
        "examples": [
            {"en": "My father used to ride a bicycle to work when there was no motorbike.", "vi": "Bố tôi từng đạp xe đạp đi làm khi chưa có xe máy."},
            {"en": "Did you use to play hide-and-seek when you were seven?", "vi": "Hồi 7 tuổi bạn có từng hay chơi trốn tìm không?"}
        ]
    },
    {
        "id": "gram_stative_dynamic_verbs",
        "topic": "Động Từ Trạng Thái & Hành Động (Stative vs Dynamic Verbs)",
        "grade_level": "Lớp 11 - Lớp 12 / IELTS",
        "curriculum_unit": "Unit 3: Cities of the Future",
        "formula": {
            "stative": "S + Stative Verb (Không dùng thì tiếp diễn)",
            "dynamic": "S + is/are/was/were + V-ing (Được dùng thì tiếp diễn)"
        },
        "usage": [
            "Động từ trạng thái (know, believe, understand, love, belong, contain) chỉ trạng thái cảm xúc, sở hữu, nhận thức và không dùng ở các thì tiếp diễn (-ing).",
            "Một số động từ có 2 nghĩa: 'think' (nghĩ là = stative; đang cân nhắc = dynamic), 'have' (sở hữu = stative; ăn/uống/trải qua = dynamic)."
        ],
        "signal_words": ["at the moment", "now", "feel", "taste", "smell", "appear"],
        "phonics_rules": "Trọng âm của động từ 2 âm tiết thường rơi vào âm 2: be-LIEVE, un-der-STAND.",
        "common_mistakes": "Dùng 'I am knowing' hoặc 'This house is belonging to me' (SAI). Đúng: 'I know', 'This house belongs to me'.",
        "examples": [
            {"en": "I think smart cities will revolutionize public transportation.", "vi": "Tôi nghĩ rằng các thành phố thông minh sẽ cách mạng hóa giao thông công cộng."},
            {"en": "The architect is thinking about the rooftop garden design.", "vi": "Kiến trúc sư đang suy nghĩ/cân nhắc về thiết kế vườn trên sân thượng."}
        ]
    },
    {
        "id": "gram_conditionals_012",
        "topic": "Câu Điều Kiện Loại 1, 2 và Hỗn Hợp (Conditionals)",
        "grade_level": "Lớp 8 - Lớp 12 / THPT QG",
        "curriculum_unit": "Chuyên đề Ngữ Pháp Trọng Điểm",
        "formula": {
            "type_1": "If + S + V(hiện tại đơn), S + will/can + V(bare)",
            "type_2": "If + S + V2/ed (were), S + would/could + V(bare)",
            "type_3": "If + S + had + V3/ed, S + would have + V3/ed"
        },
        "usage": [
            "Loại 1: Điều kiện có thật hoặc có thể xảy ra ở hiện tại hoặc tương lai.",
            "Loại 2: Giả định trái ngược với thực tế ở hiện tại.",
            "Loại 3: Giả định trái ngược với sự việc đã xảy ra trong quá khứ."
        ],
        "signal_words": ["If", "Unless (= If not)", "Provided that", "As long as"],
        "phonics_rules": "Lên giọng nhẹ ở cuối mệnh đề 'If' và hạ giọng ở mệnh đề chính.",
        "common_mistakes": "Dùng 'was' thay cho 'were' trong câu điều kiện loại 2 trong văn viết học thuật.",
        "examples": [
            {"en": "If we protect the environment, future generations will enjoy clean air.", "vi": "Nếu chúng ta bảo vệ môi trường, các thế hệ tương lai sẽ được tận hưởng không khí trong lành."},
            {"en": "If I were the mayor, I would build more solar cycle paths.", "vi": "Nếu tôi là thị trưởng, tôi sẽ xây dựng thêm nhiều làn đường dành cho xe đạp năng lượng mặt trời."}
        ]
    }
]

with open('src/lib/data/grammar_topics.json', 'w', encoding='utf-8') as f:
    json.dump(grammar_db, f, ensure_ascii=False, indent=2)
print(f"Saved {len(grammar_db)} grammar topics to src/lib/data/grammar_topics.json")

# 4. Create GDPT Curricula Database (GDPT Curricula DB)
gdpt_curricula_db = [
    {
        "grade_id": "g1_5",
        "level_name": "Khối Tiểu Học (Tiếng Anh 1 - 5)",
        "target_audience": "Học sinh 6 - 10 tuổi",
        "cefr_benchmark": "Pre-A1 Starters / A1 Movers / A2 Flyers",
        "core_books": ["Global Success 1-5", "Family and Friends", "Phonics Smart"],
        "grades": [
            {"grade": "Lớp 1", "key_focus": "Làm quen ngữ âm Phonics A-Z, bảng chữ cái, chào hỏi, đồ vật quen thuộc."},
            {"grade": "Lớp 2", "key_focus": "Từ vựng gia đình, màu sắc, số đếm 1-20, câu mệnh lệnh ngắn."},
            {"grade": "Lớp 3", "key_focus": "Học kỳ 1 & 2 Global Success: Trường lớp, bạn bè, đồ dùng học tập, cơ thể."},
            {"grade": "Lớp 4", "key_focus": "Thời gian, nghề nghiệp, động vật, hoạt động hàng ngày, ma trận đề thi chuẩn Bộ."},
            {"grade": "Lớp 5", "key_focus": "Thói quen, quê hương, địa điểm du lịch, thì quá khứ đơn cơ bản, chuẩn bị chuyển cấp."}
        ]
    },
    {
        "grade_id": "g6_9",
        "level_name": "Khối Trung Học Cơ Sở (Tiếng Anh 6 - 9)",
        "target_audience": "Học sinh 11 - 15 tuổi",
        "cefr_benchmark": "A2 KET / B1 PET",
        "core_books": ["Global Success 6-9", "Friends Plus", "Cambridge KET/PET"],
        "grades": [
            {"grade": "Lớp 6", "key_focus": "Ngôi trường mới, gia đình, kỳ quan thiên nhiên, thì Hiện tại đơn & Hiện tại tiếp diễn."},
            {"grade": "Lớp 7", "key_focus": "Hobbies, Healthy Living, Community Service, Music & Arts, Food & Drink, Traffic."},
            {"grade": "Lớp 8", "key_focus": "Lối sống nông thôn/thành thị, công nghệ, thảm họa thiên nhiên, câu so sánh, câu điều kiện."},
            {"grade": "Lớp 9", "key_focus": "Ngoại khóa bồi dưỡng HSG, luyện thi vào lớp 10 THPT công lập & trường chuyên (Bắc Giang, Nam Định, Hà Nội, TP.HCM)."}
        ]
    },
    {
        "grade_id": "g10_12",
        "level_name": "Khối Trung Học Phổ Thông & Luyện Thi (Tiếng Anh 10 - 12)",
        "target_audience": "Học sinh 16 - 18 tuổi",
        "cefr_benchmark": "B1+ / B2 / C1 / IELTS 6.5 - 7.5+",
        "core_books": ["Global Success 10-12", "Đề Thi Đổi Mới GDPT 2026", "Cambridge IELTS"],
        "grades": [
            {"grade": "Lớp 10", "key_focus": "Gia đình, môi trường, âm nhạc, bình đẳng giới, ma trận đề thi 40 câu trắc nghiệm."},
            {"grade": "Lớp 11", "key_focus": "Thành phố tương lai (Cities of the future), lối sống lành mạnh, di sản văn hóa, ASEAN."},
            {"grade": "Lớp 12", "key_focus": "Ôn thi tốt nghiệp THPT Quốc Gia theo format đổi mới 2026, đọc hiểu chuyên sâu, tư duy phản biện."}
        ]
    }
]

with open('src/lib/data/gdpt_curricula_db.json', 'w', encoding='utf-8') as f:
    json.dump(gdpt_curricula_db, f, ensure_ascii=False, indent=2)
print("Saved src/lib/data/gdpt_curricula_db.json")

# 5. Expand Exams & Questions Bank for All Grade Roles
new_exams = list(existing_exams)
existing_exam_ids = {e['id'] for e in new_exams}

additional_exams = [
    # Grade 3 Final Term Exam
    {
        "id": "ex_g3_final_term1",
        "curriculum_id": "curr_g3",
        "title": "Đề Khảo Sát Cuối Học Kỳ 1 - Tiếng Anh Lớp 3 (Global Success)",
        "description": "Bài kiểm tra chuẩn năng lực Tiểu học: Nghe hiểu tranh ảnh đồ dùng học tập, nhận biết chữ cái ngữ âm và nối từ.",
        "grade": 3,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 35,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    # Grade 4 Midterm & Final Exam
    {
        "id": "ex_g4_final_term1",
        "curriculum_id": "curr_g4",
        "title": "Đề Kiểm Tra Định Kỳ Cuối Học Kỳ 1 - Tiếng Anh Lớp 4",
        "description": "Đề thi theo ma trận phân hóa 4 mức độ của Bộ GD&ĐT: Nghe hiểu tranh, chọn đáp án đúng về nghề nghiệp và thời gian.",
        "grade": 4,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 35,
        "total_questions": 10,
        "pass_percentage": 65,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    # Grade 5 Primary Graduation Milestone
    {
        "id": "ex_g5_final_term1",
        "curriculum_id": "curr_g5",
        "title": "Đề Khảo Sát Năng Lực Đầu Ra Tiểu Học - Tiếng Anh Lớp 5",
        "description": "Đề thi đánh giá toàn diện kỹ năng Nghe - Đọc - Viết dành cho học sinh Lớp 5 chuẩn bị chuyển cấp vào THCS.",
        "grade": 5,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 40,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    # Grade 7 HSG Exam (From 25 Đề HSG Google Drive)
    {
        "id": "ex_g7_hsg_olympic",
        "curriculum_id": "curr_g7",
        "title": "Đề Thi Chọn Học Sinh Giỏi & Năng Khiếu - Tiếng Anh Lớp 7 (Đề Số 02)",
        "description": "Đề bồi dưỡng học sinh năng khiếu cấp trường/huyện: Hội thoại đời sống thực tế, phân biệt nguyên âm đôi, điền từ đoạn văn Nem Rán.",
        "grade": 7,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 60,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Ms. Dung (Leader)",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    # Grade 9 Entrance Exam to High School (From 80 Đề Ôn Vào 10)
    {
        "id": "ex_g9_vao_10",
        "curriculum_id": "curr_g9",
        "title": "Đề Khảo Sát Luyện Thi Vào Lớp 10 THPT Công Lập 2026",
        "description": "Bộ đề trắc nghiệm chuẩn 40 câu cấu trúc thi tuyển sinh vào 10: Trọng âm, ngữ âm, từ đồng nghĩa/trái nghĩa, câu giao tiếp và viết lại câu.",
        "grade": 9,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 60,
        "total_questions": 20,
        "pass_percentage": 70,
        "created_by": "Thầy Trần Mai",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    # Grade 11 Unit 3 Cities of the Future Exam
    {
        "id": "ex_g11_cities_future",
        "curriculum_id": "curr_g11",
        "title": "Khảo Sát Chuyên Đề Unit 3: Cities of the Future (Tiếng Anh 11)",
        "description": "Khảo sát từ vựng đô thị thông minh, ngữ pháp động từ chỉ trạng thái (stative verbs) và danh động từ (gerunds).",
        "grade": 11,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 65,
        "created_by": "Mr. Johnathan Miller",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    }
]

for ex in additional_exams:
    if ex['id'] not in existing_exam_ids:
        new_exams.append(ex)
        existing_exam_ids.add(ex['id'])

with open('src/lib/data/exams.json', 'w', encoding='utf-8') as f:
    json.dump(new_exams, f, ensure_ascii=False, indent=2)
print(f"Total exams catalog: {len(new_exams)} exams across all grades.")

# 6. Add Detailed Questions Bank from Drive & De Cuong
new_questions = list(existing_questions)
existing_q_keys = {f"{q.get('exam_id')}_{q.get('question_index')}" for q in new_questions}

drive_extracted_questions = [
    # G7 HSG Questions
    {
        "exam_id": "ex_g7_hsg_olympic",
        "question_index": 1,
        "grade": 7,
        "skill": "phonics",
        "type": "multiple_choice",
        "prompt": "Find the word which has a different sound in the underlined part: w<u>a</u>sh, w<u>a</u>rm, w<u>a</u>ll, w<u>a</u>lk",
        "options_json": json.dumps(["A. wash", "B. warm", "C. wall", "D. walk"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'wash' phát âm là /ɒ/ (hoặc /ɑː/ trong Anh-Mỹ), còn 'warm', 'wall', 'walk' đều phát âm là nguyên âm dài /ɔː/.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_olympic",
        "question_index": 2,
        "grade": 7,
        "skill": "phonics",
        "type": "multiple_choice",
        "prompt": "Find the word which has a different sound in the underlined part: p<u>a</u>n, b<u>a</u>g, w<u>a</u>ter, <u>a</u>dd",
        "options_json": json.dumps(["A. pan", "B. bag", "C. water", "D. add"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: 'water' phát âm là /ɔː/ (/ˈwɔːtər/), trong khi 'pan', 'bag', 'add' đều phát âm là nguyên âm bẹt /æ/.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_olympic",
        "question_index": 3,
        "grade": 7,
        "skill": "reading_cloze",
        "type": "multiple_choice",
        "prompt": "Nem Ran has long been a preferred food on special (5) ______ such as Tet and family festivities.",
        "options_json": json.dumps(["A. occasions", "B. habits", "C. hobbies", "D. ingredients"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'special occasions' là cụm cố định (collocation) có nghĩa là 'những dịp đặc biệt'.",
        "cambridge_level": "KET_A2"
    },
    # G3 Questions
    {
        "exam_id": "ex_g3_final_term1",
        "question_index": 1,
        "grade": 3,
        "skill": "listening_vocab",
        "type": "multiple_choice",
        "prompt": "Let's go to the ______ to borrow some English storybooks.",
        "options_json": json.dumps(["A. library", "B. classroom", "C. computer room", "D. playground"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'library' là thư viện nơi học sinh đến để mượn sách truyện.",
        "cambridge_level": "STARTERS"
    },
    {
        "exam_id": "ex_g3_final_term1",
        "question_index": 2,
        "grade": 3,
        "skill": "vocabulary",
        "type": "multiple_choice",
        "prompt": "What is this? - It's a pencil ______ to keep all my pens and pencils.",
        "options_json": json.dumps(["A. case", "B. book", "C. eraser", "D. ruler"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'pencil case' nghĩa là hộp đựng bút.",
        "cambridge_level": "STARTERS"
    },
    # G11 Cities of the Future Questions
    {
        "exam_id": "ex_g11_cities_future",
        "question_index": 1,
        "grade": 11,
        "skill": "vocabulary",
        "type": "multiple_choice",
        "prompt": "The local government has built a car-free ______ zone to encourage walking and reduce urban emissions.",
        "options_json": json.dumps(["A. pedestrian", "B. dweller", "C. sensor", "D. infrastructure"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'pedestrian zone' là khu phố đi bộ không có ô tô xe máy.",
        "cambridge_level": "PET_B1"
    },
    {
        "exam_id": "ex_g11_cities_future",
        "question_index": 2,
        "grade": 11,
        "skill": "grammar",
        "type": "multiple_choice",
        "prompt": "Most environmental scientists ______ that renewable solar energy is essential for sustainable smart cities.",
        "options_json": json.dumps(["A. believe", "B. are believing", "C. was believing", "D. is believed"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'believe' là động từ trạng thái (stative verb), không được dùng ở dạng tiếp diễn (-ing).",
        "cambridge_level": "FCE_B2"
    }
]

for q in drive_extracted_questions:
    key = f"{q['exam_id']}_{q['question_index']}"
    if key not in existing_q_keys:
        q['id'] = len(new_questions) + 1
        new_questions.append(q)
        existing_q_keys.add(key)

with open('src/lib/data/questions.json', 'w', encoding='utf-8') as f:
    json.dump(new_questions, f, ensure_ascii=False, indent=2)
print(f"Total questions in bank: {len(new_questions)} questions.")

# 7. Write/Update SQLite Database (data/tienganh7.db)
db_path = 'data/tienganh7.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Ensure grammar_topics table exists
cur.execute('''
CREATE TABLE IF NOT EXISTS grammar_topics (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    curriculum_unit TEXT,
    formula_json TEXT,
    usage_json TEXT,
    signal_words_json TEXT,
    phonics_rules TEXT,
    common_mistakes TEXT,
    examples_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
''')

# Ensure curricula table exists
cur.execute('''
CREATE TABLE IF NOT EXISTS curricula (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    grade INTEGER,
    cefr_level TEXT,
    description TEXT,
    unit_count INTEGER DEFAULT 12,
    is_active INTEGER DEFAULT 1
)
''')

# Ensure exams table exists
cur.execute('''
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    curriculum_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    grade INTEGER,
    format_type TEXT NOT NULL,
    skill_category TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 45,
    total_questions INTEGER DEFAULT 15,
    pass_percentage INTEGER DEFAULT 60,
    created_by TEXT,
    is_published INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
''')

# Insert/Update Grammar
for g in grammar_db:
    cur.execute('''
    INSERT OR REPLACE INTO grammar_topics (
        id, topic, grade_level, curriculum_unit, formula_json, usage_json, signal_words_json, phonics_rules, common_mistakes, examples_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        g['id'], g['topic'], g['grade_level'], g['curriculum_unit'],
        json.dumps(g['formula'], ensure_ascii=False),
        json.dumps(g['usage'], ensure_ascii=False),
        json.dumps(g['signal_words'], ensure_ascii=False),
        g.get('phonics_rules', ''), g.get('common_mistakes', ''),
        json.dumps(g['examples'], ensure_ascii=False)
    ))

# Insert/Update Curricula
for c in existing_curricula:
    cur.execute('''
    INSERT OR REPLACE INTO curricula (id, code, title, grade, cefr_level, description, unit_count, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        c.get('id', c.get('code')), c.get('code'), c.get('title'),
        c.get('grade', 0), c.get('cefr_level', 'A2'),
        c.get('description', ''), c.get('total_units', 12), 1
    ))

# Insert/Update Exams
for e in new_exams:
    cur.execute('''
    INSERT OR REPLACE INTO exams (
        id, curriculum_id, title, description, grade, format_type, skill_category, duration_minutes, total_questions, pass_percentage, created_by, is_published, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        e['id'], e.get('curriculum_id', 'curr_g7'), e['title'], e.get('description', ''),
        e.get('grade', 7), e.get('format_type', 'standard_45m'), e.get('skill_category', 'mixed'),
        e.get('duration_minutes', 45), e.get('total_questions', 10), e.get('pass_percentage', 60),
        e.get('created_by', 'Teacher'), e.get('is_published', 1), e.get('created_at', '2026-09-25 10:00:00')
    ))

# Insert/Update Words
for w in new_words_list:
    cur.execute('''
    INSERT OR REPLACE INTO words (
        id, term, ipa, pos, meaning_vi, vowels_detail, consonants_detail, phonics_note, syllables, example_en, example_vi, unit_id, difficulty, category
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        w['id'], w['term'], w.get('ipa', ''), w.get('pos', 'noun'), w['meaning_vi'],
        w.get('vowels_detail', ''), w.get('consonants_detail', ''), w.get('phonics_note', ''),
        w.get('syllables', ''), w.get('example_en', ''), w.get('example_vi', ''),
        w.get('unit_id', 'unit1'), w.get('difficulty', 'medium'), w.get('category', 'general')
    ))

# Ensure exam_questions table exists with modern schema
cur.execute('''
CREATE TABLE IF NOT EXISTS exam_questions (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    question_index INTEGER NOT NULL,
    grade INTEGER,
    skill TEXT,
    type TEXT,
    passage TEXT,
    prompt TEXT NOT NULL,
    options_json TEXT,
    correct_answer TEXT,
    explanation TEXT,
    cambridge_level TEXT
)
''')

# Insert/Update Questions into exam_questions
for q in new_questions:
    cur.execute('''
    INSERT OR REPLACE INTO exam_questions (
        id, exam_id, question_index, grade, skill, type, passage, prompt, options_json, correct_answer, explanation, cambridge_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        str(q.get('id', '')), q.get('exam_id', 'TEST_01'), q.get('question_index', 1),
        q.get('grade', 7), q.get('skill', 'general'), q.get('type', 'multiple_choice'),
        q.get('passage', None), q.get('prompt', ''),
        q.get('options_json', '[]'), q.get('correct_answer', 'A'),
        q.get('explanation', ''), q.get('cambridge_level', 'KET_A2')
    ))

conn.commit()
conn.close()

print("✅ SQLite database data/tienganh7.db updated successfully with all tables!")
print("=== MODULAR DATABASE BUILD COMPLETED SUCCESSFULLY ===")

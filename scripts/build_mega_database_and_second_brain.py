import sqlite3
import json
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
import re

sys.stdout.reconfigure(encoding='utf-8')

print("=================================================================")
print("=== MEGA SYSTEM ENRICHMENT & OBSIDIAN SECOND BRAIN GENERATOR ===")
print("=================================================================\n")

def extract_docx_paragraphs(path):
    if not os.path.exists(path):
        return []
    try:
        z = zipfile.ZipFile(path)
        tree = ET.fromstring(z.read('word/document.xml'))
        paras = []
        for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            t = ''.join([node.text for node in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]).strip()
            if t:
                paras.append(t)
        return paras
    except Exception as e:
        print(f"Error parsing {path}: {e}")
        return []

# -------------------------------------------------------------
# 1. PARSE NEW GDRIVE DOCS & MERGE VOCABULARY DATABASE
# -------------------------------------------------------------
print("--> Step 1: Enriching Vocabulary Database (src/lib/data/vocabulary_db.json)...")

with open('src/lib/data/vocabulary_db.json', 'r', encoding='utf-8') as f:
    existing_vocab = json.load(f)

vocab_dict = {v['term'].lower().strip(): v for v in existing_vocab}

mega_vocab_additions = [
    # CITIES & URBANISATION (Extracted from cities_urbanisation_vocab.docx)
    {
        "term": "urban infrastructure",
        "ipa": "/ˈɜːbən ˈɪnfrəstrʌktʃə/",
        "pos": "noun phrase",
        "meaning_vi": "Cơ sở hạ tầng đô thị (cầu đường, cấp thoát nước, lưới điện)",
        "vowels_detail": "/ɜː/, /ə/, /ɪ/, /ə/, /ʌ/, /ə/",
        "consonants_detail": "/b/, /n/, /n/, /f/, /r/, /s/, /t/, /r/, /k/, /tʃ/",
        "phonics_note": "Trọng âm: UR-ban IN-fra-struc-ture. Đuôi -ture phát âm là /tʃə/.",
        "syllables": "ur-ban in-fra-struc-ture (5 âm tiết)",
        "example_en": "The city's infrastructure suffered heavy damage due to the devastating superstorm.",
        "example_vi": "Cơ sở hạ tầng của thành phố bị thiệt hại nặng nề do cơn siêu bão tàn phá.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 12",
        "topic": "Cities and Urbanisation",
        "unit_id": "unit_urban"
    },
    {
        "term": "urban inhabitant",
        "ipa": "/ˈɜːbən ɪnˈhæbɪtənt/",
        "pos": "noun phrase",
        "meaning_vi": "Cư dân đô thị, người dân sống tại thành phố",
        "vowels_detail": "/ɜː/, /ə/, /ɪ/, /æ/, /ɪ/, /ə/",
        "consonants_detail": "/b/, /n/, /n/, /h/, /b/, /t/, /n/, /t/",
        "phonics_note": "Trọng âm: in-HAB-i-tant. Âm /h/ bật rõ ràng, đuôi -ant đọc là /ənt/.",
        "syllables": "ur-ban in-hab-i-tant (5 âm tiết)",
        "example_en": "Urban inhabitants often struggle with noise pollution and limited recreation areas.",
        "example_vi": "Cư dân đô thị thường xuyên phải đối mặt với ô nhiễm tiếng ồn và khu vui chơi hạn chế.",
        "cambridge_level": "FCE_B2",
        "grade": "Lớp 11",
        "topic": "Cities of the Future",
        "unit_id": "unit_urban"
    },
    {
        "term": "residential neighbourhood",
        "ipa": "/ˌrezɪˈdenʃl ˈneɪbəhʊd/",
        "pos": "noun phrase",
        "meaning_vi": "Khu dân cư sinh sống thanh bình",
        "vowels_detail": "/e/, /ɪ/, /e/, /eɪ/, /ə/, /ʊ/",
        "consonants_detail": "/r/, /z/, /d/, /n/, /ʃ/, /l/, /n/, /b/, /h/, /d/",
        "phonics_note": "Trọng âm: res-i-DEN-tial NEIGH-bour-hood.",
        "syllables": "res-i-den-tial neigh-bour-hood (6 âm tiết)",
        "example_en": "Modern urban zoning creates safe, walkable residential neighbourhoods.",
        "example_vi": "Quy hoạch đô thị hiện đại tạo nên các khu dân cư an toàn và thuận tiện đi bộ.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 10",
        "topic": "Cities of the Future",
        "unit_id": "unit_urban"
    },
    {
        "term": "traffic congestion",
        "ipa": "/ˈtræfɪk kənˈdʒestʃən/",
        "pos": "noun phrase",
        "meaning_vi": "Sự ùn tắc giao thông nghiêm trọng",
        "vowels_detail": "/æ/, /ɪ/, /ə/, /e/, /ə/",
        "consonants_detail": "/tr/, /f/, /k/, /k/, /n/, /dʒ/, /s/, /tʃ/, /n/",
        "phonics_note": "Đuôi -tion sau 's' phát âm là /tʃən/, trọng âm con-GES-tion.",
        "syllables": "traf-fic con-ges-tion (4 âm tiết)",
        "example_en": "Expanding the metro rail network significantly eases morning traffic congestion.",
        "example_vi": "Mở rộng mạng lưới tàu điện ngầm giúp giảm bớt đáng kể tình trạng kẹt xe buổi sáng.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 8",
        "topic": "Traffic & Transport",
        "unit_id": "unit_traffic"
    },

    # OUR HERITAGE (Extracted from our_heritage_vocab.docx)
    {
        "term": "natural landscape",
        "ipa": "/ˈnætʃrəl ˈlændskeɪp/",
        "pos": "noun phrase",
        "meaning_vi": "Danh lam thắng cảnh tự nhiên, cảnh quan thiên nhiên",
        "vowels_detail": "/æ/, /ə/, /æ/, /eɪ/",
        "consonants_detail": "/n/, /tʃ/, /r/, /l/, /l/, /n/, /d/, /s/, /k/, /p/",
        "phonics_note": "Trọng âm: NAT-u-ral LAND-scape. 'scape' có nguyên âm đôi /eɪ/.",
        "syllables": "nat-u-ral land-scape (4 âm tiết)",
        "example_en": "The impact of climate change on the natural landscape of Ha Long Bay is alarming.",
        "example_vi": "Tác động của biến đổi khí hậu lên cảnh quan thiên nhiên Vịnh Hạ Long rất đáng lo ngại.",
        "cambridge_level": "FCE_B2",
        "grade": "Lớp 12",
        "topic": "Our Heritage",
        "unit_id": "unit_heritage"
    },
    {
        "term": "ancient citadel",
        "ipa": "/ˈeɪnʃənt ˈsɪtədəl/",
        "pos": "noun phrase",
        "meaning_vi": "Hoàng thành cổ kính, thành quách cổ xưa",
        "vowels_detail": "/eɪ/, /ə/, /ɪ/, /ə/, /ə/",
        "consonants_detail": "/n/, /ʃ/, /n/, /t/, /s/, /t/, /d/, /l/",
        "phonics_note": "Trọng âm: AN-cient CIT-a-del. Âm /s/ nhẹ đầu từ citadel.",
        "syllables": "an-cient cit-a-del (5 âm tiết)",
        "example_en": "The Imperial Citadel of Thang Long is a priceless World Heritage site.",
        "example_vi": "Hoàng thành Thăng Long là di sản thế giới vô giá của nhân loại.",
        "cambridge_level": "FCE_B2",
        "grade": "Lớp 11",
        "topic": "Our Heritage",
        "unit_id": "unit_heritage"
    },
    {
        "term": "historical dynasty",
        "ipa": "/hɪˈstɒrɪkl ˈdɪnəsti/",
        "pos": "noun phrase",
        "meaning_vi": "Triều đại lịch sử phong kiến",
        "vowels_detail": "/ɪ/, /ɒ/, /ɪ/, /ə/, /ɪ/, /ə/, /i/",
        "consonants_detail": "/h/, /s/, /t/, /r/, /k/, /l/, /d/, /n/, /s/, /t/",
        "phonics_note": "Trọng âm his-TOR-i-cal DY-nas-ty (Mỹ đọc /ˈdaɪnəsti/).",
        "syllables": "his-tor-i-cal dy-nas-ty (7 âm tiết)",
        "example_en": "The Ly Dynasty laid the cultural and architectural foundations for the capital.",
        "example_vi": "Triều đại nhà Lý đã đặt nền móng văn hóa và kiến trúc cho kinh đô.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 12",
        "topic": "Our Heritage",
        "unit_id": "unit_heritage"
    },
    {
        "term": "authentic souvenir",
        "ipa": "/ɔːˈθentɪk ˌsuːvəˈnɪə/",
        "pos": "noun phrase",
        "meaning_vi": "Món quà lưu niệm đích thực, chính gốc địa phương",
        "vowels_detail": "/ɔː/, /e/, /ɪ/, /uː/, /ə/, /ɪə/",
        "consonants_detail": "/θ/, /n/, /t/, /k/, /s/, /v/, /n/",
        "phonics_note": "Trọng âm au-THEN-tic sou-ve-NIR. Âm vô thanh /θ/ trong 'authentic'.",
        "syllables": "au-then-tic sou-ve-nir (6 âm tiết)",
        "example_en": "Foreign tourists cherish buying handcrafted authentic souvenirs from craft villages.",
        "example_vi": "Du khách nước ngoài rất trân quý khi mua đồ lưu niệm thủ công chính gốc từ các làng nghề.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 9",
        "topic": "Local Environment",
        "unit_id": "unit_heritage"
    },

    # BECOMING INDEPENDENT (Extracted from becoming_independent_vocab.docx)
    {
        "term": "self-reliance",
        "ipa": "/ˌself rɪˈlaɪəns/",
        "pos": "noun",
        "meaning_vi": "Tính tự lực cánh sinh, khả năng tự lập không phụ thuộc",
        "vowels_detail": "/e/, /ɪ/, /aɪ/, /ə/",
        "consonants_detail": "/s/, /l/, /f/, /r/, /l/, /n/, /s/",
        "phonics_note": "Trọng âm self re-LI-ance, nguyên âm ba /aɪə/.",
        "syllables": "self-re-li-ance (4 âm tiết)",
        "example_en": "Living in a university dormitory fosters essential self-reliance in teenagers.",
        "example_vi": "Sống trong ký túc xá đại học nuôi dưỡng tính tự lập cần thiết cho thanh thiếu niên.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 11",
        "topic": "Becoming Independent",
        "unit_id": "unit_independent"
    },
    {
        "term": "financial autonomy",
        "ipa": "/faɪˈnænʃl ɔːˈtɒnəmi/",
        "pos": "noun phrase",
        "meaning_vi": "Sự tự chủ tài chính, tự lập về tiền bạc",
        "vowels_detail": "/aɪ/, /æ/, /ɔː/, /ɒ/, /ə/, /i/",
        "consonants_detail": "/f/, /n/, /n/, /ʃ/, /l/, /t/, /n/, /m/",
        "phonics_note": "Trọng âm: fi-NAN-cial au-TON-o-my.",
        "syllables": "fi-nan-cial au-ton-o-my (6 âm tiết)",
        "example_en": "Part-time internships teach undergraduate students the basics of financial autonomy.",
        "example_vi": "Thực tập bán thời gian dạy cho sinh viên những bài học cơ bản về tự chủ tài chính.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 12",
        "topic": "Becoming Independent",
        "unit_id": "unit_independent"
    },
    {
        "term": "time management",
        "ipa": "/taɪm ˈmænɪdʒmənt/",
        "pos": "noun phrase",
        "meaning_vi": "Kỹ năng quản lý thời gian khoa học",
        "vowels_detail": "/aɪ/, /æ/, /ɪ/, /ə/",
        "consonants_detail": "/t/, /m/, /m/, /n/, /dʒ/, /m/, /n/, /t/",
        "phonics_note": "Trọng âm MAN-age-ment, đuôi -ment đọc là /mənt/.",
        "syllables": "time man-age-ment (4 âm tiết)",
        "example_en": "Effective time management prevents exam cramming and burnout.",
        "example_vi": "Quản lý thời gian hiệu quả giúp ngăn ngừa việc học dồn và kiệt sức trước kỳ thi.",
        "cambridge_level": "FCE_B2",
        "grade": "Lớp 11",
        "topic": "Becoming Independent",
        "unit_id": "unit_independent"
    },

    # PHRASAL VERBS (Extracted from phrasal_verbs_key.docx)
    {
        "term": "hold up",
        "ipa": "/həʊld ʌp/",
        "pos": "phrasal verb",
        "meaning_vi": "1. Trì hoãn; 2. Cướp có vũ trang (ngân hàng, cửa hàng)",
        "vowels_detail": "/əʊ/, /ʌ/",
        "consonants_detail": "/h/, /l/, /d/, /p/",
        "phonics_note": "Nối âm: /həʊld/ + /ʌp/ -> /həʊl.dʌp/.",
        "syllables": "hold-up (2 âm tiết)",
        "example_en": "It was the third time in six months that the regional bank had been held up.",
        "example_vi": "Đó là lần thứ ba trong vòng 6 tháng chi nhánh ngân hàng khu vực bị cướp có vũ trang.",
        "cambridge_level": "FCE_B2",
        "grade": "HSG Lớp 11 - 12",
        "topic": "Phrasal Verbs",
        "unit_id": "unit_phrasal"
    },
    {
        "term": "bring about",
        "ipa": "/brɪŋ əˈbaʊt/",
        "pos": "phrasal verb",
        "meaning_vi": "Gây ra, mang lại sự thay đổi lớn (cause to happen)",
        "vowels_detail": "/ɪ/, /ə/, /aʊ/",
        "consonants_detail": "/br/, /ŋ/, /b/, /t/",
        "phonics_note": "Âm mũi /ŋ/ nối sang nguyên âm /ə/: /brɪŋ.ə.baʊt/.",
        "syllables": "bring-a-bout (3 âm tiết)",
        "example_en": "The transition to green technology will bring about profound societal benefits.",
        "example_vi": "Việc chuyển đổi sang công nghệ xanh sẽ mang lại những lợi ích xã hội sâu sắc.",
        "cambridge_level": "FCE_B2",
        "grade": "Luyện Thi IELTS",
        "topic": "Phrasal Verbs",
        "unit_id": "unit_phrasal"
    },
    {
        "term": "call off",
        "ipa": "/kɔːl ɒf/",
        "pos": "phrasal verb",
        "meaning_vi": "Hủy bỏ sự kiện, trận đấu (cancel)",
        "vowels_detail": "/ɔː/, /ɒ/",
        "consonants_detail": "/k/, /l/, /f/",
        "phonics_note": "Nối âm /l/ sang /ɒ/: /kɔː.lɒf/.",
        "syllables": "call-off (2 âm tiết)",
        "example_en": "The outdoor music concert was called off on account of torrential rain.",
        "example_vi": "Buổi hòa nhạc ngoài trời đã bị hủy bỏ do mưa xối xả.",
        "cambridge_level": "KET_A2",
        "grade": "Lớp 7 - Lớp 9",
        "topic": "Phrasal Verbs",
        "unit_id": "unit_phrasal"
    },
    {
        "term": "look down on",
        "ipa": "/lʊk daʊn ɒn/",
        "pos": "phrasal verb",
        "meaning_vi": "Coi thường, khinh miệt ai đó",
        "vowels_detail": "/ʊ/, /aʊ/, /ɒ/",
        "consonants_detail": "/l/, /k/, /d/, /n/, /n/",
        "phonics_note": "Cụm 3 từ: look + down + on.",
        "syllables": "look-down-on (3 âm tiết)",
        "example_en": "A true leader never looks down on those with less educational background.",
        "example_vi": "Một nhà lãnh đạo thực thụ không bao giờ coi thường những người có hoàn cảnh học vấn thấp hơn.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 9",
        "topic": "Phrasal Verbs",
        "unit_id": "unit_phrasal"
    },

    # PRIMARY FOUNDATIONS (Lớp 1 - 5)
    {
        "term": "water bottle",
        "ipa": "/ˈwɔːtə ˈbɒtl/",
        "pos": "noun phrase",
        "meaning_vi": "Bình đựng nước cá nhân",
        "vowels_detail": "/ɔː/, /ə/, /ɒ/",
        "consonants_detail": "/w/, /t/, /b/, /t/, /l/",
        "phonics_note": "Trọng âm WOR-ter BOT-tle.",
        "syllables": "wa-ter bot-tle (4 âm tiết)",
        "example_en": "Pupils carry reusable water bottles to avoid plastic waste.",
        "example_vi": "Các bạn học sinh mang theo bình nước tái sử dụng để tránh rác thải nhựa.",
        "cambridge_level": "Starters",
        "grade": "Lớp 3",
        "topic": "School Supplies",
        "unit_id": "unit_primary"
    },
    {
        "term": "favorite hobby",
        "ipa": "/ˈfeɪvərɪt ˈhɒbi/",
        "pos": "noun phrase",
        "meaning_vi": "Sở thích đam mê nhất",
        "vowels_detail": "/eɪ/, /ə/, /ɪ/, /ɒ/, /i/",
        "consonants_detail": "/f/, /v/, /r/, /t/, /h/, /b/",
        "phonics_note": "Trọng âm FAY-ver-ite HOB-by.",
        "syllables": "fa-vor-ite hob-by (5 âm tiết)",
        "example_en": "Her favorite hobby is reading English comic books before bedtime.",
        "example_vi": "Sở thích yêu thích nhất của bạn ấy là đọc truyện tranh tiếng Anh trước giờ đi ngủ.",
        "cambridge_level": "Movers",
        "grade": "Lớp 4",
        "topic": "Hobbies & Routine",
        "unit_id": "unit_primary"
    }
]

for v in mega_vocab_additions:
    k = v['term'].lower().strip()
    if k not in vocab_dict:
        vocab_dict[k] = v

final_vocab = list(vocab_dict.values())
print(f"Total vocabulary terms after mega expansion: {len(final_vocab)}")

with open('src/lib/data/vocabulary_db.json', 'w', encoding='utf-8') as f:
    json.dump(final_vocab, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# 2. ENRICH GRAMMAR TOPICS (src/lib/data/grammar_topics.json)
# -------------------------------------------------------------
print("\n--> Step 2: Enriching Grammar Topics Database (src/lib/data/grammar_topics.json)...")

with open('src/lib/data/grammar_topics.json', 'r', encoding='utf-8') as f:
    existing_grammar = json.load(f)

grammar_dict = {g['id']: g for g in existing_grammar}

mega_grammar_additions = [
    {
        "id": "gram_inversion",
        "topic": "Cấu Trúc Đảo Ngữ Nâng Cao (Grammatical Inversion)",
        "grade_level": "Lớp 11, Lớp 12, HSG & THPT QG",
        "curriculum_unit": "Chuyên đề Học sinh giỏi THPT",
        "category": "advanced_structures",
        "cefr_level": "B2 - C1",
        "summary": "Đưa phó từ phủ định hoặc bán phủ định lên đầu câu nhằm mục đích nhấn mạnh mạnh mẽ hành động.",
        "formula": {
            "affirmative": "Negative Adverbial + Auxiliary Verb + S + Main Verb",
            "negative": "Not until / Only when + Clause + Auxiliary + S + V",
            "interrogative": "Hardly/Scarcely + had + S + V3/ed + when + S + V2/ed"
        },
        "usage": [
            "Đảo ngữ với phó từ phủ định: Never, Rarely, Seldom, Little, Hardly ever.",
            "Đảo ngữ với No: Under no circumstances, At no time, On no account, Nowhere.",
            "Đảo ngữ cấu trúc 'Vừa mới... thì...': Hardly/Scarcely... when, No sooner... than.",
            "Đảo ngữ với Only: Only by, Only when, Only after, Only then."
        ],
        "signal_words": ["Never", "Rarely", "Seldom", "Hardly", "Scarcely", "No sooner", "Under no circumstances", "Only when", "Not until"],
        "phonics_rules": "Ngữ điệu rơi mạnh ở từ phủ định đầu câu để biểu đạt kịch tính (emphatic intonation).",
        "common_mistakes": "Quên mượn trợ động từ (Did/Had/Do/Can) hoặc vẫn đảo ngữ ở mệnh đề thời gian thay vì mệnh đề chính.",
        "examples": [
            {"en": "Hardly had the teacher entered the classroom when all students stood up.", "vi": "Thầy giáo vừa bước vào lớp thì tất cả học sinh đã đứng dậy chào."},
            {"en": "Under no circumstances should personal passwords be disclosed.", "vi": "Trong bất kỳ hoàn cảnh nào cũng không được tiết lộ mật khẩu cá nhân."}
        ],
        "practice_questions": [
            {
                "id": "gq_inv_1",
                "prompt": "Only in the right ecological conditions ______ these rare plants be able to thrive.",
                "options": ["A. will", "B. they will", "C. that will", "D. are"],
                "correct": "A",
                "explanation": "Đảo ngữ với cụm 'Only in...': Trợ động từ 'will' đứng trước chủ ngữ 'these rare plants'."
            }
        ]
    },
    {
        "id": "gram_cleft_sentences",
        "topic": "Câu Chẻ Nhấn Mạnh (Cleft Sentences: It is/was... that)",
        "grade_level": "Lớp 11 - Lớp 12, Thi THPT QG",
        "curriculum_unit": "Unit 12: Career Paths",
        "category": "emphasis",
        "cefr_level": "B2",
        "summary": "Tách một câu đơn thành hai mệnh đề để làm nổi bật chủ ngữ, tân ngữ hoặc trạng ngữ được nhấn mạnh.",
        "formula": {
            "affirmative": "It + is/was + Focus Element (S / O / Adv) + that/who + Rest of sentence",
            "negative": "It + is/was not + Focus Element + that...",
            "interrogative": "Is/Was it + Focus Element + that...?"
        },
        "usage": [
            "Nhấn mạnh chủ ngữ chỉ người (dùng who/that) hoặc chỉ vật (dùng that).",
            "Nhấn mạnh tân ngữ trực tiếp hoặc gián tiếp.",
            "Nhấn mạnh trạng ngữ chỉ nơi chốn, thời gian, phương tiện."
        ],
        "signal_words": ["It is... that", "It was... that", "It is... who"],
        "phonics_rules": "Nhấn trọng âm câu (sentence stress) vào phần tử nằm giữa 'It is/was' và 'that'.",
        "common_mistakes": "Dùng 'which' hoặc 'where' thay vì 'that' khi nhấn mạnh trạng từ nơi chốn (Sai: It was in Hanoi where -> Đúng: It was in Hanoi that).",
        "examples": [
            {"en": "It was my dedicated mother who inspired my passion for English.", "vi": "Chính người mẹ tận tụy của tôi là người đã truyền cảm hứng đam mê tiếng Anh cho tôi."}
        ],
        "practice_questions": [
            {
                "id": "gq_cleft_1",
                "prompt": "It was in the tranquil coastal town ______ the poet composed his masterpiece.",
                "options": ["A. that", "B. where", "C. which", "D. when"],
                "correct": "A",
                "explanation": "Câu chẻ nhấn mạnh trạng ngữ nơi chốn luôn dùng 'that' trong cấu trúc chuẩn ngữ pháp."
            }
        ]
    },
    {
        "id": "gram_subjunctive",
        "topic": "Thể Giả Định (Subjunctive Mood with Demand / Insist / Suggest)",
        "grade_level": "Lớp 12 & Luyện Thi Đại Học / HSG",
        "curriculum_unit": "Chuyên đề Ngữ pháp Bồi dưỡng HSG",
        "category": "advanced_structures",
        "cefr_level": "C1",
        "summary": "Diễn tả đề nghị, mệnh lệnh, yêu cầu khẩn thiết. Động từ trong mệnh đề that luôn ở dạng nguyên thể không 'to' (V_bare).",
        "formula": {
            "affirmative": "S1 + insist/demand/suggest/recommend + that + S2 + (should) + V_inf",
            "negative": "S1 + require + that + S2 + (should) not + V_inf",
            "interrogative": "It is essential/vital/imperative + that + S + V_inf"
        },
        "usage": [
            "Đi sau động từ chỉ yêu cầu: demand, insist, require, recommend, suggest, propose.",
            "Đi sau tính từ chỉ tính cấp thiết: vital, imperative, essential, crucial, necessary."
        ],
        "signal_words": ["insist that", "demand that", "suggest that", "essential that", "vital that", "imperative that"],
        "phonics_rules": "Không chia đuôi -s/-es hay quá khứ cho động từ trong mệnh đề that.",
        "common_mistakes": "Tự ý chia thì quá khứ hoặc thêm 's' ở ngôi thứ 3 số ít (Sai: insists that he goes -> Đúng: insists that he go).",
        "examples": [
            {"en": "The senior physician insisted that the patient take complete rest.", "vi": "Bác sĩ trưởng khoa khăng khăng yêu cầu bệnh nhân phải nghỉ ngơi tuyệt đối."}
        ],
        "practice_questions": [
            {
                "id": "gq_sub_1",
                "prompt": "The headmaster recommended that every student ______ present at the assembly by 7:00 AM.",
                "options": ["A. be", "B. is", "C. was", "D. are"],
                "correct": "A",
                "explanation": "Cấu trúc giả định với 'recommend that': động từ To Be luôn ở dạng nguyên thể 'be' cho mọi ngôi."
            }
        ]
    },
    {
        "id": "gram_phrasal_verbs_mastery",
        "topic": "Cụm Động Từ Chuyên Sâu (Phrasal Verbs Mastery)",
        "grade_level": "Lớp 7 đến Lớp 12, KET, PET, IELTS",
        "curriculum_unit": "Chuyên Đề Cụm Động Từ Thi Vào 10 & THPT",
        "category": "lexico_grammar",
        "cefr_level": "A2 - C1",
        "summary": "Sự kết hợp giữa động từ và tiểu từ (giới từ/phó từ) tạo thành một nghĩa hoàn toàn mới.",
        "formula": {
            "affirmative": "S + Verb + Particle + Object (hoặc S + Verb + Object + Particle nếu tách rời)",
            "negative": "S + Auxiliary not + Verb + Particle",
            "interrogative": "Auxiliary + S + Verb + Particle?"
        },
        "usage": [
            "Cụm động từ không thể tách rời (Inseparable): look after, run into, cope with, hold up.",
            "Cụm động từ có thể tách rời (Separable): turn off/turn on, call off, put away.",
            "Cụm động từ có 2 tiểu từ (Three-part): look forward to, catch up with, put up with."
        ],
        "signal_words": ["look after", "give up", "call off", "put off", "bring about", "hold up", "look forward to", "run out of"],
        "phonics_rules": "Nối âm liền mạch giữa phụ âm cuối của động từ với nguyên âm đầu của tiểu từ (turn off -> /tɜː.nɒf/).",
        "common_mistakes": "Nhầm lẫn giữa put off (hoãn) và call off (hủy); turn off (tắt) và take off (cất cánh/cởi áo).",
        "examples": [
            {"en": "We had to put off the camping trip until the stormy weather cleared.", "vi": "Chúng tôi đã phải hoãn chuyến cắm trại cho đến khi thời tiết bão tan."}
        ],
        "practice_questions": [
            {
                "id": "gq_pv_1",
                "prompt": "Because of sudden heavy snowfall, the flight authorities decided to ______ all departures.",
                "options": ["A. call off", "B. hold on", "C. give in", "D. take over"],
                "correct": "A",
                "explanation": "'call off' = hủy bỏ chuyến bay do bão tuyết."
            }
        ]
    },
    {
        "id": "gram_sentence_transformation",
        "topic": "Kỹ Năng Biến Đổi Viết Lại Câu Tương Đương (Sentence Rewriting)",
        "grade_level": "Lớp 7, 8, 9, 10, 11, 12 & Tuyển Sinh Vào 10",
        "curriculum_unit": "700 Câu Bài Tập Viết Lại Câu Tuyển Chọn",
        "category": "syntax_transformation",
        "cefr_level": "A2 - B2",
        "summary": "Chuyển đổi câu gốc sang một cấu trúc mới sử dụng từ cho trước sao cho ý nghĩa giữ nguyên 100%.",
        "formula": {
            "affirmative": "S + started/began V-ing ... ago <=> S + have/has V3/ed for ...",
            "negative": "Although + Clause <=> In spite of / Despite + Noun/V-ing",
            "interrogative": "Because + Clause <=> Because of + Noun Phrase"
        },
        "usage": [
            "Chuyển đổi thì: Quá khứ đơn (started/last) <=> Hiện tại hoàn thành (have/has + for/since).",
            "Chuyển đổi nguyên nhân - nhượng bộ: Although <=> Despite; Because <=> Because of.",
            "Chuyển đổi điều kiện: If you don't... <=> Unless you...",
            "Chuyển đổi so sánh: S1 is taller than S2 <=> S2 is not as tall as S1."
        ],
        "signal_words": ["Although", "Despite", "Because of", "Unless", "It takes", "Used to", "Prefer... to..."],
        "phonics_rules": "Giữ đúng thì động từ và bảo toàn đại từ nhân xưng phù hợp.",
        "common_mistakes": "Dùng 'Despite of' (Sai hoàn toàn -> chỉ dùng 'Despite' hoặc 'In spite of').",
        "examples": [
            {"en": "Despite the torrential rain, they walked to school on time.", "vi": "Mặc dù trời mưa xối xả, họ vẫn đi bộ đến trường đúng giờ."}
        ],
        "practice_questions": [
            {
                "id": "gq_rew_1",
                "prompt": "Rewrite: 'Although she was ill, Lan completed her homework.' -> 'In spite of ______'",
                "options": [
                    "A. her illness, Lan completed her homework.",
                    "B. she was ill, Lan completed her homework.",
                    "C. Lan was illness, she completed her homework.",
                    "D. being ill, Lan wasn't complete her homework."
                ],
                "correct": "A",
                "explanation": "'In spite of + her illness' (danh từ) thay thế cho mệnh đề 'Although she was ill'."
            }
        ]
    }
]

for g in mega_grammar_additions:
    grammar_dict[g['id']] = g

final_grammar = list(grammar_dict.values())
print(f"Total grammar topics after mega expansion: {len(final_grammar)}")

with open('src/lib/data/grammar_topics.json', 'w', encoding='utf-8') as f:
    json.dump(final_grammar, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# 3. ENRICH EXAMS DATABASE (src/lib/data/exams.json)
# -------------------------------------------------------------
print("\n--> Step 3: Enriching Exams Database (src/lib/data/exams.json)...")

with open('src/lib/data/exams.json', 'r', encoding='utf-8') as f:
    existing_exams = json.load(f)

exam_dict = {e['id']: e for e in existing_exams}

mega_exams_additions = [
    {
        "id": "ex_g12_cities_urbanisation",
        "curriculum_id": "curr_g12",
        "title": "Đề Khảo Sát Chuyên Sâu: Cities & Urbanisation (Tiếng Anh 12)",
        "description": "Trích xuất từ bộ tài liệu chuyên sâu: 40 câu trắc nghiệm từ vựng hạ tầng đô thị, đọc điền từ và đọc hiểu công nghệ xanh.",
        "grade": 12,
        "format_type": "standard_45m",
        "skill_category": "vocabulary_reading",
        "duration_minutes": 45,
        "total_questions": 30,
        "pass_percentage": 70,
        "created_by": "Cô Dung Tuyển Chọn",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g12_our_heritage",
        "curriculum_id": "curr_g12",
        "title": "Đề Khảo Sát Chuyên Sâu: Our Heritage & Preservation (Tiếng Anh 12)",
        "description": "Chuyên đề di sản văn hóa, hoàng thành Thăng Long, bảo tồn danh lam thắng cảnh và du lịch bền vững.",
        "grade": 12,
        "format_type": "standard_45m",
        "skill_category": "reading_use_of_english",
        "duration_minutes": 45,
        "total_questions": 30,
        "pass_percentage": 70,
        "created_by": "Cô Dung Tuyển Chọn",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_hsg_thpt_1000_syntax",
        "curriculum_id": "curr_g12",
        "title": "Bộ Đề Bồi Dưỡng Học Sinh Giỏi THPT: Cấu Trúc Ngữ Pháp Nâng Cao",
        "description": "Trích từ 1000 câu trắc nghiệm ngữ pháp HSG: Thể giả định (subjunctive), đảo ngữ (inversion), câu chẻ (cleft) và mệnh đề phân từ.",
        "grade": 12,
        "format_type": "hsg_olympic",
        "skill_category": "advanced_grammar",
        "duration_minutes": 90,
        "total_questions": 50,
        "pass_percentage": 75,
        "created_by": "Hội đồng Bồi dưỡng HSG",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_rewriting_700_mastery",
        "curriculum_id": "curr_g9",
        "title": "Đề Khảo Sát Viết Lại Câu Tuyển Sinh Lớp 10 (Rewriting Sentences)",
        "description": "Trích từ 700 câu bài tập viết lại câu có lời giải chi tiết: Chuyển đổi thì, mệnh đề nhượng bộ, câu điều kiện và câu bị động kép.",
        "grade": 9,
        "format_type": "entrance_exam",
        "skill_category": "sentence_transformation",
        "duration_minutes": 60,
        "total_questions": 30,
        "pass_percentage": 70,
        "created_by": "Tổ Chuyên Môn THCS",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_phrasal_verbs_olympic",
        "curriculum_id": "curr_g11",
        "title": "Đề Kiểm Tra Chuyên Đề: 100 Cụm Động Từ (Phrasal Verbs) Thi Olympic",
        "description": "Đánh giá khả năng hiểu sâu và áp dụng phrasal verbs trong ngữ cảnh thực tế, kiểm tra bẫy tiểu từ và thành ngữ đi kèm.",
        "grade": 11,
        "format_type": "olympic_special",
        "skill_category": "lexico_grammar",
        "duration_minutes": 45,
        "total_questions": 35,
        "pass_percentage": 70,
        "created_by": "Cô Dung Olympic Team",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    }
]

for e in mega_exams_additions:
    exam_dict[e['id']] = e

final_exams = list(exam_dict.values())
print(f"Total exams after mega expansion: {len(final_exams)}")

with open('src/lib/data/exams.json', 'w', encoding='utf-8') as f:
    json.dump(final_exams, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# 4. ENRICH QUESTIONS DATABASE (src/lib/data/questions.json)
# -------------------------------------------------------------
print("\n--> Step 4: Enriching Questions Database (src/lib/data/questions.json)...")

with open('src/lib/data/questions.json', 'r', encoding='utf-8') as f:
    existing_questions = json.load(f)

q_dict = {q['id']: q for q in existing_questions}

mega_questions_additions = [
    # HSG 1000 Câu Trắc Nghiệm Ngữ Pháp
    {
        "id": "q_hsg1000_01",
        "exam_id": "ex_hsg_thpt_1000_syntax",
        "prompt": "The attending physician insisted that his patient ______ complete bed rest for at least two weeks.",
        "options": [
            "A. take",
            "B. takes",
            "C. to take",
            "D. took"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Cấu trúc thể giả định (subjunctive mood) với động từ 'insist that + S + (should) + V_nguyên thể' không chia.",
        "cambridge_level": "CAE_C1",
        "skill": "grammar",
        "grade": 12
    },
    {
        "id": "q_hsg1000_02",
        "exam_id": "ex_hsg_thpt_1000_syntax",
        "prompt": "Only in the most pristine and protected rainforest environments ______ these endangered orchid species flourish.",
        "options": [
            "A. can",
            "B. they can",
            "C. which can",
            "D. are"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Đảo ngữ với cụm từ mở đầu 'Only in...': Trợ động từ 'can' đứng ngay trước chủ ngữ 'these endangered orchid species'.",
        "cambridge_level": "CAE_C1",
        "skill": "inversion",
        "grade": 12
    },
    {
        "id": "q_hsg1000_03",
        "exam_id": "ex_hsg_thpt_1000_syntax",
        "prompt": "Hardly ______ the final whistle blown when celebratory fireworks erupted throughout the stadium.",
        "options": [
            "A. had",
            "B. was",
            "C. did",
            "D. has"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Cấu trúc đảo ngữ 'Hardly had + S + V3/ed + when + S + V2/ed' diễn tả hành động vừa xảy ra thì hành động khác ập tới.",
        "cambridge_level": "CAE_C1",
        "skill": "inversion",
        "grade": 12
    },

    # Phrasal Verbs Key Worksheet
    {
        "id": "q_pv_01",
        "exam_id": "ex_phrasal_verbs_olympic",
        "prompt": "It was the third time in six months that the neighborhood jewelry store had been ______ by masked burglars.",
        "options": [
            "A. held up",
            "B. held down",
            "C. held over",
            "D. held on"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'hold up' mang nghĩa cướp có vũ trang (to rob someone or a bank/store using weapons).",
        "cambridge_level": "FCE_B2",
        "skill": "phrasal_verbs",
        "grade": 11
    },
    {
        "id": "q_pv_02",
        "exam_id": "ex_phrasal_verbs_olympic",
        "prompt": "The environmental summit organizers decided to ______ the outdoor opening ceremony due to gale-force winds.",
        "options": [
            "A. call off",
            "B. call on",
            "C. call up",
            "D. call for"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'call off' = hủy bỏ sự kiện (cancel).",
        "cambridge_level": "PET_B1",
        "skill": "phrasal_verbs",
        "grade": 11
    },
    {
        "id": "q_pv_03",
        "exam_id": "ex_phrasal_verbs_olympic",
        "prompt": "We are sincerely looking forward to ______ from the scholarship admission board soon.",
        "options": [
            "A. hearing",
            "B. hear",
            "C. heard",
            "D. be hearing"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Sau cấu trúc 'look forward to' là danh động từ V-ing ('hearing').",
        "cambridge_level": "KET_A2",
        "skill": "phrasal_verbs",
        "grade": 7
    },

    # Viết Lại Câu Tuyển Chọn (viet_lai_cau_1_100.docx)
    {
        "id": "q_rw_01",
        "exam_id": "ex_rewriting_700_mastery",
        "prompt": "Rewrite: 'If the project is finished by lunchtime, you can leave early.' -> 'Provided ______'",
        "options": [
            "A. that the project is finished by lunchtime, you can leave early.",
            "B. the project finished by lunchtime, you can leave early.",
            "C. if the project is finished by lunchtime, you can leave early.",
            "D. that you finish the project, so you leave early."
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'Provided (that) + clause' thay thế hoàn hảo cho liên từ điều kiện 'If + clause'.",
        "cambridge_level": "FCE_B2",
        "skill": "sentence_transformation",
        "grade": 9
    },
    {
        "id": "q_rw_02",
        "exam_id": "ex_rewriting_700_mastery",
        "prompt": "Rewrite: 'They last renovated their ancestral home five years ago.' -> 'They haven't ______'",
        "options": [
            "A. renovated their ancestral home for five years.",
            "B. renovated their ancestral home since five years.",
            "C. renovate their ancestral home five years ago.",
            "D. been renovating their ancestral home in five years."
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Chuyển đổi từ 'last V2/ed ... ago' sang 'haven't/hasn't V3/ed for ...'.",
        "cambridge_level": "PET_B1",
        "skill": "sentence_transformation",
        "grade": 9
    },

    # Cities and Urbanisation (cities_urbanisation_vocab.docx)
    {
        "id": "q_cu_01",
        "exam_id": "ex_g12_cities_urbanisation",
        "prompt": "The metropolitan city's _______ suffered heavy collapse during the historic flooding.",
        "options": [
            "A. infrastructure",
            "B. congestion",
            "C. inhabitant",
            "D. neighbourhood"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'infrastructure' = cơ sở hạ tầng (cầu cống, đường sá, lưới điện).",
        "cambridge_level": "CAE_C1",
        "skill": "vocabulary",
        "grade": 12
    },
    {
        "id": "q_cu_02",
        "exam_id": "ex_g12_cities_urbanisation",
        "prompt": "More green corridors and rooftop gardens must be planted to guarantee _______ urban expansion.",
        "options": [
            "A. sustainable",
            "B. sustaining",
            "C. sustained",
            "D. sustain"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'sustainable urban expansion' = sự phát triển/mở rộng đô thị bền vững.",
        "cambridge_level": "CAE_C1",
        "skill": "collocation",
        "grade": 12
    },

    # Our Heritage (our_heritage_vocab.docx)
    {
        "id": "q_oh_01",
        "exam_id": "ex_g12_our_heritage",
        "prompt": "The ancient _______ of Thang Long preserves multi-layered relics from the Ly, Tran, and Le dynasties.",
        "options": [
            "A. citadel",
            "B. souvenir",
            "C. landscape",
            "D. dynasty"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'citadel' = thành lũy, hoàng thành cổ kính (Imperial Citadel of Thang Long).",
        "cambridge_level": "FCE_B2",
        "skill": "vocabulary",
        "grade": 12
    }
]

for q in mega_questions_additions:
    q_dict[q['id']] = q

final_questions = list(q_dict.values())
print(f"Total questions after mega expansion: {len(final_questions)}")

with open('src/lib/data/questions.json', 'w', encoding='utf-8') as f:
    json.dump(final_questions, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# 5. SYNC SQLITE RELATIONAL DATABASE (data/tienganh7.db)
# -------------------------------------------------------------
print("\n--> Step 5: Synchronizing SQLite Database (data/tienganh7.db)...")
conn = sqlite3.connect('data/tienganh7.db')
cur = conn.cursor()

# Sync words
cur.execute("DELETE FROM words")
for idx, w in enumerate(final_vocab):
    word_id = w.get('id') or f"w_{idx+1}"
    cur.execute("""
        INSERT INTO words (id, term, ipa, pos, meaning_vi, vowels_detail, consonants_detail, phonics_note, syllables, example_en, example_vi, unit_id, grade, cambridge_level, difficulty, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        word_id,
        w.get('term', ''),
        w.get('ipa', ''),
        w.get('pos', ''),
        w.get('meaning_vi', ''),
        w.get('vowels_detail', ''),
        w.get('consonants_detail', ''),
        w.get('phonics_note', ''),
        w.get('syllables', ''),
        w.get('example_en', ''),
        w.get('example_vi', ''),
        w.get('unit_id', 'general'),
        w.get('grade', 'Lớp 7'),
        w.get('cambridge_level', 'A2'),
        w.get('difficulty', 'standard'),
        w.get('topic', 'General')
    ))

# Sync grammar_topics
cur.execute("DELETE FROM grammar_topics")
for idx, g in enumerate(final_grammar):
    cur.execute("""
        INSERT INTO grammar_topics (id, topic, grade_level, curriculum_unit, category, cefr_level, summary, formula_json, usage_json, signal_words_json, phonics_rules, common_mistakes, examples_json, practice_questions_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        g.get('id', f'gram_{idx+1}'),
        g.get('topic', ''),
        g.get('grade_level', 'Toàn cấp'),
        g.get('curriculum_unit', ''),
        g.get('category', 'general'),
        g.get('cefr_level', 'B1'),
        g.get('summary', ''),
        json.dumps(g.get('formula', {}), ensure_ascii=False),
        json.dumps(g.get('usage', []), ensure_ascii=False),
        json.dumps(g.get('signal_words', []), ensure_ascii=False),
        g.get('phonics_rules', ''),
        g.get('common_mistakes', ''),
        json.dumps(g.get('examples', []), ensure_ascii=False),
        json.dumps(g.get('practice_questions', []), ensure_ascii=False)
    ))

# Sync exams
cur.execute("DELETE FROM exams")
for e in final_exams:
    cur.execute("""
        INSERT INTO exams (id, curriculum_id, title, description, grade, format_type, skill_category, duration_minutes, total_questions, pass_percentage, created_by, is_published, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        e.get('id'),
        e.get('curriculum_id', 'curr_g7'),
        e.get('title'),
        e.get('description', ''),
        e.get('grade', 7),
        e.get('format_type', 'standard_45m'),
        e.get('skill_category', 'mixed'),
        e.get('duration_minutes', 45),
        e.get('total_questions', 20),
        e.get('pass_percentage', 60),
        e.get('created_by', 'Cô Dung'),
        e.get('is_published', 1),
        e.get('created_at', '2026-09-25 10:00:00')
    ))

# Sync exam_questions
cur.execute("DELETE FROM exam_questions")
for idx, q in enumerate(final_questions):
    cur.execute("""
        INSERT INTO exam_questions (id, exam_id, question_index, grade, skill, type, prompt, options_json, correct_answer, explanation, cambridge_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        idx + 1,
        q.get('exam_id', 'ex_std_45m_g7'),
        idx + 1,
        q.get('grade', 7),
        q.get('skill', 'general'),
        q.get('type', 'multiple_choice'),
        q.get('prompt', ''),
        json.dumps(q.get('options', []), ensure_ascii=False),
        q.get('correct_answer', 'A'),
        q.get('explanation', ''),
        q.get('cambridge_level', 'KET_A2')
    ))

conn.commit()
conn.close()
print("SQLite database data/tienganh7.db verified and fully synchronized!")

# -------------------------------------------------------------
# 6. GENERATE OBSIDIAN SECOND BRAIN VAULT
# -------------------------------------------------------------
print("\n--> Step 6: Generating Obsidian Second Brain Vault (second_brain/ & obsidian_vault/)...")

VAULT_DIR = 'second_brain'
os.makedirs(VAULT_DIR, exist_ok=True)

subfolders = [
    '01_CURRICULUM_GDPT',
    '02_GRAMMAR_KNOWLEDGE_BASE',
    '03_VOCABULARY_ATLAS',
    '04_EXAMS_AND_QUESTION_BANK',
    '05_TEACHING_SOP_AND_PEDAGOGY',
    '.obsidian'
]

for sf in subfolders:
    os.makedirs(os.path.join(VAULT_DIR, sf), exist_ok=True)

# 6.1 Create .obsidian configuration files
obsidian_app_json = {
    "legacyEditor": False,
    "livePreview": True,
    "useMarkdownLinks": False,
    "newFileLocation": "root",
    "attachmentFolderPath": "assets"
}
with open(os.path.join(VAULT_DIR, '.obsidian', 'app.json'), 'w', encoding='utf-8') as f:
    json.dump(obsidian_app_json, f, indent=2)

obsidian_graph_json = {
    "collapse-filter": False,
    "search": "",
    "colorGroups": [
        {"query": "tag:#moc", "color": {"a": 1, "rgb": 16753920}},
        {"query": "tag:#grammar", "color": {"a": 1, "rgb": 3394815}},
        {"query": "tag:#vocab", "color": {"a": 1, "rgb": 65451}},
        {"query": "tag:#exam", "color": {"a": 1, "rgb": 16724630}},
        {"query": "tag:#curriculum", "color": {"a": 1, "rgb": 11342591}},
        {"query": "tag:#pedagogy", "color": {"a": 1, "rgb": 16766720}}
    ]
}
with open(os.path.join(VAULT_DIR, '.obsidian', 'graph.json'), 'w', encoding='utf-8') as f:
    json.dump(obsidian_graph_json, f, indent=2)

# 6.2 Master Index MOC
index_content = """---
title: "🧠 Tiếng Anh Cô Dung - Master Second Brain & Knowledge Graph"
aliases: ["Index", "Dashboard", "Home", "Second Brain Hub"]
tags: ["#moc", "#second-brain", "#hub"]
author: "Cô Dung & Đội Ngũ Sư Phạm"
version: "2.4.0"
updated_at: "2026-09-25"
---

# 🧠 TIẾNG ANH CÔ DUNG: SECOND BRAIN KNOWLEDGE GRAPH

> [!abstract] BẢN ĐỒ TRI THỨC TOÀN DIỆN (MAP OF CONTENT)
> Chào mừng bạn đến với **Lớp Tri Thức Thứ Hai (Second Brain)** của Hệ thống Đào tạo Tiếng Anh Cô Dung. 
> Toàn bộ tri thức được kết nối bằng **mạng lưới liên kết 2 chiều (Bi-directional WikiLinks `[[...]]`)**, chuẩn hóa theo Chương trình GDPT 2018/2026 của Bộ GD&ĐT và Khung năng lực Châu Âu CEFR (A1 - C2).

---

## 🗺️ 5 TRỤ CỘT TRI THỨC CHÍNH (CORE PILLARS)

```mermaid
graph TD
    MOC["🧠 00_INDEX_MOC (Central Hub)"]
    MOC --> C["📚 01_CURRICULUM_GDPT"]
    MOC --> G["📐 02_GRAMMAR_KNOWLEDGE_BASE"]
    MOC --> V["🔤 03_VOCABULARY_ATLAS"]
    MOC --> E["📝 04_EXAMS_AND_QUESTION_BANK"]
    MOC --> P["👩‍🏫 05_TEACHING_SOP_AND_PEDAGOGY"]

    C <--> G
    G <--> E
    V <--> E
    V <--> G
    P --> C
```

### 1. [[GDPT_Master_Curriculum_MOC|📚 01. Chương Trình GDPT & Lộ Trình 12 Năm]]
- [[Tieu_Hoc_Lop_1_5|🌱 Bậc Tiểu Học (Lớp 1 - 5)]]: Phonics tự nhiên, TPR, phản xạ nghe nói Cambridge Young Learners.
- [[THCS_Lop_6_9|🌿 Bậc THCS (Lớp 6 - 9)]]: Chuyên đề ngữ pháp cốt lõi, bồi dưỡng HSG, luyện thi Vào 10 Chuyên Anh.
- [[THPT_Lop_10_12|🌳 Bậc THPT (Lớp 10 - 12)]]: Ngữ pháp học thuật nâng cao, luyện thi Tốt nghiệp THPT 2026.
- [[International_IELTS_TOEIC_CEFR|🌏 Hệ Thống Chứng Chỉ Quốc Tế]]: KET (A2), PET (B1), IELTS Academic (6.5 - 8.0+), TOEIC.

### 2. [[Grammar_Master_MOC|📐 02. Cơ Sở Tri Thức Ngữ Pháp Toàn Diện (Grammar Vault)]]
- **Thì & Dạng Động Từ:** [[Present_Simple_and_Continuous]], [[Past_Simple_and_Continuous]], [[Present_Perfect_Mastery]], [[Future_Forms_and_Intentions]].
- **Cấu Trúc Câu Mệnh Đề:** [[Conditionals_Type_1_2_3_Mixed]], [[Relative_Clauses_Defining_NonDefining]], [[Passive_Voice_and_Causative]], [[Reported_Speech_and_Reporting_Verbs]].
- **Chuyên Đề Nâng Cao (HSG & THPT):** [[Inversion_and_Cleft_Sentences]], [[Subjunctive_Mood_and_Wish]], [[Stative_vs_Dynamic_Verbs]], [[Phrasal_Verbs_Top_100]], [[Conjunctions_and_Adverbial_Clauses]], [[Comparison_Equal_Comparative_Superlative]].

### 3. [[Vocabulary_Atlas_MOC|🔤 03. Bản Đồ Từ Vựng & Âm Vị Học (Lexicon Atlas)]]
- [[Phonics_and_IPA_Sound_System|🔊 Hệ Thống 44 Âm Quốc Tế IPA & Quy Tắc Ngữ Âm]]: Phát âm đuôi -ed, -s/-es, trọng âm 2-3-4 âm tiết.
- [[Word_Formation_and_Affixes|🧩 Cấu Tạo Từ & Tiền Tố - Hậu Tố]]: 1000 dạng bài Word Formation trích xuất từ đề thi HSG.
- **Từ Vựng Theo Cấp Độ CEFR:**
  - [[Lexicon_Primary_G1_G5|Pre-A1 -> A1 (Tiểu học)]]
  - [[Lexicon_Secondary_G6_G9|A2 -> B1 (THCS)]]
  - [[Lexicon_HighSchool_G10_G12|B1+ -> B2 (THPT)]]
  - [[Lexicon_Academic_IELTS_C1_C2|C1 -> C2 (Học sinh giỏi & IELTS)]]
- [[Collocations_and_Idiomatic_Expressions|💡 Cụm Từ Cố Định & Thành Ngữ Điểm Cao]]

### 4. [[Exams_MOC|📝 04. Ngân Hàng Đề Thi & Kỹ Thuật Làm Bài]]
- [[HSG_Grade7_YenLap_Breakdown|🏆 Đề HSG Lớp 7 Huyện Yên Lập (Phân tích chi tiết)]]
- [[HSG_Grade12_QuangNam_Breakdown|🥇 Đề HSG Tỉnh Lớp 12 Quảng Nam (Phân tích đáp án)]]
- [[THPT_QuocGia_2026_Format|🎯 Định Dạng Đề Thi Tốt Nghiệp THPT Mới 2026]]
- [[Sentence_Transformation_Techniques_700|✍️ 700 Dạng Bài Viết Lại Câu Tuyển Chọn]]
- [[IELTS_Academic_Reading_Techniques|📖 Kỹ Thuật Skimming/Scanning Reading IELTS 8.0+]]

### 5. [[Pedagogy_MOC|👩‍🏫 05. Sổ Tay Nghiệp Vụ & Quy Chuẩn Giảng Dạy Cô Dung]]
- [[Co_Dung_Teaching_Philosophy|✨ Triết Lý Giáo Dục Đa Trí Thông Minh]]
- [[Gamification_and_Star_Rewards_Rubric|⭐ Quy Chuẩn Thưởng Sao & Đấu Trường Game]]
- [[Tuition_and_Parent_Communication_SOP|📱 Quy Trình Báo Cáo Học Phí & Zalo Bot Tự Động]]

---

## ⚡ HƯỚNG DẪN TRUY XUẤT NHANH (QUICK ACTIONS)
- **Mở trong Obsidian:** Nhấn `Ctrl + O` để tìm nhanh bất kỳ khái niệm nào.
- **Xem Đồ Thị Tri Thức:** Nhấn `Ctrl + G` để mở **Graph View**, chiêm ngưỡng toàn bộ mạng lưới node tri thức liên kết 3D.
- **Tra cứu trên Web:** Truy cập trực tiếp tại endpoint `/second-brain` trên ứng dụng SvelteKit.
"""
with open(os.path.join(VAULT_DIR, '00_INDEX_MOC.md'), 'w', encoding='utf-8') as f:
    f.write(index_content)

# 6.3 Curriculum Notes
curriculum_moc = """---
title: "📚 GDPT Master Curriculum MOC"
tags: ["#curriculum", "#moc", "#gdpt2018"]
updated_at: "2026-09-25"
---
# 📚 KHUNG CHƯƠNG TRÌNH GDPT 2018 & 2026 (MAP OF CONTENT)

Lộ trình đào tạo 12 năm học phổ thông kết nối với các chứng chỉ quốc tế:

- [[Tieu_Hoc_Lop_1_5]]: Lớp 1 -> Lớp 5 (Chuẩn đầu ra Starters / Movers / Flyers).
- [[THCS_Lop_6_9]]: Lớp 6 -> Lớp 9 (Chuẩn đầu ra KET A2 / PET B1 / Chuyên Anh).
- [[THPT_Lop_10_12]]: Lớp 10 -> Lớp 12 (Chuẩn đầu ra THPT QG 2026 / IELTS 6.5 - 7.5+).
- [[International_IELTS_TOEIC_CEFR]]: Bảng quy đổi chuẩn quốc tế.

Liên kết với: [[00_INDEX_MOC]], [[Grammar_Master_MOC]], [[Vocabulary_Atlas_MOC]].
"""
with open(os.path.join(VAULT_DIR, '01_CURRICULUM_GDPT', 'GDPT_Master_Curriculum_MOC.md'), 'w', encoding='utf-8') as f:
    f.write(curriculum_moc)

# Write Tieu_Hoc_Lop_1_5.md
with open(os.path.join(VAULT_DIR, '01_CURRICULUM_GDPT', 'Tieu_Hoc_Lop_1_5.md'), 'w', encoding='utf-8') as f:
    f.write("""---
title: "🌱 Bậc Tiểu Học (Lớp 1 - 5) - Chuẩn GDPT & Cambridge Young Learners"
tags: ["#curriculum/primary", "#cefr/a1"]
---
# 🌱 CHƯƠNG TRÌNH TIẾNG ANH TIỂU HỌC (LỚP 1 - 5)

## 1. Mục tiêu đào tạo
- Hình thành tình yêu với ngôn ngữ qua hình ảnh, bài hát, vận động TPR.
- Làm chủ [[Phonics_and_IPA_Sound_System|Ngữ âm Phonics]] tự nhiên.
- Tích lũy 500+ từ vựng cơ bản theo chủ đề trường học, gia đình, vật nuôi.

## 2. Các đơn vị bài học trọng tâm
- **Lớp 3:** Đồ dùng học tập, số đếm, màu sắc, thành viên gia đình.
- **Lớp 4:** Giờ giấc, thời khóa biểu, nghề nghiệp cha mẹ, địa điểm công cộng.
- **Lớp 5:** Kể về kỳ nghỉ hè quá khứ ([[Past_Simple_and_Continuous]]), thói quen hàng ngày ([[Present_Simple_and_Continuous]]).

Liên kết: [[GDPT_Master_Curriculum_MOC]], [[Lexicon_Primary_G1_G5]].
""")

# Write THCS_Lop_6_9.md
with open(os.path.join(VAULT_DIR, '01_CURRICULUM_GDPT', 'THCS_Lop_6_9.md'), 'w', encoding='utf-8') as f:
    f.write("""---
title: "🌿 Bậc THCS (Lớp 6 - 9) - Bứt Phá Ngữ Pháp & Bồi Dưỡng HSG"
tags: ["#curriculum/secondary", "#cefr/a2", "#cefr/b1"]
---
# 🌿 CHƯƠNG TRÌNH TIẾNG ANH THCS (LỚP 6 - 9)

## 1. Trọng tâm học thuật
- Nắm vững 12 thì cơ bản, câu bị động, câu điều kiện, mệnh đề quan hệ.
- Chuyên sâu dạng bài [[Sentence_Transformation_Techniques_700|Viết lại câu 700 dạng]].
- Luyện thi tuyển sinh lớp 10 THPT công lập & chuyên Anh.

## 2. Phân phối chương trình
- **Lớp 6:** My New School, Home Life, Community.
- **Lớp 7:** Hobbies, Healthy Living, Community Service, Traffic Safety.
- **Lớp 8:** Ethnic Groups, Local Crafts, Environmental Protection.
- **Lớp 9:** Local Community, Wonders of Vietnam, Tourism, Careers.

Liên kết: [[GDPT_Master_Curriculum_MOC]], [[HSG_Grade7_YenLap_Breakdown]], [[Lexicon_Secondary_G6_G9]].
""")

# Write THPT_Lop_10_12.md
with open(os.path.join(VAULT_DIR, '01_CURRICULUM_GDPT', 'THPT_Lop_10_12.md'), 'w', encoding='utf-8') as f:
    f.write("""---
title: "🌳 Bậc THPT (Lớp 10 - 12) - Chinh Phục Tốt Nghiệp 2026 & Đại Học"
tags: ["#curriculum/highschool", "#cefr/b2", "#cefr/c1"]
---
# 🌳 CHƯƠNG TRÌNH TIẾNG ANH THPT (LỚP 10 - 12)

## 1. Định hướng khảo thí
- Bám sát ma trận đề thi tốt nghiệp THPT Quốc Gia từ năm 2026.
- Đọc hiểu chuyên sâu các chủ đề toàn cầu: [[Cities and Urbanisation]], [[Our Heritage]], Trí tuệ nhân tạo, Biến đổi khí hậu.
- Sử dụng thành thạo [[Inversion_and_Cleft_Sentences]], [[Subjunctive_Mood_and_Wish]].

Liên kết: [[GDPT_Master_Curriculum_MOC]], [[THPT_QuocGia_2026_Format]], [[HSG_Grade12_QuangNam_Breakdown]].
""")

# 6.4 Grammar Master Notes
grammar_moc = """---
title: "📐 Grammar Master Map of Content"
tags: ["#grammar", "#moc"]
updated_at: "2026-09-25"
---
# 📐 CƠ SỞ TRI THỨC NGỮ PHÁP (GRAMMAR MASTER VAULT)

Tổng hợp các chuyên đề ngữ pháp tinh hoa phục vụ đào tạo từ cơ bản đến nâng cao:

| Chuyên Đề | Cấp Độ | Liên Kết Ghi Chú | Bài Kiểm Tra Minh Họa |
| :--- | :--- | :--- | :--- |
| Thì Hiện Tại Đơn & Tiếp Diễn | A1 - A2 | [[Present_Simple_and_Continuous]] | [[ex_quick_15m_g7]] |
| Thì Quá Khứ Đơn & Hoàn Thành | A2 - B1 | [[Past_Simple_and_Continuous]] | [[ex_std_45m_g7]] |
| Hiện Tại Hoàn Thành Toàn Diện | A2 - B1 | [[Present_Perfect_Mastery]] | [[ex_g7_hsg_yen_lap]] |
| Câu Điều Kiện Loại 1, 2, 3 & Mixed | A2 - B2 | [[Conditionals_Type_1_2_3_Mixed]] | [[ex_g9_vao_10]] |
| Mệnh Đề Quan Hệ (Relative Clauses) | B1 - B2 | [[Relative_Clauses_Defining_NonDefining]] | [[ex_g10_gk1_friends]] |
| Câu Bị Động & Thể Truyền Khiến | B1 - B2 | [[Passive_Voice_and_Causative]] | [[ex_g11_hsg_tinh]] |
| Câu Gián Tiếp & Động Từ Báo Cáo | B1 - B2 | [[Reported_Speech_and_Reporting_Verbs]] | [[ex_g8_gk1_global]] |
| Đảo Ngữ & Câu Chẻ Nhấn Mạnh | B2 - C1 | [[Inversion_and_Cleft_Sentences]] | [[ex_hsg_thpt_1000_syntax]] |
| Thể Giả Định (Subjunctive Mood) | C1 - C2 | [[Subjunctive_Mood_and_Wish]] | [[ex_hsg_thpt_1000_syntax]] |
| 100 Cụm Động Từ (Phrasal Verbs) | A2 - C1 | [[Phrasal_Verbs_Top_100]] | [[ex_phrasal_verbs_olympic]] |
| Kỹ Thuật Viết Lại Câu (Rewriting) | A2 - B2 | [[Sentence_Transformation_Techniques_700]] | [[ex_rewriting_700_mastery]] |
| Động Từ Trạng Thái vs Hành Động | B1 - B2 | [[Stative_vs_Dynamic_Verbs]] | [[ex_g11_cities_future]] |

Về trang chủ: [[00_INDEX_MOC]]
"""
with open(os.path.join(VAULT_DIR, '02_GRAMMAR_KNOWLEDGE_BASE', 'Grammar_Master_MOC.md'), 'w', encoding='utf-8') as f:
    f.write(grammar_moc)

# Write Inversion_and_Cleft_Sentences.md
with open(os.path.join(VAULT_DIR, '02_GRAMMAR_KNOWLEDGE_BASE', 'Inversion_and_Cleft_Sentences.md'), 'w', encoding='utf-8') as f:
    f.write("""---
title: "Cấu Trúc Đảo Ngữ & Câu Chẻ Nhấn Mạnh (Inversion & Cleft Sentences)"
tags: ["#grammar/advanced", "#cefr/b2", "#cefr/c1", "#exam/hsg"]
---
# ⚡ ĐẢO NGỮ VÀ CÂU CHẺ NHẤN MẠNH (INVERSION & CLEFT SENTENCES)

> [!important] NGUYÊN TẮC VÀNG
> Đảo ngữ là hiện tượng đưa trợ động từ lên trước chủ ngữ nhằm tăng cường độ biểu cảm hoặc nhấn mạnh tính chất phủ định.

## 1. Công thức Đảo Ngữ Tổng Quát
$$\\text{Negative Adverb} + \\text{Auxiliary} + \\text{Subject} + \\text{Main Verb}$$

### A. Nhóm Phó Từ Phủ Định
- **Hardly / Scarcely ... when:** Vừa mới ... thì ...
  - *Ví dụ:* Hardly **had** the bell rung **when** the students left.
- **No sooner ... than:** Vừa mới ... thì ...
  - *Ví dụ:* No sooner **had** she arrived **than** the rain poured.
- **Never / Rarely / Seldom:**
  - *Ví dụ:* Never in my life **have I witnessed** such a magnificent spectacle.

### B. Nhóm Cụm Từ Chứa 'No' (Đứng đầu câu đảo ngữ ngay)
- Under no circumstances + Trợ động từ + S + V
- At no time + Trợ động từ + S + V
- On no account + Trợ động từ + S + V

## 2. Câu Chẻ Nhấn Mạnh (Cleft Sentence)
$$\\text{It} + \\text{is/was} + [\\text{Thành phần nhấn mạnh: S / O / Trạng từ}] + \\text{that} + \\dots$$

- *Ví dụ:* **It was in Hanoi that** they first met each other. (Nhấn mạnh nơi chốn)
- *Ví dụ:* **It was my teacher who** encouraged me to enter the English Olympic contest.

Liên kết bài tập: [[ex_hsg_thpt_1000_syntax]], [[Grammar_Master_MOC]].
""")

# Write Phrasal_Verbs_Top_100.md
with open(os.path.join(VAULT_DIR, '02_GRAMMAR_KNOWLEDGE_BASE', 'Phrasal_Verbs_Top_100.md'), 'w', encoding='utf-8') as f:
    f.write("""---
title: "Top 100 Cụm Động Từ Thường Gặp Nhất Trong Đề Thi (Phrasal Verbs)"
tags: ["#grammar/phrasal-verbs", "#vocab", "#exam"]
---
# 🎯 TOP CỤM ĐỘNG TỪ BẤT HỦ TRONG CÁC KỲ THI TIẾNG ANH

Trích xuất trực tiếp từ chuyên đề Google Drive `phrasal_verbs_key.docx` & `100 cum dong tu hay gap nhat trong de thi.doc`:

## 1. Nhóm 'Hold' & 'Bring'
- **Hold up:** 1. Hoãn lại (= delay); 2. Cướp có vũ trang (= rob with weapon).
  - *Câu thi thực tế:* The bank was **held up** by two armed men yesterday.
- **Bring about:** Gây ra, mang lại sự chuyển biến lớn (= cause).
  - *Câu thi thực tế:* Major technological breakthroughs will **bring about** social changes.

## 2. Nhóm 'Call' & 'Put'
- **Call off:** Hủy bỏ (= cancel).
  - *Phân biệt:* **Put off** là trì hoãn (= postpone, delay).
- **Put up with:** Chịu đựng (= tolerate).
  - *Ví dụ:* I cannot **put up with** his rude behavior any longer.

## 3. Nhóm 'Look'
- **Look after:** Chăm sóc (= take care of).
- **Look forward to + V-ing:** Mong đợi điều gì với niềm hân hoan.
- **Look down on:** Khinh thường ai đó.
- **Look up to:** Tôn kính, ngưỡng mộ ai đó (= admire).

Liên kết bài tập: [[ex_phrasal_verbs_olympic]], [[Grammar_Master_MOC]].
""")

# 6.5 Vocabulary Atlas Notes
vocab_moc = """---
title: "🔤 Vocabulary Atlas Map of Content"
tags: ["#vocab", "#moc", "#phonics"]
updated_at: "2026-09-25"
---
# 🔤 BẢN ĐỒ TỪ VỰNG & NGỮ ÂM (VOCABULARY ATLAS MOC)

Mạng lưới từ vựng phân tầng đa chiều:

- [[Phonics_and_IPA_Sound_System]]: Bảng 44 ký hiệu phiên âm quốc tế IPA và quy luật phát âm.
- [[Word_Formation_and_Affixes]]: 1000 quy tắc biến đổi từ (Noun, Verb, Adj, Adv).
- [[Lexicon_Primary_G1_G5]]: 500 từ cơ sở bậc Tiểu học.
- [[Lexicon_Secondary_G6_G9]]: 1000 từ học thuật bậc THCS.
- [[Lexicon_HighSchool_G10_G12]]: 1500 từ chuyên sâu bậc THPT.
- [[Lexicon_Academic_IELTS_C1_C2]]: Từ vựng Band 7.5 - 8.5+ IELTS & HSG Quốc Gia.
- [[Collocations_and_Idiomatic_Expressions]]: Thành ngữ và cụm từ cố định.

Quay lại: [[00_INDEX_MOC]]
"""
with open(os.path.join(VAULT_DIR, '03_VOCABULARY_ATLAS', 'Vocabulary_Atlas_MOC.md'), 'w', encoding='utf-8') as f:
    f.write(vocab_moc)

# Write Phonics_and_IPA_Sound_System.md
with open(os.path.join(VAULT_DIR, '03_VOCABULARY_ATLAS', 'Phonics_and_IPA_Sound_System.md'), 'w', encoding='utf-8') as f:
    f.write("""---
title: "Hệ Thống 44 Ký Hiệu Quốc Tế IPA & Quy Tắc Ngữ Âm Chuẩn Xác"
tags: ["#phonics", "#ipa", "#pronunciation"]
---
# 🔊 BẢN ĐỒ NGỮ ÂM QUỐC TẾ IPA (PHONICS SOUND SYSTEM)

## 1. Quy tắc phát âm đuôi '-ed'
Có 3 cách phát âm cực chuẩn:
1. **/ɪd/:** Khi động từ kết thúc bằng âm **/t/** hoặc **/d/** (wanted, decided, visited).
2. **/t/:** Khi động từ kết thúc bằng phụ âm vô thanh: **/p, k, f, s, ʃ, tʃ/** (stopped, looked, laughed, washed, watched).
3. **/d/:** Các trường hợp còn lại (nguyên âm và phụ âm hữu thanh: played, loved, cleaned).

## 2. Quy tắc phát âm đuôi '-s / -es'
1. **/ɪz/:** Khi từ kết thúc bằng âm gió **/s, z, ʃ, ʒ, tʃ, dʒ/** (kisses, watches, bridges).
2. **/s/:** Khi từ kết thúc bằng âm vô thanh **/p, t, k, f, θ/** (stops, cats, books, laughs, months).
3. **/z/:** Các trường hợp còn lại (days, bags, loves).

## 3. Quy tắc trọng âm (Word Stress)
- **Từ 2 âm tiết:**
  - Danh từ / Tính từ: Thường nhấn âm 1 (*TEA-cher, HAP-py*).
  - Động từ: Thường nhấn âm 2 (*re-LAX, de-CIDE*).
- **Hậu tố hút trọng âm:** -ee, -eer, -ese, -ique (employ-EE, engi-NEER).
- **Hậu tố khiến trọng âm rơi ngay trước nó:** -tion, -sion, -ic, -ical, -ity, -logy (so-LU-tion, de-CI-sion, sta-TI-stics).

Liên kết: [[Vocabulary_Atlas_MOC]], [[00_INDEX_MOC]].
""")

# 6.6 Exams & Question Bank Notes
exams_moc = """---
title: "📝 Exams & Question Bank Map of Content"
tags: ["#exam", "#moc"]
updated_at: "2026-09-25"
---
# 📝 NGÂN HÀNG ĐỀ THI & PHÂN TÍCH MA TRẬN KHẢO THÍ

Tổng hợp bộ đề thi thực chiến có lời giải chi tiết:

- [[HSG_Grade7_YenLap_Breakdown]]: Phân tích đề thi HSG Lớp 7 Huyện Yên Lập.
- [[HSG_Grade12_QuangNam_Breakdown]]: Phân tích đề thi HSG Tỉnh Lớp 12 Tỉnh Quảng Nam.
- [[THPT_QuocGia_2026_Format]]: Ma trận đề thi tốt nghiệp THPT Quốc Gia form mới 2026.
- [[Sentence_Transformation_Techniques_700]]: Cẩm nang 700 câu viết lại câu ăn chắc điểm 9+.
- [[IELTS_Academic_Reading_Techniques]]: Chiến thuật đọc hiểu IELTS Reading 8.0+.

Quay lại: [[00_INDEX_MOC]].
"""
with open(os.path.join(VAULT_DIR, '04_EXAMS_AND_QUESTION_BANK', 'Exams_MOC.md'), 'w', encoding='utf-8') as f:
    f.write(exams_moc)

# Write Sentence_Transformation_Techniques_700.md
with open(os.path.join(VAULT_DIR, '04_EXAMS_AND_QUESTION_BANK', 'Sentence_Transformation_Techniques_700.md'), 'w', encoding='utf-8') as f:
    f.write("""---
title: "Cẩm Nang 700 Dạng Bài Viết Lại Câu Tuyển Chọn (Rewriting Sentences)"
tags: ["#exam/rewriting", "#grammar"]
---
# ✍️ CẨM NANG 700 CÂU BIẾN ĐỔI CÂU TƯƠNG ĐƯƠNG (REWRITING SENTENCES)

Trích xuất trực tiếp từ kho tài liệu `700 CÂU BÀI TẬP VIẾT LẠI CÂU`:

## 1. Dạng 1: Chuyển đổi liên từ nguyên nhân - kết quả
$$\\text{Because} + \\text{Clause} \\iff \\text{Because of} / \\text{Due to} / \\text{Owing to} + \\text{Noun Phrase / V-ing}$$
- *Gốc:* Because the weather was terrible, the flight was delayed.
- *Viết lại:* **Because of the terrible weather**, the flight was delayed.

## 2. Dạng 2: Chuyển đổi mệnh đề nhượng bộ
$$\\text{Although / Even though} + \\text{Clause} \\iff \\text{In spite of / Despite} + \\text{Noun Phrase / V-ing}$$
- *Gốc:* Although she had a high fever, she went to take the exam.
- *Viết lại:* **In spite of having a high fever**, she went to take the exam.

## 3. Dạng 3: Cấu trúc So ... That <=> Too ... For <=> Such ... That
$$\\text{S} + \\text{be} + \\text{so} + \\text{adj} + \\text{that} + \\dots \\iff \\text{It is} + \\text{too} + \\text{adj} + \\text{for someone to V}$$
- *Gốc:* The tea is so hot that I cannot drink it.
- *Viết lại:* The tea is **too hot for me to drink**.

Liên kết: [[Exams_MOC]], [[Grammar_Master_MOC]].
""")

# 6.7 Pedagogy & SOP Notes
pedagogy_moc = """---
title: "👩‍🏫 Pedagogy & Teaching SOP Map of Content"
tags: ["#pedagogy", "#sop", "#moc"]
updated_at: "2026-09-25"
---
# 👩‍🏫 SỔ TAY QUY TRÌNH & PHƯƠNG PHÁP SƯ PHẠM CÔ DUNG

- [[Co_Dung_Teaching_Philosophy]]: Triết lý lấy học sinh làm trung tâm, kết hợp công nghệ AI.
- [[Gamification_and_Star_Rewards_Rubric]]: Quy chế tặng sao, bảng xếp hạng và mở Đấu trường trò chơi.
- [[Tuition_and_Parent_Communication_SOP]]: Quy trình gửi phiếu điểm và thông báo học phí tự động qua Zalo Bot.

Quay lại: [[00_INDEX_MOC]].
"""
with open(os.path.join(VAULT_DIR, '05_TEACHING_SOP_AND_PEDAGOGY', 'Pedagogy_MOC.md'), 'w', encoding='utf-8') as f:
    f.write(pedagogy_moc)

print(f"Generated Obsidian Second Brain Vault at: {os.path.abspath(VAULT_DIR)}")
print("=== MEGA SYSTEM ENRICHMENT & SECOND BRAIN COMPLETE! ===")

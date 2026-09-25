import sqlite3
import json
import os
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

print("=== STARTING FULL EDUCATIONAL SYSTEM ENRICHMENT ===")

# -------------------------------------------------------------
# 1. LOAD EXISTING VOCABULARY AND MERGE EXPANDED SET
# -------------------------------------------------------------
with open('src/lib/data/vocabulary_db.json', 'r', encoding='utf-8') as f:
    existing_vocab = json.load(f)

vocab_by_term = {v['term'].lower().strip(): v for v in existing_vocab}

additional_vocab = [
    # Primary (Lớp 1 - 5)
    {
        "term": "pencil case",
        "ipa": "/ˈpensl keɪs/",
        "pos": "noun",
        "meaning_vi": "Hộp đựng bút",
        "phonics_note": "Âm đầu /p/ bật hơi, nguyên âm /eɪ/ trong 'case'.",
        "example_en": "I put my pens, pencils, and ruler into my pencil case.",
        "example_vi": "Em để bút mực, bút chì và thước kẻ vào trong hộp bút.",
        "cambridge_level": "Starters",
        "grade": "Lớp 3",
        "topic": "School Things",
        "unit_id": "unit_school"
    },
    {
        "term": "playground",
        "ipa": "/ˈpleɪɡraʊnd/",
        "pos": "noun",
        "meaning_vi": "Sân chơi trường học",
        "phonics_note": "Tổ hợp phụ âm /pl/, nguyên âm đôi /eɪ/ và /aʊ/.",
        "example_en": "Pupils play badminton in the playground during break time.",
        "example_vi": "Các bạn học sinh chơi cầu lông ở sân chơi vào giờ ra chơi.",
        "cambridge_level": "Movers",
        "grade": "Lớp 3",
        "topic": "School Life",
        "unit_id": "unit_school"
    },
    {
        "term": "morning exercise",
        "ipa": "/ˈmɔːnɪŋ ˈeksəsaɪz/",
        "pos": "noun phrase",
        "meaning_vi": "Thể dục buổi sáng",
        "phonics_note": "Trọng âm rơi vào âm tiết đầu tiên của cả hai từ: MORN-ing EX-er-cise.",
        "example_en": "Doing morning exercise regularly helps children stay healthy.",
        "example_vi": "Tập thể dục buổi sáng đều đặn giúp các em nhỏ giữ gìn sức khỏe.",
        "cambridge_level": "Flyers",
        "grade": "Lớp 4",
        "topic": "Daily Routine",
        "unit_id": "unit_health"
    },
    {
        "term": "school uniform",
        "ipa": "/skuːl ˈjuːnɪfɔːm/",
        "pos": "noun phrase",
        "meaning_vi": "Đồng phục học sinh",
        "phonics_note": "Nguyên âm dài /uː/ trong 'school', trọng âm rơi vào 'U-ni-form'.",
        "example_en": "Vietnamese students wear white uniforms every Monday morning.",
        "example_vi": "Học sinh Việt Nam mặc đồng phục trắng vào mỗi sáng thứ Hai.",
        "cambridge_level": "Flyers",
        "grade": "Lớp 5",
        "topic": "School Life",
        "unit_id": "unit_school"
    },
    {
        "term": "computer room",
        "ipa": "/kəmˈpjuːtə ruːm/",
        "pos": "noun phrase",
        "meaning_vi": "Phòng thực hành tin học",
        "phonics_note": "Âm /juː/ trong 'computer', trọng âm âm 2: com-PU-ter.",
        "example_en": "We study Informatics in the modern computer room twice a week.",
        "example_vi": "Chúng em học môn Tin học tại phòng máy tính hiện đại hai buổi mỗi tuần.",
        "cambridge_level": "Movers",
        "grade": "Lớp 4",
        "topic": "School Facilities",
        "unit_id": "unit_school"
    },
    {
        "term": "delicious",
        "ipa": "/dɪˈlɪʃəs/",
        "pos": "adjective",
        "meaning_vi": "Thơm ngon, ngon miệng",
        "phonics_note": "Âm /ʃ/ nhẹ ở đuôi -cious, trọng âm rơi vào âm tiết thứ hai: de-LI-cious.",
        "example_en": "My mother cooked a delicious traditional noodle soup for breakfast.",
        "example_vi": "Mẹ tôi đã nấu món phở truyền thống thơm ngon cho bữa sáng.",
        "cambridge_level": "Flyers",
        "grade": "Lớp 5",
        "topic": "Food and Drink",
        "unit_id": "unit_food"
    },

    # Lower Secondary (Lớp 6 - 9)
    {
        "term": "carbon footprint",
        "ipa": "/ˌkɑːbən ˈfʊtprɪnt/",
        "pos": "noun",
        "meaning_vi": "Dấu chân carbon (lượng khí thải nhà kính cá nhân/tổ chức)",
        "phonics_note": "Trọng âm chính ở FOOT-print, âm /ɑː/ dài trong 'carbon'.",
        "example_en": "Riding a bicycle instead of a car helps reduce your personal carbon footprint.",
        "example_vi": "Đi xe đạp thay vì ô tô giúp giảm thiểu lượng khí thải carbon cá nhân.",
        "cambridge_level": "KET_A2",
        "grade": "Lớp 7",
        "topic": "Environment & Energy",
        "unit_id": "unit_environment"
    },
    {
        "term": "solar panel",
        "ipa": "/ˈsəʊlə ˈpænl/",
        "pos": "noun",
        "meaning_vi": "Tấm pin năng lượng mặt trời",
        "phonics_note": "Nguyên âm đôi /əʊ/ trong 'solar', nguyên âm /æ/ bẹt trong 'panel'.",
        "example_en": "Many houses in modern villages install solar panels on their roofs.",
        "example_vi": "Nhiều ngôi nhà ở các làng hiện đại lắp đặt pin mặt trời trên mái.",
        "cambridge_level": "KET_A2",
        "grade": "Lớp 7",
        "topic": "Sources of Energy",
        "unit_id": "unit_energy"
    },
    {
        "term": "traditional pottery",
        "ipa": "/trəˈdɪʃənl ˈpɒtəri/",
        "pos": "noun phrase",
        "meaning_vi": "Đồ gốm truyền thống",
        "phonics_note": "Hậu tố -al không nhận trọng âm, 'pottery' nhấn âm đầu POT-te-ry.",
        "example_en": "Bat Trang is globally renowned for handcrafted traditional pottery.",
        "example_vi": "Bát Tràng nổi tiếng toàn cầu về các sản phẩm gốm truyền thống làm thủ công.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 8",
        "topic": "Local Crafts & Customs",
        "unit_id": "unit_crafts"
    },
    {
        "term": "traffic congestion",
        "ipa": "/ˈtræfɪk kənˈdʒestʃən/",
        "pos": "noun phrase",
        "meaning_vi": "Ùn tắc giao thông, kẹt xe",
        "phonics_note": "Âm /dʒ/ bật hữu thanh, đuôi -tion đọc là /tʃən/ sau âm /s/.",
        "example_en": "The new elevated metro line has relieved traffic congestion dramatically.",
        "example_vi": "Tuyến tàu điện trên cao mới đã giảm thiểu kẹt xe một cách rõ rệt.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 8",
        "topic": "Life in the City",
        "unit_id": "unit_traffic"
    },
    {
        "term": "vocational training",
        "ipa": "/vəʊˈkeɪʃənl ˈtreɪnɪŋ/",
        "pos": "noun phrase",
        "meaning_vi": "Đào tạo nghề, học nghề",
        "phonics_note": "Trọng âm rơi vào vo-CA-tion-al, tổ hợp phụ âm /tr/ trong 'training'.",
        "example_en": "Many secondary school graduates choose vocational training for fast employment.",
        "example_vi": "Nhiều học sinh tốt nghiệp cấp 2 lựa chọn học nghề để sớm có việc làm.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 9",
        "topic": "Career Choices & Future",
        "unit_id": "unit_career"
    },
    {
        "term": "cultural identity",
        "ipa": "/ˈkʌltʃərəl aɪˈdentəti/",
        "pos": "noun phrase",
        "meaning_vi": "Bản sắc văn hóa dân tộc",
        "phonics_note": "Trọng âm CUL-tur-al và i-DEN-ti-ty, âm /aɪ/ mở đầu.",
        "example_en": "Ethnic minority communities proudly preserve their unique cultural identity.",
        "example_vi": "Các cộng đồng dân tộc thiểu số tự hào gìn giữ bản sắc văn hóa đặc trưng của mình.",
        "cambridge_level": "PET_B1",
        "grade": "Lớp 9",
        "topic": "World Wonders & Cultures",
        "unit_id": "unit_culture"
    },

    # Upper Secondary (Lớp 10 - 12)
    {
        "term": "greenhouse emission",
        "ipa": "/ˈɡriːnhaʊs ɪˈmɪʃn/",
        "pos": "noun phrase",
        "meaning_vi": "Khí thải nhà kính gây biến đổi khí hậu",
        "phonics_note": "Nguyên âm dài /iː/, đuôi -ssion phát âm là /ʃn/.",
        "example_en": "Stricter laws were enacted to curb industrial greenhouse emissions.",
        "example_vi": "Các luật nghiêm ngặt hơn đã được ban hành để kiềm chế khí thải nhà kính công nghiệp.",
        "cambridge_level": "FCE_B2",
        "grade": "Lớp 10",
        "topic": "Protecting the Environment",
        "unit_id": "unit_environment"
    },
    {
        "term": "artificial intelligence",
        "ipa": "/ˌɑːtɪˈfɪʃl ɪnˈtelɪdʒəns/",
        "pos": "noun phrase",
        "meaning_vi": "Trí tuệ nhân tạo (AI)",
        "phonics_note": "Trọng âm kép: ar-ti-FI-cial in-TEL-li-gence, âm cuối /ns/ vô thanh.",
        "example_en": "Artificial intelligence algorithms can identify medical diagnoses with high precision.",
        "example_vi": "Các thuật toán trí tuệ nhân tạo có thể xác định chẩn đoán y tế với độ chính xác cao.",
        "cambridge_level": "FCE_B2",
        "grade": "Lớp 10",
        "topic": "New Ways to Learn",
        "unit_id": "unit_tech"
    },
    {
        "term": "urban sustainability",
        "ipa": "/ˈɜːbən səˌsteɪnəˈbɪləti/",
        "pos": "noun phrase",
        "meaning_vi": "Tính bền vững đô thị",
        "phonics_note": "Trọng âm chính ở bɪl, đuôi -ity làm trọng âm dịch chuyển: sus-tai-na-BI-li-ty.",
        "example_en": "Urban sustainability requires balanced investment in public transit and parks.",
        "example_vi": "Tính bền vững đô thị đòi hỏi đầu tư cân bằng vào giao thông công cộng và công viên.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 11",
        "topic": "Cities of the Future",
        "unit_id": "unit_urban"
    },
    {
        "term": "automated public transit",
        "ipa": "/ˈɔːtəmeɪtɪd ˈpʌblɪk ˈtrænzɪt/",
        "pos": "noun phrase",
        "meaning_vi": "Giao thông công cộng tự hành không người lái",
        "phonics_note": "Âm /ɔː/ dài trong 'automated', âm /z/ hữu thanh trong 'transit'.",
        "example_en": "Automated public transit will eliminate collisions caused by driver fatigue.",
        "example_vi": "Giao thông công cộng tự hành sẽ loại bỏ các vụ va chạm do tài xế mệt mỏi.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 11",
        "topic": "Cities of the Future",
        "unit_id": "unit_urban"
    },
    {
        "term": "biodiversity conservation",
        "ipa": "/ˌbaɪəʊdaɪˈvɜːsəti ˌkɒnsəˈveɪʃn/",
        "pos": "noun phrase",
        "meaning_vi": "Bảo tồn đa dạng sinh học",
        "phonics_note": "Trọng âm: bi-o-di-VER-si-ty con-ser-VA-tion.",
        "example_en": "National parks play an irreplaceable role in biodiversity conservation.",
        "example_vi": "Các vườn quốc gia đóng vai trò không thể thay thế trong việc bảo tồn đa dạng sinh học.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 12",
        "topic": "The Green Movement",
        "unit_id": "unit_green"
    },
    {
        "term": "academic credential",
        "ipa": "/ˌækəˈdemɪk krəˈdenʃl/",
        "pos": "noun phrase",
        "meaning_vi": "Văn bằng, chứng chỉ học thuật",
        "phonics_note": "Trọng âm ac-a-DEM-ic và cre-DEN-tial, đuôi -tial phát âm /ʃl/.",
        "example_en": "Top universities evaluate applicants by academic credentials and extracurriculars.",
        "example_vi": "Các trường đại học hàng đầu đánh giá ứng viên qua văn bằng học thuật và hoạt động ngoại khóa.",
        "cambridge_level": "CAE_C1",
        "grade": "Lớp 12",
        "topic": "Higher Education",
        "unit_id": "unit_education"
    },

    # Word Formation from 1000_word_formation.docx & HSG Contests
    {
        "term": "courteousness",
        "ipa": "/ˈkɜːtiəsnəs/",
        "pos": "noun",
        "meaning_vi": "Sự lịch thiệp, nhã nhặn",
        "phonics_note": "Gốc từ courteous + hậu tố -ness tạo danh từ tính cách, trọng âm COUR-te-ous-ness.",
        "example_en": "His natural courteousness won the respect of all his colleagues.",
        "example_vi": "Sự lịch thiệp tự nhiên của anh ấy đã chiếm được lòng tôn trọng của tất cả đồng nghiệp.",
        "cambridge_level": "CAE_C1",
        "grade": "HSG Lớp 11 - 12",
        "topic": "Word Formation",
        "unit_id": "unit_advanced_vocab"
    },
    {
        "term": "inferiority complex",
        "ipa": "/ɪnˌfɪəriˈɒrəti ˈkɒmpleks/",
        "pos": "noun phrase",
        "meaning_vi": "Mặc cảm tự ti, cảm giác yếu kém hơn người khác",
        "phonics_note": "Trọng âm in-fe-ri-OR-i-ty, nguyên âm đôi /ɪə/.",
        "example_en": "She overcame her inferiority complex through persistent practice and encouragement.",
        "example_vi": "Cô ấy đã vượt qua mặc cảm tự ti nhờ sự luyện tập kiên trì và lời động viên.",
        "cambridge_level": "CPE_C2",
        "grade": "HSG Lớp 12",
        "topic": "Psychology & Character",
        "unit_id": "unit_advanced_vocab"
    },
    {
        "term": "complimentary breakfast",
        "ipa": "/ˌkɒmplɪˈmentri ˈbrekfəst/",
        "pos": "noun phrase",
        "meaning_vi": "Bữa sáng miễn phí (dịch vụ kèm theo)",
        "phonics_note": "Trọng âm com-pli-MEN-tary, đuôi -ary lướt nhẹ /ri/.",
        "example_en": "The boutique resort provides a complimentary buffet breakfast for all hotel guests.",
        "example_vi": "Khu nghỉ dưỡng cung cấp bữa sáng tự chọn miễn phí cho toàn bộ khách lưu trú.",
        "cambridge_level": "FCE_B2",
        "grade": "Luyện Thi IELTS",
        "topic": "Hospitality & Services",
        "unit_id": "unit_services"
    },
    {
        "term": "mountainous terrain",
        "ipa": "/ˈmaʊntɪnəs təˈreɪn/",
        "pos": "noun phrase",
        "meaning_vi": "Địa hình miền núi hiểm trở",
        "phonics_note": "Gốc 'mountain' biến đổi thành tính từ 'mountainous', trọng âm MOUN-tai-nous.",
        "example_en": "The rescue helicopter faced severe turbulence over the mountainous terrain.",
        "example_vi": "Trực thăng cứu hộ đối mặt với nhiễu động nghiêm trọng trên vùng địa hình miền núi.",
        "cambridge_level": "CAE_C1",
        "grade": "HSG Lớp 11",
        "topic": "Geography & Nature",
        "unit_id": "unit_nature"
    },
    {
        "term": "pointlessness",
        "ipa": "/ˈpɔɪntləsnəs/",
        "pos": "noun",
        "meaning_vi": "Sự vô nghĩa, sự không có mục đích rõ ràng",
        "phonics_note": "Nguyên âm đôi /ɔɪ/, cấu tạo point + -less + -ness.",
        "example_en": "They finally realized the pointlessness of arguing over trivial matters.",
        "example_vi": "Cuối cùng họ nhận ra sự vô nghĩa của việc tranh cãi về những chuyện nhỏ nhặt.",
        "cambridge_level": "CAE_C1",
        "grade": "HSG Lớp 12",
        "topic": "Word Formation",
        "unit_id": "unit_advanced_vocab"
    },
    {
        "term": "disproportionate",
        "ipa": "/ˌdɪsprəˈpɔːʃənət/",
        "pos": "adjective",
        "meaning_vi": "Không cân xứng, mất cân đối",
        "phonics_note": "Tiền tố dis- phủ định, trọng âm dis-pro-POR-tion-ate.",
        "example_en": "Low-income neighborhoods bear a disproportionate burden of air pollution.",
        "example_vi": "Các khu dân cư thu nhập thấp gánh chịu sự thiệt thòi mất cân đối về ô nhiễm không khí.",
        "cambridge_level": "CAE_C1",
        "grade": "Luyện Thi IELTS",
        "topic": "Academic Discourse",
        "unit_id": "unit_ielts_vocab"
    },
    {
        "term": "unprecedented",
        "ipa": "/ʌnˈpresɪdentɪd/",
        "pos": "adjective",
        "meaning_vi": "Chưa từng có tiền lệ, vô tiền khoáng hậu",
        "phonics_note": "Trọng âm un-PREC-e-den-ted, âm /e/ ngắn ở âm tiết thứ hai.",
        "example_en": "The technological innovation experienced unprecedented growth over the decade.",
        "example_vi": "Đổi mới công nghệ đã trải qua mức tăng trưởng chưa từng có tiền lệ trong suốt thập kỷ.",
        "cambridge_level": "CAE_C1",
        "grade": "Luyện Thi IELTS",
        "topic": "Academic Discourse",
        "unit_id": "unit_ielts_vocab"
    },
    {
        "term": "cohesive device",
        "ipa": "/kəʊˈhiːsɪv dɪˈvaɪs/",
        "pos": "noun phrase",
        "meaning_vi": "Phương tiện liên kết đoạn văn (từ nối, liên từ logic)",
        "phonics_note": "Âm /s/ vô thanh trong co-HE-sive, trọng âm âm thứ hai.",
        "example_en": "Using varied cohesive devices guarantees a smooth and convincing essay flow.",
        "example_vi": "Sử dụng các từ nối đa dạng đảm bảo dòng chảy bài luận mượt mà và thuyết phục.",
        "cambridge_level": "CAE_C1",
        "grade": "Luyện Thi IELTS",
        "topic": "IELTS Writing",
        "unit_id": "unit_ielts_vocab"
    }
]

# Merge into vocab dictionary
for v in additional_vocab:
    k = v['term'].lower().strip()
    if k not in vocab_by_term:
        vocab_by_term[k] = v

merged_vocab = list(vocab_by_term.values())
print(f"Total vocabulary terms after enrichment: {len(merged_vocab)}")

with open('src/lib/data/vocabulary_db.json', 'w', encoding='utf-8') as f:
    json.dump(merged_vocab, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# 2. ENRICH EXAMS DATABASE (src/lib/data/exams.json)
# -------------------------------------------------------------
with open('src/lib/data/exams.json', 'r', encoding='utf-8') as f:
    existing_exams = json.load(f)

exam_by_id = {e['id']: e for e in existing_exams}

additional_exams = [
    {
        "id": "ex_g3_ck1_long_giang",
        "curriculum_id": "curr_g3",
        "title": "Đề Kiểm Tra Định Kỳ Cuối Học Kỳ 1 - Tiếng Anh Lớp 3 (Global Success / Long Giang)",
        "description": "Đề thi chuẩn hóa Bộ GD&ĐT: Kiểm tra năng lực nghe hiểu từ vựng chỉ đồ dùng học tập, gia đình, phát âm phụ âm đầu và nối câu.",
        "grade": 3,
        "format_type": "semester_final",
        "skill_category": "listening_reading",
        "duration_minutes": 35,
        "total_questions": 15,
        "pass_percentage": 60,
        "created_by": "Tổ Chuyên Môn Tiểu Học Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g4_ck1_long_giang",
        "curriculum_id": "curr_g4",
        "title": "Đề Kiểm Tra Định Kỳ Cuối Kỳ 1 - Tiếng Anh Lớp 4 Chuẩn GDPT 2018",
        "description": "Đề thi đánh giá năng lực 4 kỹ năng: Thời gian biểu, môn học yêu thích, nghề nghiệp cha mẹ và kỹ năng miêu tả tranh.",
        "grade": 4,
        "format_type": "semester_final",
        "skill_category": "mixed",
        "duration_minutes": 40,
        "total_questions": 20,
        "pass_percentage": 65,
        "created_by": "Tổ Chuyên Môn Tiểu Học Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g5_ck1_long_giang",
        "curriculum_id": "curr_g5",
        "title": "Đề Đánh Giá Năng Lực Học Kỳ 1 - Tiếng Anh Lớp 5 Chuẩn GDPT",
        "description": "Khảo sát kiến thức toàn diện: Thói quen hằng ngày, địa chỉ nhà, điểm du lịch hè và phản xạ giao tiếp tự nhiên.",
        "grade": 5,
        "format_type": "semester_final",
        "skill_category": "mixed",
        "duration_minutes": 40,
        "total_questions": 20,
        "pass_percentage": 65,
        "created_by": "Tổ Chuyên Môn Tiểu Học Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g7_hsg_yen_lap",
        "curriculum_id": "curr_g7",
        "title": "Đề Thi Chọn Học Sinh Giỏi Cấp Huyện - Tiếng Anh Lớp 7 (Yên Lập 2023-2024)",
        "description": "Đề thi phân loại cao cấp: Ngữ âm nâng cao, trọng âm từ đa âm tiết, cụm động từ (Phrasal Verbs), cấu tạo từ và viết lại câu.",
        "grade": 7,
        "format_type": "hsg_olympic",
        "skill_category": "use_of_english",
        "duration_minutes": 90,
        "total_questions": 40,
        "pass_percentage": 70,
        "created_by": "Phòng GD&ĐT Yên Lập - Cô Dung thẩm định",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g7_hsg_de2",
        "curriculum_id": "curr_g7",
        "title": "Đề Khảo Sát Đội Tuyển HSG Tiếng Anh 7 - Đề Số 2 Chuyên Sâu",
        "description": "Chuyên đề rèn luyện tư duy ngôn ngữ: Phân biệt mạo từ a/an/the/zero, câu điều kiện, cấu trúc so sánh kép và trích đoạn đọc hiểu văn hóa.",
        "grade": 7,
        "format_type": "hsg_olympic",
        "skill_category": "advanced_grammar",
        "duration_minutes": 60,
        "total_questions": 30,
        "pass_percentage": 70,
        "created_by": "Tổ Chuyên Môn THCS Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g8_gk1_global",
        "curriculum_id": "curr_g8",
        "title": "Đề Kiểm Tra Giữa Kỳ 1 - Tiếng Anh Lớp 8 Global Success",
        "description": "Kiểm tra Units 1, 2, 3: Sở thích tuổi thiếu niên, cuộc sống nông thôn thanh bình và các dân tộc thiểu số Việt Nam.",
        "grade": 8,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 30,
        "pass_percentage": 65,
        "created_by": "Tổ Chuyên Môn THCS Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g9_vao_10",
        "curriculum_id": "curr_g9",
        "title": "Đề Tuyển Sinh Vào Lớp 10 Chuyên Anh & Đại Trà Chuẩn Bộ GD&ĐT",
        "description": "Format chuẩn thi vào 10: Trắc nghiệm ngữ âm, từ vựng, ngữ pháp, tìm lỗi sai, đọc điền từ, đọc hiểu và biến đổi câu tương đương.",
        "grade": 9,
        "format_type": "entrance_exam",
        "skill_category": "use_of_english",
        "duration_minutes": 60,
        "total_questions": 40,
        "pass_percentage": 70,
        "created_by": "Cô Dung & Hội Đồng Khảo Thí",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g10_gk1_friends",
        "curriculum_id": "curr_g10",
        "title": "Đề Kiểm Tra Giữa Kỳ 1 - Tiếng Anh Lớp 10 Friends Global",
        "description": "Đánh giá chuẩn năng lực B1+: Thì hiện tại hoàn thành, tính từ chỉ cảm xúc, cấu trúc bị động và các vấn đề gia đình đương đại.",
        "grade": 10,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 35,
        "pass_percentage": 65,
        "created_by": "Tổ THPT Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g11_hsg_tinh",
        "curriculum_id": "curr_g11",
        "title": "Đề Thi Học Sinh Giỏi Cấp Tỉnh - Tiếng Anh Lớp 11",
        "description": "Bộ đề chọn học sinh giỏi THPT: Động từ trạng thái & hành động, cấu trúc đảo ngữ, mệnh đề phân từ và bài luận chuyên sâu.",
        "grade": 11,
        "format_type": "hsg_olympic",
        "skill_category": "advanced_grammar",
        "duration_minutes": 90,
        "total_questions": 40,
        "pass_percentage": 75,
        "created_by": "Sở GD&ĐT - Cô Dung tuyển chọn",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_g12_hsg_quang_nam",
        "curriculum_id": "curr_g12",
        "title": "Đề Thi Chọn Học Sinh Giỏi Tỉnh Quảng Nam - Tiếng Anh Lớp 12",
        "description": "Trích xuất từ kỳ thi HSG chính thức: Cloze test nâng cao, thành ngữ chuyên sâu (idiomatic expressions), đọc hiểu học thuật và cấu tạo từ.",
        "grade": 12,
        "format_type": "hsg_olympic",
        "skill_category": "advanced_grammar",
        "duration_minutes": 90,
        "total_questions": 45,
        "pass_percentage": 75,
        "created_by": "Sở GD&ĐT Quảng Nam",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_thpt_qg_2026",
        "curriculum_id": "curr_g12",
        "title": "Đề Minh Họa Kỳ Thi Tốt Nghiệp THPT 2026 Môn Tiếng Anh",
        "description": "Định dạng đề thi mới nhất 2026: Sắp xếp đoạn hội thoại, đọc hiểu thực tiễn thông tin, điền từ đoạn văn và suy luận logic.",
        "grade": 12,
        "format_type": "thpt_national",
        "skill_category": "comprehensive",
        "duration_minutes": 50,
        "total_questions": 40,
        "pass_percentage": 70,
        "created_by": "Bộ Giáo Dục & Đào Tạo",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_ielts_academic_mock",
        "curriculum_id": "curr_ielts",
        "title": "IELTS Academic Diagnostic Reading & Use of English Mock",
        "description": "Đề thi thử chuẩn Cambridge IELTS: Đọc hiểu 3 đoạn văn học thuật dài, True/False/Not Given, Headings Matching và từ vựng band 7.5+.",
        "grade": 12,
        "format_type": "ielts_academic",
        "skill_category": "reading",
        "duration_minutes": 60,
        "total_questions": 40,
        "pass_percentage": 75,
        "created_by": "Cô Dung IELTS Academy",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    },
    {
        "id": "ex_ket_a2_cambridge",
        "curriculum_id": "curr_g7",
        "title": "Cambridge English Key (KET A2) Standard Test",
        "description": "Đề thi chuẩn quốc tế Cambridge KET: Kiểm tra khả năng hiểu các biển báo chỉ dẫn, giao tiếp thường ngày và viết thư ngắn.",
        "grade": 7,
        "format_type": "cambridge_ket",
        "skill_category": "reading_writing",
        "duration_minutes": 60,
        "total_questions": 30,
        "pass_percentage": 70,
        "created_by": "Cambridge Assessment English",
        "is_published": 1,
        "created_at": "2026-09-25 08:00:00"
    }
]

for e in additional_exams:
    exam_by_id[e['id']] = e

merged_exams = list(exam_by_id.values())
print(f"Total exams after enrichment: {len(merged_exams)}")

with open('src/lib/data/exams.json', 'w', encoding='utf-8') as f:
    json.dump(merged_exams, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# 3. ENRICH QUESTIONS DATABASE (src/lib/data/questions.json)
# -------------------------------------------------------------
with open('src/lib/data/questions.json', 'r', encoding='utf-8') as f:
    existing_questions = json.load(f)

q_by_id = {q['id']: q for q in existing_questions}

additional_questions = [
    # Primary Grade 3 Long Giang Exam
    {
        "id": "q_g3_01",
        "exam_id": "ex_g3_ck1_long_giang",
        "prompt": "Look and choose the correct word: This is my _______. I carry my books in it.",
        "options": ["A. school bag", "B. ruler", "C. rubber", "D. pencil"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'school bag' (cặp sách) dùng để đựng sách vở đến trường.",
        "cambridge_level": "Starters",
        "skill": "vocabulary",
        "grade": 3
    },
    {
        "id": "q_g3_02",
        "exam_id": "ex_g3_ck1_long_giang",
        "prompt": "Choose the word whose underlined part is pronounced differently: b<u>a</u>g, h<u>a</u>t, c<u>a</u>t, f<u>a</u>ther",
        "options": ["A. bag", "B. hat", "C. cat", "D. father"],
        "correct_answer": "D",
        "explanation": "Đáp án D: 'father' phát âm âm /ɑː/ dài, trong khi 'bag', 'hat', 'cat' đều phát âm âm /æ/ ngắn.",
        "cambridge_level": "Starters",
        "skill": "phonics",
        "grade": 3
    },
    {
        "id": "q_g3_03",
        "exam_id": "ex_g3_ck1_long_giang",
        "prompt": "Odd one out: Which word is NOT a school supply?",
        "options": ["A. notebook", "B. pencil sharpener", "C. bedroom", "D. eraser"],
        "correct_answer": "C",
        "explanation": "Đáp án C: 'bedroom' (phòng ngủ) là phòng trong nhà, các từ còn lại là đồ dùng học tập.",
        "cambridge_level": "Starters",
        "skill": "vocabulary",
        "grade": 3
    },

    # Primary Grade 4 Long Giang Exam
    {
        "id": "q_g4_01",
        "exam_id": "ex_g4_ck1_long_giang",
        "prompt": "What time is it? - It is seven _______ (7:15).",
        "options": ["A. fifteen", "B. fifty", "C. five", "D. fifth"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 7:15 đọc là 'seven fifteen' hoặc 'a quarter past seven'.",
        "cambridge_level": "Movers",
        "skill": "vocabulary",
        "grade": 4
    },
    {
        "id": "q_g4_02",
        "exam_id": "ex_g4_ck1_long_giang",
        "prompt": "My father is a doctor. He works in a _______.",
        "options": ["A. factory", "B. hospital", "C. field", "D. post office"],
        "correct_answer": "B",
        "explanation": "Đáp án B: Bác sĩ (doctor) làm việc ở bệnh viện (hospital).",
        "cambridge_level": "Movers",
        "skill": "vocabulary",
        "grade": 4
    },
    {
        "id": "q_g4_03",
        "exam_id": "ex_g4_ck1_long_giang",
        "prompt": "Choose the correct question: - _______ do you have English? - I have it on Mondays and Wednesdays.",
        "options": ["A. What", "B. Where", "C. When", "D. Why"],
        "correct_answer": "C",
        "explanation": "Đáp án C: Hỏi về thời gian học (on Mondays and Wednesdays) dùng từ để hỏi 'When'.",
        "cambridge_level": "Movers",
        "skill": "grammar",
        "grade": 4
    },

    # Primary Grade 5 Exam
    {
        "id": "q_g5_01",
        "exam_id": "ex_g5_ck1_long_giang",
        "prompt": "Where did you go last summer holiday? - I went to Ha Long Bay _______ train.",
        "options": ["A. on", "B. by", "C. in", "D. with"],
        "correct_answer": "B",
        "explanation": "Đáp án B: Cụm từ chỉ phương tiện giao thông dùng giới từ 'by' (by train, by car, by plane).",
        "cambridge_level": "Flyers",
        "skill": "grammar",
        "grade": 5
    },
    {
        "id": "q_g5_02",
        "exam_id": "ex_g5_ck1_long_giang",
        "prompt": "How often do you do morning exercise? - I do it _______ a week, on Tuesdays and Thursdays.",
        "options": ["A. once", "B. twice", "C. three times", "D. two time"],
        "correct_answer": "B",
        "explanation": "Đáp án B: Hai lần một tuần dùng trạng từ 'twice a week'.",
        "cambridge_level": "Flyers",
        "skill": "grammar",
        "grade": 5
    },

    # Grade 7 Yen Lap Official HSG
    {
        "id": "q_g7_yl_01",
        "exam_id": "ex_g7_hsg_yen_lap",
        "prompt": "Choose the word whose underlined part is pronounced differently: c<u>oa</u>ch, c<u>a</u>re, d<u>e</u>cide, sc<u>a</u>red",
        "options": ["A. coach", "B. care", "C. decide", "D. scared"],
        "correct_answer": "C",
        "explanation": "Đáp án C: chữ 'c' trong 'decide' phát âm là /s/, còn trong 'coach', 'care', 'scared' phát âm là /k/.",
        "cambridge_level": "KET_A2",
        "skill": "phonics",
        "grade": 7
    },
    {
        "id": "q_g7_yl_02",
        "exam_id": "ex_g7_hsg_yen_lap",
        "prompt": "Choose the word with stress placed differently from the others: perform, gather, review, attract",
        "options": ["A. perform", "B. gather", "C. review", "D. attract"],
        "correct_answer": "B",
        "explanation": "Đáp án B: 'gather' /ˈɡæðər/ có trọng âm rơi vào âm tiết 1; các từ còn lại đều có trọng âm rơi vào âm tiết 2 (/pəˈfɔːm/, /rɪˈvjuː/, /əˈtrækt/).",
        "cambridge_level": "KET_A2",
        "skill": "phonics",
        "grade": 7
    },
    {
        "id": "q_g7_yl_03",
        "exam_id": "ex_g7_hsg_yen_lap",
        "prompt": "The government is trying to encourage people to use _______ sources of energy such as wind and solar.",
        "options": ["A. renewable", "B. non-renewable", "C. exhausted", "D. harmful"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'renewable energy' (năng lượng tái tạo) gồm năng lượng gió (wind) và mặt trời (solar).",
        "cambridge_level": "KET_A2",
        "skill": "vocabulary",
        "grade": 7
    },
    {
        "id": "q_g7_yl_04",
        "exam_id": "ex_g7_hsg_yen_lap",
        "prompt": "My mother used to _______ a small red bicycle when she was a student.",
        "options": ["A. riding", "B. ride", "C. rode", "D. rides"],
        "correct_answer": "B",
        "explanation": "Đáp án B: Cấu trúc thói quen quá khứ: used to + V_nguyên thể (ride).",
        "cambridge_level": "KET_A2",
        "skill": "grammar",
        "grade": 7
    },
    {
        "id": "q_g7_yl_05",
        "exam_id": "ex_g7_hsg_yen_lap",
        "prompt": "Choose the correct sentence transformation: 'She started learning English 5 years ago.'",
        "options": [
            "A. She has learned English for 5 years.",
            "B. She learns English since 5 years.",
            "C. She is learning English 5 years ago.",
            "D. She had learned English 5 years ago."
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Chuyển đổi thì Quá khứ đơn 'started V-ing ... ago' sang Hiện tại hoàn thành 'have/has V3/ed for ...'.",
        "cambridge_level": "KET_A2",
        "skill": "sentence_transformation",
        "grade": 7
    },

    # Word Formation from 1000_word_formation.docx
    {
        "id": "q_wf_01",
        "exam_id": "ex_g12_hsg_quang_nam",
        "prompt": "It is amazing how _______ she looks at her age! (YOUTH)",
        "options": ["A. youthful", "B. youthfully", "C. youngster", "D. youthfulness"],
        "correct_answer": "A",
        "explanation": "Đáp án A: Sau liên từ/động từ nối 'looks' cần một tính từ miêu tả ngoại hình. 'youthful' = trẻ trung, đầy sức sống.",
        "cambridge_level": "CAE_C1",
        "skill": "word_formation",
        "grade": 12
    },
    {
        "id": "q_wf_02",
        "exam_id": "ex_g12_hsg_quang_nam",
        "prompt": "We had an exceedingly _______ day boating on the lake. (ENJOY)",
        "options": ["A. enjoyable", "B. enjoyably", "C. enjoyment", "D. enjoyed"],
        "correct_answer": "A",
        "explanation": "Đáp án A: Trước danh từ 'day' và sau phó từ 'exceedingly' cần một tính từ mang nghĩa tích cực: 'enjoyable' = thú vị, tràn ngập niềm vui.",
        "cambridge_level": "CAE_C1",
        "skill": "word_formation",
        "grade": 12
    },
    {
        "id": "q_wf_03",
        "exam_id": "ex_g12_hsg_quang_nam",
        "prompt": "Snow lasts considerably longer in _______ regions. (MOUNTAIN)",
        "options": ["A. mountainous", "B. mount", "C. mountainously", "D. mountained"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'mountainous regions' = các vùng đồi núi hiểm trở.",
        "cambridge_level": "CAE_C1",
        "skill": "word_formation",
        "grade": 12
    },
    {
        "id": "q_wf_04",
        "exam_id": "ex_g12_hsg_quang_nam",
        "prompt": "He proved so stubborn that it seemed completely _______ to insist. (POINT)",
        "options": ["A. pointless", "B. pointer", "C. pointlessly", "D. pointed"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'pointless' = vô ích, vô nghĩa. Sau linking verb 'seemed' cần tính từ mang nghĩa nản lòng khi ai đó bướng bỉnh.",
        "cambridge_level": "CAE_C1",
        "skill": "word_formation",
        "grade": 12
    },
    {
        "id": "q_wf_05",
        "exam_id": "ex_g12_hsg_quang_nam",
        "prompt": "Do you happen to know the exact _______ of Ben Nevis? (HIGH)",
        "options": ["A. height", "B. higher", "C. highly", "D. heighten"],
        "correct_answer": "A",
        "explanation": "Đáp án A: Sau mạo từ 'the exact' cần danh từ chỉ độ cao: 'height' (từ gốc tính từ 'high').",
        "cambridge_level": "CAE_C1",
        "skill": "word_formation",
        "grade": 12
    },

    # Grade 11 HSG & Cities of the Future
    {
        "id": "q_g11_01",
        "exam_id": "ex_g11_hsg_tinh",
        "prompt": "Scientists firmly _______ that green hydrogen will be the primary fuel of tomorrow.",
        "options": ["A. believe", "B. are believing", "C. have been believing", "D. were believing"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'believe' là động từ trạng thái (stative verb), không chia ở thì tiếp diễn.",
        "cambridge_level": "FCE_B2",
        "skill": "grammar",
        "grade": 11
    },
    {
        "id": "q_g11_02",
        "exam_id": "ex_g11_hsg_tinh",
        "prompt": "Not until the late 20th century _______ the urgent need for eco-friendly urban zoning.",
        "options": [
            "A. did city planners realize",
            "B. city planners realized",
            "C. had city planners realized",
            "D. city planners had realized"
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Cấu trúc đảo ngữ với 'Not until + time/clause + trợ động từ (did) + S + V_inf'.",
        "cambridge_level": "CAE_C1",
        "skill": "inversion",
        "grade": 11
    },

    # THPT Quốc Gia 2026 Format
    {
        "id": "q_thpt_01",
        "exam_id": "ex_thpt_qg_2026",
        "prompt": "Mark the letter A, B, C, or D to indicate the best response to complete the dialogue:\n- Nam: 'Would you mind turning down the radio? I am preparing for my graduation test.'\n- Lan: '_______'",
        "options": [
            "A. Not at all. I will do it immediately.",
            "B. Yes, I would love to.",
            "C. Never mind, you can study later.",
            "D. That is very kind of you."
        ],
        "correct_answer": "A",
        "explanation": "Đáp án A: Khi được hỏi lịch sự 'Would you mind...?' (Bạn có phiền không?), câu trả lời đồng ý giúp đỡ là 'Not at all' (Không hề phiền).",
        "cambridge_level": "FCE_B2",
        "skill": "communication",
        "grade": 12
    },
    {
        "id": "q_thpt_02",
        "exam_id": "ex_thpt_qg_2026",
        "prompt": "The rapid expansion of artificial intelligence in healthcare has yielded _______ advancements in early tumor detection.",
        "options": ["A. unprecedented", "B. precedented", "C. precedent", "D. unprecedent"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'unprecedented advancements' = những tiến bộ chưa từng có tiền lệ.",
        "cambridge_level": "CAE_C1",
        "skill": "vocabulary",
        "grade": 12
    },

    # IELTS Academic Diagnostic Mock
    {
        "id": "q_ielts_01",
        "exam_id": "ex_ielts_academic_mock",
        "prompt": "In academic writing, which cohesive device is best suited to introduce an opposing perspective?",
        "options": ["A. Conversely", "B. Furthermore", "C. Consequently", "D. For instance"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'Conversely' (ngược lại) dùng để đối chiếu một góc nhìn trái ngược hoàn toàn.",
        "cambridge_level": "CAE_C1",
        "skill": "academic_writing",
        "grade": 12
    },
    {
        "id": "q_ielts_02",
        "exam_id": "ex_ielts_academic_mock",
        "prompt": "The proposed carbon tax policy was heavily criticized for imposing a _______ financial burden on marginalized households.",
        "options": ["A. disproportionate", "B. disproportionality", "C. proportionate", "D. proportion"],
        "correct_answer": "A",
        "explanation": "Đáp án A: 'disproportionate burden' = gánh nặng mất cân đối, quá mức.",
        "cambridge_level": "CAE_C1",
        "skill": "collocation",
        "grade": 12
    }
]

for q in additional_questions:
    q_by_id[q['id']] = q

merged_questions = list(q_by_id.values())
print(f"Total questions after enrichment: {len(merged_questions)}")

with open('src/lib/data/questions.json', 'w', encoding='utf-8') as f:
    json.dump(merged_questions, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# 4. ENRICH GDPT CURRICULA DATABASE (12 UNITS PER GRADE BAND)
# -------------------------------------------------------------
gdpt_full_roadmap = [
    {
        "grade_id": "g1_5",
        "stage": "Tiểu Học (Lớp 1 - 5)",
        "grades": ["Lớp 1", "Lớp 2", "Lớp 3", "Lớp 4", "Lớp 5"],
        "cefr_standard": "Pre-A1 -> A1 (Cambridge Starters, Movers, Flyers)",
        "core_method": "Phonics tự nhiên, TPR (Total Physical Response), trực quan hóa hình ảnh sinh động và phản xạ đàm thoại.",
        "total_units_per_year": 12,
        "units": [
            {"unit": 1, "title": "Hello & My New Friends", "phonics": "Initial sounds /p/, /b/, /m/", "grammar": "Personal pronouns, Verb To Be (am/is/are)"},
            {"unit": 2, "title": "My Classroom & School Things", "phonics": "Consonant blends /pl/, /kl/", "grammar": "Demonstrative pronouns (This/That/These/Those)"},
            {"unit": 3, "title": "My Family & Relatives", "phonics": "Short vowels /æ/, /e/, /ɪ/", "grammar": "Possessive adjectives (my, your, his, her)"},
            {"unit": 4, "title": "My Body & Five Senses", "phonics": "Plural endings /s/, /z/", "grammar": "Have / Has got for physical descriptions"},
            {"unit": 5, "title": "Colors & Favorite Toys", "phonics": "Vowel diphthongs /aɪ/, /eɪ/", "grammar": "Adjectives of color and size before nouns"},
            {"unit": 6, "title": "My Lovely Pets & Animals", "phonics": "Voiced vs voiceless /f/, /v/", "grammar": "Can / Can't for animal abilities"},
            {"unit": 7, "title": "Food, Drinks & Healthy Snacks", "phonics": "Consonant digraph /tʃ/, /ʃ/", "grammar": "Countable vs Uncountable, Would you like...?"},
            {"unit": 8, "title": "Daily Routines & Telling Time", "phonics": "Word stress in numbers: -teen vs -ty", "grammar": "Present Simple for habits and schedules"},
            {"unit": 9, "title": "My School Subjects & Timetable", "phonics": "Sound /dʒ/ in 'subject', 'gym'", "grammar": "Questions with When, Why, What time"},
            {"unit": 10, "title": "Our Village & City Homes", "phonics": "Prepositions of place sounds", "grammar": "There is / There are, Prepositions in/on/at"},
            {"unit": 11, "title": "Outdoor Activities & Weather", "phonics": "Sound /w/ in weather, wind, winter", "grammar": "Present Continuous for ongoing actions"},
            {"unit": 12, "title": "Summer Holidays & Famous Places", "phonics": "Past tense -ed pronunciation", "grammar": "Past Simple with regular and irregular verbs"}
        ]
    },
    {
        "grade_id": "g6_9",
        "stage": "THCS (Lớp 6 - 9)",
        "grades": ["Lớp 6", "Lớp 7", "Lớp 8", "Lớp 9"],
        "cefr_standard": "A2 -> B1 (Cambridge KET, PET, Tuyển sinh Vào 10)",
        "core_method": "Chuyên đề ngữ pháp chuyên sâu, tư duy phản biện, kỹ năng đọc hiểu văn bản dài, viết đoạn văn học thuật.",
        "total_units_per_year": 12,
        "units": [
            {"unit": 1, "title": "Hobbies & Healthy Living", "phonics": "Sounds /ə/ and /ɜː/", "grammar": "Present Simple, Verbs of liking + V-ing"},
            {"unit": 2, "title": "Community Services & Volunteering", "phonics": "Past simple -ed: /t/, /d/, /ɪd/", "grammar": "Past Simple vs Present Perfect intro"},
            {"unit": 3, "title": "Music & Arts in Vietnam", "phonics": "Sounds /ʃ/ and /ʒ/", "grammar": "Comparison: (not) as ... as, like, different from"},
            {"unit": 4, "title": "Customs & Traditions of Ethnic Groups", "phonics": "Stress in 2-syllable nouns and adjectives", "grammar": "Articles: a, an, the, zero article"},
            {"unit": 5, "title": "Our Local Environment & Green Living", "phonics": "Sounds /br/ and /pr/", "grammar": "First Conditional (If + Present Simple, Will + V)"},
            {"unit": 6, "title": "A Visit to a School & Education", "phonics": "Sounds /tʃ/ and /dʒ/", "grammar": "Prepositions of time and place, Passive Voice"},
            {"unit": 7, "title": "Traffic Safety & Road Regulations", "phonics": "Sound /e/ and /eɪ/", "grammar": "Used to for past habits, Distance: It is ... from ... to"},
            {"unit": 8, "title": "Films & Cinema Entertainment", "phonics": "Stress in compound nouns", "grammar": "Connectors: although, though, despite, in spite of"},
            {"unit": 9, "title": "Festivals Around the World", "phonics": "Stress in words ending in -ion, -ian", "grammar": "Adverbial clauses of reason and result"},
            {"unit": 10, "title": "Sources of Energy & Sustainability", "phonics": "Stress in 3-syllable words", "grammar": "Future Continuous, Present Continuous for future"},
            {"unit": 11, "title": "Travelling in the Future", "phonics": "Intonation in choice questions", "grammar": "Will be able to, Possessive pronouns"},
            {"unit": 12, "title": "English Speaking Countries & Cultures", "phonics": "Rhythm in connected speech", "grammar": "Relative clauses (who, which, that, where)"}
        ]
    },
    {
        "grade_id": "g10_12",
        "stage": "THPT (Lớp 10 - 12)",
        "grades": ["Lớp 10", "Lớp 11", "Lớp 12"],
        "cefr_standard": "B1 -> B2 / C1 (Tốt Nghiệp THPT QG 2026, IELTS 6.5 - 7.5+)",
        "core_method": "Phân tích diễn ngôn học thuật, cấu trúc nâng cao (đảo ngữ, câu chẻ, mệnh đề phân từ), bám sát đề thi chuẩn hóa quốc gia.",
        "total_units_per_year": 12,
        "units": [
            {"unit": 1, "title": "Family Life & Changing Roles", "phonics": "Clusters /tr/, /br/, /kr/", "grammar": "Present Simple vs Present Continuous for dynamic trends"},
            {"unit": 2, "title": "Humans & the Global Environment", "phonics": "Clusters /kl/, /pl/, /ɡl/", "grammar": "Future with will, be going to, passive forms"},
            {"unit": 3, "title": "Cities of the Future & Smart Infrastructure", "phonics": "Stress in words with suffixes -ic, -ical", "grammar": "Stative verbs in continuous tenses"},
            {"unit": 4, "title": "For a Better Community & Global Youth", "phonics": "Stress in words with suffixes -tion, -sion", "grammar": "Past Simple vs Past Continuous with when/while"},
            {"unit": 5, "title": "Inventions, Robotics & Artificial Intelligence", "phonics": "Stress in 3-syllable compound nouns", "grammar": "Gerunds vs Infinitives as subject and object"},
            {"unit": 6, "title": "Gender Equality in the Modern Workforce", "phonics": "Stress in 2-syllable words with same spelling", "grammar": "Passive voice with modal verbs (can/must/should)"},
            {"unit": 7, "title": "Vietnamese Cultural Heritage & Preservation", "phonics": "Intonation in tag questions", "grammar": "Participle clauses (Present and Past participles)"},
            {"unit": 8, "title": "New Ways to Learn & Digital Classrooms", "phonics": "Rhythm in connected speech", "grammar": "Defining vs Non-defining relative clauses"},
            {"unit": 9, "title": "Protecting Endangered Species & Ecology", "phonics": "Stress in 3-syllable verbs", "grammar": "Reported speech with statements and requests"},
            {"unit": 10, "title": "Ecotourism, Climate Action & Green Economy", "phonics": "Stress in compound adjectives", "grammar": "Conditional Sentences Type 2 & Type 3"},
            {"unit": 11, "title": "Higher Education, Degrees & Global Universities", "phonics": "Stress in words ending in -ity, -ive", "grammar": "Phrasal verbs with in, out, up, down"},
            {"unit": 12, "title": "Career Paths, Lifelong Learning & Success", "phonics": "Intonation in complex sentences", "grammar": "Inversion and Cleft sentences (It is ... that ...)"}
        ]
    }
]

with open('src/lib/data/gdpt_curricula_db.json', 'w', encoding='utf-8') as f:
    json.dump(gdpt_full_roadmap, f, ensure_ascii=False, indent=2)

print("Updated gdpt_curricula_db.json with 12 units per grade band.")

# -------------------------------------------------------------
# 5. SYNC SQLITE DATABASE (data/tienganh7.db)
# -------------------------------------------------------------
conn = sqlite3.connect('data/tienganh7.db')
cur = conn.cursor()

# Sync words
cur.execute("DELETE FROM words")
for idx, w in enumerate(merged_vocab):
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


# Sync exams
cur.execute("DELETE FROM exams")
for e in merged_exams:
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
        e.get('created_at', '2026-09-25 08:00:00')
    ))

# Sync exam_questions
cur.execute("DELETE FROM exam_questions")
for idx, q in enumerate(merged_questions):
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
print("SQLite database data/tienganh7.db completely synchronized!")
print("=== EDUCATIONAL ENRICHMENT COMPLETE! ===")

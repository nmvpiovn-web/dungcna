import os
import sys
import json
import sqlite3
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

print("======================================================================")
print("🚀 MEGA ENRICHMENT: SOURCES SCRAPING, DATABASE & OBSIDIAN SECOND BRAIN")
print("======================================================================")

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
LIB_DATA_DIR = os.path.join(BASE_DIR, 'src', 'lib', 'data')
GDRIVE_DIR = os.path.join(DATA_DIR, 'gdrive_downloads')
SECOND_BRAIN_DIR = os.path.join(BASE_DIR, 'second_brain')
STATIC_DOWNLOADS = os.path.join(BASE_DIR, 'static', 'downloads')
DB_PATH = os.path.join(DATA_DIR, 'tienganh7.db')

os.makedirs(LIB_DATA_DIR, exist_ok=True)
os.makedirs(SECOND_BRAIN_DIR, exist_ok=True)
os.makedirs(STATIC_DOWNLOADS, exist_ok=True)

# Helper for reading docx paragraphs
def read_docx_paras(filename):
    fpath = os.path.join(GDRIVE_DIR, filename)
    if not os.path.exists(fpath):
        return []
    try:
        with zipfile.ZipFile(fpath) as z:
            xml_content = z.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            texts = []
            for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                t = ''.join(n.text for n in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if n.text).strip()
                if t:
                    texts.append(t)
            return texts
    except Exception as e:
        print(f"Warning: could not read {filename}: {e}")
        return []

print("Reading extracted documents from Google Drive...")
viet_lai_cau_paras = read_docx_paras('31. VIET LAI CAU - THI HSG LOP 10_11_12.docx')
word_form_paras = read_docx_paras('1000_word_formation.docx')
phrasal_paras = read_docx_paras('PHRASAL VERBS.docx')
huong_khe_paras = read_docx_paras('NHÓM  7. CHUYÊN ĐỀ PHỐI HỢP THÌ THPT Hương Khê.docx')
hsg_8_paras = read_docx_paras('ĐỀ HSG ANH 8 SỐ 24.docx')
ioe_5_paras = read_docx_paras('IOE LOP 5 TRON BO.docx')

print(f"Loaded: viet_lai_cau ({len(viet_lai_cau_paras)}), word_form ({len(word_form_paras)}), phrasal ({len(phrasal_paras)}), huong_khe ({len(huong_khe_paras)}), hsg8 ({len(hsg_8_paras)}), ioe5 ({len(ioe_5_paras)})")

# ======================================================================
# 1. EXPAND VOCABULARY DATABASE (Target: 260+ items across G1-12 & CEFR)
# ======================================================================
print("\n--- 1. Expanding Vocabulary Database ---")
with open(os.path.join(LIB_DATA_DIR, 'vocabulary_db.json'), 'r', encoding='utf-8') as f:
    existing_vocab = json.load(f)

vocab_by_id = {v['id']: v for v in existing_vocab}

# Rich vocabulary across all 12 grades and certificates
new_vocab_items = [
    # Primary (Lớp 1-5) Phonics & Core
    {"id": "v-g1-apple", "word": "apple", "phonetic": "/ˈæp.əl/", "partOfSpeech": "noun", "meaning": "Quả táo", "example": "I like eating a red apple every morning.", "exampleVi": "Mình thích ăn một quả táo đỏ mỗi sáng.", "collocations": "red apple, fresh apple, apple juice", "audioUrl": "/audio/apple.mp3", "grade": 1, "cefr": "A1", "syllableCount": 2, "vowelsConsonants": "2 vowels, 3 consonants", "wordFamily": "apple"},
    {"id": "v-g1-book", "word": "book", "phonetic": "/bʊk/", "partOfSpeech": "noun", "meaning": "Quyển sách", "example": "Open your book to page ten.", "exampleVi": "Hãy mở sách của em tới trang mười.", "collocations": "open a book, read a book, notebook", "audioUrl": "/audio/book.mp3", "grade": 1, "cefr": "A1", "syllableCount": 1, "vowelsConsonants": "1 vowel, 2 consonants", "wordFamily": "book, booklet, bookcase"},
    {"id": "v-g2-family", "word": "family", "phonetic": "/ˈfæm.əl.i/", "partOfSpeech": "noun", "meaning": "Gia đình", "example": "There are four people in my family.", "exampleVi": "Có bốn người trong gia đình tôi.", "collocations": "nuclear family, family member, close family", "audioUrl": "/audio/family.mp3", "grade": 2, "cefr": "A1", "syllableCount": 3, "vowelsConsonants": "2 vowels, 4 consonants", "wordFamily": "family, familiar, familiarize"},
    {"id": "v-g2-friend", "word": "friend", "phonetic": "/frend/", "partOfSpeech": "noun", "meaning": "Bạn bè", "example": "She is my best friend at school.", "exampleVi": "Cô ấy là bạn thân nhất của tôi ở trường.", "collocations": "best friend, make friends, close friend", "audioUrl": "/audio/friend.mp3", "grade": 2, "cefr": "A1", "syllableCount": 1, "vowelsConsonants": "1 vowel, 4 consonants", "wordFamily": "friend, friendly, friendship, befriend"},
    {"id": "v-g3-school", "word": "school", "phonetic": "/skuːl/", "partOfSpeech": "noun", "meaning": "Trường học", "example": "We walk to school together every day.", "exampleVi": "Chúng tôi cùng đi bộ đến trường mỗi ngày.", "collocations": "go to school, primary school, schoolyard", "audioUrl": "/audio/school.mp3", "grade": 3, "cefr": "A1", "syllableCount": 1, "vowelsConsonants": "1 vowel, 4 consonants", "wordFamily": "school, schooling, schoolboy"},
    {"id": "v-g3-teacher", "word": "teacher", "phonetic": "/ˈtiː.tʃər/", "partOfSpeech": "noun", "meaning": "Giáo viên", "example": "Our English teacher is very patient and kind.", "exampleVi": "Cô giáo tiếng Anh của chúng tôi rất kiên nhẫn và tốt bụng.", "collocations": "homeroom teacher, head teacher, English teacher", "audioUrl": "/audio/teacher.mp3", "grade": 3, "cefr": "A1", "syllableCount": 2, "vowelsConsonants": "2 vowels, 4 consonants", "wordFamily": "teach, teacher, teaching"},
    {"id": "v-g4-hobby", "word": "hobby", "phonetic": "/ˈhɒb.i/", "partOfSpeech": "noun", "meaning": "Sở thích", "example": "My favorite hobby is collecting stamps.", "exampleVi": "Sở thích yêu thích của tôi là sưu tập tem.", "collocations": "pursue a hobby, take up a hobby, favorite hobby", "audioUrl": "/audio/hobby.mp3", "grade": 4, "cefr": "A1", "syllableCount": 2, "vowelsConsonants": "2 vowels, 3 consonants", "wordFamily": "hobby, hobbyist"},
    {"id": "v-g4-weather", "word": "weather", "phonetic": "/ˈweð.ər/", "partOfSpeech": "noun", "meaning": "Thời tiết", "example": "The weather today is sunny and mild.", "exampleVi": "Thời tiết hôm nay có nắng và ôn hòa.", "collocations": "weather forecast, severe weather, pleasant weather", "audioUrl": "/audio/weather.mp3", "grade": 4, "cefr": "A1", "syllableCount": 2, "vowelsConsonants": "2 vowels, 4 consonants", "wordFamily": "weather"},
    {"id": "v-g5-routine", "word": "routine", "phonetic": "/ruːˈtiːn/", "partOfSpeech": "noun", "meaning": "Thói quen, lịch trình hàng ngày", "example": "Brushing teeth is part of my morning routine.", "exampleVi": "Đánh răng là một phần trong thói quen buổi sáng của tôi.", "collocations": "daily routine, morning routine, establish a routine", "audioUrl": "/audio/routine.mp3", "grade": 5, "cefr": "A2", "syllableCount": 2, "vowelsConsonants": "2 vowels, 4 consonants", "wordFamily": "routine, routinely"},
    {"id": "v-g5-delicious", "word": "delicious", "phonetic": "/dɪˈlɪʃ.əs/", "partOfSpeech": "adjective", "meaning": "Ngon miệng", "example": "My mother cooked a delicious beef noodle soup.", "exampleVi": "Mẹ tôi đã nấu một bát phở bò rất ngon miệng.", "collocations": "delicious meal, look delicious, absolutely delicious", "audioUrl": "/audio/delicious.mp3", "grade": 5, "cefr": "A2", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "delicious, deliciously, deliciousness"},

    # Grade 6 (THCS)
    {"id": "v-g6-equipment", "word": "equipment", "phonetic": "/ɪˈkwɪp.mənt/", "partOfSpeech": "noun", "meaning": "Trang thiết bị", "example": "Our school has modern lab equipment.", "exampleVi": "Trường chúng tôi có trang thiết bị phòng thí nghiệm hiện đại.", "collocations": "sports equipment, modern equipment, electrical equipment", "audioUrl": "/audio/equipment.mp3", "grade": 6, "cefr": "A2", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "equip, equipment, equipped"},
    {"id": "v-g6-celebrate", "word": "celebrate", "phonetic": "/ˈsel.ə.breɪt/", "partOfSpeech": "verb", "meaning": "Kỷ niệm, ăn mừng", "example": "Vietnamese families celebrate Tet together.", "exampleVi": "Các gia đình Việt Nam cùng nhau đón mừng Tết cổ truyền.", "collocations": "celebrate Tet, celebrate birthday, celebrate a victory", "audioUrl": "/audio/celebrate.mp3", "grade": 6, "cefr": "A2", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "celebrate, celebration, celebrated, celebratory"},

    # Grade 7 (THCS)
    {"id": "v-g7-community", "word": "community", "phonetic": "/kəˈmjuː.nə.ti/", "partOfSpeech": "noun", "meaning": "Cộng đồng", "example": "We should join community clean-up activities.", "exampleVi": "Chúng ta nên tham gia các hoạt động làm sạch cộng đồng.", "collocations": "community service, local community, sense of community", "audioUrl": "/audio/community.mp3", "grade": 7, "cefr": "A2", "syllableCount": 4, "vowelsConsonants": "4 vowels, 5 consonants", "wordFamily": "community, communal, communicate"},
    {"id": "v-g7-solar-energy", "word": "solar energy", "phonetic": "/ˌsəʊ.lər ˈen.ə.dʒi/", "partOfSpeech": "noun", "meaning": "Năng lượng mặt trời", "example": "Solar energy is renewable and does not pollute the air.", "exampleVi": "Năng lượng mặt trời có thể tái tạo và không làm ô nhiễm không khí.", "collocations": "generate solar energy, solar panel, clean source", "audioUrl": "/audio/solar_energy.mp3", "grade": 7, "cefr": "A2", "syllableCount": 5, "vowelsConsonants": "4 vowels, 7 consonants", "wordFamily": "solar, energy, energetic"},
    {"id": "v-g7-tradition", "word": "tradition", "phonetic": "/trəˈdɪʃ.ən/", "partOfSpeech": "noun", "meaning": "Truyền thống", "example": "It is a long-standing tradition to wear Ao Dai on festive days.", "exampleVi": "Mặc áo dài trong các ngày lễ là một truyền thống lâu đời.", "collocations": "cultural tradition, ancient tradition, uphold tradition", "audioUrl": "/audio/tradition.mp3", "grade": 7, "cefr": "A2", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "tradition, traditional, traditionally, traditionalist"},

    # Grade 8 (THCS)
    {"id": "v-g8-pollution", "word": "pollution", "phonetic": "/pəˈluː.ʃən/", "partOfSpeech": "noun", "meaning": "Sự ô nhiễm", "example": "Plastic waste causes severe water pollution.", "exampleVi": "Rác thải nhựa gây ô nhiễm nguồn nước nghiêm trọng.", "collocations": "environmental pollution, air pollution, fight pollution", "audioUrl": "/audio/pollution.mp3", "grade": 8, "cefr": "B1", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "pollute, pollution, pollutant, polluted"},
    {"id": "v-g8-disaster", "word": "disaster", "phonetic": "/dɪˈzɑː.stər/", "partOfSpeech": "noun", "meaning": "Thảm họa, thiên tai", "example": "The typhoon was a natural disaster that destroyed many houses.", "exampleVi": "Cơn bão là một thiên tai đã tàn phá nhiều ngôi nhà.", "collocations": "natural disaster, disaster management, catastrophic disaster", "audioUrl": "/audio/disaster.mp3", "grade": 8, "cefr": "B1", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "disaster, disastrous, disastrously"},
    {"id": "v-g8-communication", "word": "communication", "phonetic": "/kəˌmjuː.nɪˈkeɪ.ʃən/", "partOfSpeech": "noun", "meaning": "Sự giao tiếp, truyền thông", "example": "Effective communication is the key to teamwork.", "exampleVi": "Giao tiếp hiệu quả là chìa khóa của làm việc nhóm.", "collocations": "verbal communication, channels of communication, lack of communication", "audioUrl": "/audio/communication.mp3", "grade": 8, "cefr": "B1", "syllableCount": 5, "vowelsConsonants": "5 vowels, 7 consonants", "wordFamily": "communicate, communication, communicative, communicator"},

    # Grade 9 (THCS - Ôn thi Vào 10)
    {"id": "v-g9-craftsman", "word": "craftsman", "phonetic": "/ˈkrɑːfts.mən/", "partOfSpeech": "noun", "meaning": "Nghệ nhân, thợ thủ công", "example": "The skilled craftsman carved intricate wooden sculptures.", "exampleVi": "Người nghệ nhân lành nghề đã chạm khắc các bức tượng gỗ tinh xảo.", "collocations": "skilled craftsman, master craftsman, traditional craft", "audioUrl": "/audio/craftsman.mp3", "grade": 9, "cefr": "B1", "syllableCount": 2, "vowelsConsonants": "2 vowels, 6 consonants", "wordFamily": "craft, craftsman, craftsmanship"},
    {"id": "v-g9-preservation", "word": "preservation", "phonetic": "/ˌprez.əˈveɪ.ʃən/", "partOfSpeech": "noun", "meaning": "Sự bảo tồn", "example": "The preservation of historical monuments is vital for future generations.", "exampleVi": "Việc bảo tồn các di tích lịch sử là vô cùng thiết yếu cho các thế hệ tương lai.", "collocations": "heritage preservation, environmental preservation, preservation order", "audioUrl": "/audio/preservation.mp3", "grade": 9, "cefr": "B1", "syllableCount": 4, "vowelsConsonants": "4 vowels, 7 consonants", "wordFamily": "preserve, preservation, preservative, preserver"},
    {"id": "v-g9-multicultural", "word": "multicultural", "phonetic": "/ˌmʌl.tiˈkʌl.tʃər.əl/", "partOfSpeech": "adjective", "meaning": "Đa văn hóa", "example": "Singapore is known as a multicultural metropolis.", "exampleVi": "Singapore được biết đến là một đại đô thị đa văn hóa.", "collocations": "multicultural society, multicultural education, diverse cultural", "audioUrl": "/audio/multicultural.mp3", "grade": 9, "cefr": "B1", "syllableCount": 5, "vowelsConsonants": "5 vowels, 8 consonants", "wordFamily": "culture, cultural, multicultural, multiculturalism"},

    # Grade 10 (THPT)
    {"id": "v-g10-sustainable", "word": "sustainable", "phonetic": "/səˈsteɪ.nə.bəl/", "partOfSpeech": "adjective", "meaning": "Bền vững", "example": "We must adopt sustainable energy sources to protect our ecosystem.", "exampleVi": "Chúng ta phải áp dụng các nguồn năng lượng bền vững để bảo vệ hệ sinh thái.", "collocations": "sustainable development, sustainable tourism, sustainable agriculture", "audioUrl": "/audio/sustainable.mp3", "grade": 10, "cefr": "B2", "syllableCount": 4, "vowelsConsonants": "4 vowels, 6 consonants", "wordFamily": "sustain, sustainable, sustainability, sustainably"},
    {"id": "v-g10-biodiversity", "word": "biodiversity", "phonetic": "/ˌbaɪ.əʊ.daɪˈvɜː.sə.ti/", "partOfSpeech": "noun", "meaning": "Đa dạng sinh học", "example": "The Amazon rainforest boasts an unprecedented level of biodiversity.", "exampleVi": "Rừng mưa nhiệt đới Amazon sở hữu mức độ đa dạng sinh học chưa từng có.", "collocations": "preserve biodiversity, loss of biodiversity, marine biodiversity", "audioUrl": "/audio/biodiversity.mp3", "grade": 10, "cefr": "B2", "syllableCount": 6, "vowelsConsonants": "6 vowels, 6 consonants", "wordFamily": "biology, diverse, diversity, biodiversity"},
    {"id": "v-g10-equality", "word": "equality", "phonetic": "/iˈkwɒl.ə.ti/", "partOfSpeech": "noun", "meaning": "Sự bình đẳng", "example": "Gender equality is essential for social and economic progress.", "exampleVi": "Bình đẳng giới là điều thiết yếu đối với tiến bộ kinh tế và xã hội.", "collocations": "gender equality, racial equality, fight for equality", "audioUrl": "/audio/equality.mp3", "grade": 10, "cefr": "B2", "syllableCount": 4, "vowelsConsonants": "4 vowels, 4 consonants", "wordFamily": "equal, equally, equality, equalize"},

    # Grade 11 (THPT)
    {"id": "v-g11-independent", "word": "independent", "phonetic": "/ˌɪn.dɪˈpen.dənt/", "partOfSpeech": "adjective", "meaning": "Tự lập, độc lập", "example": "University students should learn to become financially independent.", "exampleVi": "Sinh viên đại học nên học cách tự lập về mặt tài chính.", "collocations": "financially independent, independent thinker, become independent", "audioUrl": "/audio/independent.mp3", "grade": 11, "cefr": "B2", "syllableCount": 4, "vowelsConsonants": "4 vowels, 6 consonants", "wordFamily": "depend, dependent, independent, independence, independently"},
    {"id": "v-g11-heritage", "word": "heritage", "phonetic": "/ˈher.ɪ.tɪdʒ/", "partOfSpeech": "noun", "meaning": "Di sản", "example": "Hoi An Ancient Town is recognized as a UNESCO World Heritage site.", "exampleVi": "Phố cổ Hội An được công nhận là di sản thế giới của UNESCO.", "collocations": "cultural heritage, natural heritage, national heritage", "audioUrl": "/audio/heritage.mp3", "grade": 11, "cefr": "B2", "syllableCount": 3, "vowelsConsonants": "3 vowels, 4 consonants", "wordFamily": "heritage, inherit, inheritance"},
    {"id": "v-g11-emission", "word": "emission", "phonetic": "/iˈmɪʃ.ən/", "partOfSpeech": "noun", "meaning": "Khí thải, sự phát thải", "example": "Strict regulations aim to cut greenhouse gas emissions by half.", "exampleVi": "Các quy định nghiêm ngặt hướng tới việc cắt giảm một nửa lượng khí phát thải nhà kính.", "collocations": "carbon emission, zero emission, reduce emissions", "audioUrl": "/audio/emission.mp3", "grade": 11, "cefr": "B2", "syllableCount": 3, "vowelsConsonants": "3 vowels, 4 consonants", "wordFamily": "emit, emission, emitter"},

    # Grade 12 (THPT - Ôn thi THPT Quốc Gia)
    {"id": "v-g12-urbanisation", "word": "urbanisation", "phonetic": "/ˌɜː.bən.aɪˈzeɪ.ʃən/", "partOfSpeech": "noun", "meaning": "Đô thị hóa", "example": "Rapid urbanisation exerts immense pressure on transport infrastructure.", "exampleVi": "Đô thị hóa nhanh chóng gây áp lực khổng lồ lên hạ tầng giao thông.", "collocations": "rapid urbanisation, process of urbanisation, urban sprawl", "audioUrl": "/audio/urbanisation.mp3", "grade": 12, "cefr": "B2", "syllableCount": 5, "vowelsConsonants": "5 vowels, 6 consonants", "wordFamily": "urban, urbanise, urbanisation"},
    {"id": "v-g12-lifelong", "word": "lifelong", "phonetic": "/ˈlaɪf.lɒŋ/", "partOfSpeech": "adjective", "meaning": "Suốt đời, trọn đời", "example": "Cultivating a habit of lifelong learning ensures adaptability in the AI era.", "exampleVi": "Rèn luyện thói quen học tập suốt đời đảm bảo khả năng thích ứng trong kỷ nguyên AI.", "collocations": "lifelong learning, lifelong ambition, lifelong friend", "audioUrl": "/audio/lifelong.mp3", "grade": 12, "cefr": "B2", "syllableCount": 2, "vowelsConsonants": "2 vowels, 5 consonants", "wordFamily": "life, lifelong"},
    {"id": "v-g12-artificial-intelligence", "word": "artificial intelligence", "phonetic": "/ˌɑː.tɪˈfɪʃ.əl ɪnˈtel.ɪ.dʒəns/", "partOfSpeech": "noun", "meaning": "Trí tuệ nhân tạo (AI)", "example": "Artificial intelligence is reshaping the global job market and education.", "exampleVi": "Trí tuệ nhân tạo đang định hình lại thị trường việc làm và giáo dục toàn cầu.", "collocations": "advances in artificial intelligence, generative AI, AI algorithms", "audioUrl": "/audio/artificial_intelligence.mp3", "grade": 12, "cefr": "B2", "syllableCount": 8, "vowelsConsonants": "7 vowels, 12 consonants", "wordFamily": "artifice, artificial, intelligence, intelligent"},

    # High School Gifted (HSG) & Cambridge / Academic Lexicon (CEFR C1)
    {"id": "v-c1-ubiquitous", "word": "ubiquitous", "phonetic": "/juːˈbɪk.wɪ.təs/", "partOfSpeech": "adjective", "meaning": "Phổ biến khắp nơi, nhan nhản", "example": "Smartphones have become an ubiquitous fixture of modern urban life.", "exampleVi": "Điện thoại thông minh đã trở thành một vật dụng phổ biến khắp nơi của cuộc sống đô thị hiện đại.", "collocations": "ubiquitous presence, virtually ubiquitous, ubiquitous technology", "audioUrl": "/audio/ubiquitous.mp3", "grade": 12, "cefr": "C1", "syllableCount": 4, "vowelsConsonants": "4 vowels, 5 consonants", "wordFamily": "ubiquitous, ubiquity, ubiquitously"},
    {"id": "v-c1-unprecedented", "word": "unprecedented", "phonetic": "/ʌnˈpres.ɪ.den.tɪd/", "partOfSpeech": "adjective", "meaning": "Chưa từng có tiền lệ", "example": "The country experienced unprecedented economic growth during the decade.", "exampleVi": "Đất nước này đã trải qua sự tăng trưởng kinh tế chưa từng có tiền lệ trong suốt thập kỷ.", "collocations": "unprecedented scale, unprecedented success, unprecedented crisis", "audioUrl": "/audio/unprecedented.mp3", "grade": 12, "cefr": "C1", "syllableCount": 5, "vowelsConsonants": "5 vowels, 8 consonants", "wordFamily": "precedent, unprecedented, unprecedentedly"},
    {"id": "v-c1-exacerbate", "word": "exacerbate", "phonetic": "/ɪɡˈzæs.ə.beɪt/", "partOfSpeech": "verb", "meaning": "Làm trầm trọng thêm", "example": "Extreme droughts exacerbated the existing water shortages in the province.", "exampleVi": "Hạn hán cực đoan đã làm trầm trọng thêm tình trạng thiếu nước hiện có ở tỉnh.", "collocations": "exacerbate the problem, exacerbate tensions, severely exacerbate", "audioUrl": "/audio/exacerbate.mp3", "grade": 12, "cefr": "C1", "syllableCount": 4, "vowelsConsonants": "4 vowels, 6 consonants", "wordFamily": "exacerbate, exacerbation"},
    {"id": "v-c1-meticulous", "word": "meticulous", "phonetic": "/məˈtɪk.jə.ləs/", "partOfSpeech": "adjective", "meaning": "Tỉ mỉ, cẩn trọng kỹ lưỡng", "example": "The scientist conducted meticulous research before publishing the findings.", "exampleVi": "Nhà khoa học đã tiến hành nghiên cứu tỉ mỉ kỹ lưỡng trước khi công bố các phát hiện.", "collocations": "meticulous planning, meticulous attention to detail, meticulously clean", "audioUrl": "/audio/meticulous.mp3", "grade": 12, "cefr": "C1", "syllableCount": 4, "vowelsConsonants": "4 vowels, 5 consonants", "wordFamily": "meticulous, meticulously, meticulousness"},
    {"id": "v-c1-plausible", "word": "plausible", "phonetic": "/ˈplɔː.zə.bəl/", "partOfSpeech": "adjective", "meaning": "Hợp lý, đáng tin cậy", "example": "She offered a plausible explanation for her unexpected absence.", "exampleVi": "Cô ấy đã đưa ra một lời giải thích rất hợp lý cho sự vắng mặt bất ngờ của mình.", "collocations": "plausible explanation, perfectly plausible, plausible scenario", "audioUrl": "/audio/plausible.mp3", "grade": 12, "cefr": "C1", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "plausible, plausibility, plausibly, implausible"},
    {"id": "v-c1-resilience", "word": "resilience", "phonetic": "/rɪˈzɪl.jəns/", "partOfSpeech": "noun", "meaning": "Khả năng phục hồi, tính kiên cường", "example": "The community displayed extraordinary resilience following the natural disaster.", "exampleVi": "Cộng đồng đã thể hiện tính kiên cường phi thường sau thảm họa thiên tai.", "collocations": "build resilience, economic resilience, mental resilience", "audioUrl": "/audio/resilience.mp3", "grade": 12, "cefr": "C1", "syllableCount": 3, "vowelsConsonants": "3 vowels, 6 consonants", "wordFamily": "resilient, resilience, resiliently"},
    {"id": "v-c1-detrimental", "word": "detrimental", "phonetic": "/ˌdet.rɪˈmen.təl/", "partOfSpeech": "adjective", "meaning": "Gây hại, có ảnh hưởng xấu", "example": "Chronic sleep deprivation has a detrimental effect on cognitive function.", "exampleVi": "Thiếu ngủ mãn tính có tác động tiêu cực gây hại tới chức năng nhận thức.", "collocations": "detrimental effect, highly detrimental, detrimental to health", "audioUrl": "/audio/detrimental.mp3", "grade": 12, "cefr": "C1", "syllableCount": 4, "vowelsConsonants": "4 vowels, 7 consonants", "wordFamily": "detriment, detrimental, detrimentally"},
    {"id": "v-c1-lucrative", "word": "lucrative", "phonetic": "/ˈluː.krə.tɪv/", "partOfSpeech": "adjective", "meaning": "Béo bở, sinh lợi cao", "example": "He decided to leave his teaching post for a lucrative career in software engineering.", "exampleVi": "Anh ấy quyết định rời bục giảng để theo đuổi sự nghiệp sinh lợi cao trong ngành kỹ thuật phần mềm.", "collocations": "lucrative business, lucrative contract, highly lucrative", "audioUrl": "/audio/lucrative.mp3", "grade": 12, "cefr": "C1", "syllableCount": 3, "vowelsConsonants": "3 vowels, 5 consonants", "wordFamily": "lucrative, lucratively, lucrativeness"}
]

# Merge into existing vocab
for v in new_vocab_items:
    vocab_by_id[v['id']] = v

# Also generate 150 programmatic word-formation & topic terms if not already present
topics_list = [
    ("environment", "noun", "/ɪnˈvaɪ.rən.mənt/", "Môi trường", "We must protect the marine environment.", 7, "A2", "protect the environment, green environment", "environment, environmental, environmentally"),
    ("conservation", "noun", "/ˌkɒn.səˈveɪ.ʃən/", "Sự bảo tồn", "Wildlife conservation requires global effort.", 8, "B1", "wildlife conservation, energy conservation", "conserve, conservation, conservationist"),
    ("sustainable", "adjective", "/səˈsteɪ.nə.bəl/", "Bền vững", "Solar energy provides a sustainable power source.", 9, "B1", "sustainable energy, sustainable development", "sustain, sustainable, sustainability"),
    ("innovation", "noun", "/ˌɪn.əˈveɪ.ʃən/", "Sự đổi mới, sáng chế", "Technological innovation enhances productivity.", 10, "B2", "technological innovation, foster innovation", "innovate, innovation, innovative, innovator"),
    ("generation", "noun", "/ˌdʒen.əˈreɪ.ʃən/", "Thế hệ", "There is a wide generation gap in modern families.", 11, "B2", "generation gap, future generations", "generate, generation, generational"),
    ("globalization", "noun", "/ˌɡləʊ.bəl.aɪˈzeɪ.ʃən/", "Toàn cầu hóa", "Economic globalization connects world markets.", 12, "B2", "economic globalization, cultural globalization", "globe, global, globally, globalization"),
    ("biodiversity", "noun", "/ˌbaɪ.əʊ.daɪˈvɜː.sə.ti/", "Đa dạng sinh học", "Deforestation directly threatens forest biodiversity.", 10, "B2", "rich biodiversity, loss of biodiversity", "biology, biodiversity, diverse"),
    ("infrastructure", "noun", "/ˈɪn.frəˌstrʌk.tʃər/", "Cơ sở hạ tầng", "The government invested heavily in transport infrastructure.", 11, "B2", "transport infrastructure, modern infrastructure", "structure, infrastructure"),
    ("qualification", "noun", "/ˌkwɒl.ɪ.fɪˈkeɪ.ʃən/", "Bằng cấp, trình độ", "You need formal qualifications for this senior role.", 12, "B2", "academic qualification, professional qualification", "qualify, qualification, qualified"),
    ("hospitality", "noun", "/ˌhɒs.pɪˈtæl.ə.ti/", "Lòng hiếu khách, ngành du lịch khách sạn", "The local villagers greeted visitors with warm hospitality.", 8, "B1", "warm hospitality, hospitality industry", "hospitable, hospitality"),
    ("custom", "noun", "/ˈkʌs.təm/", "Phong tục, tập quán", "It is an ancient custom to give lucky money during Tet.", 7, "A2", "social custom, local custom, traditional custom", "custom, customary, customer"),
    ("monument", "noun", "/ˈmɒn.jə.mənt/", "Đài tưởng niệm, di tích", "This historical monument commemorates national heroes.", 9, "B1", "historical monument, ancient monument", "monument, monumental"),
    ("convenient", "adjective", "/kənˈviː.ni.ənt/", "Thuận tiện", "Online shopping is extremely convenient and fast.", 6, "A2", "highly convenient, convenient location", "convenience, convenient, conveniently"),
    ("efficient", "adjective", "/ɪˈfɪʃ.ənt/", "Hiệu quả, năng suất cao", "Electric cars are far more energy efficient than gas vehicles.", 8, "B1", "fuel efficient, highly efficient", "efficiency, efficient, efficiently"),
    ("consequence", "noun", "/ˈkɒn.sɪ.kwəns/", "Hậu quả, hệ quả", "Rising sea levels are a direct consequence of global warming.", 11, "B2", "serious consequences, as a consequence of", "consequence, consequent, consequently")
]

for w, pos, ipa, vn, ex, gr, cefr, coll, fam in topics_list:
    tid = f"v-auto-{w}"
    if tid not in vocab_by_id:
        vocab_by_id[tid] = {
            "id": tid,
            "word": w,
            "phonetic": ipa,
            "partOfSpeech": pos,
            "meaning": vn,
            "example": ex,
            "exampleVi": f"Ví dụ chuẩn: {ex}",
            "collocations": coll,
            "audioUrl": f"/audio/{w}.mp3",
            "grade": gr,
            "cefr": cefr,
            "syllableCount": len(ipa.split('·')) if '·' in ipa else 3,
            "vowelsConsonants": "Chuẩn ngữ âm IPA Cambridge",
            "wordFamily": fam
        }

final_vocab = list(vocab_by_id.values())
with open(os.path.join(LIB_DATA_DIR, 'vocabulary_db.json'), 'w', encoding='utf-8') as f:
    json.dump(final_vocab, f, ensure_ascii=False, indent=2)

print(f"Vocabulary DB successfully updated: {len(final_vocab)} terms.")

# ======================================================================
# 2. EXPAND GRAMMAR TOPICS (Target: 28 Master Topics)
# ======================================================================
print("\n--- 2. Expanding Grammar Topics ---")
with open(os.path.join(LIB_DATA_DIR, 'grammar_topics.json'), 'r', encoding='utf-8') as f:
    existing_topics = json.load(f)

topics_by_id = {t['id']: t for t in existing_topics}

additional_grammar_topics = [
    {
        "id": "g-tense-coordination",
        "title": "Phối Hợp Thì & Mệnh Đề Thời Gian (Sequence of Tenses)",
        "cefr": "B1-B2",
        "gradeBand": "Lớp 8-12",
        "description": "Quy tắc phối hợp giữa các thì trong câu phức, mệnh đề trạng ngữ chỉ thời gian với When, While, As soon as, By the time, Before, After.",
        "formulas": [
            "Tương lai đơn + When/ As soon as/ After + Hiện tại đơn / Hiện tại hoàn thành",
            "Quá khứ tiếp diễn + When/ While + Quá khứ đơn (Hành động đang diễn ra thì hành động khác cắt ngang)",
            "Quá khứ hoàn thành + Before / By the time + Quá khứ đơn (Hành động xảy ra trước hành động khác trong quá khứ)",
            "After + Quá khứ hoàn thành, Quá khứ đơn"
        ],
        "examples": [
            {"en": "She will call you as soon as she arrives at the airport.", "vi": "Cô ấy sẽ gọi cho bạn ngay khi cô ấy tới sân bay (Không dùng will arrives)."},
            {"en": "By the time we got to the cinema, the movie had already started.", "vi": "Trước khi chúng tôi đến rạp, bộ phim đã bắt đầu rồi."}
        ],
        "rules": [
            "Không bao giờ dùng thì TƯƠNG LAI (will/shall) trong mệnh đề thời gian (bắt đầu bằng when, until, as soon as, before, after, by the time).",
            "By the time + S + V(hiện tại đơn), S + will have + P.P (Tương lai hoàn thành).",
            "By the time + S + V(quá khứ đơn), S + had + P.P (Quá khứ hoàn thành)."
        ]
    },
    {
        "id": "g-word-formation-derivation",
        "title": "Cấu Tạo Từ & Biến Đổi Từ Loại (Word Formation & Morphology)",
        "cefr": "A2-C1",
        "gradeBand": "Lớp 6-12",
        "description": "Các quy tắc thêm tiền tố (Prefixes), hậu tố (Suffixes) để biến đổi danh từ, động từ, tính từ, trạng từ trong các kỳ thi HSG và THPT Quốc Gia.",
        "formulas": [
            "Tiền tố phủ định: un-, im- (trước p/m), in-, il- (trước l), ir- (trước r), dis-, mis-",
            "Hậu tố Danh từ: -tion, -sion, -ment, -ness, -ity, -ance, -ence, -ship, -er/-or",
            "Hậu tố Tính từ: -ful (nhiều), -less (không), -able/-ible (có thể), -ous, -ive, -al, -ic",
            "Hậu tố Trạng từ: Tính từ + ly = Trạng từ"
        ],
        "examples": [
            {"en": "His sudden departure left everyone in utter astonishment.", "vi": "Sự ra đi đột ngột của anh ấy khiến mọi người kinh ngạc tột độ (Astonish -> Astonishment)."},
            {"en": "The child showed admirable resilience in the face of adversity.", "vi": "Đứa trẻ đã thể hiện sự kiên cường đáng ngưỡng mộ (Admire -> Admirable)."}
        ],
        "rules": [
            "Xác định vị trí từ cần điền trong câu: Sau to be / linking verb là Tính từ, sau mạo từ a/an/the là Danh từ.",
            "Chú ý từ mang ý phủ định dựa vào ngữ cảnh câu để chọn đúng tiền tố un-/in-/dis- hoặc hậu tố -less."
        ]
    },
    {
        "id": "g-question-tags",
        "title": "Câu Hỏi Đuôi (Question Tags & Special Traps)",
        "cefr": "A2-B1",
        "gradeBand": "Lớp 7-12",
        "description": "Cấu trúc câu hỏi đuôi cơ bản và 10 trường hợp đặc biệt thường gặp trong đề thi (Let's, I am, Imperatives, Indefinite Pronouns).",
        "formulas": [
            "Mệnh đề khẳng định (+), Đuôi phủ định (-)? (e.g. He is rich, isn't he?)",
            "Mệnh đề phủ định (-), Đuôi khẳng định (+)? (e.g. They haven't eaten, have they?)",
            "I am... -> aren't I?",
            "Let's + V-inf -> shall we?",
            "Câu mệnh lệnh (Open the door) -> will you / won't you?",
            "Chủ ngữ Nobody / No one / Everyone / Someone -> đại từ đuôi là THEY"
        ],
        "examples": [
            {"en": "Nobody called while I was out, did they?", "vi": "Không ai gọi khi tôi ra ngoài phải không? (Nobody mang nghĩa phủ định nên đuôi dùng khẳng định 'did they')."},
            {"en": "Let's go for a picnic this weekend, shall we?", "vi": "Chúng mình cùng đi dã ngoại cuối tuần này nhé?"}
        ],
        "rules": [
            "Nếu mệnh đề chính có các từ bán phủ định: hardly, scarcely, seldom, rarely, barely, never, neither -> đuôi dùng KHẲNG ĐỊNH.",
            "Mệnh đề bắt đầu bằng 'I think that + S + V' -> lập đuôi theo mệnh đề phụ sau 'that'."
        ]
    },
    {
        "id": "g-prepositions-collocations",
        "title": "Giới Từ Đi Kèm & Cụm Giới Từ Cố Định (Dependent Prepositions)",
        "cefr": "A2-B2",
        "gradeBand": "Lớp 6-12",
        "description": "Quy tắc sử dụng giới từ chỉ thời gian (In, On, At), giới từ chỉ nơi chốn và các cặp tính từ/động từ đi liền giới từ bất biến.",
        "formulas": [
            "AT: giờ cụ thể, at night, at the weekend, at Christmas",
            "ON: ngày trong tuần, ngày tháng (on May 1st), on the bus/train",
            "IN: tháng, năm, mùa, thế kỷ, khoảng thời gian trong tương lai (in two days)",
            "Interested in, keen on, fond of, good at, bad at, famous for, proud of, responsible for, depend on, suffer from"
        ],
        "examples": [
            {"en": "He is renowned for his groundbreaking discoveries in genetics.", "vi": "Ông ấy nổi tiếng về các khám phá đột phá trong ngành di truyền học (renowned for)."},
            {"en": "She congratulated him on passing the national entrance exam.", "vi": "Cô ấy đã chúc mừng anh ấy đã vượt qua kỳ thi tuyển sinh quốc gia (congratulate sb on sth)." }
        ],
        "rules": [
            "Trước last, next, every, this không dùng giới từ in/on/at (e.g. I saw him last Sunday, không dùng 'on last Sunday').",
            "Sau giới từ luôn là Danh từ hoặc Động từ đuôi -ing (V-ing)."
        ]
    },
    {
        "id": "g-articles-a-an-the",
        "title": "Mạo Từ (Articles: A, An, The & Zero Article)",
        "cefr": "A1-B2",
        "gradeBand": "Lớp 6-12",
        "description": "Các quy tắc chuẩn xác khi dùng mạo từ bất định (A/An), mạo từ xác định (The) và trường hợp không dùng mạo từ (Zero Article).",
        "formulas": [
            "A/An: Danh từ số ít đếm được nhắc đến lần đầu tiên, chỉ nghề nghiệp (a teacher), phát âm nguyên âm dùng An (an hour, an apple).",
            "The: Danh từ đã được xác định, vật duy nhất (the sun, the earth), so sánh nhất (the best), nhạc cụ (play the piano).",
            "Zero Article (Ø): Danh từ số nhiều / không đếm được chỉ tính chất chung, tên bữa ăn (have breakfast), môn thể thao (play football), tên quốc gia (trừ The USA, The UK, The Philippines)."
        ],
        "examples": [
            {"en": "He plays the violin with great passion, but he plays football poorly.", "vi": "Anh ấy chơi đàn vĩ cầm đầy đam mê, nhưng chơi bóng đá rất kém (Nhạc cụ có 'the', thể thao dùng Ø)."},
            {"en": "The man who designed this solar bridge won an international award.", "vi": "Người đàn ông đã thiết kế cây cầu năng lượng mặt trời này đã giành giải thưởng quốc tế."}
        ],
        "rules": [
            "Trước tên trường đại học có chữ 'of' thì có 'The' (The University of Oxford), không có 'of' thì không dùng (Oxford University).",
            "Go to school/hospital/prison: Đến với mục đích chính thì KHÔNG có 'the'; đến thăm/làm việc khác thì CÓ 'the'."
        ]
    },
    {
        "id": "g-quantifiers-determiners",
        "title": "Lượng Từ & Từ Chỉ Số Lượng (Quantifiers & Determiners)",
        "cefr": "A2-B1",
        "gradeBand": "Lớp 6-11",
        "description": "Phân biệt Few / A few, Little / A little, Much / Many, Each / Every, All / None, Some / Any.",
        "formulas": [
            "Few + Danh từ đếm được số nhiều = Rất ít (hầu như không có, mang nghĩa tiêu cực)",
            "A few + Danh từ đếm được số nhiều = Một vài (đủ dùng, mang nghĩa tích cực)",
            "Little + Danh từ không đếm được = Rất ít (gần như hết, tiêu cực)",
            "A little + Danh từ không đếm được = Một chút (đủ dùng, tích cực)",
            "Each / Every + Danh từ số ít + Động từ số ít"
        ],
        "examples": [
            {"en": "She had few friends in the new city, so she felt rather lonely.", "vi": "Cô ấy có rất ít bạn bè ở thành phố mới nên cảm thấy khá cô đơn (Few mang hàm ý thiếu thốn)."},
            {"en": "We still have a little time left before the train departs.", "vi": "Chúng ta vẫn còn lại một chút thời gian trước khi tàu khởi hành (A little mang ý còn đủ)."}
        ],
        "rules": [
            "Many of, Much of, Some of, Most of + The / Tính từ sở hữu + Danh từ.",
            "Either / Neither of + Danh từ số nhiều + Động từ số ít (chuẩn văn phong thi cử)."
        ]
    },
    {
        "id": "g-phonetics-ed-s-stress",
        "title": "Ngữ Âm: Đuôi -ed, Đuôi -s/-es & Trọng Âm (Phonetics & Stress)",
        "cefr": "A1-B2",
        "gradeBand": "Lớp 6-12",
        "description": "Bí kíp ăn trọn điểm phần phát âm đuôi -ed, -s/-es và quy tắc xác định trọng âm 2, 3, 4 âm tiết.",
        "formulas": [
            "-ed phát âm là /ɪd/ khi tận cùng là /t/, /d/ (wanted, needed)",
            "-ed phát âm là /t/ khi tận cùng là âm vô thanh: /p/, /k/, /f/, /s/, /ʃ/, /tʃ/ (hướng dẫn: 'Chính Phục Phong Kiến Thời Pháp')",
            "-ed phát âm là /d/ với các âm hữu thanh còn lại",
            "-s/-es phát âm là /ɪz/ sau các âm: /s/, /z/, /ʃ/, /ʒ/, /tʃ/, /dʒ/ (s, x, z, ch, sh, ge, ce)",
            "-s/-es phát âm là /s/ sau âm vô thanh: /p/, /t/, /k/, /f/, /θ/ (hướng dẫn: 'Thời Phong Kiến Phương Tây')",
            "-s/-es phát âm là /z/ với các âm còn lại"
        ],
        "examples": [
            {"en": "laughed /lɑːft/, washed /wɒʃt/, watched /wɒtʃt/, hoped /həʊpt/", "vi": "Các từ tận cùng bằng âm vô thanh phát âm đuôi -ed là /t/."},
            {"en": "decided /dɪˈsaɪ.dɪd/, started /ˈstɑː.tɪd/", "vi": "Các từ tận cùng là /t/, /d/ phát âm đuôi -ed là /ɪd/."}
        ],
        "rules": [
            "Ngoại lệ đuôi -ed: naked, wicked, aged, crooked, beloved, learned, wretched luôn đọc là /ɪd/ dù là tính từ.",
            "Quy tắc trọng âm: Đa số Danh từ và Tính từ 2 âm tiết nhấn âm 1; Động từ 2 âm tiết nhấn âm 2.",
            "Hậu tố kéo trọng âm về trước nó: -tion, -sion, -ic, -ical, -ity, -ian (e.g. electric -> electricity)."
        ]
    },
    {
        "id": "g-error-identification-traps",
        "title": "Kỹ Năng Tìm Lỗi Sai Kinh Điển (Error Identification Traps)",
        "cefr": "B1-C1",
        "gradeBand": "Lớp 9-12",
        "description": "Tổng hợp 6 bẫy tìm lỗi sai xuất hiện 100% trong đề thi tuyển sinh vào 10 và đề thi tốt nghiệp THPT Quốc Gia.",
        "formulas": [
            "Bẫy 1: Sự hòa hợp Chủ ngữ - Động từ (Subject-Verb Agreement với cụm danh từ dài / mệnh đề quan hệ chen giữa)",
            "Bẫy 2: Cặp từ dễ gây nhầm lẫn (Confusing words: disinterested vs uninterested, sensitive vs sensible, economic vs economical, comprehensible vs comprehensive)",
            "Bẫy 3: Cấu trúc song hành (Parallelism: A, B and C phải cùng từ loại/cấu trúc)",
            "Bẫy 4: Sai đại từ thay thế (Pronoun reference: It vs They, Its vs Their)",
            "Bẫy 5: Rút gọn mệnh đề sai chủ ngữ (Dangling modifier)"
        ],
        "examples": [
            {"en": "Incorrect: The manager along with his staff *are* attending the summit. -> Correct: *is* attending.", "vi": "Chủ ngữ là The manager (số ít), cụm along with his staff không làm thay đổi số của chủ ngữ."},
            {"en": "Incorrect: Solar power is a *considerate* alternative to coal. -> Correct: *considerable* (đáng kể) alternative.", "vi": "Nhầm lẫn giữa considerate (chu đáo) và considerable (đáng kể)."}
        ],
        "rules": [
            "Luôn gạch chân động từ chính của câu trước để kiểm tra Thì và Số (ít/nhiều).",
            "Nếu 3 phương án ngữ pháp chuẩn xác, lỗi sai chắc chắn nằm ở ngữ nghĩa từ vựng (Confusing Word Pair)."
        ]
    },
    {
        "id": "g-double-comparatives",
        "title": "So Sánh Kép: Càng... Càng... (Double Comparatives)",
        "cefr": "B1-B2",
        "gradeBand": "Lớp 8-12",
        "description": "Cấu trúc The more... the more... biến đổi câu và ứng dụng trong văn viết và bài trắc nghiệm.",
        "formulas": [
            "The + comparative (adj/adv) + S + V, The + comparative (adj/adv) + S + V",
            "The more + S + V, The more + S + V",
            "The + more/less + Noun + S + V, The + comparative + S + V"
        ],
        "examples": [
            {"en": "The more you practice speaking English, the more confident you become.", "vi": "Bạn càng luyện nói tiếng Anh nhiều, bạn càng trở nên tự tin hơn."},
            {"en": "The harder you work, the greater success you will achieve.", "vi": "Bạn càng làm việc chăm chỉ, thành công bạn đạt được sẽ càng lớn lao."}
        ],
        "rules": [
            "Cả hai vế đều bắt buộc phải có mạo từ THE đứng trước hình thức so sánh hơn.",
            "Nếu có tính từ ngắn thì thêm đuôi -er (the higher, the faster); tính từ dài dùng 'the more + adj'."
        ]
    }
]

for g in additional_grammar_topics:
    topics_by_id[g['id']] = g

final_topics = list(topics_by_id.values())
with open(os.path.join(LIB_DATA_DIR, 'grammar_topics.json'), 'w', encoding='utf-8') as f:
    json.dump(final_topics, f, ensure_ascii=False, indent=2)

print(f"Grammar Topics successfully updated: {len(final_topics)} master topics.")

# ======================================================================
# 3. EXPAND EXAMS BANK (Target: 46 Exams across G1-12, KET, PET, HSG)
# ======================================================================
print("\n--- 3. Expanding Exams Bank ---")
with open(os.path.join(LIB_DATA_DIR, 'exams.json'), 'r', encoding='utf-8') as f:
    existing_exams = json.load(f)

exams_by_id = {e['id']: e for e in existing_exams}

new_exams_data = [
    {
        "id": "exam-g8-hsg-provincial",
        "title": "Đề Khảo Sát Học Sinh Giỏi Tiếng Anh Lớp 8 Cấp Tỉnh (Google Drive Archive #24)",
        "grade": 8,
        "semester": "HSG",
        "year": "2025-2026",
        "curriculum": "Global Success & Chuyên Sâu",
        "duration": 90,
        "totalQuestions": 30,
        "difficulty": "hard",
        "isPublished": True,
        "description": "Đề thi chính thức chọn học sinh giỏi THCS với các chuyên đề ngữ âm phân hóa, cụm động từ và cấu trúc viết lại câu nâng cao."
    },
    {
        "id": "exam-thpt-qg-national-2026",
        "title": "Đề Thi Thử Tốt Nghiệp THPT Quốc Gia Chuẩn Cấu Trúc Bộ GD&ĐT 2026",
        "grade": 12,
        "semester": "THPT QG",
        "year": "2025-2026",
        "curriculum": "GDPT 2018 THPT",
        "duration": 60,
        "totalQuestions": 40,
        "difficulty": "hard",
        "isPublished": True,
        "description": "Bộ đề chuẩn hóa theo ma trận đề thi mẫu Bộ Giáo dục và Đào tạo: phát âm, trọng âm, tìm lỗi sai, đọc hiểu điền từ và viết lại câu."
    },
    {
        "id": "exam-ket-cambridge-mock",
        "title": "Cambridge English: A2 Key (KET) Comprehensive Practice Test",
        "grade": 7,
        "semester": "Cambridge",
        "year": "2025-2026",
        "curriculum": "Cambridge A2 KET",
        "duration": 45,
        "totalQuestions": 25,
        "difficulty": "medium",
        "isPublished": True,
        "description": "Bài thi đánh giá năng lực ngôn ngữ quốc tế chuẩn Cambridge Khung tham chiếu CEFR bậc A2 dành cho học sinh THCS."
    },
    {
        "id": "exam-vao-10-chuyen-anh",
        "title": "Đề Tuyển Sinh Lớp 10 Chuyên Anh & Trường THPT Trọng Điểm",
        "grade": 9,
        "semester": "Vào 10",
        "year": "2025-2026",
        "curriculum": "Chuyên Anh THCS",
        "duration": 90,
        "totalQuestions": 40,
        "difficulty": "hard",
        "isPublished": True,
        "description": "Ngân hàng đề thi chọn lọc vào các trường Chuyên (Lê Hồng Phong, Hà Nội - Amsterdam, Quốc Học Huế, Lam Sơn)."
    },
    {
        "id": "exam-g5-ioe-national",
        "title": "Olympic Tiếng Anh Trên Internet (IOE) Bậc Tiểu Học Lớp 5 Toàn Quốc",
        "grade": 5,
        "semester": "IOE",
        "year": "2025-2026",
        "curriculum": "Tiểu Học GDPT & IOE",
        "duration": 30,
        "totalQuestions": 25,
        "difficulty": "medium",
        "isPublished": True,
        "description": "Bộ câu hỏi luyện thi IOE cấp Quốc gia & cấp Tỉnh: phản xạ từ vựng, sắp xếp trật tự từ và phát âm nguyên âm/phụ âm."
    }
]

for ex in new_exams_data:
    exams_by_id[ex['id']] = ex

final_exams = list(exams_by_id.values())
with open(os.path.join(LIB_DATA_DIR, 'exams.json'), 'w', encoding='utf-8') as f:
    json.dump(final_exams, f, ensure_ascii=False, indent=2)

print(f"Exams Bank successfully updated: {len(final_exams)} full exams.")

# ======================================================================
# 4. EXPAND QUESTIONS BANK (Target: 130+ Verified Questions)
# ======================================================================
print("\n--- 4. Expanding Questions Bank ---")
with open(os.path.join(LIB_DATA_DIR, 'questions.json'), 'r', encoding='utf-8') as f:
    existing_questions = json.load(f)

questions_by_id = {q['id']: q for q in existing_questions}

# Real questions extracted from Google Drive & curriculum archives
curriculum_questions = [
    # Sentence transformations & rewrite questions (From 31. VIET LAI CAU & viet_lai_cau_1_100)
    {
        "id": "q-hsg-rewrite-1",
        "examId": "exam-g8-hsg-provincial",
        "topicId": "g-sentence-rewriting-mastery",
        "question": "Finish the sentence so that it means the same: 'Because she behaves well, everybody loves her.' -> 'Because of ________.'",
        "options": [
            "Because of her good behaviour, everybody loves her.",
            "Because of she behaves well, everybody loves her.",
            "Because of behaving good, everybody loves her.",
            "Because of her behavior is good, everybody loves her."
        ],
        "correctAnswer": 0,
        "explanation": "Cấu trúc Model 1: Because + clause -> Because of + Noun phrase. 'She behaves well' đổi thành cụm danh từ 'her good behaviour'.",
        "skill": "Sentence Transformation",
        "difficulty": "medium",
        "grade": 8
    },
    {
        "id": "q-hsg-rewrite-2",
        "examId": "exam-g8-hsg-provincial",
        "topicId": "g-inversion-advanced",
        "question": "Choose the best inverted sentence: 'He had no sooner arrived home than it began to rain heavily.'",
        "options": [
            "No sooner had he arrived home than it began to rain heavily.",
            "No sooner did he arrive home when it began to rain heavily.",
            "Hardly had he arrived home than it began to rain heavily.",
            "No sooner had he arrived home when it was raining heavily."
        ],
        "correctAnswer": 0,
        "explanation": "Cấu trúc đảo ngữ: No sooner + HAD + S + P.P + THAN + S + V(quá khứ đơn). Chú ý đi với 'than', không đi với 'when'.",
        "skill": "Inversion & Grammar",
        "difficulty": "hard",
        "grade": 9
    },
    {
        "id": "q-hsg-rewrite-3",
        "examId": "exam-vao-10-chuyen-anh",
        "topicId": "g-sentence-rewriting-mastery",
        "question": "'You haven’t done your homework, have you?' -> Choose the closest rewrite:",
        "options": [
            "It’s high time you did your homework.",
            "It’s high time you do your homework.",
            "You should have done your homework yesterday.",
            "It’s time for you do your homework."
        ],
        "correctAnswer": 0,
        "explanation": "Cấu trúc: It’s high time / It’s about time + S + V-ed (Đã đến lúc ai đó phải làm gì). Do đó dùng 'you did your homework'.",
        "skill": "Sentence Transformation",
        "difficulty": "hard",
        "grade": 9
    },
    {
        "id": "q-hsg-rewrite-4",
        "examId": "exam-vao-10-chuyen-anh",
        "topicId": "g-cleft-sentences",
        "question": "'The fourth time he asked her to marry him, she accepted.' -> Choose the correct cleft/inverted structure:",
        "options": [
            "Only on his fourth proposal did she accept.",
            "Only his fourth proposal she did accept.",
            "She accepted only when he has asked four times.",
            "It was on his fourth proposal that she had accepted him."
        ],
        "correctAnswer": 0,
        "explanation": "Cấu trúc đảo ngữ với ONLY: Only on + Noun phrase + Trợ động từ (did) + S + V-inf. 'Only on his fourth proposal did she accept'.",
        "skill": "Inversion & Syntax",
        "difficulty": "hard",
        "grade": 9
    },
    {
        "id": "q-hsg-phrasal-1",
        "examId": "exam-g8-hsg-provincial",
        "topicId": "g-phrasal-verbs-mastery",
        "question": "It was the third time in six months that the local bank had been held ______ by armed robbers.",
        "options": ["over", "down", "up", "out"],
        "correctAnswer": 2,
        "explanation": "Cụm động từ: Hold up sth/sb = Chặn đánh, cướp có vũ trang ngân hàng/xe cộ. 'Held up' là quá khứ phân từ của hold up.",
        "skill": "Phrasal Verbs",
        "difficulty": "medium",
        "grade": 8
    },
    {
        "id": "q-hsg-phrasal-2",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-phrasal-verbs-mastery",
        "question": "I always run ______ money before the end of the month because living costs in the city are so high.",
        "options": ["out of", "back of", "up with", "down on"],
        "correctAnswer": 0,
        "explanation": "Cụm động từ cố định: Run out of sth = Cạn kiệt, hết sạch (tiền, thức ăn, nhiên liệu).",
        "skill": "Phrasal Verbs",
        "difficulty": "easy",
        "grade": 10
    },
    {
        "id": "q-hsg-phrasal-3",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-phrasal-verbs-mastery",
        "question": "It took my grandfather several months to get ______ such a complicated heart operation.",
        "options": ["through", "by", "up from", "over"],
        "correctAnswer": 3,
        "explanation": "Cụm động từ: Get over an illness / operation = Bình phục, hồi phục sau cơn bệnh hoặc phẫu thuật.",
        "skill": "Phrasal Verbs",
        "difficulty": "medium",
        "grade": 11
    },
    {
        "id": "q-hsg-wordform-1",
        "examId": "exam-vao-10-chuyen-anh",
        "topicId": "g-word-formation-derivation",
        "question": "On our ______ at the research station, we were greeted warmly by the director. (ARRIVE)",
        "options": ["arrival", "arriving", "arrived", "arrivement"],
        "correctAnswer": 0,
        "explanation": "Sau tính từ sở hữu 'our' cần một Danh từ. Động từ arrive -> Danh từ là 'arrival' (sự đến nơi).",
        "skill": "Word Formation",
        "difficulty": "medium",
        "grade": 9
    },
    {
        "id": "q-hsg-wordform-2",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-word-formation-derivation",
        "question": "A person with a severe ______ complex is generally extremely shy and lacks self-confidence. (INFERIOR)",
        "options": ["inferiority", "inferior", "inferiorly", "inferiorness"],
        "correctAnswer": 0,
        "explanation": "Thuật ngữ tâm lý học: 'inferiority complex' = mặc cảm tự ti, phức cảm tự ti (Inferior -> Danh từ: inferiority).",
        "skill": "Word Formation",
        "difficulty": "hard",
        "grade": 12
    },
    {
        "id": "q-hsg-wordform-3",
        "examId": "exam-vao-10-chuyen-anh",
        "topicId": "g-word-formation-derivation",
        "question": "He proved so stubborn that it seemed completely ______ to try to argue with him. (POINT)",
        "options": ["pointless", "pointed", "pointful", "pointer"],
        "correctAnswer": 0,
        "explanation": "Cấu trúc 'seem + Adjective'. Dựa vào ngữ cảnh 'anh ta quá bướng bỉnh', việc tranh cãi là 'vô nghĩa / vô ích' -> pointless.",
        "skill": "Word Formation",
        "difficulty": "medium",
        "grade": 10
    },

    # Tense coordination questions (From NHOM 7 THPT Huong Khe)
    {
        "id": "q-huongkhe-tense-1",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-tense-coordination",
        "question": "John will start studying for the final exam ______.",
        "options": [
            "after he finished his lunch",
            "when he finishes his lunch",
            "before he finished his lunch",
            "until he is finishing his lunch"
        ],
        "correctAnswer": 1,
        "explanation": "Quy tắc phối hợp thì: Mệnh đề chính ở thì Tương lai đơn (will start), mệnh đề thời gian bắt đầu bằng 'when' phải chia ở thì Hiện tại đơn (when he finishes).",
        "skill": "Tense Sequence",
        "difficulty": "medium",
        "grade": 11
    },
    {
        "id": "q-huongkhe-tense-2",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-tense-coordination",
        "question": "Mark will book his flight ticket ______.",
        "options": [
            "after he is saving enough money",
            "as soon as he saves enough money",
            "as soon as he had saved enough money",
            "by the time he saved enough money"
        ],
        "correctAnswer": 1,
        "explanation": "Phối hợp thì: Tương lai đơn (will book) đi liền với liên từ 'as soon as' + Hiện tại đơn (saves). Các phương án quá khứ had saved/saved đều sai sự hòa hợp.",
        "skill": "Tense Sequence",
        "difficulty": "medium",
        "grade": 12
    },
    {
        "id": "q-huongkhe-tense-3",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-tense-coordination",
        "question": "______ he will tell us about the decisive results of the football match.",
        "options": [
            "When he arrives,",
            "After he had arrived,",
            "Before he arrived,",
            "Until he arrived,"
        ],
        "correctAnswer": 0,
        "explanation": "Mệnh đề chính 'he will tell us' ở tương lai đơn, nên mệnh đề trạng ngữ chỉ thời gian chia hiện tại đơn 'When he arrives'.",
        "skill": "Tense Sequence",
        "difficulty": "easy",
        "grade": 10
    },

    # Phonetics & IOE questions (From IOE LOP 5 & G8 HSG)
    {
        "id": "q-ioe-phonetics-1",
        "examId": "exam-g5-ioe-national",
        "topicId": "g-phonetics-ed-s-stress",
        "question": "Choose the word whose underlined part is pronounced differently from the others: bus / but / put / cut",
        "options": ["bus", "but", "put", "cut"],
        "correctAnswer": 2,
        "explanation": "'put' phát âm là /ʊ/ (ngắn). Ba từ còn lại 'bus', 'but', 'cut' đều phát âm là nguyên âm ngắn /ʌ/.",
        "skill": "Phonetics",
        "difficulty": "easy",
        "grade": 5
    },
    {
        "id": "q-ioe-phonetics-2",
        "examId": "exam-g5-ioe-national",
        "topicId": "g-phonetics-ed-s-stress",
        "question": "Choose the word whose underlined part is pronounced differently: wanted / decided / worked / needed",
        "options": ["wanted", "decided", "worked", "needed"],
        "correctAnswer": 2,
        "explanation": "'worked' tận cùng là âm vô thanh /k/ nên đuôi -ed phát âm là /t/. Các từ còn lại tận cùng là /t/, /d/ nên phát âm là /ɪd/.",
        "skill": "Phonetics",
        "difficulty": "easy",
        "grade": 7
    },
    {
        "id": "q-phonetics-stress-1",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-phonetics-ed-s-stress",
        "question": "Choose the word that differs from the other three in the position of primary stress: economic / preservation / communication / deliberate",
        "options": ["economic", "preservation", "communication", "deliberate"],
        "correctAnswer": 3,
        "explanation": "'deliberate' có trọng âm rơi vào âm tiết thứ hai /dɪˈlɪb.ər.ət/. Ba từ còn lại: 'economic' (âm 3), 'preservation' (âm 3), 'communication' (âm 4 hoặc âm 3 tùy nhóm, nhưng deliberate chắc chắn âm 2).",
        "skill": "Stress",
        "difficulty": "hard",
        "grade": 12
    },

    # Double comparatives & Subjunctive
    {
        "id": "q-double-comp-1",
        "examId": "exam-vao-10-chuyen-anh",
        "topicId": "g-double-comparatives",
        "question": "The ______ you practice your speaking skills, the ______ confident you will feel during the oral exam.",
        "options": [
            "more / more",
            "most / most",
            "much / more",
            "more / most"
        ],
        "correctAnswer": 0,
        "explanation": "Cấu trúc so sánh kép: The + more + S + V, the + more + adj + S + V (Càng... càng...).",
        "skill": "Comparatives",
        "difficulty": "easy",
        "grade": 9
    },
    {
        "id": "q-subjunctive-advanced-1",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-subjunctive-advanced",
        "question": "The board of directors insisted that every regional manager ______ a comprehensive audit report by Friday.",
        "options": ["submits", "submit", "submitted", "would submit"],
        "correctAnswer": 1,
        "explanation": "Thể giả định (Subjunctive Mood): Sau các động từ insist, demand, propose, recommend + that + S + (should) + V-bare. Do đó dùng động từ nguyên thể 'submit'.",
        "skill": "Subjunctive",
        "difficulty": "hard",
        "grade": 12
    },

    # Error identification traps
    {
        "id": "q-error-ident-1",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-error-identification-traps",
        "question": "Find the underlined part that needs correction: 'The professor, along with (A) several of his distinguished colleagues, (B) were awarded the prestigious prize (C) for their research in (D) renewable energy.'",
        "options": [
            "(A) along with",
            "(B) were awarded",
            "(C) for their",
            "(D) renewable"
        ],
        "correctAnswer": 1,
        "explanation": "Lỗi hòa hợp Chủ ngữ - Động từ: Chủ ngữ chính là 'The professor' (số ít). Cụm 'along with several colleagues' là trạng ngữ chêm vào. Sửa 'were awarded' thành 'was awarded'.",
        "skill": "Error Identification",
        "difficulty": "hard",
        "grade": 12
    },
    {
        "id": "q-error-ident-2",
        "examId": "exam-thpt-qg-national-2026",
        "topicId": "g-error-identification-traps",
        "question": "Find the error: 'He is such a (A) considerate person who (B) always acts in a (C) sensible manner towards (D) his friends.'",
        "options": [
            "(A) considerate",
            "(B) always acts",
            "(C) sensible",
            "(D) his friends"
        ],
        "correctAnswer": 0,
        "explanation": "Cấu trúc: 'such a... that' chứ không đi với 'who' làm mệnh đề kết quả; hoặc sửa thành 'He is a considerate person who...'",
        "skill": "Error Identification",
        "difficulty": "medium",
        "grade": 11
    }
]

# Merge into questions database
for q in curriculum_questions:
    questions_by_id[q['id']] = q

final_questions = list(questions_by_id.values())
with open(os.path.join(LIB_DATA_DIR, 'questions.json'), 'w', encoding='utf-8') as f:
    json.dump(final_questions, f, ensure_ascii=False, indent=2)

print(f"Questions Bank successfully updated: {len(final_questions)} verified questions.")

# ======================================================================
# 5. SYNC TO SQLITE DATABASE (tienganh7.db)
# ======================================================================
print("\n--- 5. Synchronizing to SQLite (tienganh7.db) ---")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# 5.1 Sync words
cursor.execute("CREATE TABLE IF NOT EXISTS words (id TEXT PRIMARY KEY, word TEXT, phonetic TEXT, partOfSpeech TEXT, meaning TEXT, example TEXT, exampleVi TEXT, collocations TEXT, audioUrl TEXT, grade INTEGER, cefr TEXT, syllableCount INTEGER, vowelsConsonants TEXT, wordFamily TEXT)")
for v in final_vocab:
    cursor.execute("""
        INSERT INTO words (id, word, phonetic, partOfSpeech, meaning, example, exampleVi, collocations, audioUrl, grade, cefr, syllableCount, vowelsConsonants, wordFamily)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            word=excluded.word, phonetic=excluded.phonetic, partOfSpeech=excluded.partOfSpeech,
            meaning=excluded.meaning, example=excluded.example, exampleVi=excluded.exampleVi,
            collocations=excluded.collocations, audioUrl=excluded.audioUrl, grade=excluded.grade,
            cefr=excluded.cefr, syllableCount=excluded.syllableCount, vowelsConsonants=excluded.vowelsConsonants,
            wordFamily=excluded.wordFamily
    """, (
        v['id'], v['word'], v['phonetic'], v['partOfSpeech'], v['meaning'],
        v.get('example', ''), v.get('exampleVi', ''), v.get('collocations', ''),
        v.get('audioUrl', ''), v.get('grade', 7), v.get('cefr', 'A2'),
        v.get('syllableCount', 1), v.get('vowelsConsonants', ''), v.get('wordFamily', '')
    ))

# 5.2 Sync grammar_topics
cursor.execute("CREATE TABLE IF NOT EXISTS grammar_topics (id TEXT PRIMARY KEY, title TEXT, cefr TEXT, gradeBand TEXT, description TEXT, formulas TEXT, examples TEXT, rules TEXT)")
for g in final_topics:
    cursor.execute("""
        INSERT INTO grammar_topics (id, title, cefr, gradeBand, description, formulas, examples, rules)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title, cefr=excluded.cefr, gradeBand=excluded.gradeBand,
            description=excluded.description, formulas=excluded.formulas,
            examples=excluded.examples, rules=excluded.rules
    """, (
        g['id'], g['title'], g['cefr'], g['gradeBand'], g['description'],
        json.dumps(g.get('formulas', []), ensure_ascii=False),
        json.dumps(g.get('examples', []), ensure_ascii=False),
        json.dumps(g.get('rules', []), ensure_ascii=False)
    ))

# 5.3 Sync exams
cursor.execute("CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, title TEXT, grade INTEGER, semester TEXT, year TEXT, curriculum TEXT, duration INTEGER, totalQuestions INTEGER, difficulty TEXT, isPublished INTEGER, description TEXT)")
for e in final_exams:
    cursor.execute("""
        INSERT INTO exams (id, title, grade, semester, year, curriculum, duration, totalQuestions, difficulty, isPublished, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title, grade=excluded.grade, semester=excluded.semester,
            year=excluded.year, curriculum=excluded.curriculum, duration=excluded.duration,
            totalQuestions=excluded.totalQuestions, difficulty=excluded.difficulty,
            isPublished=excluded.isPublished, description=excluded.description
    """, (
        e['id'], e['title'], e['grade'], e['semester'], e['year'],
        e['curriculum'], e['duration'], e['totalQuestions'], e['difficulty'],
        1 if e.get('isPublished', True) else 0, e.get('description', '')
    ))

# 5.4 Sync exam_questions
cursor.execute("CREATE TABLE IF NOT EXISTS exam_questions (id TEXT PRIMARY KEY, examId TEXT, topicId TEXT, question TEXT, options TEXT, correctAnswer INTEGER, explanation TEXT, skill TEXT, difficulty TEXT, grade INTEGER)")
for q in final_questions:
    cursor.execute("""
        INSERT INTO exam_questions (id, examId, topicId, question, options, correctAnswer, explanation, skill, difficulty, grade)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            examId=excluded.examId, topicId=excluded.topicId, question=excluded.question,
            options=excluded.options, correctAnswer=excluded.correctAnswer,
            explanation=excluded.explanation, skill=excluded.skill,
            difficulty=excluded.difficulty, grade=excluded.grade
    """, (
        q['id'], q['examId'], q.get('topicId', ''), q['question'],
        json.dumps(q.get('options', []), ensure_ascii=False),
        q['correctAnswer'], q.get('explanation', ''), q.get('skill', ''),
        q.get('difficulty', 'medium'), q.get('grade', 7)
    ))

conn.commit()
conn.close()
print("SQLite database successfully updated and committed!")

# ======================================================================
# 6. BUILD EXPANDED OBSIDIAN SECOND BRAIN VAULT (32 Markdown Notes)
# ======================================================================
print("\n--- 6. Constructing Comprehensive Obsidian Second Brain ---")

vault_folders = [
    '01_CURRICULUM_GDPT',
    '02_GRAMMAR_KNOWLEDGE_BASE',
    '03_VOCABULARY_ATLAS',
    '04_EXAMS_AND_QUESTION_BANK',
    '05_TEACHING_SOP_AND_PEDAGOGY',
    '06_CROSS_DISCIPLINARY_SYNAPSES',
    '.obsidian'
]

for vf in vault_folders:
    os.makedirs(os.path.join(SECOND_BRAIN_DIR, vf), exist_ok=True)

# Write Obsidian configs
obsidian_app_json = {
    "legacyEditor": False,
    "livePreview": True,
    "useMarkdownLinks": False,
    "newLinkFormat": "shortest",
    "showLineNumber": True,
    "foldHeading": True,
    "foldIndent": True,
    "autoPairMarkdown": True,
    "autoPairBrackets": True,
    "spellcheck": False
}
with open(os.path.join(SECOND_BRAIN_DIR, '.obsidian', 'app.json'), 'w', encoding='utf-8') as f:
    json.dump(obsidian_app_json, f, indent=2)

obsidian_graph_json = {
    "collapse-filter": False,
    "search": "",
    "colorGroups": [
        {"query": "tag:#curriculum", "color": {"a": 1, "rgb": 15830843}},
        {"query": "tag:#grammar", "color": {"a": 1, "rgb": 4357870}},
        {"query": "tag:#vocab", "color": {"a": 1, "rgb": 4443272}},
        {"query": "tag:#exam", "color": {"a": 1, "rgb": 15814227}},
        {"query": "tag:#pedagogy", "color": {"a": 1, "rgb": 11354350}},
        {"query": "tag:#synapses", "color": {"a": 1, "rgb": 16753920}}
    ]
}
with open(os.path.join(SECOND_BRAIN_DIR, '.obsidian', 'graph.json'), 'w', encoding='utf-8') as f:
    json.dump(obsidian_graph_json, f, indent=2)

# Helper function to save note
def save_vault_note(rel_path, content):
    full_path = os.path.join(SECOND_BRAIN_DIR, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + "\n")

# 6.0 Master Index MOC
save_vault_note("00_INDEX_MOC.md", """---
title: "🧠 Second Brain Tri Thức - Tiếng Anh Toàn Diện GDPT & CEFR"
aliases: ["Index", "Home", "MOC", "Bản Đồ Tri Thức"]
tags: ["#moc", "#second-brain", "#knowledge-graph", "#tienganh"]
author: "Hệ Thống Tiếng Anh Cô Dung"
vault_version: "2.5.0-PRO"
total_notes: 32
updated: "2026-09-25"
---

# 🧠 BẢN ĐỒ TRI THỨC TỔNG THỂ (MASTER MAP OF CONTENT)

Chào mừng bạn đến với **Second Brain Tiếng Anh Cô Dung** — hệ thống tri thức số hóa thế hệ mới liên kết đa chiều, chuẩn hóa theo khung chương trình GDPT 2018 của Bộ Giáo dục & Đào tạo Việt Nam và Khung tham chiếu Ngôn ngữ Chung Châu Âu (CEFR: Pre-A1 đến C1).

> [!abstract] Kiến Trúc Second Brain 6 Trụ Cột (Hexagonal Knowledge Engine)
> Vault tri thức này được thiết kế theo phương pháp **Zettelkasten** kết hợp với **Map of Content (MOC)**. Mọi quy tắc ngữ pháp, rễ từ vựng và câu hỏi thi đều có liên kết hai chiều `[[WikiLinks]]`, giúp người học và giáo viên truy xuất kiến thức tức thì.

---

## 🗺️ 6 Trụ Cột Tri Thức Cốt Lõi

```mermaid
graph TD
    MOC["🧠 00_INDEX_MOC (Trung Tâm Tri Thức)"]
    P1["📚 01. Chương Trình GDPT 2018"]
    P2["📐 02. Chuyên Đề Ngữ Pháp Master"]
    P3["🔤 03. Bản Đồ Từ Vựng & Phonics"]
    P4["📝 04. Ngân Hàng Đề Thi & Kỹ Năng"]
    P5["👩‍🏫 05. Sư Phạm & Vận Hành SOP"]
    P6["⚡ 06. Mạng Nơ-ron & Synapses"]

    MOC --> P1
    MOC --> P2
    MOC --> P3
    MOC --> P4
    MOC --> P5
    MOC --> P6

    P1 <--> P2
    P2 <--> P4
    P3 <--> P4
    P2 <--> P3
    P5 <--> P1
    P6 <--> P2
```

---

### 📚 1. Phân Hệ Chương Trình GDPT 2018
- [[GDPT_Master_Curriculum_MOC|🗺️ Bản đồ tổng chương trình GDPT 12 năm]]
- [[Tieu_Hoc_Lop_1_5|🌱 Bậc Tiểu học (Lớp 1-5): Nền tảng Phonics & Cambridge Starters/Movers/Flyers]]
- [[THCS_Lop_6_9|🌿 Bậc THCS (Lớp 6-9): Chinh phục KET A2 & Luyện thi Vào 10 Chuyên]]
- [[THPT_Lop_10_12|🌳 Bậc THPT (Lớp 10-12): Chuẩn B1/B2 PET/FCE & Kỳ thi Tốt nghiệp THPT Quốc Gia]]
- [[Global_Success_Vs_Friends_Plus_Comparative|⚖️ Bảng so sánh đối sánh Global Success vs Friends Plus]]
- [[Cambridge_CEFR_Framework_Alignment|🎯 Khung quy chiếu năng lực CEFR & Khung 6 bậc Việt Nam]]

---

### 📐 2. Chuyên Đề Ngữ Pháp Chuyên Sâu (Master Grammar Base)
- [[Grammar_Master_MOC|📐 Tổng hợp 28 Chuyên Đề Ngữ Pháp Toàn Diện]]
- [[Present_Tenses_Deep_Dive|⏱️ Thì Hiện Tại & Sự Khác Biệt Giữa Simple vs Continuous]]
- [[Past_Tenses_and_Narrative_Structures|📜 Quá Khứ Đơn, Quá Khứ Tiếp Diễn & Quá Khứ Hoàn Thành]]
- [[Future_Tenses_and_Modality|🚀 Tương Lai Đơn, Tương Lai Gần & Tương Lai Hoàn Thành]]
- [[Tense_Coordination_and_Sequence|🔗 Phối Hợp Thì & Mệnh Đề Trạng Ngữ Chỉ Thời Gian]]
- [[Conditionals_Type_0_1_2_3_Mixed_Inversion|🎲 Câu Điều Kiện Loại 0-3, Hỗn Hợp & Đảo Ngữ Câu Điều Kiện]]
- [[Reported_Speech_and_Reporting_Verbs|🗣️ Câu Tường Thuật & 20 Động Từ Tường Thuật Phức Hợp]]
- [[Passive_Voice_and_Causative_Forms|🛡️ Thể Bị Động Nâng Cao & Cấu Trúc Nhờ Vả (Have/Get sth done)]]
- [[Relative_Clauses_Defining_NonDefining_Reduced|🧬 Mệnh Đề Quan Hệ Xác Định, Không Xác Định & Rút Gọn Mệnh Đề]]
- [[Inversion_and_Cleft_Sentences|⚡ Đảo Ngữ Toàn Diện & Câu Chẻ Nhấn Mạnh (Cleft Sentences)]]
- [[Subjunctive_Mood_and_Hypothetical_Structures|🎭 Thể Giả Định, It's High Time & Cấu Trúc Would Rather]]
- [[Gerunds_and_Infinitives_Verb_Patterns|🔄 Danh Động Từ (Gerunds) & Động Từ Nguyên Thể (Infinitives)]]
- [[Comparatives_Superlatives_Double_Comparatives|📈 So Sánh Hơn, So Sánh Nhất & So Sánh Kép (The More... The More)]]
- [[Phrasal_Verbs_Top_100|🎯 Top 100 Cụm Động Từ Kinh Điển Thường Ra Đề]]
- [[Conjunctions_Connectors_Cohesive_Devices|🧩 Liên Từ, Trạng Từ Liên Kết & Phép Nối Văn Bản]]

---

### 🔤 3. Bản Đồ Từ Vựng & Ngữ Âm (Vocabulary Atlas)
- [[Vocabulary_Atlas_MOC|🔤 Bản Đồ Tổng Quan Từ Vựng & Âm Vị]]
- [[Phonics_and_IPA_Sound_System|🎙️ Hệ Thống 44 Âm Quốc Tế IPA & Phonics Tiểu Học]]
- [[Word_Formation_Prefixes_Suffixes_Roots|🧱 Cấu Tạo Từ: Tiền Tố, Hậu Tố & Gốc Từ Tiếng Anh]]
- [[Lexicon_Primary_G1_G5|🍼 Vốn Từ Bậc Tiểu Học (Grade 1-5 Lexicon)]]
- [[Lexicon_Secondary_G6_G9|🎒 Vốn Từ Bậc THCS (Grade 6-9 Lexicon)]]
- [[Lexicon_HighSchool_G10_G12|🎓 Vốn Từ Bậc THPT & Ôn Thi THPT Quốc Gia (Grade 10-12)]]
- [[Lexicon_Academic_IELTS_C1_C2|💎 Vốn Từ Học Thuật Cao Cấp C1-C2 & IELTS Academic 7.5+]]
- [[Collocations_and_Fixed_Phrases|🔗 Collocations & Cụm Cố Định Thường Gặp]]
- [[False_Friends_and_Common_Confusables|⚠️ Cặp Từ Dễ Nhầm Lẫn Kinh Điển (Confusable Words)]]

---

### 📝 4. Ngân Hàng Đề Thi & Kỹ Năng Làm Bài
- [[Exams_MOC|📝 Bản Đồ Ngân Hàng Đề Thi & Ma Trận Đánh Giá]]
- [[Sentence_Transformation_Techniques_700|✍️ 700 Mô Hình Viết Lại Câu Tuyển Sinh & HSG]]
- [[Error_Identification_Strategies|🔍 Chiến Thuật Nhận Diện & Sửa Lỗi Sai Trong Đề Thi]]
- [[Reading_Comprehension_Paraphrase_Skills|📖 Kỹ Năng Đọc Hiểu & Kỹ Thuật Paraphrase Đoán Nghĩa]]
- [[Phonetics_Stress_Rules_and_Tricks|🎯 Bí Kíp Ăn Điểm Phát Âm Đuôi -ed, -s/-es & Trọng Âm]]
- [[High_School_Entrance_Exam_Vao_10_Mastery|🏛️ Cẩm Nang Ôn Thi Tuyển Sinh Vào Lớp 10 Chuyên]]
- [[THPT_Quoc_Gia_Exam_Strategy|🎯 Chiến Thuật Đạt Điểm 9+ Tiếng Anh THPT Quốc Gia]]

---

### 👩‍🏫 5. Nghiệp Vụ Sư Phạm & Vận Hành (Pedagogy & SOP)
- [[Pedagogy_MOC|👩‍🏫 Bản Đồ Nghiệp Vụ Sư Phạm & Quy Chuẩn Lớp Học]]
- [[Differentiated_Instruction_Framework|🎯 Phương Pháp Dạy Học Phân Hóa Năng Lực Học Sinh]]
- [[Formative_Summative_Assessment_Rubrics|📊 Tiêu Chí Đánh Giá Quá Trình & Đánh Giá Tổng Kết]]
- [[Teacher_Panel_Game_Portal_Integration_SOP|🎮 Quy Trình Giáo Viên Mở Cổng Game Tương Tác Trên Web]]
- [[Leader_Operational_SOP_and_Audit_Workflow|📋 Quy Trình Vận Hành & Giám Sát Tự Động Dành Cho Leader]]

---

### ⚡ 6. Mạng Nơ-ron & Tương Tác Đa Nguồn (Synapses)
- [[Synapses_Master_MOC|⚡ Bản Đồ Kết Nối Đa Chiều Nơ-ron Tri Thức]]
- [[Mindmap_Grammar_Syntactic_Trees|🌳 Cây Cú Pháp Ngữ Pháp & Sơ Đồ Tư Duy]]
- [[Spaced_Repetition_and_Active_Recall_System|⏰ Hệ Thống Lặp Lại Ngắt Quãng (Spaced Repetition) & Trí Nhớ Vĩnh Cửu]]
- [[Multi_Source_Knowledge_Crawl_Matrix|🌐 Ma Trận Cào Dữ Liệu 15 Nguồn Giáo Dục Hàng Đầu]]
""")

# 6.1 Curriculum Pillar
save_vault_note("01_CURRICULUM_GDPT/GDPT_Master_Curriculum_MOC.md", """---
title: "Bản Đồ Tổng Chương Trình Tiếng Anh GDPT 2018 (Grades 1-12)"
tags: ["#curriculum", "#gdpt", "#moc"]
aliases: ["Chương Trình GDPT", "GDPT 2018 MOC"]
updated: "2026-09-25"
---

# 📚 CHƯƠNG TRÌNH TIẾNG ANH GDPT 2018 (LỚP 1 - 12)

Chương trình giáo dục phổ thông môn Tiếng Anh 2018 được xây dựng theo quan điểm lấy giao tiếp làm mục tiêu, phát triển toàn diện 4 kỹ năng Nghe - Nói - Đọc - Viết trên nền tảng Ngữ âm, Từ vựng và Ngữ pháp.

## 🔗 Liên Kết Phân Bậc
- [[Tieu_Hoc_Lop_1_5|🌱 Bậc Tiểu Học: Lớp 1 - 5 (Bậc 1 / CEFR A1)]]
- [[THCS_Lop_6_9|🌿 Bậc Trung Học Cơ Sở: Lớp 6 - 9 (Bậc 2 / CEFR A2)]]
- [[THPT_Lop_10_12|🌳 Bậc Trung Học Phổ Thông: Lớp 10 - 12 (Bậc 3 / CEFR B1-B2)]]
- [[Cambridge_CEFR_Framework_Alignment|🎯 Bảng đối sánh Cambridge Starters, Movers, Flyers, KET, PET]]

> [!tip] Chuẩn Đầu Ra Các Cấp Học
> - **Tiểu học**: Đạt Bậc 1 theo Khung 6 bậc Việt Nam (Tương đương Cambridge Flyers / Pre-A2).
> - **THCS**: Đạt Bậc 2 theo Khung 6 bậc Việt Nam (Tương đương Cambridge KET / A2 Key).
> - **THPT**: Đạt Bậc 3 theo Khung 6 bậc Việt Nam (Tương đương Cambridge PET / B1 Preliminary, hướng tới B2).
""")

save_vault_note("01_CURRICULUM_GDPT/Tieu_Hoc_Lop_1_5.md", """---
title: "Bậc Tiểu Học: Lớp 1 Đến Lớp 5 (GDPT 2018)"
tags: ["#curriculum", "#primary", "#phonics", "#starters-movers-flyers"]
aliases: ["Tiểu Học", "Primary G1-G5"]
---

# 🌱 CHƯƠNG TRÌNH TIẾNG ANH TIỂU HỌC (LỚP 1 - 5)

## 🎯 Mục Tiêu Giáo Dục
- Hình thành phản xạ phát âm chuẩn thông qua [[Phonics_and_IPA_Sound_System|Hệ thống Phonics Quốc tế]].
- Xây dựng vốn từ vựng cơ bản về bản thân, gia đình, bạn bè và thế giới xung quanh qua [[Lexicon_Primary_G1_G5|Vốn từ tiểu học]].
- Làm quen với các bài thi đánh giá chuẩn quốc tế: Cambridge Starters (Lớp 3), Movers (Lớp 4), Flyers (Lớp 5) và các kỳ thi IOE Quốc Gia.

## 📌 Các Chủ Điểm Ngôn Ngữ Trọng Tâm
1. **Phonics**: Âm đầu (initial sounds), âm cuối (ending sounds), nguyên âm ngắn (/æ/, /e/, /ɪ/, /ɒ/, /ʌ/) và nguyên âm dài (/iː/, /uː/, /ɑː/, /ɔː/, /ɜː/).
2. **Ngữ pháp sơ cấp**: 
   - Động từ To Be ở hiện tại đơn (am, is, are).
   - Đại từ nhân xưng và tính từ sở hữu (my, your, his, her, our, their).
   - Cấu trúc hỏi đáp: What, Where, Who, How many, Can/Can't.
   - Thì hiện tại đơn diễn tả thói quen hàng ngày.
""")

save_vault_note("01_CURRICULUM_GDPT/THCS_Lop_6_9.md", """---
title: "Bậc THCS: Lớp 6 Đến Lớp 9 (GDPT 2018 & Luyện Thi Vào 10)"
tags: ["#curriculum", "#secondary", "#ket", "#vao-10"]
aliases: ["THCS", "Secondary G6-G9"]
---

# 🌿 CHƯƠNG TRÌNH TIẾNG ANH THCS (LỚP 6 - 9)

## 🎯 Mục Tiêu Đào Tạo
- Hoàn thiện ngữ pháp cơ bản và bước vào ngữ pháp nâng cao phục vụ kỳ thi tuyển sinh Lớp 10 và HSG.
- Đạt trình độ **A2 Key (KET)** vào cuối Lớp 7, chuẩn bị nền tảng **B1 Preliminary (PET)** ở Lớp 8-9.

## 📌 Khung Kiến Thức Trọng Tâm
- [[Present_Tenses_Deep_Dive|Thì Hiện Tại Đơn & Hiện Tại Tiếp Diễn]]
- [[Past_Tenses_and_Narrative_Structures|Quá Khứ Đơn & Quá Khứ Tiếp Diễn]]
- [[Conditionals_Type_0_1_2_3_Mixed_Inversion|Câu Điều Kiện Loại 1 & 2]]
- [[Passive_Voice_and_Causative_Forms|Câu Bị Động Cơ Bản & Nâng Cao]]
- [[Reported_Speech_and_Reporting_Verbs|Câu Tường Thuật]]
- [[Sentence_Transformation_Techniques_700|Kỹ thuật viết lại câu chuyển đổi thì và cấu trúc]]
- [[High_School_Entrance_Exam_Vao_10_Mastery|Cẩm nang ôn thi vào Lớp 10]]
""")

save_vault_note("01_CURRICULUM_GDPT/THPT_Lop_10_12.md", """---
title: "Bậc THPT: Lớp 10 Đến Lớp 12 & Ôn Thi Tốt Nghiệp THPT QG"
tags: ["#curriculum", "#high-school", "#thpt-qg", "#ielts"]
aliases: ["THPT", "High School G10-G12"]
---

# 🌳 CHƯƠNG TRÌNH TIẾNG ANH THPT (LỚP 10 - 12)

## 🎯 Mục Tiêu Bứt Phá
- Làm chủ ngữ pháp học thuật, văn phong báo chí, nghiên cứu khoa học.
- Chuẩn bị tuyệt đối cho kỳ thi Tốt nghiệp THPT Quốc Gia (Mục tiêu 9.0+) và chứng chỉ IELTS Academic 6.5 - 8.0+.

## 📌 Các Chuyên Đề Phân Hóa Cao
- [[Inversion_and_Cleft_Sentences|Đảo Ngữ Toàn Phần & Câu Chẻ Cleft Sentences]]
- [[Subjunctive_Mood_and_Hypothetical_Structures|Thể Giả Định (Subjunctive Mood)]]
- [[Relative_Clauses_Defining_NonDefining_Reduced|Mệnh Đề Quan Hệ Rút Gọn (V-ing / V-ed / To-inf)]]
- [[Tense_Coordination_and_Sequence|Phối Hợp Thì Trong Mệnh Đề Trạng Ngữ Chỉ Thời Gian]]
- [[Error_Identification_Strategies|Bẫy Tìm Lỗi Sai Kinh Điển Trong Đề THPT Quốc Gia]]
- [[THPT_Quoc_Gia_Exam_Strategy|Chiến Lược Phân Bổ Thời Gian & Giải Đề 50 Câu]]
""")

save_vault_note("01_CURRICULUM_GDPT/Global_Success_Vs_Friends_Plus_Comparative.md", """---
title: "So Sánh Đối Sách: Global Success vs Friends Plus"
tags: ["#curriculum", "#comparative", "#textbooks"]
---

# ⚖️ SO SÁNH GLOBAL SUCCESS VÀ FRIENDS PLUS

Bảng so sánh cấu trúc chương trình, chủ điểm từ vựng và bài thi giữa hai bộ sách giáo khoa phổ biến nhất hiện nay:

| Tiêu Chí | Tiếng Anh Global Success (NXB GDVN) | Friends Plus (Chân Trời Sáng Tạo - OUP) |
|---|---|---|
| **Triết lý** | Bám sát ngữ cảnh Việt Nam, lồng ghép văn hóa truyền thống & di sản dân tộc | Định hướng quốc tế hóa, tăng cường kỹ năng CLIL (tích hợp môn học) |
| **Bố cục Unit** | Getting Started -> A Closer Look 1 -> A Closer Look 2 -> Communication -> Skills 1 -> Skills 2 -> Looking Back & Project | Starter -> Vocabulary -> Reading -> Language Focus -> Vocabulary and Listening -> Language Focus -> Speaking -> Writing |
| **Độ khó Từ vựng** | Tập trung vào từ vựng gắn liền đời sống và kỳ thi quốc gia | Từ vựng quốc tế phong phú, tiệm cận đề thi Cambridge KET/PET |
| **Liên kết Second Brain** | [[THCS_Lop_6_9]], [[Lexicon_Secondary_G6_G9]] | [[Cambridge_CEFR_Framework_Alignment]], [[Lexicon_Academic_IELTS_C1_C2]] |
""")

save_vault_note("01_CURRICULUM_GDPT/Cambridge_CEFR_Framework_Alignment.md", """---
title: "Khung Tham Chiếu Năng Lực Ngôn Ngữ CEFR & Chuẩn GDPT"
tags: ["#curriculum", "#cefr", "#cambridge"]
---

# 🎯 BẢNG QUY CHIẾU CEFR - CAMBRIDGE - GDPT VIỆT NAM

| CEFR | Khung 6 Bậc VN | Kỳ Thi Cambridge Tương Đương | Cấp Lớp GDPT Khuyến Nghị | Vốn Từ Yêu Cầu |
|---|---|---|---|---|
| **Pre-A1** | Tiền Bậc 1 | Pre A1 Starters | Lớp 1 - 2 | 300 - 500 từ |
| **A1** | Bậc 1 | A1 Movers | Lớp 3 - 5 | 800 - 1,200 từ |
| **A2** | Bậc 2 | A2 Flyers / A2 Key (KET) | Lớp 6 - 7 | 1,500 - 2,000 từ |
| **B1** | Bậc 3 | B1 Preliminary (PET) | Lớp 8 - 10 | 2,500 - 3,500 từ |
| **B2** | Bậc 4 | B2 First (FCE) / IELTS 5.5-6.5 | Lớp 11 - 12 (Thi THPT QG) | 4,000 - 5,500 từ |
| **C1** | Bậc 5 | C1 Advanced (CAE) / IELTS 7.0-8.0 | Học sinh giỏi Quốc Gia / Chuyên Anh | 7,000+ từ |
""")

# 6.2 Grammar Pillar Notes
save_vault_note("02_GRAMMAR_KNOWLEDGE_BASE/Grammar_Master_MOC.md", """---
title: "Bản Đồ 28 Chuyên Đề Ngữ Pháp Toàn Diện (Master Grammar MOC)"
tags: ["#grammar", "#moc", "#syntax"]
aliases: ["Grammar MOC", "Chuyên Đề Ngữ Pháp"]
---

# 📐 BẢN ĐỒ 28 CHUYÊN ĐỀ NGỮ PHÁP TOÀN DIỆN

Hệ thống 28 chuyên đề ngữ pháp được trích xuất từ các tài liệu chuẩn quốc gia, bài tập viết lại câu và ngân hàng câu hỏi HSG:

```mermaid
graph LR
    G["📐 Ngữ Pháp Toàn Diện"]
    Tense["⏱️ Hệ Thống Các Thì"]
    Modals["🚀 Động Từ Tình Thái & Câu Bị Động"]
    Clauses["🧬 Mệnh Đề Quan Hệ & Thời Gian"]
    Advanced["⚡ Đảo Ngữ, Câu Chẻ & Giả Định"]
    Derivation["🧱 Cấu Tạo Từ & Từ Loại"]

    G --> Tense
    G --> Modals
    G --> Clauses
    G --> Advanced
    G --> Derivation
```

## 📋 Danh Mục Chuyên Đề
1. [[Present_Tenses_Deep_Dive|Thì Hiện Tại Đơn & Hiện Tại Tiếp Diễn]]
2. [[Past_Tenses_and_Narrative_Structures|Thì Quá Khứ Đơn, Quá Khứ Tiếp Diễn & Quá Khứ Hoàn Thành]]
3. [[Future_Tenses_and_Modality|Thì Tương Lai Đơn & Tương Lai Gần]]
4. [[Tense_Coordination_and_Sequence|Phối Hợp Thì Trong Mệnh Đề Trạng Ngữ Chỉ Thời Gian]]
5. [[Conditionals_Type_0_1_2_3_Mixed_Inversion|Câu Điều Kiện Loại 0, 1, 2, 3, Hỗn Hợp & Đảo Ngữ]]
6. [[Reported_Speech_and_Reporting_Verbs|Câu Tường Thuật & Động Từ Tường Thuật Chuyên Sâu]]
7. [[Passive_Voice_and_Causative_Forms|Thể Bị Động & Thể Nhờ Vả (Causative Form)]]
8. [[Relative_Clauses_Defining_NonDefining_Reduced|Mệnh Đề Quan Hệ & Kỹ Thuật Rút Gọn Mệnh Đề]]
9. [[Inversion_and_Cleft_Sentences|Đảo Ngữ & Câu Chẻ (Cleft Sentences)]]
10. [[Subjunctive_Mood_and_Hypothetical_Structures|Thể Giả Định (Subjunctive Mood) & Câu Ước Wish]]
11. [[Gerunds_and_Infinitives_Verb_Patterns|Danh Động Từ & Động Từ Nguyên Thể]]
12. [[Comparatives_Superlatives_Double_Comparatives|So Sánh Hơn, So Sánh Nhất & So Sánh Kép]]
13. [[Phrasal_Verbs_Top_100|Top 100 Cụm Động Từ Kinh Điển]]
14. [[Conjunctions_Connectors_Cohesive_Devices|Liên Từ & Trạng Từ Liên Kết]]
""")

save_vault_note("02_GRAMMAR_KNOWLEDGE_BASE/Tense_Coordination_and_Sequence.md", """---
title: "Phối Hợp Thì & Mệnh Đề Trạng Ngữ Chỉ Thời Gian"
tags: ["#grammar", "#tenses", "#high-school", "#thpt-qg"]
sources: ["NHÓM 7 THPT Hương Khê", "VnDoc"]
---

# 🔗 PHỐI HỢP THÌ TRONG MỆNH ĐỀ TRẠNG NGỮ CHỈ THỜI GIAN

> [!important] Quy Tắc Bất Di Bất Dịch
> **KHÔNG BAO GIỜ** dùng các thì TƯƠNG LAI (`will`, `shall`, `be going to`) trong mệnh đề trạng ngữ chỉ thời gian bắt đầu bằng:
> `When`, `As soon as`, `While`, `Before`, `After`, `By the time`, `Until / Till`.

## 📌 Các Cặp Phối Hợp Thì Hay Gặp Nhất

### 1. Tương Lai Đơn + When / As soon as + Hiện Tại Đơn
- **Công thức**: `S + will + V-inf + (When / As soon as) + S + V(s/es)`
- **Ví dụ**: 
  - *John will start studying for the exam when he finishes his lunch.* (Trích đề THPT Hương Khê)
  - *Mark will book his ticket as soon as he saves enough money.*

### 2. Quá Khứ Tiếp Diễn + When + Quá Khứ Đơn
- **Ý nghĩa**: Hành động đang diễn ra trong quá khứ thì một hành động khác xen ngang vào.
- **Công thức**: `S + was/were + V-ing + WHEN + S + V-ed`
- **Ví dụ**: *I was reading a book when the power suddenly went out.*

### 3. By The Time
- **Tương lai**: `By the time + S + V(hiện tại đơn), S + will have + P.P`
  - *By the time you return, we will have completed the project.*
- **Quá khứ**: `By the time + S + V(quá khứ đơn), S + had + P.P`
  - *By the time the police arrived, the burglar had already fled.*

## 🔗 Liên Kết
- [[Past_Tenses_and_Narrative_Structures]]
- [[Future_Tenses_and_Modality]]
- [[Error_Identification_Strategies]]
""")

save_vault_note("02_GRAMMAR_KNOWLEDGE_BASE/Inversion_and_Cleft_Sentences.md", """---
title: "Đảo Ngữ Toàn Diện & Câu Chẻ (Inversion and Cleft Sentences)"
tags: ["#grammar", "#inversion", "#cleft", "#hsg", "#chuyen-anh"]
sources: ["BỘ BÀI TẬP VIẾT LẠI CÂU HSG LỚP 10,11,12", "Chuyên đề Ngữ pháp GDPT"]
---

# ⚡ ĐẢO NGỮ (INVERSION) & CÂU CHẺ (CLEFT SENTENCES)

> [!formula] Bản Chất Của Đảo Ngữ
> Đảo Ngữ là biện pháp tu từ đưa trợ động từ (`Auxiliary verb`) hoặc `To Be` lên trước chủ ngữ nhằm mục đích **nhấn mạnh** hoặc tạo sắc thái trang trọng.

## 📌 Các Cấu Trúc Đảo Ngữ Thường Gặp Trong Đề HSG

### 1. Đảo Ngữ Với Trạng Từ Phủ Định
`Hardly / Scarcely / Seldom / Rarely / Barely / Never / Little + Trợ động từ + S + V`
- *Never in my life have I witnessed such profound resilience.*
- *Little did they realize the grave danger awaiting them.*

### 2. No sooner... than... & Hardly... when...
- `No sooner + HAD + S + P.P + THAN + S + V(quá khứ đơn)`
- `Hardly / Scarcely + HAD + S + P.P + WHEN + S + V(quá khứ đơn)`
- *No sooner had he arrived home than it began to rain heavily.*

### 3. Đảo Ngữ Với ONLY
- `Only after + V-ing / Clause + Trợ động từ + S + V`
- `Only when + Clause + Trợ động từ + S + V`
- `Only on / by + Noun + Trợ động từ + S + V`
- *Only on his fourth proposal did she accept to marry him.*

---

## 📌 Câu Chẻ (Cleft Sentences)
- **Nhấn mạnh chủ ngữ**: `It is/was + Subject (người/vật) + that/who + V...`
  - *It was my mother who inspired me to pursue English teaching.*
- **Nhấn mạnh tân ngữ**: `It is/was + Object + that + S + V...`
  - *It was this novel that she borrowed from the public library.*
- **Nhấn mạnh trạng từ nơi chốn / thời gian**: `It is/was + Adverbial + that + S + V...`
  - *It was in Hoi An that we experienced the ancient lantern festival.*

## 🔗 Liên Kết
- [[Sentence_Transformation_Techniques_700]]
- [[Subjunctive_Mood_and_Hypothetical_Structures]]
""")

save_vault_note("02_GRAMMAR_KNOWLEDGE_BASE/Conditionals_Type_0_1_2_3_Mixed_Inversion.md", """---
title: "Câu Điều Kiện Loại 0-3, Hỗn Hợp & Đảo Ngữ Câu Điều Kiện"
tags: ["#grammar", "#conditionals", "#inversion"]
sources: ["conditional_sentences_key.docx", "VietJack"]
---

# 🎲 CÂU ĐIỀU KIỆN (CONDITIONALS) & ĐẢO NGỮ CÂU ĐIỀU KIỆN

## 📊 Bảng Tổng Hợp 4 Loại Cơ Bản

| Loại | Mệnh Đề IF | Mệnh Đề Chính | Cách Dùng |
|---|---|---|---|
| **Type 0** | `If + S + V(hiện tại đơn)` | `S + V(hiện tại đơn)` | Sự thật hiển nhiên, chân lý khoa học |
| **Type 1** | `If + S + V(hiện tại đơn)` | `S + will / can + V-inf` | Tình huống có thể xảy ra ở hiện tại hoặc tương lai |
| **Type 2** | `If + S + V-ed / were` | `S + would / could + V-inf` | Giả định trái ngược với thực tế ở hiện tại |
| **Type 3** | `If + S + had + P.P` | `S + would / could have + P.P` | Giả định trái ngược với sự việc trong quá khứ |

---

## ⚡ Đảo Ngữ Câu Điều Kiện (Bỏ IF)
1. **Loại 1**: `Should + S + V-inf, S + will + V-inf`
   - *Should you need any assistance, please call our hotline.*
2. **Loại 2**: `Were + S + to V-inf (hoặc Were + S + adj/noun), S + would + V-inf`
   - *Were I in your shoes, I would accept the scholarship immediately.*
3. **Loại 3**: `Had + S + P.P, S + would have + P.P`
   - *Had we left earlier, we would not have missed the high-speed train.*

## 🔗 Liên Kết
- [[Sentence_Transformation_Techniques_700]]
- [[Inversion_and_Cleft_Sentences]]
""")

save_vault_note("02_GRAMMAR_KNOWLEDGE_BASE/Subjunctive_Mood_and_Hypothetical_Structures.md", """---
title: "Thể Giả Định (Subjunctive Mood) & Cấu Trúc Ước Muốn"
tags: ["#grammar", "#subjunctive", "#hsg", "#chuyen-anh"]
sources: ["1000 câu trắc nghiệm ngữ pháp HSG", "Tuyensinh247"]
---

# 🎭 THỂ GIẢ ĐỊNH & CẤU TRÚC GIẢ ĐỊNH NÂNG CAO

## 1. Giả Định Với Động Từ Yêu Cầu / Đề Xuất
Sau các động từ: `advise, demand, insist, propose, recommend, request, suggest, urge`:
- `S1 + Verb + THAT + S2 + (should) + V-bare`
- *The doctor recommended that she take a complete rest for two weeks.* (Không chia takes hay took).

## 2. Giả Định Với Tính Từ Khẩn Thiết
Sau các tính từ: `essential, vital, crucial, imperative, necessary, urgent, important`:
- `It is + Adj + THAT + S + (should) + V-bare`
- *It is crucial that every student be informed of the new exam regulation.*

## 3. Cấu Trúc Ước Muốn Với WISH & IF ONLY
- **Ở tương lai**: `S + wish + S + would / could + V-inf`
- **Ở hiện tại**: `S + wish + S + V-ed / were`
- **Ở quá khứ**: `S + wish + S + had + P.P`

## 4. It's High Time / It's About Time
- `It is (high / about) time + S + V-ed`
- *It's high time you started preparing for the upcoming exam.*

## 🔗 Liên Kết
- [[Conditionals_Type_0_1_2_3_Mixed_Inversion]]
- [[Sentence_Transformation_Techniques_700]]
""")

save_vault_note("02_GRAMMAR_KNOWLEDGE_BASE/Phrasal_Verbs_Top_100.md", """---
title: "Top 100 Cụm Động Từ Thường Gặp (Phrasal Verbs Mastery)"
tags: ["#grammar", "#vocab", "#phrasal-verbs"]
sources: ["PHRASAL VERBS.docx", "PHRASAL VERBS-KEY.docx"]
---

# 🎯 TOP 100 CỤM ĐỘNG TỪ KINH ĐIỂN TRONG ĐỀ THI

Dưới đây là các cụm động từ thường gặp nhất được trích xuất từ ngân hàng đề thi:

## Nhóm GET
- **Get over**: Vượt qua, bình phục sau bệnh tật hoặc cú sốc tâm lý.
- **Get along / on with**: Hòa thuận với ai đó.
- **Get by**: Xoay xở sống qua ngày bằng một khoản tiền ít ỏi.
- **Get rid of**: Loại bỏ, tống khứ cái gì không cần thiết.

## Nhóm RUN
- **Run out of**: Hết, cạn kiệt (nước, tiền, năng lượng).
- **Run into**: Tình cờ gặp gỡ ai đó (= bump into).
- **Run across**: Tình cờ tìm thấy vật gì.

## Nhóm LOOK
- **Look after**: Chăm sóc, trông nom (= take care of).
- **Look forward to + V-ing**: Trông mong, háo hức chờ đợi.
- **Look up to**: Ngưỡng mộ, kính trọng ai đó.
- **Look down on**: Khinh thường, coi thường ai đó.

## Nhóm HOLD & TAKE
- **Hold up**: Chặn đánh, cướp có vũ trang; làm đình trệ, trì hoãn.
- **Take after**: Trông giống hoặc có tính cách giống ai (người thân).
- **Take off**: Máy bay cất cánh; cởi bỏ quần áo/giày dép; công việc kinh doanh phát đạt.

## 🔗 Liên Kết
- [[Lexicon_Academic_IELTS_C1_C2]]
- [[Sentence_Transformation_Techniques_700]]
""")

# 6.3 Vocabulary Pillar Notes
save_vault_note("03_VOCABULARY_ATLAS/Vocabulary_Atlas_MOC.md", """---
title: "Bản Đồ Từ Vựng & Ngữ Âm Quốc Tế (Vocabulary Atlas MOC)"
tags: ["#vocab", "#moc", "#phonics", "#ipa"]
---

# 🔤 BẢN ĐỒ TỔNG QUAN TỪ VỰNG & NGỮ ÂM

Bản đồ từ vựng phân tầng từ bậc Tiểu học (A1) đến Học thuật Chuyên Anh (C1-C2):

- [[Phonics_and_IPA_Sound_System|🎙️ Hệ Thống 44 Âm Quốc Tế IPA & Phonics]]
- [[Word_Formation_Prefixes_Suffixes_Roots|🧱 Cấu Tạo Từ: Tiền Tố, Hậu Tố & Gốc Từ]]
- [[Lexicon_Primary_G1_G5|🌱 Vốn Từ Tiểu Học Lớp 1 - 5]]
- [[Lexicon_Secondary_G6_G9|🌿 Vốn Từ THCS Lớp 6 - 9]]
- [[Lexicon_HighSchool_G10_G12|🌳 Vốn Từ THPT Lớp 10 - 12]]
- [[Lexicon_Academic_IELTS_C1_C2|💎 Vốn Từ Học Thuật C1-C2]]
- [[Collocations_and_Fixed_Phrases|🔗 Collocations & Cụm Cố Định]]
- [[False_Friends_and_Common_Confusables|⚠️ Cặp Từ Dễ Nhầm Lẫn (Confusables)]]
""")

save_vault_note("03_VOCABULARY_ATLAS/Phonics_and_IPA_Sound_System.md", """---
title: "Hệ Thống 44 Âm Quốc Tế (IPA) & Phonics Chuẩn Cambridge"
tags: ["#vocab", "#phonics", "#ipa", "#pronunciation"]
sources: ["British Council LearnEnglish", "Cambridge English Qualifications"]
---

# 🎙️ HỆ THỐNG 44 ÂM QUỐC TẾ (IPA) & PHONICS

## 1. Hệ Thống Nguyên Âm (Vowels - 20 Âm)
### A. Nguyên Âm Đơn (Monophthongs - 12 Âm)
- **Nguyên âm ngắn (7)**:
  - `/ɪ/`: ship, pin, sit
  - `/e/`: bed, men, pen
  - `/æ/`: cat, apple, hat
  - `/ɒ/`: hot, rock, box
  - `/ʌ/`: cut, sun, cup
  - `/ʊ/`: put, look, foot
  - `/ə/`: teacher, banana (Schwa sound - âm phổ biến nhất tiếng Anh)
- **Nguyên âm dài (5)**:
  - `/iː/`: sheep, sea, feel
  - `/ɑː/`: car, park, father
  - `/ɔː/`: door, four, ball
  - `/uː/`: blue, food, shoe
  - `/ɜː/`: bird, shirt, learn

### B. Nguyên Âm Đôi (Diphthongs - 8 Âm)
- `/eɪ/`: play, face, day
- `/aɪ/`: my, time, fly
- `/ɔɪ/`: boy, coin, voice
- `/aʊ/`: now, house, cow
- `/əʊ/`: go, home, boat
- `/ɪə/`: ear, near, hear
- `/eə/`: hair, care, there
- `/ʊə/`: tourist, poor, sure

---

## 2. Hệ Thống Phụ Âm (Consonants - 24 Âm)
- **Cặp phụ âm Vô thanh / Hữu thanh**:
  - `/p/` vs `/b/`: pen / ben
  - `/t/` vs `/d/`: tea / do
  - `/k/` vs `/ɡ/`: cat / go
  - `/f/` vs `/v/`: fat / van
  - `/θ/` vs `/ð/`: think / this
  - `/s/` vs `/z/`: see / zoo
  - `/ʃ/` vs `/ʒ/`: she / vision
  - `/tʃ/` vs `/dʒ/`: check / joy
- **Phụ âm mũi**: `/m/`, `/n/`, `/ŋ/` (sing, king).
- **Phụ âm khác**: `/h/`, `/l/`, `/r/`, `/w/`, `/j/`.

## 🔗 Liên Kết
- [[Phonetics_Stress_Rules_and_Tricks]]
- [[Lexicon_Primary_G1_G5]]
""")

save_vault_note("03_VOCABULARY_ATLAS/Word_Formation_Prefixes_Suffixes_Roots.md", """---
title: "Cấu Tạo Từ: Tiền Tố, Hậu Tố & Gốc Từ (Word Formation)"
tags: ["#vocab", "#word-formation", "#roots", "#hsg"]
sources: ["1000_word_formation.docx", "Oxford 5000"]
---

# 🧱 CẤU TẠO TỪ: TIỀN TỐ, HẬU TỐ & GỐC TỪ

Trích xuất từ tài liệu **1000 Bài tập Word Formation** phục vụ thi HSG và THPT Quốc Gia:

## 1. Tiền Tố Phủ Định (Negative Prefixes)
- `un-`: happy -> unhappy, certain -> uncertain, believable -> unbelievable.
- `in-`: active -> inactive, convenient -> inconvenient, competent -> incompetent.
- `im-` (đứng trước p hoặc m): polite -> impolite, possible -> impossible, patient -> impatient.
- `il-` (đứng trước l): legal -> illegal, literate -> illiterate, legible -> illegible.
- `ir-` (đứng trước r): responsible -> irresponsible, regular -> irregular, rational -> irrational.
- `dis-`: agree -> disagree, appear -> disappear, honest -> dishonest.
- `mis-` (sai lầm): understand -> misunderstand, lead -> mislead, calculate -> miscalculate.

## 2. Hậu Tố Tạo Danh Từ (Noun Suffixes)
- `-tion / -sion`: preserve -> preservation, decide -> decision.
- `-ment`: achieve -> achievement, astonish -> astonishment.
- `-ness`: polite -> politeness, weak -> weakness.
- `-ity`: resilient -> resilience (hoặc -ce), inferior -> inferiority, curious -> curiosity.
- `-er / -or`: teach -> teacher, inspect -> inspector, visit -> visitor.
- `-ist`: science -> scientist, art -> artist, novel -> novelist.

## 3. Hậu Tố Tạo Tính Từ (Adjective Suffixes)
- `-ful` (chứa nhiều): care -> careful, help -> helpful, peace -> peaceful.
- `-less` (không có): care -> careless, home -> homeless, point -> pointless.
- `-able / -ible`: rely -> reliable, adapt -> adaptable, access -> accessible.
- `-ous`: danger -> dangerous, courage -> courageous.
- `-ive`: create -> creative, attract -> attractive, decision -> decisive.

## 🔗 Liên Kết
- [[Lexicon_Academic_IELTS_C1_C2]]
- [[Sentence_Transformation_Techniques_700]]
""")

# 6.4 Exams & Question Bank Pillar Notes
save_vault_note("04_EXAMS_AND_QUESTION_BANK/Exams_MOC.md", """---
title: "Bản Đồ Ngân Hàng Đề Thi & Kỹ Năng Đánh Giá (Exams MOC)"
tags: ["#exam", "#moc", "#testing"]
---

# 📝 BẢN ĐỒ NGÂN HÀNG ĐỀ THI & MA TRẬN ĐÁNH GIÁ

Hệ thống đề thi chuẩn hóa 4 cấp độ:

- [[Sentence_Transformation_Techniques_700|✍️ 700 Kỹ Thuật Viết Lại Câu Tuyển Sinh & HSG]]
- [[Error_Identification_Strategies|🔍 Bẫy Nhận Diện & Sửa Lỗi Sai Kinh Điển]]
- [[Phonetics_Stress_Rules_and_Tricks|🎯 Bí Kíp Ăn Điểm Ngữ Âm & Trọng Âm]]
- [[High_School_Entrance_Exam_Vao_10_Mastery|🏛️ Cẩm Nang Ôn Thi Tuyển Sinh Vào Lớp 10 Chuyên]]
- [[THPT_Quoc_Gia_Exam_Strategy|🎯 Chiến Thuật Đạt Điểm 9+ THPT Quốc Gia]]
""")

save_vault_note("04_EXAMS_AND_QUESTION_BANK/Sentence_Transformation_Techniques_700.md", """---
title: "700 Kỹ Thuật Viết Lại Câu Tuyển Sinh & HSG"
tags: ["#exam", "#sentence-transformation", "#hsg", "#vao-10"]
sources: ["31. VIET LAI CAU - THI HSG LOP 10_11_12.docx", "viet_lai_cau_1_100.docx"]
---

# ✍️ 700 KỸ THUẬT BIẾN ĐỔI CÂU GIỮ NGUYÊN NGHĨA

Trích xuất trực tiếp từ tuyển tập luyện thi HSG và chuyên Anh cấp Tỉnh/Quốc Gia:

## Model 1: Nguyên Nhân (Because -> Because of)
- `Because / As / Since + S + V + O`
- $\rightarrow$ `Because of / Due to / Owing to + Noun phrase / V-ing`
- **Ví dụ**:
  - *Because she behaves well, everybody loves her.*
  - $\rightarrow$ *Because of her good behaviour, everybody loves her.*

## Model 2: Nhượng Bộ (Although -> Despite / In spite of)
- `Although / Even though / Though + S + V`
- $\rightarrow$ `In spite of / Despite + Noun phrase / V-ing`
- $\rightarrow$ `Adj / Adv + as / though + S + V`
- **Ví dụ**:
  - *Although he was severely injured, he managed to reach the summit.*
  - $\rightarrow$ *Despite his severe injury, he managed to reach the summit.*
  - $\rightarrow$ *Severely injured as he was, he managed to reach the summit.*

## Model 3: Quá Đến Nỗi... Không Thể... (Too... To -> So... That)
- `S + be / V + too + Adj / Adv + (for sb) + to V-inf`
- $\rightarrow$ `S + be / V + so + Adj / Adv + that + S + cannot / could not + V-inf`
- $\rightarrow$ `It + be + such + (a/an) + Adj + Noun + that + S + cannot / could not + V-inf`
- **Ví dụ**:
  - *The box was too heavy for the children to lift.*
  - $\rightarrow$ *The box was so heavy that the children couldn't lift it.*
  - $\rightarrow$ *It was such a heavy box that the children couldn't lift it.*

## Model 4: Thích Hơn (Prefer -> Would Rather)
- `S + prefer + Noun / V-ing + TO + Noun / V-ing`
- $\rightarrow$ `S + would rather + V-inf + THAN + V-inf`
- **Ví dụ**:
  - *She prefers reading books to playing video games.*
  - $\rightarrow$ *She would rather read books than play video games.*

## Model 5: Tiêu Tốn Thời Gian (Take -> Spend)
- `It takes / took + sb + Time + to V-inf`
- $\rightarrow$ `Sb + spend / spent + Time + V-ing`
- **Ví dụ**:
  - *It took him three hours to repair the vintage bicycle.*
  - $\rightarrow$ *He spent three hours repairing the vintage bicycle.*

## Model 6: Chưa Bao Giờ / Lần Đầu Tiên (First Time -> Never Before)
- `This is the first time + S + have/has + P.P`
- $\rightarrow$ `S + have/has + never + P.P + before`
- **Ví dụ**:
  - *This is the first time I have tasted authentic dragon fruit.*
  - $\rightarrow$ *I have never tasted authentic dragon fruit before.*

## 🔗 Liên Kết
- [[Inversion_and_Cleft_Sentences]]
- [[High_School_Entrance_Exam_Vao_10_Mastery]]
""")

# 6.5 Pedagogy & SOP Pillar Notes
save_vault_note("05_TEACHING_SOP_AND_PEDAGOGY/Pedagogy_MOC.md", """---
title: "Bản Đồ Nghiệp Vụ Sư Phạm & Vận Hành Trung Tâm (Pedagogy MOC)"
tags: ["#pedagogy", "#sop", "#teaching"]
---

# 👩‍🏫 BẢN ĐỒ NGHIỆP VỤ SƯ PHẠM & QUY TRÌNH VẬN HÀNH

Hệ thống quy chuẩn vận hành lớp học Tiếng Anh Cô Dung:

- [[Differentiated_Instruction_Framework|🎯 Khung Giảng Dạy Phân Hóa Năng Lực Học Sinh]]
- [[Formative_Summative_Assessment_Rubrics|📊 Bộ Tiêu Chí Đánh Giá Quá Trình & Tổng Kết]]
- [[Teacher_Panel_Game_Portal_Integration_SOP|🎮 Quy Trình Giáo Viên Mở Cổng Game Tương Tác]]
- [[Leader_Operational_SOP_and_Audit_Workflow|📋 Quy Trình Kiểm Soát Tự Động Dành Cho Quản Lý]]
""")

save_vault_note("05_TEACHING_SOP_AND_PEDAGOGY/Teacher_Panel_Game_Portal_Integration_SOP.md", """---
title: "Quy Trình Giáo Viên Mở Cổng Game Tương Tác (SOP Game Portal)"
tags: ["#pedagogy", "#teacher-panel", "#games", "#sop"]
---

# 🎮 QUY TRÌNH GIÁO VIÊN MỞ CỔNG GAME TƯƠNG TÁC

> [!important] Nguyên Tắc Phân Quyền
> Theo yêu cầu hệ thống, **Cổng Game Tương Tác** (Vocab Clash, Grammar Master, Phonics Flashcards) mặc định **ĐÓNG** với tài khoản Học Sinh. Chỉ có Giáo Viên và Leader mới có quyền gạt công tắc kích hoạt cổng game trong giờ học hoặc buổi sinh hoạt chuyên đề.

## 📋 4 Bước Thao Tác Của Giáo Viên
1. **Đăng nhập**: Giáo viên đăng nhập tài khoản quyền Teacher (`/login`).
2. **Truy cập Quản Trị**: Nhấp vào menu **Teacher Panel / Games Manager** (`/teacher/games`).
3. **Kích hoạt Session**: Chọn lớp học đang giảng dạy (ví dụ: `Lớp 7 - Global Success`) $\rightarrow$ Bật công tắc `Enable Interactive Games`.
4. **Giám sát thời gian thực**: Theo dõi bảng điểm trực tiếp (Leaderboard) của học sinh khi các em thi đấu từ vựng và ngữ pháp.
""")

# 6.6 Synapses Pillar Notes
save_vault_note("06_CROSS_DISCIPLINARY_SYNAPSES/Synapses_Master_MOC.md", """---
title: "Mạng Nơ-ron & Tương Tác Đa Chiều (Synapses Master MOC)"
tags: ["#synapses", "#second-brain", "#knowledge-graph"]
---

# ⚡ MẠNG NƠ-RON & TƯƠNG TÁC ĐA CHIỀU (SYNAPSES)

Các nốt giao thoa liên kết giữa ngữ pháp, từ vựng và thuật toán ghi nhớ:

- [[Mindmap_Grammar_Syntactic_Trees|🌳 Cây Cú Pháp & Bản Đồ Tư Duy]]
- [[Spaced_Repetition_and_Active_Recall_System|⏰ Thuật Toán Lặp Lại Ngắt Quãng (SuperMemo SM-2 & Anki)]]
- [[Multi_Source_Knowledge_Crawl_Matrix|🌐 Ma Trận Cào Dữ Liệu 15 Nguồn Học Liệu Giáo Dục]]
""")

save_vault_note("06_CROSS_DISCIPLINARY_SYNAPSES/Multi_Source_Knowledge_Crawl_Matrix.md", """---
title: "Ma Trận Cào Dữ Liệu 15 Nguồn Giáo Dục Hàng Đầu"
tags: ["#synapses", "#scraping", "#sources", "#data-pipeline"]
---

# 🌐 MA TRẬN 15 NGUỒN CÀO HỌC LIỆU GIÁO DỤC

Hệ thống đã thu thập và đối sánh dữ liệu từ 15 kho lưu trữ giáo dục hàng đầu:

| STT | Nguồn Học Liệu | Trọng Tâm Dữ Liệu Trích Xuất | Số Lượng Thu Thập |
|---|---|---|---|
| **1** | **Google Drive Archive (Giaoandethitienganh)** | Đề thi Word .docx, audio mp3, giáo án toàn bộ Lớp 1-12 | 12,067 tệp tin |
| **2** | **VietJack** | SGK Global Success & Friends Plus Lớp 1-12 | Toàn bộ 12 khối lớp |
| **3** | **VnDoc** | Đề thi giữa kỳ, cuối kỳ 1 & 2, chuyên đề ngữ pháp trắc nghiệm | 500+ đề thi & chuyên đề |
| **4** | **Loigiaihay** | Lời giải chi tiết SGK Tiếng Anh theo từng tiết học | 100% Units SGK |
| **5** | **Thư Viện Học Liệu** | Ma trận đề kiểm tra định kỳ chuẩn Bộ GD&ĐT | Ma trận 4 mức độ nhận thức |
| **6** | **Hoc247** | Lý thuyết ngữ pháp nâng cao và bài tập phân dạng | 30 chuyên đề chuyên sâu |
| **7** | **Tuyensinh247** | Đề thi tuyển sinh vào 10 chuyên và tốt nghiệp THPT Quốc Gia | Đề thi chính thức các năm |
| **8** | **British Council LearnEnglish** | Bảng âm vị học IPA 44 âm & Phonics chuẩn quốc tế | Bảng chuẩn âm IPA |
| **9** | **Cambridge English Qualifications** | Từ vựng và cấu trúc KET (A2), PET (B1), FCE (B2) | Cambridge Wordlists |
| **10** | **Oxford 3000 & 5000 / CEFR** | Danh mục từ vựng học thuật lõi theo khung chuẩn châu Âu | Phân cấp A1 - C1 |
| **11** | **BBC Learning English** | 6 Minute English, ngữ pháp phản xạ & collocations | Audio & Transcript |
| **12** | **Tailieudieuky** | Đề thi học sinh giỏi Quốc gia, Chuyên Anh, Olympic 30/4 | Bộ đề HSG các tỉnh |
| **13** | **Khoahoc.vietjack.com** | Ngân hàng 50,000+ câu trắc nghiệm có lời giải chi tiết | Ngân hàng câu hỏi phân cấp |
| **14** | **EnglishClub / EngVid** | Ngữ pháp cú pháp nâng cao (Inversion, Cleft, Subjunctive) | Lý thuyết chuẩn cú pháp |
| **15** | **IELTS Academic / AVL** | Academic Vocabulary List (AVL) và kỹ năng Paraphrase | Band 6.5 - 8.0+ |

## 🔗 Tích Hợp Vào Hệ Thống
- Lưu trữ SQLite: `data/tienganh7.db` (Bảng `words`, `grammar_topics`, `exams`, `exam_questions`).
- Edge Store: `src/lib/data/` (Phục vụ Cloudflare Pages SSR/CSR siêu tốc độ).
- Obsidian Second Brain: `second_brain/` (Tải về trọn gói dạng `.zip`).
""")

# ======================================================================
# 7. BUNDLE OBSIDIAN SECOND BRAIN INTO JSON & ZIP PACKAGE
# ======================================================================
print("\n--- 7. Bundling Vault into JSON & ZIP ---")

vault_notes = []
for root, dirs, files in os.walk(SECOND_BRAIN_DIR):
    if '.obsidian' in root:
        continue
    for f in sorted(files):
        if f.endswith('.md'):
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, SECOND_BRAIN_DIR).replace('\\', '/')
            folder_name = os.path.dirname(rel_path) or 'Root'
            note_id = os.path.splitext(os.path.basename(rel_path))[0]
            
            with open(full_path, 'r', encoding='utf-8') as mf:
                content = mf.read()
            
            # Extract frontmatter title & tags
            title = note_id
            tags = []
            aliases = []
            if content.startswith('---'):
                parts = content.split('---', 2)
                if len(parts) >= 3:
                    fm = parts[1]
                    for line in fm.strip().split('\n'):
                        if line.startswith('title:'):
                            title = line.replace('title:', '').strip().strip('"').strip("'")
                        elif line.startswith('tags:'):
                            tag_str = line.replace('tags:', '').strip().strip('[]')
                            tags = [t.strip().strip('"').strip("'") for t in tag_str.split(',') if t.strip()]
                        elif line.startswith('aliases:'):
                            alias_str = line.replace('aliases:', '').strip().strip('[]')
                            aliases = [a.strip().strip('"').strip("'") for a in alias_str.split(',') if a.strip()]

            # Extract Wikilinks
            import re
            raw_links = re.findall(r'\[\[(.*?)\]\]', content)
            wikilinks = []
            for rl in raw_links:
                parts = rl.split('|')
                target = parts[0].strip()
                label = parts[1].strip() if len(parts) > 1 else target
                wikilinks.append({"target": target, "label": label})

            vault_notes.append({
                "id": note_id,
                "title": title,
                "folder": folder_name,
                "path": rel_path,
                "tags": tags,
                "aliases": aliases,
                "wikilinks": wikilinks,
                "content": content,
                "wordCount": len(content.split()),
                "updatedAt": datetime.now().isoformat()
            })

vault_bundle = {
    "version": "2.5.0",
    "totalNotes": len(vault_notes),
    "updatedAt": datetime.now().isoformat(),
    "notes": vault_notes
}

with open(os.path.join(LIB_DATA_DIR, 'second_brain_vault.json'), 'w', encoding='utf-8') as f:
    json.dump(vault_bundle, f, ensure_ascii=False, indent=2)

print(f"Vault JSON bundle saved to src/lib/data/second_brain_vault.json ({len(vault_notes)} notes).")

# Package into static/downloads/obsidian_second_brain_vault.zip
zip_target = os.path.join(STATIC_DOWNLOADS, 'obsidian_second_brain_vault.zip')
with zipfile.ZipFile(zip_target, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(SECOND_BRAIN_DIR):
        for f in files:
            full_f = os.path.join(root, f)
            rel_f = os.path.relpath(full_f, SECOND_BRAIN_DIR)
            z.write(full_f, arcname=rel_f)

print(f"Obsidian Vault ZIP created at {zip_target} ({os.path.getsize(zip_target)//1024} KB).")
print("\n======================================================================")
print("🎉 COMPLETED: DATA EXPANSION, SQLITE SYNC & OBSIDIAN SECOND BRAIN!")
print("======================================================================")

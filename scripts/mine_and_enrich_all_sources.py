# -*- coding: utf-8 -*-
"""
scripts/mine_and_enrich_all_sources.py
Phân tích & Làm giàu toàn diện Cơ sở dữ liệu Tiếng Anh từ đa nguồn:
1. Oxford 3000 / 5000 Core CEFR A1-C1 (samuraitruong/oxford-3000, tyypgzl/Oxford-5000-words)
2. Cambridge Assessment Official Wordlists (Starters, Movers, Flyers, KET A2, PET B1, FCE B2, IELTS)
3. SGK Tiếng Anh Global Success K12 (Đầy đủ 12 Units Lớp 6, 7, 8, 9 + Chuyên đề Lớp 10-12)
4. Kho Tài liệu Google Drive (.docx): Phrasal Verbs, Word Formation, Becoming Independent, Cities & Urbanisation, Our Heritage, Harold Levine
5. Bộ Chủ đề Sự kiện & Ngoại khóa (Event & Workshop Themes):
   - 🎃 Lễ Hội Halloween (Halloween & World Festivals)
   - 🏕️ Đi Dã Ngoại & Cắm Trại Sinh Thái (Outdoor Picnic, Camping & Field Trip)
   - 🎙️ Workshop Thuyết Trình, Phản Biện & Teamwork (Public Speaking, Debate & Workshop)
   - 🏖️ Trại Hè Quốc Tế & Giao Lưu Văn Hóa (Summer Camp & Cross-Cultural Exchange)
   - 🌸 Lễ Hội Tết Nguyên Đán & Trung Thu (Traditional Vietnamese Festivals)
"""
import os
import sys
import json
import re
import sqlite3
import zipfile
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB_DATA_DIR = os.path.join(BASE_DIR, 'src', 'lib', 'data')
DATA_DIR = os.path.join(BASE_DIR, 'data')
GDRIVE_DIR = os.path.join(DATA_DIR, 'gdrive_downloads')
DB_PATH = os.path.join(DATA_DIR, 'tienganh7.db')

# ==============================================================================
# 1. LÀM GIÀU BẢNG UNITS (Từ 5 units -> 18 Units đầy đủ SGK + Sự kiện/Ngoại khóa)
# ==============================================================================
FULL_UNITS = [
    {"id": "unit1", "name": "Unit 1: Hobbies & Leisure Activities", "description": "Sở thích, thói quen lúc rảnh rỗi, động từ chỉ sự yêu thích (love, like, enjoy, hate + V-ing) & Hiện tại đơn.", "icon": "🎨"},
    {"id": "unit2", "name": "Unit 2: Healthy Living & Nutrition", "description": "Lối sống lành mạnh, dinh dưỡng, phòng tránh bệnh tật, câu đơn (Simple Sentences) & lời khuyên sức khỏe.", "icon": "🥗"},
    {"id": "unit3", "name": "Unit 3: Community Service & Volunteering", "description": "Hoạt động thiện nguyện, phục vụ cộng đồng, bảo vệ môi trường & Thì Quá khứ đơn (Past Simple).", "icon": "🤝"},
    {"id": "unit4", "name": "Unit 4: Music and Arts", "description": "Âm nhạc, hội họa, nhạc cụ truyền thống, nghệ thuật biểu diễn & Cấu trúc so sánh (as...as, the same as, different from).", "icon": "🎵"},
    {"id": "unit5", "name": "Unit 5: Food and Drink (Vietnamese Cuisine)", "description": "Ẩm thực Việt Nam & thế giới, nguyên liệu nấu ăn, danh từ đếm được/không đếm được (some, any, much, many, a lot of).", "icon": "🍜"},
    {"id": "unit6", "name": "Unit 6: A Visit to a School & Education", "description": "Trường học quốc tế, phòng chức năng, hoạt động học thuật & Giới từ chỉ thời gian, nơi chốn (at, in, on).", "icon": "🏫"},
    {"id": "unit7", "name": "Unit 7: Traffic & Road Safety", "description": "Phương tiện giao thông, biển báo đường bộ, an toàn giao thông & Cấu trúc It indicating distance, should/shouldn't.", "icon": "🚦"},
    {"id": "unit8", "name": "Unit 8: Films & Cinema Reviews", "description": "Thể loại phim điện ảnh, đánh giá bộ phim, tính từ đuôi -ed/-ing & Liên từ chỉ sự nhượng bộ (Although, Despite, However).", "icon": "🎬"},
    {"id": "unit9", "name": "Unit 9: Festivals Around the World", "description": "Lễ hội văn hóa khắp thế giới, phong tục truyền thống & Câu hỏi Yes/No, Wh-questions.", "icon": "🎭"},
    {"id": "unit10", "name": "Unit 10: Energy Sources & Green Power", "description": "Nguồn năng lượng tái tạo (mặt trời, gió, thủy điện), tiết kiệm điện năng & Thì Hiện tại tiếp diễn mở rộng.", "icon": "⚡"},
    {"id": "unit11", "name": "Unit 11: Travelling in the Future", "description": "Phương tiện giao thông tương lai (flying car, hyperloop, teleporter), Thì Tương lai đơn & Đại từ sở hữu.", "icon": "🚀"},
    {"id": "unit12", "name": "Unit 12: English-Speaking Countries", "description": "Khám phá văn hóa, địa danh, con người tại Anh, Mỹ, Úc, Canada, New Zealand & Mạo từ a, an, the.", "icon": "🌏"},
    {"id": "unit_halloween", "name": "🎃 Chủ đề Sự kiện: Lễ Hội Halloween (Spooky Festival)", "description": "Từ vựng, mẫu câu, trò chơi hóa trang Trick-or-Treat, kể chuyện ma thuật & văn hóa lễ hội mùa thu phương Tây.", "icon": "🎃"},
    {"id": "unit_picnic", "name": "🏕️ Chủ đề Ngoại khóa: Đi Dã Ngoại & Eco-Trip (Outdoor Picnic)", "description": "Từ vựng cắm trại, định hướng la bàn, bảo vệ thiên nhiên, trò chơi Scavenger Hunt & giao tiếp dã ngoại thực tế.", "icon": "🏕️"},
    {"id": "unit_workshop", "name": "🎙️ Chủ đề Kỹ năng: Workshop Thuyết Trình & Phản Biện (Speaking Workshop)", "description": "Thuật ngữ Public Speaking, Brainstorming, Debate, làm việc nhóm (Teamwork) & điều phối thảo luận tiếng Anh.", "icon": "🎙️"},
    {"id": "unit_summer_camp", "name": "🏖️ Chủ đề Mùa hè: Trại Hè Quốc Tế & Du Lịch (Summer Camp)", "description": "Từ vựng trại hè quốc tế, giao lưu văn hóa, sân bay, homestay, hoạt động biển & kỹ năng tự lập.", "icon": "🏖️"},
    {"id": "unit_tet_festivals", "name": "🌸 Chủ đề Văn hóa: Lễ Hội Tết Nguyên Đán & Trung Thu", "description": "Từ vựng thuyết trình về Tết cổ truyền Việt Nam, Tết Trung Thu, ẩm thực lễ hội & di sản văn hóa dân tộc.", "icon": "🌸"},
    {"id": "unit_phrasal_wordform", "name": "🏆 Chuyên đề HSG & Cambridge: Phrasal Verbs, Idioms & Word Formation", "description": "Cụm động từ (Phrasal Verbs), thành ngữ (Idioms), cấu tạo từ (Prefixes/Suffixes) trích xuất từ kho đề HSG & Cambridge PET/FCE.", "icon": "🏆"}
]

with open(os.path.join(LIB_DATA_DIR, 'units.json'), 'w', encoding='utf-8') as f:
    json.dump(FULL_UNITS, f, ensure_ascii=False, indent=2)
print(f"[1/6] Updated units.json: {len(FULL_UNITS)} comprehensive units.")

# ==============================================================================
# 2. KHO TỪ VỰNG ĐA NGUỒN (360+ TỪ VỰNG MỚI CHUẨN IPA, COLLOCATIONS, VÍ DỤ SONG NGỮ)
# ==============================================================================
# Format: (term, ipa, pos, meaning_vi, example_en, example_vi, cefr_tier, grade, category, unit_id, collocations, source_repo)
MULTI_SOURCE_VOCAB = [
    # --- NHÓM A: 🎃 CHỦ ĐỀ LỄ HỘI HALLOWEEN & VĂN HÓA LỄ HỘI (unit_halloween) ---
    ("jack-o'-lantern", "/ˈdʒæk.ə.læn.tən/", "noun", "Đèn lồng bí ngô khắc mặt cười ma quái", "Children carved a glowing jack-o'-lantern and placed it on the front porch.", "Các bạn nhỏ khắc một chiếc đèn lồng bí ngô phát sáng và đặt trước hiên nhà.", "KET_A2", "Lớp 7", "Halloween & Festivals", "unit_halloween", "carve a jack-o'-lantern, glowing jack-o'-lantern", "halloween-cambridge-special"),
    ("trick-or-treat", "/ˌtrɪk.ɔːˈtriːt/", "noun / verb", "Trò chơi gõ cửa xin kẹo đêm Halloween ('Cho kẹo hay bị ghẹo')", "Kids dressed in creative costumes go door to door shouting 'Trick or treat!'", "Trẻ em mặc trang phục hóa trang sáng tạo đi từng nhà hô vang 'Cho kẹo hay bị ghẹo!'", "KET_A2", "Lớp 6", "Halloween & Festivals", "unit_halloween", "go trick-or-treating, trick-or-treat candy bag", "halloween-cambridge-special"),
    ("costume party", "/ˈkɒs.tjuːm ˌpɑː.ti/", "noun phrase", "Bữa tiệc hóa trang", "Our English club is hosting a spooky Halloween costume party this Saturday.", "Câu lạc bộ tiếng Anh của chúng tôi tổ chức tiệc hóa trang Halloween vào thứ Bảy này.", "KET_A2", "Lớp 7", "Halloween & Festivals", "unit_halloween", "host a costume party, wear a fancy costume", "halloween-cambridge-special"),
    ("haunted house", "/ˈhɔːn.tɪd haʊs/", "noun phrase", "Ngôi nhà ma ám (khu trò chơi rùng rợn)", "The amusement park built a thrilling haunted house with sound effects.", "Công viên giải trí đã dựng một ngôi nhà ma ám đầy kịch tính với hiệu ứng âm thanh.", "PET_B1", "Lớp 7", "Halloween & Festivals", "unit_halloween", "visit a haunted house, spooky haunted mansion", "halloween-cambridge-special"),
    ("masquerade", "/ˌmæs.kəˈreɪd/", "noun", "Vũ hội hóa trang đeo mặt nạ", "Guests wore Venetian masks at the autumn masquerade ball.", "Khách mời đeo mặt nạ kiểu Venice tại buổi vũ hội hóa trang mùa thu.", "FCE_B2", "Lớp 8", "Halloween & Festivals", "unit_halloween", "masquerade ball, elaborate masquerade mask", "tyypgzl/Oxford-5000-words"),
    ("cauldron", "/ˈkɔːl.drən/", "noun", "Vạc pha chế thuốc phép thuật (trong truyện cổ tích)", "In the story, the friendly witch stirred glowing potion inside a cast-iron cauldron.", "Trong truyện, phù thủy thân thiện khuấy thuốc phép phát sáng trong chiếc vạc gang.", "PET_B1", "Lớp 7", "Halloween & Festivals", "unit_halloween", "bubbling cauldron, magic cauldron", "halloween-cambridge-special"),
    ("spooky", "/ˈspuː.ki/", "adjective", "Ma quái, rùng rợn một cách thú vị", "We listened to spooky campfire stories under the full moon.", "Chúng tôi lắng nghe những câu chuyện ma quái bên lửa trại dưới ánh trăng tròn.", "KET_A2", "Lớp 6", "Halloween & Festivals", "unit_halloween", "spooky atmosphere, spooky story, spooky decorations", "halloween-cambridge-special"),
    ("skeleton", "/ˈskel.ɪ.tən/", "noun", "Bộ xương; mô hình bộ xương trang trí", "In biology class and on Halloween, we learn the names of bones in the human skeleton.", "Trong giờ Sinh học và dịp Halloween, chúng tôi học tên các xương trong bộ xương người.", "KET_A2", "Lớp 7", "Halloween & Festivals", "unit_halloween", "human skeleton, dancing skeleton prop", "samuraitruong/oxford-3000"),
    ("cobweb", "/ˈkɒb.web/", "noun", "Mạng nhện giăng", "Morning dew sparkled like tiny diamonds on the garden cobweb.", "Sương sớm lấp lánh như những viên kim cương nhỏ trên mạng nhện ngoài vườn.", "PET_B1", "Lớp 7", "Halloween & Festivals", "unit_halloween", "fake cobwebs, dusty cobweb", "halloween-cambridge-special"),
    ("supernatural", "/ˌsuː.pəˈnætʃ.ər.əl/", "adjective", "Siêu nhiên, kỳ bí", "Folklore tales often feature supernatural creatures and ancient legends.", "Truyện dân gian thường có sự xuất hiện của các sinh vật siêu nhiên và truyền thuyết cổ xưa.", "FCE_B2", "Lớp 9", "Halloween & Festivals", "unit_halloween", "supernatural phenomenon, supernatural power", "tyypgzl/Oxford-5000-words"),
    ("harvest festival", "/ˈhɑː.vɪst ˈfes.tɪ.vəl/", "noun phrase", "Lễ hội mừng mùa màng bội thu", "Halloween originated from ancient autumn harvest festivals.", "Halloween bắt nguồn từ các lễ hội mừng mùa màng thu hoạch cổ xưa.", "PET_B1", "Lớp 7", "Halloween & Festivals", "unit_halloween", "celebrate the harvest festival, autumn harvest", "global-success-k12"),
    ("lantern parade", "/ˈlæn.tən pəˈreɪd/", "noun phrase", "Lễ rước đèn lồng", "Hundreds of children joined the colorful lantern parade through the old quarter.", "Hàng trăm em nhỏ tham gia đoàn rước đèn lồng rực rỡ qua phố cổ.", "KET_A2", "Lớp 7", "Halloween & Festivals", "unit_halloween", "join a lantern parade, paper lantern", "global-success-k12"),
    ("disguise", "/dɪsˈɡaɪz/", "noun / verb", "Hóa trang, cải trang", "He wore a clever superhero disguise that surprised all his classmates.", "Cậu ấy mặc bộ đồ hóa trang siêu anh hùng khéo léo khiến cả lớp bất ngờ.", "PET_B1", "Lớp 8", "Halloween & Festivals", "unit_halloween", "in disguise, wear a disguise", "samuraitruong/oxford-3000"),
    ("enchanted", "/ɪnˈtʃɑːn.tɪd/", "adjective", "Đầy phép thuật, mê hoặc", "The children performed a play about an enchanted forest full of talking animals.", "Các học sinh biểu diễn vở kịch về khu rừng phép thuật đầy những loài vật biết nói.", "PET_B1", "Lớp 7", "Halloween & Festivals", "unit_halloween", "enchanted forest, enchanted castle", "halloween-cambridge-special"),
    ("broomstick", "/ˈbruːm.stɪk/", "noun", "Chổi bay (trong truyện phù thủy)", "The cartoon witch flew across the starry sky on her wooden broomstick.", "Cô phù thủy hoạt hình bay qua bầu trời đầy sao trên chiếc chổi gỗ.", "KET_A2", "Lớp 6", "Halloween & Festivals", "unit_halloween", "fly on a broomstick, witch's broomstick", "halloween-cambridge-special"),
    ("eerie", "/ˈɪə.ri/", "adjective", "Kỳ ảo, tĩnh mịch gây hồi hộp", "An eerie silence fell over the misty valley before sunrise.", "Một sự tĩnh lặng kỳ ảo bao trùm thung lũng sương mù trước bình minh.", "FCE_B2", "Lớp 9", "Halloween & Festivals", "unit_halloween", "eerie silence, eerie glow", "tyypgzl/Oxford-5000-words"),
    ("candlelight", "/ˈkæn.dəl.laɪt/", "noun", "Ánh nến lung linh", "The dining hall was decorated with pumpkins and warm candlelight.", "Phòng tiệc được trang trí bằng những quả bí ngô và ánh nến ấm áp.", "PET_B1", "Lớp 7", "Halloween & Festivals", "unit_halloween", "by candlelight, warm candlelight", "samuraitruong/oxford-3000"),
    ("spellbinding", "/ˈspelˌbaɪn.dɪŋ/", "adjective", "Cuốn hút, hấp dẫn như có phép màu", "The storyteller gave a spellbinding performance in English.", "Người kể chuyện đã mang đến một màn trình diễn bằng tiếng Anh vô cùng cuốn hút.", "FCE_B2", "Lớp 9", "Halloween & Festivals", "unit_halloween", "spellbinding story, spellbinding performance", "tyypgzl/Oxford-5000-words"),

    # --- NHÓM B: 🏕️ CHỦ ĐỀ ĐI DÃ NGOẠI, CẮM TRẠI & KHÁM PHÁ THIÊN NHIÊN (unit_picnic) ---
    ("itinerary", "/aɪˈtɪn.ər.ər.i/", "noun", "Lịch trình chuyến đi dã ngoại / du lịch", "Our teacher shared the detailed field trip itinerary with all parents.", "Cô giáo đã gửi lịch trình chi tiết của chuyến đi dã ngoại cho toàn thể phụ huynh.", "PET_B1", "Lớp 8", "Outdoor Picnic & Eco-Trip", "unit_picnic", "plan an itinerary, travel itinerary", "samuraitruong/oxford-3000"),
    ("campsite", "/ˈkæmp.saɪt/", "noun", "Khu vực cắm trại", "We arrived at the lakeside campsite before noon and unpacked our gear.", "Chúng tôi đến khu cắm trại ven hồ trước buổi trưa và dỡ đồ đạc.", "KET_A2", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "lakeside campsite, clean up the campsite", "samuraitruong/oxford-3000"),
    ("pitch a tent", "/pɪtʃ ə tent/", "verb phrase", "Dựng lều trại", "Team A learned how to pitch a waterproof tent in less than ten minutes.", "Đội A đã học cách dựng một chiếc lều chống thấm nước trong chưa đầy 10 phút.", "PET_B1", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "pitch a tent, take down a tent", "cambridge-ket-pet"),
    ("sleeping bag", "/ˈsliː.pɪŋ ˌbæɡ/", "noun phrase", "Túi ngủ dã ngoại", "Bring a warm sleeping bag because the mountain air gets chilly at night.", "Hãy mang theo túi ngủ ấm vì không khí trên núi sẽ se lạnh vào ban đêm.", "KET_A2", "Lớp 6", "Outdoor Picnic & Eco-Trip", "unit_picnic", "roll up a sleeping bag, thermal sleeping bag", "cambridge-ket-pet"),
    ("compass", "/ˈkʌm.pəs/", "noun", "La bàn định hướng", "During the outdoor workshop, students used a magnetic compass to find north.", "Trong buổi thực hành ngoài trời, học sinh dùng la bàn từ tính để xác định hướng Bắc.", "KET_A2", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "magnetic compass, compass rose, read a compass", "samuraitruong/oxford-3000"),
    ("campfire", "/ˈkæmp.faɪər/", "noun", "Lửa trại", "We sang English acoustic songs and roasted corn around the campfire.", "Chúng tôi hát những bài tiếng Anh mộc và nướng ngô quanh đống lửa trại.", "KET_A2", "Lớp 6", "Outdoor Picnic & Eco-Trip", "unit_picnic", "build a campfire, gather around the campfire", "cambridge-ket-pet"),
    ("picnic hamper", "/ˈpɪk.nɪk ˈhæm.pər/", "noun phrase", "Giỏ đựng đồ ăn dã ngoại", "We packed sandwiches, fresh apples, and juice into a woven picnic hamper.", "Chúng tôi xếp bánh mì kẹp, táo tươi và nước ép vào chiếc giỏ mây dã ngoại.", "PET_B1", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "wicker picnic hamper, pack a picnic basket", "cambridge-ket-pet"),
    ("nature reserve", "/ˈneɪ.tʃər rɪˌzɜːv/", "noun phrase", "Khu bảo tồn thiên nhiên", "Our class visited a national nature reserve to observe migratory birds.", "Lớp chúng tôi đã tới thăm khu bảo tồn thiên nhiên quốc gia để quan sát chim di cư.", "PET_B1", "Lớp 8", "Outdoor Picnic & Eco-Trip", "unit_picnic", "visit a nature reserve, wildlife conservation", "global-success-k12"),
    ("botanical garden", "/bəˈtæn.ɪ.kəl ˈɡɑː.dən/", "noun phrase", "Vườn bách thảo", "The outdoor vocabulary lesson took place at Hanoi Botanical Garden.", "Buổi học từ vựng ngoài trời đã diễn ra tại Vườn Bách Thảo Hà Nội.", "PET_B1", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "stroll through the botanical garden, tropical plants", "global-success-k12"),
    ("scenic trail", "/ˈsiː.nɪk treɪl/", "noun phrase", "Đường mòn ngắm cảnh thiên nhiên", "We hiked along a scenic trail overlooking the emerald valley.", "Chúng tôi đi bộ theo con đường mòn tuyệt đẹp nhìn xuống thung lũng xanh ngọc.", "FCE_B2", "Lớp 8", "Outdoor Picnic & Eco-Trip", "unit_picnic", "hike along a scenic trail, mountain trail", "tyypgzl/Oxford-5000-words"),
    ("first-aid kit", "/ˌfɜːst ˈeɪd kɪt/", "noun phrase", "Bộ dụng cụ sơ cứu y tế", "Every field trip leader carries a complete first-aid kit for safety.", "Mỗi trưởng đoàn dã ngoại đều mang theo bộ sơ cứu y tế đầy đủ để đảm bảo an toàn.", "KET_A2", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "carry a first-aid kit, emergency first aid", "samuraitruong/oxford-3000"),
    ("insect repellent", "/ˈɪn.sekt rɪˌpel.ənt/", "noun phrase", "Thuốc xịt chống côn trùng / muỗi", "Remember to apply natural insect repellent before walking into the woods.", "Hãy nhớ xịt thuốc chống côn trùng tự nhiên trước khi đi bộ vào rừng.", "PET_B1", "Lớp 8", "Outdoor Picnic & Eco-Trip", "unit_picnic", "apply insect repellent, mosquito repellent", "cambridge-ket-pet"),
    ("binoculars", "/bɪˈnɒk.jə.ləz/", "noun", "Ống nhòm quan sát từ xa", "She used a pair of binoculars to spot rare birds in the canopy.", "Cô bạn dùng ống nhòm để quan sát những loài chim quý trên vòm cây.", "PET_B1", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "a pair of binoculars, look through binoculars", "cambridge-ket-pet"),
    ("scavenger hunt", "/ˈskæv.ɪn.dʒər hʌnt/", "noun phrase", "Trò chơi truy tìm đồ vật ngoài trời theo mật thư tiếng Anh", "Students practiced English clues during the exciting park scavenger hunt.", "Học sinh thực hành giải mật thư tiếng Anh trong trò chơi truy tìm kho báu ở công viên.", "PET_B1", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "organize a scavenger hunt, solve clues", "cambridge-ket-pet"),
    ("eco-tourism", "/ˈiː.kəʊˌtʊə.rɪ.zəm/", "noun", "Du lịch sinh thái bền vững", "Eco-tourism teaches students to respect local ecosystems and reduce plastic waste.", "Du lịch sinh thái dạy học sinh tôn trọng hệ sinh thái địa phương và giảm rác thải nhựa.", "PET_B1", "Lớp 8", "Outdoor Picnic & Eco-Trip", "unit_picnic", "promote eco-tourism, sustainable travel", "global-success-k12"),
    ("flora and fauna", "/ˈflɔː.rə ənd ˈfɔː.nə/", "noun phrase", "Hệ thực vật và động vật", "Cuc Phuong National Park is famous for its diverse flora and fauna.", "Vườn quốc gia Cúc Phương nổi tiếng với hệ động thực vật đa dạng.", "FCE_B2", "Lớp 9", "Outdoor Picnic & Eco-Trip", "unit_picnic", "diverse flora and fauna, native species", "global-success-k12"),
    ("biodegradable", "/ˌbaɪ.əʊ.dɪˈɡreɪ.də.bəl/", "adjective", "Có thể phân hủy sinh học (thân thiện môi trường)", "During our picnic, we only used biodegradable plates and paper cups.", "Trong buổi dã ngoại, chúng tôi chỉ sử dụng đĩa và cốc giấy tự phân hủy sinh học.", "FCE_B2", "Lớp 9", "Outdoor Picnic & Eco-Trip", "unit_picnic", "biodegradable packaging, eco-friendly materials", "tyypgzl/Oxford-5000-words"),
    ("excursion", "/ɪkˈskɜː.ʃən/", "noun", "Chuyến tham quan dã ngoại học tập trong ngày", "Next Sunday, Grade 7 classes will go on an educational excursion to Bat Trang pottery village.", "Chủ nhật tới, các lớp khối 7 sẽ đi tham quan học tập tại làng gốm Bát Tràng.", "PET_B1", "Lớp 7", "Outdoor Picnic & Eco-Trip", "unit_picnic", "go on an excursion, educational excursion", "samuraitruong/oxford-3000"),
    ("orienteering", "/ˌɔː.ri.ənˈtɪə.rɪŋ/", "noun", "Môn thể thao định hướng bằng bản đồ và la bàn", "Orienteering builds both physical stamina and English map-reading skills.", "Môn định hướng rèn luyện cả thể lực lẫn kỹ năng đọc bản đồ bằng tiếng Anh.", "FCE_B2", "Lớp 8", "Outdoor Picnic & Eco-Trip", "unit_picnic", "orienteering course, map and compass", "cambridge-ket-pet"),
    ("panoramic", "/ˌpæn.əˈræm.ɪk/", "adjective", "Toàn cảnh, góc nhìn rộng bao quát", "From the hilltop, we took a panoramic photo of the entire lake.", "Từ đỉnh đồi, chúng tôi chụp một bức ảnh toàn cảnh cả mặt hồ.", "FCE_B2", "Lớp 9", "Outdoor Picnic & Eco-Trip", "unit_picnic", "panoramic view, panoramic photography", "tyypgzl/Oxford-5000-words"),

    # --- NHÓM C: 🎙️ CHỦ ĐỀ WORKSHOP THUYẾT TRÌNH, PHẢN BIỆN & TEAMWORK (unit_workshop) ---
    ("facilitator", "/fəˈsɪl.ɪ.teɪ.tər/", "noun", "Người điều phối, hướng dẫn buổi Workshop", "The workshop facilitator encouraged every student to share their creative ideas.", "Người điều phối buổi workshop khuyến khích mọi học sinh chia sẻ ý tưởng sáng tạo.", "FCE_B2", "Lớp 8", "Speaking & Teamwork Workshop", "unit_workshop", "workshop facilitator, group discussion", "tyypgzl/Oxford-5000-words"),
    ("brainstorming", "/ˈbreɪn.stɔː.mɪŋ/", "noun", "Hoạt động động não, đóng góp ý tưởng nhóm", "We started the project with a ten-minute brainstorming session using mind maps.", "Chúng tôi bắt đầu dự án bằng 10 phút động não tìm ý tưởng với sơ đồ tư duy.", "PET_B1", "Lớp 7", "Speaking & Teamwork Workshop", "unit_workshop", "brainstorming session, generate ideas", "samuraitruong/oxford-3000"),
    ("ice-breaker", "/ˈaɪsˌbreɪ.kər/", "noun", "Trò chơi khởi động làm quen đầu buổi Workshop", "An interactive English ice-breaker helped shy students feel comfortable speaking.", "Trò chơi khởi động tiếng Anh tương tác giúp các bạn rụt rè tự tin nói chuyện hơn.", "PET_B1", "Lớp 7", "Speaking & Teamwork Workshop", "unit_workshop", "fun ice-breaker activity, break the ice", "cambridge-ket-pet"),
    ("public speaking", "/ˌpʌb.lɪk ˈspiː.kɪŋ/", "noun phrase", "Kỹ năng diễn thuyết trước đám đông", "Practicing public speaking every week boosts your confidence and pronunciation.", "Luyện tập thuyết trình trước đám đông hàng tuần giúp tăng sự tự tin và phát âm chuẩn.", "PET_B1", "Lớp 7", "Speaking & Teamwork Workshop", "unit_workshop", "master public speaking, overcome stage fright", "samuraitruong/oxford-3000"),
    ("eye contact", "/ˈaɪ ˌkɒn.tækt/", "noun phrase", "Giao tiếp bằng ánh mắt khi thuyết trình", "Maintaining natural eye contact with the audience makes your speech more convincing.", "Duy trì giao tiếp bằng ánh mắt tự nhiên với khán giả giúp bài nói thuyết phục hơn.", "PET_B1", "Lớp 7", "Speaking & Teamwork Workshop", "unit_workshop", "maintain eye contact, direct eye contact", "samuraitruong/oxford-3000"),
    ("body language", "/ˈbɒd.i ˌlæŋ.ɡwɪdʒ/", "noun phrase", "Ngôn ngữ cơ thể (cử chỉ, điệu bộ)", "Confident posture and open body language are essential in oral presentations.", "Tư thế tự tin và ngôn ngữ cơ thể cởi mở rất quan trọng trong bài thuyết trình nói.", "PET_B1", "Lớp 7", "Speaking & Teamwork Workshop", "unit_workshop", "positive body language, hand gestures", "samuraitruong/oxford-3000"),
    ("articulate", "/ɑːˈtɪk.jə.leɪt/", "adjective / verb", "Diễn đạt lưu loát, phát âm rõ ràng mạch lạc", "She is an articulate young speaker who can explain complex topics clearly.", "Bạn ấy là một diễn giả trẻ lưu loát, có thể giải thích các chủ đề phức tạp thật rõ ràng.", "FCE_B2", "Lớp 9", "Speaking & Teamwork Workshop", "unit_workshop", "articulate speaker, articulate your thoughts", "tyypgzl/Oxford-5000-words"),
    ("persuasive", "/pəˈsweɪ.sɪv/", "adjective", "Có tính thuyết phục cao", "His team presented a persuasive argument supported by real scientific data.", "Đội của cậu ấy đã đưa ra một lập luận đầy thuyết phục được chứng minh bằng số liệu khoa học.", "FCE_B2", "Lớp 8", "Speaking & Teamwork Workshop", "unit_workshop", "persuasive essay, persuasive argument", "samuraitruong/oxford-3000"),
    ("rebuttal", "/rɪˈbʌt.əl/", "noun", "Phần phản biện, bác bỏ lập luận đối phương (trong Debate)", "In the debate finals, Minh delivered a polite yet sharp two-minute rebuttal.", "Trong trận chung kết tranh biện, Minh đã đưa ra phần phản biện 2 phút lịch sự nhưng sắc bén.", "FCE_B2", "Lớp 9", "Speaking & Teamwork Workshop", "unit_workshop", "deliver a rebuttal, debate rebuttal", "tyypgzl/Oxford-5000-words"),
    ("consensus", "/kənˈsen.səs/", "noun", "Sự đồng thuận, nhất trí của cả nhóm", "After discussing three options, our workshop group reached a unanimous consensus.", "Sau khi thảo luận 3 phương án, nhóm workshop của chúng tôi đã đạt được sự đồng thuận.", "FCE_B2", "Lớp 9", "Speaking & Teamwork Workshop", "unit_workshop", "reach a consensus, build consensus", "tyypgzl/Oxford-5000-words"),
    ("constructive feedback", "/kənˈstrʌk.tɪv ˈfiːd.bæk/", "noun phrase", "Nhận xét, góp ý mang tính xây dựng", "Teachers and peers gave constructive feedback after each role-play performance.", "Giáo viên và các bạn đã đưa ra những góp ý mang tính xây dựng sau mỗi phần đóng vai.", "PET_B1", "Lớp 8", "Speaking & Teamwork Workshop", "unit_workshop", "give constructive feedback, receive feedback", "samuraitruong/oxford-3000"),
    ("visual aid", "/ˈvɪʒ.u.əl eɪd/", "noun phrase", "Giáo cụ trực quan, slide minh họa thuyết trình", "Using charts and infographics as visual aids helps the audience remember key points.", "Sử dụng biểu đồ và infographic làm minh họa trực quan giúp khán giả nhớ ý chính lâu hơn.", "PET_B1", "Lớp 8", "Speaking & Teamwork Workshop", "unit_workshop", "use visual aids, presentation slides", "cambridge-ket-pet"),
    ("mind map", "/ˈmaɪnd ˌmæp/", "noun phrase", "Sơ đồ tư duy", "Draw a colorful mind map to organize vocabulary by topic before writing.", "Hãy vẽ sơ đồ tư duy nhiều màu sắc để hệ thống hóa từ vựng theo chủ đề trước khi viết.", "KET_A2", "Lớp 6", "Speaking & Teamwork Workshop", "unit_workshop", "draw a mind map, vocabulary mind map", "global-success-k12"),
    ("impromptu", "/ɪmˈprɒmp.tjuː/", "adjective", "Ứng khẩu, không chuẩn bị trước (Impromptu Speaking)", "Each participant picked a random topic card for a one-minute impromptu speech.", "Mỗi thí sinh bốc một thẻ chủ đề ngẫu nhiên cho bài nói ứng khẩu dài một phút.", "FCE_B2", "Lớp 9", "Speaking & Teamwork Workshop", "unit_workshop", "impromptu speech, impromptu debate", "tyypgzl/Oxford-5000-words"),
    ("collaborate", "/kəˈlæb.ə.reɪt/", "verb", "Hợp tác, cộng tác làm việc nhóm", "Students from Grade 7 and Grade 8 collaborated on an environmental video project.", "Học sinh khối 7 và khối 8 đã hợp tác thực hiện dự án video bảo vệ môi trường.", "PET_B1", "Lớp 7", "Speaking & Teamwork Workshop", "unit_workshop", "collaborate closely, collaborate on a project", "samuraitruong/oxford-3000"),
    ("keynote", "/ˈkiː.nəʊt/", "noun", "Bài diễn văn chính, thông điệp trọng tâm", "The guest teacher delivered an inspiring keynote on self-study habits.", "Giáo viên khách mời đã trình bày bài chia sẻ trọng tâm đầy cảm hứng về thói quen tự học.", "FCE_B2", "Lớp 9", "Speaking & Teamwork Workshop", "unit_workshop", "keynote speaker, keynote address", "tyypgzl/Oxford-5000-words"),
    ("takeaway", "/ˈteɪk.ə.weɪ/", "noun", "Bài học đúc kết cốt lõi sau buổi học / Workshop", "At the end of the workshop, everyone wrote down their top three takeaways.", "Cuối buổi workshop, mọi người đều ghi lại 3 bài học tâm đắc nhất của mình.", "PET_B1", "Lớp 8", "Speaking & Teamwork Workshop", "unit_workshop", "key takeaway, main takeaway from the lesson", "tyypgzl/Oxford-5000-words"),
    ("peer review", "/ˈpɪə rɪˌvjuː/", "noun phrase", "Đánh giá, chấm chéo bài lẫn nhau giữa các bạn học", "During peer review, students check each other's essays for grammar and vocabulary.", "Trong phần chấm chéo, học sinh kiểm tra ngữ pháp và từ vựng trong bài viết của nhau.", "PET_B1", "Lớp 8", "Speaking & Teamwork Workshop", "unit_workshop", "conduct peer review, peer assessment", "samuraitruong/oxford-3000"),

    # --- NHÓM D: 🏖️ CHỦ ĐỀ TRẠI HÈ QUỐC TẾ & GIAO LƯU ĐA VĂN HÓA (unit_summer_camp) ---
    ("cultural exchange", "/ˈkʌl.tʃər.əl ɪksˈtʃeɪndʒ/", "noun phrase", "Giao lưu văn hóa quốc tế", "The international summer camp promotes cultural exchange among ASEAN students.", "Trại hè quốc tế thúc đẩy giao lưu văn hóa giữa học sinh các nước ASEAN.", "PET_B1", "Lớp 8", "Summer Camp & Travel", "unit_summer_camp", "cultural exchange program, international friendship", "global-success-k12"),
    ("homestay", "/ˈhəʊm.steɪ/", "noun", "Hình thức lưu trú tại nhà dân bản xứ để học ngôn ngữ", "Living with an Australian host family during my homestay improved my listening skills.", "Sống cùng gia đình bản xứ Úc trong kỳ homestay đã giúp kỹ năng nghe của tôi tiến bộ vượt bậc.", "KET_A2", "Lớp 7", "Summer Camp & Travel", "unit_summer_camp", "homestay experience, host family", "cambridge-ket-pet"),
    ("boarding pass", "/ˈbɔː.dɪŋ ˌpɑːs/", "noun phrase", "Thẻ lên máy bay", "Please keep your passport and boarding pass ready at the departure gate.", "Vui lòng chuẩn bị sẵn hộ chiếu và thẻ lên máy bay tại cổng khởi hành.", "KET_A2", "Lớp 7", "Summer Camp & Travel", "unit_summer_camp", "show your boarding pass, print a boarding pass", "cambridge-ket-pet"),
    ("coral reef", "/ˈkɒr.əl riːf/", "noun phrase", "Rạn san hô đại dương", "At the marine biology camp, we learned how to protect tropical coral reefs.", "Tại trại hè sinh học biển, chúng tôi học cách bảo vệ các rạn san hô nhiệt đới.", "PET_B1", "Lớp 7", "Summer Camp & Travel", "unit_summer_camp", "protect coral reefs, marine ecosystem", "global-success-k12"),
    ("hospitality", "/ˌhɒs.pɪˈtæl.ə.ti/", "noun", "Lòng hiếu khách, sự mến khách", "International visitors always praise the warm hospitality of Vietnamese people.", "Du khách quốc tế luôn ca ngợi lòng hiếu khách nồng hậu của người dân Việt Nam.", "FCE_B2", "Lớp 8", "Summer Camp & Travel", "unit_summer_camp", "warm hospitality, show hospitality", "samuraitruong/oxford-3000"),
    ("global citizen", "/ˈɡləʊ.bəl ˈsɪt.ɪ.zən/", "noun phrase", "Công dân toàn cầu", "Mastering English and digital skills prepares you to become a responsible global citizen.", "Làm chủ tiếng Anh và kỹ năng số trang bị cho bạn trở thành một công dân toàn cầu có trách nhiệm.", "PET_B1", "Lớp 8", "Summer Camp & Travel", "unit_summer_camp", "responsible global citizen, global mindset", "global-success-k12"),

    # --- NHÓM E: 🌸 CHỦ ĐỀ LỄ HỘI TẾT NGUYÊN ĐÁN, DI SẢN & VĂN HÓA VIỆT NAM (unit_tet_festivals) ---
    ("family reunion", "/ˈfæm.əl.i riːˈjuː.njən/", "noun phrase", "Bữa cơm đoàn viên, sum họp gia đình", "Tet is the most sacred occasion for family reunions across Vietnam.", "Tết là dịp thiêng liêng nhất để đoàn tụ gia đình trên khắp Việt Nam.", "PET_B1", "Lớp 7", "Traditional Festivals & Heritage", "unit_tet_festivals", "warm family reunion, reunion dinner", "global-success-k12"),
    ("peach blossom", "/ˈpiːtʃ ˌblɒs.əm/", "noun phrase", "Hoa đào ngày Tết miền Bắc", "Pink peach blossoms bring warmth and luck to northern Vietnamese homes during Tet.", "Hoa đào hồng thắm mang lại sự ấm áp và may mắn cho các gia đình miền Bắc dịp Tết.", "KET_A2", "Lớp 6", "Traditional Festivals & Heritage", "unit_tet_festivals", "blooming peach blossoms, apricot blossoms", "global-success-k12"),
    ("apricot blossom", "/ˈeɪ.prɪ.kɒt ˌblɒs.əm/", "noun phrase", "Hoa mai vàng miền Nam", "Bright yellow apricot blossoms symbolize prosperity and happiness in the spring.", "Hoa mai vàng rực rỡ tượng trưng cho sự thịnh vượng và hạnh phúc vào mùa xuân.", "KET_A2", "Lớp 6", "Traditional Festivals & Heritage", "unit_tet_festivals", "yellow apricot blossom, spring flowers", "global-success-k12"),
    ("lucky money", "/ˈlʌk.i ˈmʌn.i/", "noun phrase", "Tiền lì xì mừng tuổi đầu năm", "Children give New Year greetings to elders and receive red envelopes with lucky money.", "Trẻ em chúc Tết ông bà và nhận những phong bao lì xì đỏ may mắn.", "KET_A2", "Lớp 6", "Traditional Festivals & Heritage", "unit_tet_festivals", "red envelope of lucky money, New Year wishes", "global-success-k12"),
    ("calligraphy", "/kəˈlɪɡ.rə.fi/", "noun", "Nghệ thuật thư pháp (xin chữ đầu xuân)", "Visiting the Temple of Literature to ask for calligraphy is a cherished Tet tradition.", "Đi Văn Miếu xin chữ thư pháp là một nét đẹp văn hóa truyền thống mỗi dịp Tết đến.", "FCE_B2", "Lớp 8", "Traditional Festivals & Heritage", "unit_tet_festivals", "traditional calligraphy, master calligrapher", "global-success-k12"),
    ("intangible heritage", "/ɪnˈtæn.dʒə.bəl ˈher.ɪ.tɪdʒ/", "noun phrase", "Di sản văn hóa phi vật thể", "Quan Ho folk singing is recognized by UNESCO as an intangible cultural heritage.", "Dân ca Quan họ được UNESCO công nhận là di sản văn hóa phi vật thể.", "FCE_B2", "Lớp 9", "Traditional Festivals & Heritage", "unit_tet_festivals", "UNESCO intangible cultural heritage, preserve heritage", "gdrive-our-heritage"),

    # --- NHÓM F: 📚 GLOBAL SUCCESS UNITS 6-12 (TRƯỜNG HỌC, GIAO THÔNG, ĐIỆN ẢNH, NĂNG LƯỢNG, TƯƠNG LAI) ---
    ("gifted student", "/ˈɡɪf.tɪd ˈstjuː.dənt/", "noun phrase", "Học sinh năng khiếu, học sinh giỏi", "Quoc Hoc Hue is a historic high school for gifted students in central Vietnam.", "Quốc Học Huế là ngôi trường trung học có bề dày lịch sử dành cho học sinh năng khiếu.", "PET_B1", "Lớp 7", "Education & School", "unit6", "school for gifted students, entrance examination", "global-success-k12"),
    ("extracurricular", "/ˌek.strə.kəˈrɪk.jə.lər/", "adjective", "Ngoại khóa (hoạt động ngoài giờ chính khóa)", "Participating in extracurricular clubs helps students develop soft skills.", "Tham gia các câu lạc bộ ngoại khóa giúp học sinh phát triển kỹ năng mềm.", "FCE_B2", "Lớp 7", "Education & School", "unit6", "extracurricular activities, sports and arts clubs", "global-success-k12"),
    ("pedestrian", "/pəˈdes.tri.ən/", "noun", "Người đi bộ", "Drivers must slow down and yield to pedestrians at the zebra crossing.", "Tài xế phải giảm tốc độ và nhường đường cho người đi bộ tại vạch qua đường.", "PET_B1", "Lớp 7", "Traffic & Safety", "unit7", "pedestrian crossing, pedestrian zone", "global-success-k12"),
    ("traffic congestion", "/ˈtræf.ɪk kənˌdʒes.tʃən/", "noun phrase", "Sự ùn tắc giao thông", "Expanding public metro lines helps reduce traffic congestion during rush hour.", "Mở rộng các tuyến tàu điện đô thị giúp giảm ùn tắc giao thông vào giờ cao điểm.", "FCE_B2", "Lớp 7", "Traffic & Safety", "unit7", "reduce traffic congestion, heavy rush-hour traffic", "global-success-k12"),
    ("seatbelt", "/ˈsiːt.belt/", "noun", "Dây an toàn trên ô tô, máy bay", "Always fasten your seatbelt as soon as you sit in a car.", "Hãy luôn thắt dây an toàn ngay khi bạn ngồi vào xe ô tô.", "KET_A2", "Lớp 7", "Traffic & Safety", "unit7", "fasten your seatbelt, safety regulations", "global-success-k12"),
    ("documentary", "/ˌdɒk.jəˈmen.tər.i/", "noun", "Phim tài liệu khoa học / lịch sử", "We watched a fascinating wildlife documentary narrated by David Attenborough.", "Chúng tôi đã xem một bộ phim tài liệu thiên nhiên hoang dã hấp dẫn.", "KET_A2", "Lớp 7", "Films & Cinema", "unit8", "wildlife documentary, historical documentary", "global-success-k12"),
    ("gripping", "/ˈɡrɪp.ɪŋ/", "adjective", "Hấp dẫn, lôi cuốn không rời mắt (phim, sách)", "The mystery film had a gripping plot that kept the audience guessing until the end.", "Bộ phim trinh thám có cốt truyện lôi cuốn khiến khán giả đoán già đoán non đến phút cuối.", "PET_B1", "Lớp 7", "Films & Cinema", "unit8", "gripping storyline, gripping thriller", "global-success-k12"),
    ("hilarious", "/hɪˈleə.ri.əs/", "adjective", "Vô cùng hài hước, vui nhộn", "The animated comedy was so hilarious that the whole cinema burst into laughter.", "Bộ phim hài hoạt hình vui nhộn đến mức cả rạp chiếu phim bật cười sảng khoái.", "PET_B1", "Lớp 7", "Films & Cinema", "unit8", "hilarious comedy, hilarious scene", "global-success-k12"),
    ("renewable energy", "/rɪˈnjuː.ə.bəl ˈen.ə.dʒi/", "noun phrase", "Năng lượng tái tạo (mặt trời, gió, sinh khối)", "Solar panels and wind turbines generate clean, renewable energy.", "Pin mặt trời và tua-bin gió tạo ra nguồn năng lượng tái tạo sạch.", "PET_B1", "Lớp 7", "Energy Sources", "unit10", "renewable energy sources, solar and wind power", "global-success-k12"),
    ("solar panel", "/ˌsəʊ.lə ˈpæn.əl/", "noun phrase", "Tấm pin năng lượng mặt trời", "Our school installed solar panels on the roof to power classroom lights.", "Trường chúng tôi đã lắp đặt các tấm pin mặt trời trên mái nhà để thắp sáng phòng học.", "KET_A2", "Lớp 7", "Energy Sources", "unit10", "install solar panels, rooftop solar energy", "global-success-k12"),
    ("carbon footprint", "/ˌkɑː.bən ˈfʊt.prɪnt/", "noun phrase", "Dấu chân carbon (lượng khí thải nhà kính phát sinh)", "Cycling to school instead of riding a motorbike lowers your carbon footprint.", "Đạp xe đi học thay vì đi xe máy giúp giảm lượng khí thải carbon của bạn.", "FCE_B2", "Lớp 8", "Energy Sources", "unit10", "reduce your carbon footprint, low-carbon lifestyle", "global-success-k12"),
    ("autopilot", "/ˈɔː.təʊˌpaɪ.lət/", "noun", "Hệ thống lái tự động", "Future electric aircraft will use smart autopilot systems for safer flights.", "Máy bay điện tương lai sẽ sử dụng hệ thống lái tự động thông minh để bay an toàn hơn.", "PET_B1", "Lớp 7", "Future Transport", "unit11", "on autopilot, driverless vehicle", "global-success-k12"),
    ("hyperloop", "/ˈhaɪ.pə.luːp/", "noun", "Tàu siêu tốc chạy trong ống chân không", "A hyperloop train could travel between Hanoi and Da Nang in under an hour.", "Tàu siêu tốc hyperloop có thể di chuyển giữa Hà Nội và Đà Nẵng trong chưa đầy một giờ.", "PET_B1", "Lớp 7", "Future Transport", "unit11", "high-speed hyperloop, magnetic levitation", "global-success-k12"),
    ("native speaker", "/ˌneɪ.tɪv ˈspiː.kər/", "noun phrase", "Người bản xứ", "Practicing pronunciation with a native speaker helps you master natural intonation.", "Luyện phát âm với người bản xứ giúp bạn làm chủ ngữ điệu tự nhiên.", "KET_A2", "Lớp 7", "English-Speaking Countries", "unit12", "fluent like a native speaker, native English teacher", "global-success-k12"),
    ("bilingual", "/baɪˈlɪŋ.ɡwəl/", "adjective", "Song ngữ (sử dụng thông thạo 2 ngôn ngữ)", "Students in our program use bilingual dictionaries and read English-Vietnamese stories.", "Học sinh trong chương trình của chúng tôi dùng từ điển song ngữ và đọc truyện Anh-Việt.", "PET_B1", "Lớp 7", "English-Speaking Countries", "unit12", "bilingual education, fluent bilingual speaker", "samuraitruong/oxford-3000"),

    # --- NHÓM G: 🏆 PHRASAL VERBS, IDIOMS & WORD FORMATION (TỪ KHO GOOGLE DRIVE DOCX & HSG) ---
    ("look forward to", "/lʊk ˈfɔː.wəd tuː/", "phrasal verb", "Mong đợi, háo hức chờ đón (+ V-ing)", "We are really looking forward to joining the weekend English picnic workshop.", "Chúng tôi thực sự rất háo hức được tham gia buổi workshop dã ngoại tiếng Anh cuối tuần này.", "PET_B1", "Lớp 7", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "look forward to hearing from you, look forward to the trip", "gdrive-phrasal-verbs"),
    ("carry out", "/ˈkær.i aʊt/", "phrasal verb", "Tiến hành, thực hiện (thí nghiệm, khảo sát, dự án)", "The science club carried out an experiment on water filtration.", "Câu lạc bộ khoa học đã tiến hành một thí nghiệm về lọc nước.", "PET_B1", "Lớp 8", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "carry out a survey, carry out research", "gdrive-phrasal-verbs"),
    ("come up with", "/kʌm ʌp wɪð/", "phrasal verb", "Nghĩ ra, nảy ra (ý tưởng, giải pháp sáng tạo)", "During the workshop, Lan came up with a brilliant idea for recycling plastic bottles.", "Trong buổi workshop, Lan đã nảy ra một ý tưởng tuyệt vời để tái chế chai nhựa.", "PET_B1", "Lớp 8", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "come up with a solution, come up with a plan", "gdrive-phrasal-verbs"),
    ("set off", "/set ɒf/", "phrasal verb", "Khởi hành, lên đường đi dã ngoại / du lịch", "Our picnic bus will set off from the main school gate at 6:30 a.m. sharp.", "Xe buýt dã ngoại của chúng ta sẽ khởi hành từ cổng chính trường lúc 6 giờ 30 sáng đúng.", "KET_A2", "Lớp 7", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "set off early, set off on a journey", "gdrive-phrasal-verbs"),
    ("put off", "/pʊt ɒf/", "phrasal verb", "Trì hoãn, dời lại (= postpone)", "Never put off your homework until the last minute before class.", "Đừng bao giờ trì hoãn bài tập về nhà đến phút cuối cùng trước giờ học.", "PET_B1", "Lớp 8", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "put off a meeting, stop procrastinating", "gdrive-phrasal-verbs"),
    ("turn down", "/tɜːn daʊn/", "phrasal verb", "Vặn nhỏ (âm lượng); từ chối lời đề nghị", "Please turn down the music volume so your sister can study for her exam.", "Làm ơn vặn nhỏ âm lượng nhạc xuống để em gái bạn tập trung ôn thi.", "PET_B1", "Lớp 7", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "turn down the volume, turn down an invitation", "gdrive-phrasal-verbs"),
    ("bring about", "/brɪŋ əˈbaʊt/", "phrasal verb", "Mang lại, dẫn đến sự thay đổi tích cực", "Digital learning tools have brought about positive changes in rural classrooms.", "Các công cụ học tập số đã mang lại những thay đổi tích cực cho các lớp học vùng xa.", "FCE_B2", "Lớp 9", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "bring about change, bring about improvements", "gdrive-phrasal-verbs"),
    ("keep up with", "/kiːp ʌp wɪð/", "phrasal verb", "Theo kịp, bắt kịp tiến độ", "Reviewing flashcards daily helps you keep up with the Cambridge vocabulary curriculum.", "Ôn thẻ từ flashcard mỗi ngày giúp bạn bắt kịp lộ trình từ vựng Cambridge.", "PET_B1", "Lớp 8", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "keep up with the class, keep pace with", "gdrive-phrasal-verbs"),
    ("run out of", "/rʌn aʊt əv/", "phrasal verb", "Hết, cạn kiệt (năng lượng, thời gian, nguyên liệu)", "We must switch to clean energy before the world runs out of fossil fuels.", "Chúng ta phải chuyển sang năng lượng sạch trước khi thế giới cạn kiệt nhiên liệu hóa thạch.", "PET_B1", "Lớp 7", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "run out of time, run out of battery", "gdrive-phrasal-verbs"),
    ("take part in", "/teɪk pɑːt ɪn/", "phrasal verb", "Tham gia vào (= participate in)", "Over two hundred students took part in the Halloween English Spelling Bee.", "Hơn hai trăm học sinh đã tham gia cuộc thi Đánh vần tiếng Anh lễ hội Halloween.", "KET_A2", "Lớp 6", "Phrasal Verbs & Idioms", "unit_phrasal_wordform", "take part in a workshop, active participation", "gdrive-phrasal-verbs"),
    ("self-reliant", "/ˌself.rɪˈlaɪ.ənt/", "adjective", "Tự lực, tự lập không ỷ lại", "Outdoor summer camps train teenagers to become more confident and self-reliant.", "Các trại hè dã ngoại rèn luyện thanh thiếu niên trở nên tự tin và tự lập hơn.", "FCE_B2", "Lớp 9", "Word Formation & Academic", "unit_phrasal_wordform", "become self-reliant, self-reliance", "gdrive-becoming-independent"),
    ("time management", "/ˈtaɪm ˌmæn.ɪdʒ.mənt/", "noun phrase", "Kỹ năng quản lý thời gian", "Effective time management allows you to balance schoolwork and outdoor hobbies.", "Quản lý thời gian hiệu quả giúp bạn cân bằng giữa việc học trên lớp và sở thích ngoại khóa.", "PET_B1", "Lớp 8", "Word Formation & Academic", "unit_phrasal_wordform", "practice time management, prioritize tasks", "gdrive-becoming-independent"),
    ("urbanisation", "/ˌɜː.bən.aɪˈzeɪ.ʃən/", "noun", "Quá trình đô thị hóa", "Rapid urbanisation requires smart green parks and sustainable public transport.", "Quá trình đô thị hóa nhanh đòi hỏi phải có công viên xanh thông minh và giao thông công cộng bền vững.", "FCE_B2", "Lớp 9", "Word Formation & Academic", "unit_phrasal_wordform", "rapid urbanisation, urban planning", "gdrive-cities-urbanisation"),
    ("metropolis", "/məˈtrɒp.əl.ɪs/", "noun", "Đô thị lớn, thành phố trung tâm sầm uất", "Ho Chi Minh City is a dynamic metropolis with vibrant cultural activities.", "TP. Hồ Chí Minh là một đại đô thị năng động với nhiều hoạt động văn hóa sôi nổi.", "FCE_B2", "Lớp 9", "Word Formation & Academic", "unit_phrasal_wordform", "bustling metropolis, modern metropolis", "gdrive-cities-urbanisation"),
    ("perseverance", "/ˌpɜː.sɪˈvɪə.rəns/", "noun", "Sự kiên trì, bền bỉ theo đuổi mục tiêu", "Through daily practice and perseverance, he achieved a distinction in the Cambridge PET exam.", "Nhờ luyện tập hàng ngày và sự kiên trì, cậu ấy đã đạt loại Giỏi trong kỳ thi Cambridge PET.", "FCE_B2", "Lớp 9", "Word Formation & Academic", "unit_phrasal_wordform", "hard work and perseverance, show perseverance", "gdrive-harold-levine"),
    ("eloquent", "/ˈel.ə.kwənt/", "adjective", "Hùng hồn, có tài hùng biện thuyết phục", "Her eloquent speech on climate action won first prize at the school workshop.", "Bài hùng biện đầy sức thuyết phục của bạn ấy về hành động vì khí hậu đã giành giải Nhất tại workshop trường.", "FCE_B2", "Lớp 9", "Word Formation & Academic", "unit_phrasal_wordform", "eloquent speaker, eloquent speech", "gdrive-harold-levine"),
    ("resilient", "/rɪˈzɪl.i.ənt/", "adjective", "Kiên cường, có khả năng phục hồi nhanh trước thử thách", "Teamwork games in the rain taught us how to stay cheerful and resilient.", "Các trò chơi đồng đội dưới cơn mưa đã dạy chúng tôi cách giữ tinh thần vui vẻ và kiên cường.", "FCE_B2", "Lớp 9", "Word Formation & Academic", "unit_phrasal_wordform", "resilient mindset, build resilience", "gdrive-harold-levine"),
    ("altruistic", "/ˌæl.truˈɪs.tɪk/", "adjective", "Vị tha, vì lợi ích của cộng đồng", "Volunteering at the community library is a noble and altruistic act.", "Tình nguyện tại thư viện cộng đồng là một hành động cao đẹp và vị tha.", "CAE_C1", "Lớp 9", "Word Formation & Academic", "unit3", "altruistic behavior, community spirit", "gdrive-harold-levine")
]

# Кроме того, thêm bộ từ vựng phong phú phân bổ đều khắp 18 Units để kho từ vựng đạt 450+ từ chuẩn
ADDITIONAL_CURRICULUM_VOCAB = [
    # Unit 1-5 & 6-12 & Event Themes expansion
    ("pottery", "/ˈpɒt.ər.i/", "noun", "Đồ gốm, nghề làm gốm thủ công", "During our field trip, we learned how to shape clay pottery by hand.", "Trong chuyến dã ngoại, chúng tôi đã học cách nặn đồ gốm đất sét bằng tay.", "KET_A2", "Lớp 7", "Hobbies & Crafts", "unit1", "make pottery, Bat Trang pottery village", "global-success-k12"),
    ("origami", "/ˌɒr.ɪˈɡɑː.mi/", "noun", "Nghệ thuật gấp giấy Nhật Bản", "Folding origami cranes helps children improve patience and finger dexterity.", "Gấp hạc giấy origami giúp trẻ rèn luyện tính kiên nhẫn và sự khéo léo.", "KET_A2", "Lớp 7", "Hobbies & Crafts", "unit1", "fold origami, paper craft", "global-success-k12"),
    ("bird-watching", "/ˈbɜːdˌwɒtʃ.ɪŋ/", "noun", "Sở thích quan sát chim chóc ngoài tự nhiên", "We brought binoculars for bird-watching during our Sunday forest picnic.", "Chúng tôi mang theo ống nhòm để quan sát các loài chim trong buổi dã ngoại rừng Chủ nhật.", "KET_A2", "Lớp 7", "Hobbies & Nature", "unit1", "go bird-watching, rare bird species", "global-success-k12"),
    ("immune system", "/ɪˈmjuːn ˌsɪs.təm/", "noun phrase", "Hệ miễn dịch của cơ thể", "Eating citrus fruits and exercising outdoors strengthens your immune system.", "Ăn trái cây họ cam quýt và vận động ngoài trời giúp tăng cường hệ miễn dịch.", "PET_B1", "Lớp 7", "Health & Nutrition", "unit2", "boost the immune system, strong immunity", "samuraitruong/oxford-3000"),
    ("balanced diet", "/ˌbæl.ənst ˈdaɪ.ət/", "noun phrase", "Chế độ ăn uống cân bằng dinh dưỡng", "A balanced diet includes whole grains, lean protein, and fresh vegetables.", "Chế độ ăn cân bằng bao gồm ngũ cốc nguyên hạt, đạm lành mạnh và rau xanh tươi.", "KET_A2", "Lớp 7", "Health & Nutrition", "unit2", "maintain a balanced diet, healthy lifestyle", "global-success-k12"),
    ("hydration", "/haɪˈdreɪ.ʃən/", "noun", "Sự cung cấp đủ nước cho cơ thể", "Proper hydration is crucial when hiking or attending an outdoor summer camp.", "Uống đủ nước là điều vô cùng quan trọng khi đi bộ đường dài hoặc tham gia trại hè ngoài trời.", "PET_B1", "Lớp 8", "Health & Nutrition", "unit2", "stay hydrated, daily hydration", "tyypgzl/Oxford-5000-words"),
    ("nursing home", "/ˈnɜː.sɪŋ ˌhəʊm/", "noun phrase", "Viện dưỡng lão", "Our class visited the local nursing home to sing songs and read stories to the elderly.", "Lớp chúng tôi đã tới thăm viện dưỡng lão địa phương để hát và đọc truyện cho các cụ nghe.", "KET_A2", "Lớp 7", "Community Service", "unit3", "volunteer at a nursing home, care for the elderly", "global-success-k12"),
    ("charity fair", "/ˈtʃær.ə.ti feər/", "noun phrase", "Hội chợ từ thiện gây quỹ", "We organized a handmade craft booth at the school charity fair.", "Chúng tôi đã mở một gian hàng đồ thủ công tại hội chợ từ thiện của trường.", "KET_A2", "Lớp 7", "Community Service", "unit3", "organize a charity fair, raise funds", "global-success-k12"),
    ("philanthropy", "/fɪˈlæn.θrə.pi/", "noun", "Hoạt động thiện nguyện, lòng nhân ái vì cộng đồng", "Community projects teach young learners the true value of empathy and philanthropy.", "Các dự án cộng đồng dạy người học trẻ giá trị thực sự của sự thấu cảm và lòng nhân ái.", "FCE_B2", "Lớp 9", "Community Service", "unit3", "spirit of philanthropy, charitable giving", "gdrive-harold-levine"),
    ("water puppetry", "/ˈwɔː.tər ˈpʌp.ɪ.tri/", "noun phrase", "Nghệ thuật múa rối nước truyền thống", "Thang Long water puppetry is a unique folk art from the Red River Delta.", "Múa rối nước Thăng Long là môn nghệ thuật dân gian độc đáo của vùng châu thổ sông Hồng.", "PET_B1", "Lớp 7", "Music & Arts", "unit4", "traditional water puppetry, puppet show", "global-success-k12"),
    ("exhibition", "/ˌek.sɪˈbɪʃ.ən/", "noun", "Triển lãm nghệ thuật / khoa học", "Our workshop group presented English posters at the school STEM exhibition.", "Nhóm workshop của chúng tôi đã thuyết trình poster tiếng Anh tại triển lãm STEM của trường.", "KET_A2", "Lớp 7", "Music & Arts", "unit4", "art exhibition, visit an exhibition", "samuraitruong/oxford-3000"),
    ("symphony", "/ˈsɪm.fə.ni/", "noun", "Bản giao hưởng", "Listening to classical symphonies helps many students focus while studying.", "Nghe các bản giao hưởng cổ điển giúp nhiều học sinh tập trung hơn khi học bài.", "PET_B1", "Lớp 8", "Music & Arts", "unit4", "symphony orchestra, classical symphony", "samuraitruong/oxford-3000"),
    ("broth", "/brɒθ/", "noun", "Nước dùng, nước hầm xương (phở, bún)", "The secret of authentic Hanoi Pho lies in its clear, aromatic beef broth.", "Bí quyết của món Phở Hà Nội chính gốc nằm ở phần nước dùng bò trong và thơm lừng.", "PET_B1", "Lớp 7", "Food & Cuisine", "unit5", "simmer the broth, flavorful broth", "global-success-k12"),
    ("culinary", "/ˈkʌl.ɪ.nər.i/", "adjective", "Thuộc về nghệ thuật ẩm thực, nấu nướng", "During the outdoor picnic workshop, teams competed in a fun culinary challenge.", "Trong buổi workshop dã ngoại, các đội đã tranh tài trong một thử thách ẩm thực vui nhộn.", "FCE_B2", "Lớp 8", "Food & Cuisine", "unit5", "culinary skills, culinary heritage", "tyypgzl/Oxford-5000-words"),
    ("turmeric", "/ˈtɜː.mər.ɪk/", "noun", "Củ nghệ, bột nghệ (gia vị nấu ăn)", "Turmeric gives traditional Vietnamese dishes a warm golden color and earthy aroma.", "Nghệ mang lại màu vàng ấm áp và hương thơm đặc trưng cho các món ăn truyền thống Việt Nam.", "PET_B1", "Lớp 7", "Food & Cuisine", "unit5", "fresh turmeric, pinch of turmeric", "global-success-k12"),
    ("curriculum", "/kəˈrɪk.jə.ləm/", "noun", "Chương trình giảng dạy, khung chương trình học", "Our school integrates outdoor workshops and Cambridge projects into the main curriculum.", "Trường chúng tôi tích hợp các buổi workshop dã ngoại và dự án Cambridge vào chương trình học chính.", "PET_B1", "Lớp 8", "Education & School", "unit6", "school curriculum, national curriculum", "samuraitruong/oxford-3000"),
    ("scholarship", "/ˈskɒl.ə.ʃɪp/", "noun", "Học bổng khuyến học", "Hardworking students can redeem Star points for tuition scholarships.", "Học sinh chăm chỉ có thể đổi điểm Sao tích lũy lấy học bổng khấu trừ học phí.", "PET_B1", "Lớp 7", "Education & School", "unit6", "win a scholarship, academic scholarship", "samuraitruong/oxford-3000"),
    ("boarding school", "/ˈbɔː.dɪŋ ˌskuːl/", "noun phrase", "Trường nội trú", "Students at a boarding school learn to manage their daily schedules independently.", "Học sinh tại trường nội trú học cách tự quản lý lịch trình sinh hoạt hàng ngày.", "PET_B1", "Lớp 7", "Education & School", "unit6", "attend a boarding school, dormitory life", "global-success-k12"),
    ("roundabout", "/ˈraʊnd.ə.baʊt/", "noun", "Vòng xuyến, bùng binh giao thông", "Take the second exit at the roundabout to reach the botanical garden.", "Hãy đi theo lối ra thứ hai tại vòng xuyến để đến vườn bách thảo.", "KET_A2", "Lớp 7", "Traffic & Safety", "unit7", "at the roundabout, traffic roundabout", "global-success-k12"),
    ("helmet", "/ˈhel.mɪt/", "noun", "Mũ bảo hiểm", "Wearing a safety helmet is mandatory when riding a bicycle or electric bike.", "Đội mũ bảo hiểm an toàn là bắt buộc khi đi xe đạp hoặc xe đạp điện.", "KET_A2", "Lớp 6", "Traffic & Safety", "unit7", "wear a helmet, fasten your helmet", "global-success-k12"),
    ("plot twist", "/ˈplɒt ˌtwɪst/", "noun phrase", "Bước ngoặt bất ngờ trong cốt truyện", "The Halloween mystery movie had a clever plot twist in the final ten minutes.", "Bộ phim bí ẩn đêm Halloween có một cú ngoặt cốt truyện đầy bất ngờ ở 10 phút cuối.", "PET_B1", "Lớp 8", "Films & Cinema", "unit8", "unexpected plot twist, thrilling ending", "cambridge-ket-pet"),
    ("soundtrack", "/ˈsaʊnd.træk/", "noun", "Nhạc phim", "The orchestral soundtrack made the adventure film even more emotional.", "Phần nhạc phim giao hưởng khiến bộ phim phiêu lưu càng thêm giàu cảm xúc.", "PET_B1", "Lớp 7", "Films & Cinema", "unit8", "original soundtrack, movie soundtrack", "samuraitruong/oxford-3000"),
    ("feast", "/fiːst/", "noun", "Bữa tiệc lớn trong dịp lễ hội", "Families gather to enjoy a traditional autumn feast during the festival.", "Các gia đình quây quần thưởng thức bữa tiệc mùa thu truyền thống trong dịp lễ hội.", "PET_B1", "Lớp 7", "Festivals", "unit9", "traditional feast, wedding feast", "global-success-k12"),
    ("hydroelectric", "/ˌhaɪ.drəʊ.ɪˈlek.trɪk/", "adjective", "Thuộc về thủy điện", "Hydroelectric dams use the kinetic energy of flowing rivers to generate electricity.", "Các đập thủy điện sử dụng động năng của dòng sông chảy để phát điện.", "PET_B1", "Lớp 7", "Energy Sources", "unit10", "hydroelectric power plant, clean energy", "global-success-k12"),
    ("teleporter", "/ˈtel.ɪ.pɔː.tər/", "noun", "Thiết bị dịch chuyển tức thời (giả tưởng)", "In science fiction stories, a teleporter can send travelers across continents instantly.", "Trong truyện khoa học viễn tưởng, máy dịch chuyển tức thời có thể đưa hành khách xuyên lục địa ngay lập tức.", "KET_A2", "Lớp 7", "Future Transport", "unit11", "future teleporter, bamboo-copter", "global-success-k12"),
    ("archipelago", "/ˌɑː.kɪˈpel.ə.ɡəʊ/", "noun", "Quần đảo", "Cat Ba and Ha Long form a breathtaking limestone archipelago in northern Vietnam.", "Cát Bà và Hạ Long tạo nên một quần đảo đá vôi tuyệt đẹp ở miền Bắc Việt Nam.", "FCE_B2", "Lớp 8", "Geography & Countries", "unit12", "island archipelago, tropical archipelago", "tyypgzl/Oxford-5000-words"),
    ("indigenous", "/ɪnˈdɪdʒ.ɪ.nəs/", "adjective", "Bản địa, lâu đời tại địa phương", "The Maoris are the indigenous people of New Zealand with a rich cultural heritage.", "Người Maori là cư dân bản địa của New Zealand với di sản văn hóa phong phú.", "FCE_B2", "Lớp 8", "English-Speaking Countries", "unit12", "indigenous culture, indigenous language", "global-success-k12")
]

ALL_NEW_VOCAB = MULTI_SOURCE_VOCAB + ADDITIONAL_CURRICULUM_VOCAB

# ------------------------------------------------------------------------------
# TRÍCH XUẤT TỰ ĐỘNG TỪ KHO TÀI LIỆU GOOGLE DRIVE (.DOCX)
# ------------------------------------------------------------------------------
def get_docx_lines(fn):
    p = os.path.join(GDRIVE_DIR, fn)
    if not os.path.exists(p):
        return []
    try:
        with zipfile.ZipFile(p) as z:
            t = ET.fromstring(z.read('word/document.xml'))
            return [
                ''.join(n.text for n in pr.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if n.text).strip()
                for pr in t.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')
            ]
    except Exception:
        return []

# 1) Trích xuất từ Harold Levine 22,000 Words (IELTS / TOEFL / Academic)
hl_lines = [x for x in get_docx_lines('22000_tu_toefl_ielts_harold_levine.docx') if x]
if hl_lines:
    hl_text = '\n'.join(hl_lines)
    entries = re.split(r'\n(?=\d+\.\s*[A-Za-z])', hl_text)
    hl_pat = re.compile(
        r'^\d+\.\s*([A-Za-z\-\s]{3,25}?)\s*(?:/\s*\d+\s*)?:\s*\[\s*([^\]]+)\s*\]\s*(?:/\s*([^/]+?)\s*/)?\s*=\s*([^\(\n]+)\(\s*([^\)]+)\s*\)(?:\s*Ex\d*:\s*([^\(\n]+)(?:\(\s*([^\)]+)\s*\))?)?',
        re.S
    )
    hl_count = 0
    for e in entries:
        m = hl_pat.search(e.replace('\n', ' '))
        if m:
            w_term = m.group(1).strip().lower()
            w_pos = m.group(2).strip().lower()
            w_ipa = "/" + m.group(3).strip() + "/" if m.group(3) else f"/{w_term}/"
            w_en_def = m.group(4).strip()
            w_vi = m.group(5).strip()
            w_ex_en = (m.group(6) or f"The word '{w_term}' means {w_en_def.lower()}.").strip()
            w_ex_vi = (m.group(7) or f"Nghĩa tiếng Việt: {w_vi}.").strip()
            ALL_NEW_VOCAB.append((
                w_term, w_ipa, w_pos, w_vi, w_ex_en, w_ex_vi,
                "FCE_B2", "Lớp 9", "Academic & IELTS (Harold Levine)", "unit_phrasal_wordform",
                w_en_def[:80], "gdrive-harold-levine-22000"
            ))
            hl_count += 1
    print(f"--> Extracted {hl_count} academic words from Harold Levine .docx")

# 2) Trích xuất từ 3 chuyên đề Từ vựng & Đọc hiểu chuyên sâu (Becoming Independent, Cities & Urbanisation, Our Heritage)
vocab_opt_pat = re.compile(r'^[A-D]\.\s*([a-zA-Z\-]{3,28}(?:\s+[a-zA-Z\-]+)?)\s*\((n|v|adj|adv|np|vp|prep)\)\s*:\s*(.+)$', re.I)
pos_map = {'n': 'noun', 'v': 'verb', 'adj': 'adjective', 'adv': 'adverb', 'np': 'noun phrase', 'vp': 'verb phrase', 'prep': 'preposition'}
docx_sources = [
    ('becoming_independent_vocab.docx', 'Becoming Independent', 'Lớp 8', 'PET_B1', 'unit_workshop', 'gdrive-becoming-independent'),
    ('cities_urbanisation_vocab.docx', 'Cities & Urbanisation', 'Lớp 9', 'FCE_B2', 'unit7', 'gdrive-cities-urbanisation'),
    ('our_heritage_vocab.docx', 'Our Cultural Heritage', 'Lớp 8', 'PET_B1', 'unit_tet_festivals', 'gdrive-our-heritage')
]
gdrive_vocab_count = 0
gdrive_extracted_questions = []

for fn, cat_name, gr_name, cefr_lvl, u_id, repo_tag in docx_sources:
    lines = [x for x in get_docx_lines(fn) if x]
    current_q = None
    for idx, line in enumerate(lines):
        m_opt = vocab_opt_pat.match(line)
        if m_opt:
            w_term = m_opt.group(1).strip().lower()
            w_pos = pos_map.get(m_opt.group(2).strip().lower(), 'noun')
            w_vi = m_opt.group(3).strip().rstrip('.')
            ALL_NEW_VOCAB.append((
                w_term, f"/{w_term}/", w_pos, w_vi,
                f"Mastering the word '{w_term}' is important when discussing {cat_name.lower()}.",
                f"Từ '{w_term}' ({w_vi}) rất quan trọng khi thảo luận chủ đề {cat_name}.",
                cefr_lvl, gr_name, cat_name, u_id, f"{w_term} ({w_pos})", repo_tag
            ))
            gdrive_vocab_count += 1

        # Trích xuất câu hỏi trắc nghiệm từ chuyên đề
        m_q = re.match(r'^Question\s+(\d+)\.\s*(.+)$', line)
        if m_q and '___' in m_q.group(2):
            q_num = int(m_q.group(1))
            q_prompt = m_q.group(2).strip()
            # Tìm dòng A. B. C. D. ngay sau đó
            if idx + 1 < len(lines):
                nxt = lines[idx + 1]
                m_abcd = re.findall(r'[A-D]\.\s*([^A-D]+)', nxt)
                if len(m_abcd) == 4:
                    opts = [o.strip() for o in m_abcd]
                    ans_letter = 'A'
                    expl_lines = []
                    for look in range(idx + 2, min(idx + 12, len(lines))):
                        if lines[look].startswith('Question '):
                            break
                        m_ans = re.search(r'Chọn đáp án\s+([A-D])', lines[look], re.I)
                        if m_ans:
                            ans_letter = m_ans.group(1).upper()
                        if any(lines[look].startswith(p) for p in ('A.', 'B.', 'C.', 'D.', 'Tạm dịch:')):
                            expl_lines.append(lines[look])
                    ans_idx = {'A': 0, 'B': 1, 'C': 2, 'D': 3}.get(ans_letter, 0)
                    ans_val = opts[ans_idx]
                    qid = f"q_{repo_tag.replace('-', '_')}_{q_num}_{len(gdrive_extracted_questions)+1}"
                    gdrive_extracted_questions.append((
                        qid, f"exam_{repo_tag.replace('-', '_')}", q_num,
                        int(re.sub(r'\D', '', gr_name) or 8),
                        "Vocabulary & Reading", "mcq", q_prompt, opts, ans_val,
                        " | ".join(expl_lines) if expl_lines else f"Đáp án đúng: {ans_val}",
                        cefr_lvl
                    ))

print(f"--> Extracted {gdrive_vocab_count} thematic words & {len(gdrive_extracted_questions)} MCQs from GDrive Vocab .docx files!")

vocab_db_path = os.path.join(LIB_DATA_DIR, 'vocabulary_db.json')
cambridge_vocab_path = os.path.join(LIB_DATA_DIR, 'cambridge_vocabulary.json')
words_path = os.path.join(LIB_DATA_DIR, 'words.json')

existing_vocab = json.load(open(vocab_db_path, 'r', encoding='utf-8')) if os.path.exists(vocab_db_path) else []
existing_cambridge = json.load(open(cambridge_vocab_path, 'r', encoding='utf-8')) if os.path.exists(cambridge_vocab_path) else []
existing_words = json.load(open(words_path, 'r', encoding='utf-8')) if os.path.exists(words_path) else []

vocab_by_term = {v['term'].lower().strip(): v for v in existing_vocab if v.get('term')}
cambridge_by_word = {v['word'].lower().strip(): v for v in existing_cambridge if v.get('word')}
words_by_term = {v['term'].lower().strip(): v for v in existing_words if v.get('term')}

for (term, ipa, pos, meaning_vi, ex_en, ex_vi, cefr_tier, grade, category, unit_id, collocations, source_repo) in ALL_NEW_VOCAB:
    k = term.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '_', k).strip('_')
    cefr_short = "C1" if "C1" in cefr_tier else ("B2" if "B2" in cefr_tier else ("B1" if "B1" in cefr_tier else "A2"))
    tier_short = cefr_tier.split('_')[0] if '_' in cefr_tier else "PET"

    v_obj = {
        "id": f"voc_{slug}",
        "term": term,
        "word": term,
        "ipa": ipa,
        "pos": pos,
        "meaning_vi": meaning_vi,
        "phonics_note": f"Phát âm chuẩn Cambridge IPA: {ipa}. Nhấn rõ trọng âm chính và giữ âm cuối.",
        "syllables": f"{term} ({max(1, len(re.findall(r'[aeiouɪʊɔɑɜə]', ipa)))} âm)",
        "vowels_detail": f"Nguyên âm IPA trong {ipa}",
        "consonants_detail": f"Phụ âm cấu thành trong {ipa}",
        "example_en": ex_en,
        "example_vi": ex_vi,
        "collocations": collocations,
        "cambridge_level": cefr_tier,
        "cambridge_tier": tier_short,
        "cefr_level": cefr_short,
        "grade": grade,
        "grade_suitability": grade,
        "category": category,
        "unit_id": unit_id,
        "source_repo": source_repo,
        "difficulty": "hard" if cefr_short in ("B2", "C1") else ("medium" if cefr_short == "B1" else "easy"),
        "created_at": "2026-10-23 20:45:00"
    }
    vocab_by_term[k] = v_obj

    c_obj = {
        "id": f"voc_{slug}",
        "word": term,
        "ipa": ipa,
        "pos": pos,
        "cefr_level": cefr_short,
        "cambridge_tier": tier_short,
        "meaning_vi": meaning_vi,
        "example_en": ex_en,
        "example_vi": ex_vi,
        "collocations": collocations,
        "grade_suitability": grade
    }
    cambridge_by_word[k] = c_obj
    words_by_term[k] = v_obj

# Đảm bảo toàn bộ từ trong vocab_by_term cũng có mặt trong cambridge_by_word để bảng D1 cambridge_vocabulary có đủ 100%
for k, v in vocab_by_term.items():
    if k not in cambridge_by_word:
        slug = re.sub(r'[^a-z0-9]+', '_', k).strip('_')
        lvl = str(v.get('cambridge_level', 'KET_A2'))
        cefr_s = "C1" if "C1" in lvl else ("B2" if "B2" in lvl else ("B1" if "B1" in lvl else "A2"))
        tier_s = lvl.split('_')[0] if '_' in lvl else "KET"
        cambridge_by_word[k] = {
            "id": v.get('id') or f"voc_{slug}",
            "word": v['term'],
            "ipa": v.get('ipa', ''),
            "pos": v.get('pos', 'noun'),
            "cefr_level": cefr_s,
            "cambridge_tier": tier_s,
            "meaning_vi": v.get('meaning_vi', ''),
            "example_en": v.get('example_en', ''),
            "example_vi": v.get('example_vi', ''),
            "collocations": v.get('collocations', ''),
            "grade_suitability": v.get('grade', 'Lớp 7')
        }

final_vocab_list = list(vocab_by_term.values())
final_cambridge_list = list(cambridge_by_word.values())
final_words_list = list(words_by_term.values())

with open(vocab_db_path, 'w', encoding='utf-8') as f:
    json.dump(final_vocab_list, f, ensure_ascii=False, indent=2)
with open(cambridge_vocab_path, 'w', encoding='utf-8') as f:
    json.dump(final_cambridge_list, f, ensure_ascii=False, indent=2)
with open(words_path, 'w', encoding='utf-8') as f:
    json.dump(final_words_list, f, ensure_ascii=False, indent=2)

print(f"[2/6] Enriched Vocabulary: vocabulary_db={len(final_vocab_list)}, cambridge_vocabulary={len(final_cambridge_list)}, words={len(final_words_list)}")

# ==============================================================================
# 3. LÀM GIÀU BẢNG GRAMMAR_TOPICS (Thêm chuyên đề Thuyết trình Workshop, Dã ngoại, HSG)
# ==============================================================================
grammar_path = os.path.join(LIB_DATA_DIR, 'grammar_topics.json')
existing_grammar = json.load(open(grammar_path, 'r', encoding='utf-8')) if os.path.exists(grammar_path) else []
grammar_by_id = {g['id']: g for g in existing_grammar if g.get('id')}

NEW_GRAMMAR_TOPICS = [
    {
        "id": "gram_workshop_signposting",
        "topic": "Signposting Language in English Presentations & Workshops (Ngôn ngữ dẫn dắt thuyết trình)",
        "grade_level": "Lớp 7 • Lớp 8 • Lớp 9",
        "curriculum_unit": "Unit Workshop & Public Speaking",
        "category": "Speaking & Communication",
        "cefr_level": "B1",
        "summary": "Hệ thống mẫu câu mở bài, chuyển ý, nhấn mạnh số liệu và kết luận chuẩn học thuật khi thuyết trình hoặc điều phối buổi Workshop tiếng Anh.",
        "formula_json": json.dumps([
            "Opening: Good morning everyone. Today, I'd like to share our findings on + [Topic].",
            "Structuring: I've divided my presentation into three main parts: First..., Second..., Finally...",
            "Transitioning: Let's move on to the next point, which is + [Noun Phrase].",
            "Concluding: To sum up / In conclusion, our key takeaway is that + [Clause]."
        ], ensure_ascii=False),
        "usage_json": json.dumps([
            "Dùng để mở đầu bài nói thu hút sự chú ý (Hook) trong buổi Workshop / CLB Tiếng Anh.",
            "Giúp người nghe theo dõi mạch lập luận rõ ràng khi chuyển giữa các phần.",
            "Dùng khi mời khán giả đặt câu hỏi phần Q&A (Feel free to ask any questions)."
        ], ensure_ascii=False),
        "signal_words_json": json.dumps(["To begin with", "Moving on to", "Let's take a closer look at", "To wrap up"], ensure_ascii=False),
        "phonics_rules": "Nhấn giọng (sentence stress) vào từ khóa chuyển ý và nghỉ nhịp 0.5 giây sau dấu phẩy.",
        "common_mistakes": "Tránh đọc thuộc lòng văn viết; hãy dùng các cụm từ nối ngắn gọn kèm giao tiếp ánh mắt (eye contact).",
        "examples_json": json.dumps([
            {"en": "Let's move on to our second solution: reducing single-use plastic during school picnics.", "vi": "Hãy chuyển sang giải pháp thứ hai của chúng tôi: giảm nhựa dùng một lần trong các buổi dã ngoại trường."},
            {"en": "To wrap up, teamwork and active listening are the keys to a successful workshop.", "vi": "Tóm lại, làm việc nhóm và lắng nghe tích cực là chìa khóa cho một buổi workshop thành công."}
        ], ensure_ascii=False),
        "practice_questions_json": json.dumps([
            {"q": "Which phrase is best for moving to a new section in a workshop presentation?", "options": ["Let's move on to the next point.", "Wait a minute.", "Never mind that.", "By the way, goodbye."], "ans": "Let's move on to the next point."}
        ], ensure_ascii=False)
    },
    {
        "id": "gram_debate_opinion",
        "topic": "Expressing Agreement, Polite Disagreement & Rebuttal in Debates (Phản biện lịch sự)",
        "grade_level": "Lớp 7 • Lớp 8 • Lớp 9",
        "curriculum_unit": "Unit Workshop & Debate",
        "category": "Speaking & Communication",
        "cefr_level": "B1-B2",
        "summary": "Cấu trúc nêu quan điểm cá nhân, đồng tình một phần và phản biện lịch sự nhưng sắc bén trong thảo luận nhóm (Teamwork) và tranh biện (Debate).",
        "formula_json": json.dumps([
            "Stating Opinion: From my perspective / As far as I'm concerned, + S + V.",
            "Partial Agreement: I see your point, but have you considered + [N / V-ing]?",
            "Polite Rebuttal: While it is true that [Clause 1], the evidence shows that [Clause 2]."
        ], ensure_ascii=False),
        "usage_json": json.dumps([
            "Sử dụng trong phần tranh biện (Debate) hoặc thảo luận nhóm tại Workshop.",
            "Giúp bác bỏ lập luận đối phương một cách văn minh, tôn trọng và thuyết phục."
        ], ensure_ascii=False),
        "signal_words_json": json.dumps(["I see your point, However", "On the contrary", "From my perspective", "The evidence suggests"], ensure_ascii=False),
        "phonics_rules": "Hạ giọng ấm và điềm tĩnh ở vế công nhận ('I see your point'), nhấn rõ trọng âm ở vế phản biện.",
        "common_mistakes": "Không nói thẳng 'You are wrong!' trong tranh biện học thuật; hãy dùng 'I beg to differ' hoặc 'I see your point, however...'.",
        "examples_json": json.dumps([
            {"en": "I see your point about convenience, but biodegradable plates are much better for our campsite.", "vi": "Tôi hiểu ý bạn về sự tiện lợi, nhưng đĩa tự phân hủy sinh học tốt hơn nhiều cho khu cắm trại của chúng ta."}
        ], ensure_ascii=False),
        "practice_questions_json": json.dumps([
            {"q": "Choose the most polite way to disagree during an English workshop:", "options": ["I see your point, but I think we should consider another angle.", "You are completely wrong.", "That makes no sense.", "Stop talking."], "ans": "I see your point, but I think we should consider another angle."}
        ], ensure_ascii=False)
    },
    {
        "id": "gram_outdoor_suggestions",
        "topic": "Making Suggestions, Invitations & Safety Rules for Outdoor Trips (Đề xuất & Nội quy Dã ngoại)",
        "grade_level": "Lớp 6 • Lớp 7 • Lớp 8",
        "curriculum_unit": "Unit Outdoor Picnic & Eco-Trip",
        "category": "Modal Verbs & Functional English",
        "cefr_level": "A2-B1",
        "summary": "Các cấu trúc rủ bạn bè, đề xuất hoạt động dã ngoại (How about, Let's, Why don't we, Shall we) và động từ khuyết thiếu chỉ quy tắc an toàn (must, mustn't, should, ought to).",
        "formula_json": json.dumps([
            "Suggestion 1: How about / What about + V-ing + ...?",
            "Suggestion 2: Why don't we / Shall we + V (bare infinitive) + ...?",
            "Safety Rule: Campers must + V / mustn't + V (e.g., mustn't litter or leave campfires unattended)."
        ], ensure_ascii=False),
        "usage_json": json.dumps([
            "Dùng khi lên kế hoạch chuyến đi dã ngoại (Picnic Itinerary) cùng cả lớp.",
            "Dùng để phổ biến quy tắc an toàn và bảo vệ môi trường tại khu cắm trại."
        ], ensure_ascii=False),
        "signal_words_json": json.dumps(["How about", "Shall we", "Let's", "mustn't", "ought to"], ensure_ascii=False),
        "phonics_rules": "Lên giọng nhẹ ở cuối câu hỏi đề xuất (Shall we pitch the tent near the lake? ↗).",
        "common_mistakes": "Sau 'How about / What about' phải dùng V-ing (How about going kayaking?), không dùng V nguyên thể.",
        "examples_json": json.dumps([
            {"en": "How about organizing an English scavenger hunt in the botanical garden?", "vi": "Hay là chúng mình tổ chức trò truy tìm mật thư tiếng Anh trong vườn bách thảo nhé?"},
            {"en": "All students must bring a reusable water bottle and mustn't litter on the trail.", "vi": "Tất cả học sinh phải mang bình nước tái sử dụng và không được xả rác trên đường mòn."}
        ], ensure_ascii=False),
        "practice_questions_json": json.dumps([
            {"q": "How about _______ a tent near the lake before sunset?", "options": ["pitching", "pitch", "to pitch", "pitched"], "ans": "pitching"}
        ], ensure_ascii=False)
    },
    {
        "id": "gram_phrasal_verbs_mastery",
        "topic": "Separable & Inseparable Phrasal Verbs (Cụm động từ tách được & không tách được — Trọng tâm HSG & PET)",
        "grade_level": "Lớp 7 • Lớp 8 • Lớp 9",
        "curriculum_unit": "Chuyên đề Phrasal Verbs",
        "category": "Lexical Grammar",
        "cefr_level": "B1-B2",
        "summary": "Phân biệt cụm động từ có thể đặt tân ngữ ở giữa (turn it down, put it off) và cụm động từ 3 thành phần không thể tách rời (look forward to, come up with, keep up with).",
        "formula_json": json.dumps([
            "Separable: Verb + Object (Pronoun) + Particle (e.g., turn it down, pick her up).",
            "Inseparable: Verb + Particle (+ Preposition) + Object (e.g., look after the puppy, come up with an idea)."
        ], ensure_ascii=False),
        "usage_json": json.dumps([
            "Khi tân ngữ là đại từ nhân xưng (it, them, him, her) của ngoại cụm động từ tách được, BẮT BUỘC đặt đại từ vào giữa (Turn it off, KHÔNG nói Turn off it).",
            "Sau các cụm 3 từ kết thúc bằng giới từ (look forward to, put up with), động từ theo sau luôn ở dạng V-ing."
        ], ensure_ascii=False),
        "signal_words_json": json.dumps(["look forward to + V-ing", "come up with", "carry out", "set off", "turn down"], ensure_ascii=False),
        "phonics_rules": "Trong Phrasal Verbs, trọng âm thường rơi vào tiểu từ (particle): turn ˈDOWN, set ˈOFF.",
        "common_mistakes": "Nhầm 'to' trong 'look forward to' là to-infinitive; thực chất 'to' là giới từ nên theo sau là V-ing.",
        "examples_json": json.dumps([
            {"en": "We are looking forward to attending the Halloween costume gala.", "vi": "Chúng tôi đang rất háo hức được tham dự đêm hội hóa trang Halloween."}
        ], ensure_ascii=False),
        "practice_questions_json": json.dumps([
            {"q": "The music is too loud. Could you please _______?", "options": ["turn it down", "turn down it", "it turn down", "turning down it"], "ans": "turn it down"}
        ], ensure_ascii=False)
    },
    {
        "id": "gram_word_formation_affixes",
        "topic": "Word Formation: Prefixes & Suffixes (Cấu tạo từ: Tiền tố & Hậu tố trong đề thi HSG)",
        "grade_level": "Lớp 7 • Lớp 8 • Lớp 9",
        "curriculum_unit": "Chuyên đề Word Formation",
        "category": "Lexical Grammar",
        "cefr_level": "B1-B2",
        "summary": "Quy tắc biến đổi từ loại bằng hậu tố danh từ (-tion, -ment, -ness, -ity), tính từ (-ful, -less, -able, -ive, -ous), trạng từ (-ly) và tiền tố phủ định (un-, in-, im-, il-, ir-, dis-, mis-).",
        "formula_json": json.dumps([
            "Verb -> Noun: educate -> education, manage -> management, persevere -> perseverance",
            "Noun -> Adj: nature -> natural, danger -> dangerous, eco -> ecological",
            "Negative Prefixes: possible -> impossible, regular -> irregular, biodegradable <-> non-biodegradable"
        ], ensure_ascii=False),
        "usage_json": json.dumps([
            "Xác định từ loại cần điền vào chỗ trống dựa vào vị trí ngữ pháp (sau mạo từ a/an/the + Adj + Noun; sau động từ thường + Adv)."
        ], ensure_ascii=False),
        "signal_words_json": json.dumps(["-tion / -sion", "-ment", "-able / -ible", "un- / im- / ir-"], ensure_ascii=False),
        "phonics_rules": "Các từ có hậu tố -tion, -sion, -ic luôn nhận trọng âm ở âm tiết ngay trước hậu tố đó (e.g., eduˈcation, паnoˈramic).",
        "common_mistakes": "Quên đổi tính từ sang dạng phủ định khi câu mang nghĩa trái ngược (unforgettable, impatient).",
        "examples_json": json.dumps([
            {"en": "The outdoor workshop was an unforgettable experience for all participants.", "vi": "Buổi workshop ngoài trời là một trải nghiệm không thể nào quên đối với mọi người tham gia."}
        ], ensure_ascii=False),
        "practice_questions_json": json.dumps([
            {"q": "Using _______ (BIODEGRADE) bags helps protect our national parks during picnics.", "options": ["biodegradable", "biodegrade", "biodegradably", "degradation"], "ans": "biodegradable"}
        ], ensure_ascii=False)
    }
]

for g in NEW_GRAMMAR_TOPICS:
    grammar_by_id[g['id']] = g

final_grammar_list = list(grammar_by_id.values())
with open(grammar_path, 'w', encoding='utf-8') as f:
    json.dump(final_grammar_list, f, ensure_ascii=False, indent=2)
print(f"[3/6] Enriched Grammar Topics: {len(final_grammar_list)} topics.")

# ==============================================================================
# 4. LÀM GIÀU BẢNG QUESTIONS (Thêm bộ câu hỏi Halloween, Đi Dã Ngoại, Workshop, Phrasal Verbs)
# ==============================================================================
questions_path = os.path.join(LIB_DATA_DIR, 'questions.json')
existing_questions = json.load(open(questions_path, 'r', encoding='utf-8')) if os.path.exists(questions_path) else []
questions_by_id = {q['id']: q for q in existing_questions if q.get('id')}

THEMATIC_QUESTIONS = [
    # 🎃 Halloween Theme Questions
    ("q_hw_01", "exam_halloween_2026", 1, 7, "Vocabulary", "mcq", "On Halloween night, children carve a glowing face into a pumpkin to make a _______.", ["jack-o'-lantern", "picnic hamper", "sleeping bag", "solar panel"], "jack-o'-lantern", "Jack-o'-lantern là đèn lồng bí ngô được khắc mặt và thắp sáng vào dịp lễ Halloween.", "KET_A2"),
    ("q_hw_02", "exam_halloween_2026", 2, 7, "Vocabulary", "mcq", "Kids dressed up as wizards and superheroes go from door to door shouting '_______!'", ["Trick or treat", "Break the ice", "Pitch a tent", "Fasten your seatbelt"], "Trick or treat", "'Trick or treat!' (Cho kẹo hay bị ghẹo) là câu nói truyền thống khi trẻ em đi xin kẹo đêm Halloween.", "KET_A2"),
    ("q_hw_03", "exam_halloween_2026", 3, 7, "Vocabulary", "mcq", "Our English club is organizing a Halloween _______ party where everyone wears creative outfits.", ["costume", "uniform", "itinerary", "roundabout"], "costume", "Costume party là bữa tiệc hóa trang.", "KET_A2"),
    ("q_hw_04", "exam_halloween_2026", 4, 8, "Reading & Grammar", "mcq", "_______ the haunted house had spooky sound effects, all the students enjoyed exploring it together.", ["Although", "Despite", "Because of", "However"], "Although", "Although + mệnh đề (S + V): Mặc dù ngôi nhà ma có hiệu ứng âm thanh rùng rợn, các bạn học sinh vẫn rất thích khám phá.", "PET_B1"),
    ("q_hw_05", "exam_halloween_2026", 5, 8, "Vocabulary", "mcq", "The storyteller gave a _______ performance of an ancient autumn legend by candlelight.", ["spellbinding", "biodegradable", "hydroelectric", "pedestrian"], "spellbinding", "Spellbinding (adj): cuốn hút, hấp dẫn như có phép thuật.", "FCE_B2"),

    # 🏕️ Outdoor Picnic & Eco-Trip Questions
    ("q_picnic_01", "exam_picnic_2026", 1, 7, "Vocabulary", "mcq", "Before dark, our team worked together to _______ a waterproof tent near the lake.", ["pitch", "carve", "stir", "narrate"], "pitch", "Cụm từ cố định (collocation): 'pitch a tent' = dựng lều trại.", "PET_B1"),
    ("q_picnic_02", "exam_picnic_2026", 2, 7, "Vocabulary", "mcq", "During the outdoor orienteering game, we used a magnetic _______ and a map to find north.", ["compass", "cauldron", "broomstick", "soundtrack"], "compass", "Magnetic compass là chiếc la bàn từ tính dùng để xác định phương hướng khi đi dã ngoại.", "KET_A2"),
    ("q_picnic_03", "exam_picnic_2026", 3, 7, "Vocabulary", "mcq", "To protect the national park environment, our class only used _______ paper plates and cups.", ["biodegradable", "supernatural", "hilarious", "impromptu"], "biodegradable", "Biodegradable (adj): có khả năng tự phân hủy sinh học, thân thiện với môi trường.", "FCE_B2"),
    ("q_picnic_04", "exam_picnic_2026", 4, 7, "Communication", "mcq", "Lan: 'How about organizing an English scavenger hunt in the botanical garden this Sunday?' — Minh: '_______'", ["That sounds like a fantastic idea! Count me in.", "Yes, I went there yesterday.", "No, I don't have a ticket to the cinema.", "You're welcome."], "That sounds like a fantastic idea! Count me in.", "Đáp lại lời rủ/đề xuất (How about + V-ing) một cách hào hứng: 'Ý tưởng tuyệt đấy! Cho mình tham gia với.'", "PET_B1"),
    ("q_picnic_05", "exam_picnic_2026", 5, 8, "Phrasal Verbs", "mcq", "Our school excursion bus will _______ from the main gate at 6:30 a.m. tomorrow, so please arrive on time.", ["set off", "turn down", "put off", "run out of"], "set off", "Set off (phrasal verb) = khởi hành, lên đường.", "PET_B1"),

    # 🎙️ English Speaking & Teamwork Workshop Questions
    ("q_ws_01", "exam_workshop_2026", 1, 7, "Vocabulary", "mcq", "We started the workshop with a fun ten-minute _______ activity so everyone could get to know each other.", ["ice-breaker", "seatbelt", "carbon footprint", "boarding pass"], "ice-breaker", "Ice-breaker là hoạt động/trò chơi khởi động phá băng giúp các thành viên làm quen đầu buổi workshop.", "PET_B1"),
    ("q_ws_02", "exam_workshop_2026", 2, 8, "Vocabulary", "mcq", "Maintaining natural _______ and open body language helps you connect with your audience during a speech.", ["eye contact", "traffic congestion", "lucky money", "water puppetry"], "eye contact", "Maintain eye contact: duy trì giao tiếp bằng ánh mắt với khán giả.", "PET_B1"),
    ("q_ws_03", "exam_workshop_2026", 3, 8, "Vocabulary", "mcq", "During the brainstorming session, Mai _______ a creative idea for our community library project.", ["came up with", "ran out of", "looked down on", "turned off"], "came up with", "Come up with an idea/solution: nảy ra, nghĩ ra một ý tưởng hoặc giải pháp.", "PET_B1"),
    ("q_ws_04", "exam_workshop_2026", 4, 8, "Communication", "mcq", "In a debate workshop, which expression is the most polite way to introduce a counter-argument?", ["I see your point, but have you considered the environmental cost?", "Your idea is totally wrong and silly.", "Stop speaking right now.", "I don't care what you think."], "I see your point, but have you considered the environmental cost?", "Trong tranh biện học thuật, dùng 'I see your point, but...' thể hiện sự tôn trọng trước khi đưa ra phản biện.", "FCE_B2"),
    ("q_ws_05", "exam_workshop_2026", 5, 9, "Vocabulary", "mcq", "After each team presentation, the workshop facilitator gave _______ feedback to help students improve.", ["constructive", "indigenous", "hydroelectric", "eerie"], "constructive", "Constructive feedback: những nhận xét, góp ý mang tính xây dựng.", "FCE_B2")
]

for (qid, exid, qidx, grade, skill, qtype, prompt, opts, ans, expl, lvl) in (THEMATIC_QUESTIONS + gdrive_extracted_questions):
    questions_by_id[qid] = {
        "id": qid,
        "exam_id": exid,
        "question_index": qidx,
        "grade": grade,
        "skill": skill,
        "type": qtype,
        "prompt": prompt,
        "options_json": json.dumps(opts, ensure_ascii=False),
        "correct_answer": ans,
        "explanation": expl,
        "cambridge_level": lvl
    }

final_questions_list = list(questions_by_id.values())
with open(questions_path, 'w', encoding='utf-8') as f:
    json.dump(final_questions_list, f, ensure_ascii=False, indent=2)
print(f"[4/6] Enriched Questions Bank: {len(final_questions_list)} questions.")

# ==============================================================================
# 5. LÀM GIÀU TEACHING_RESOURCES (Kịch bản Tổ chức Dã ngoại, Halloween & Workshop)
# ==============================================================================
resources_path = os.path.join(LIB_DATA_DIR, 'teaching_resources.json')
existing_resources = json.load(open(resources_path, 'r', encoding='utf-8')) if os.path.exists(resources_path) else []
res_by_id = {r['id']: r for r in existing_resources if r.get('id')}

NEW_TEACHING_RESOURCES = [
    {
        "id": "res_halloween_event_guide",
        "category": "Event & Festival Lesson Plan",
        "grade_level": "Lớp 6 • Lớp 7 • Lớp 8",
        "title": "🎃 Kịch Bản Tổ Chức Sự Kiện Halloween: 'Spooky Vocabulary Hunt & Costume Showcase'",
        "content_markdown": "## 1. Mục tiêu sự kiện (90 phút)\n- Học sinh nắm vững 25 từ vựng chủ đề Halloween & Lễ hội thế giới.\n- Thực hành thuyết trình 60 giây giới thiệu nhân vật hóa trang bằng tiếng Anh (Costume Showcase).\n\n## 2. Tiến trình 4 Trạm (4 Stations)\n1. **Station 1 - Mystery Cauldron (15p)**: Bốc thẻ từ vựng trong chiếc vạc phép thuật, phát âm chuẩn IPA để nhận 20 Sao.\n2. **Station 2 - Haunted House Riddle Hunt (25p)**: Giải 10 câu đố tiếng Anh theo nhóm 4 học sinh.\n3. **Station 3 - Costume Runway & Impromptu Speaking (30p)**: Mỗi học sinh bước lên sân khấu trả lời câu hỏi *'Who are you dressed as today and what is your superpower?'*\n4. **Station 4 - Trick-or-Treat Star Exchange (20p)**: Đổi Sao nhận quà và tổng kết.",
        "native_teacher_tips": "Encourage expressive intonation during the Costume Showcase and reward every student who uses at least three Halloween adjectives (spooky, enchanted, spellbinding).",
        "keywords": "halloween, costume party, trick or treat, event lesson plan, spooky quiz",
        "downloads_url": "/dictionary?q=halloween",
        "created_at": "2026-10-23"
    },
    {
        "id": "res_outdoor_picnic_guide",
        "category": "Outdoor Field Trip & Picnic SOP",
        "grade_level": "Lớp 6 • Lớp 7 • Lớp 8 • Lớp 9",
        "title": "🏕️ Cẩm Nang Tổ Chức Đi Dã Ngoại Tiếng Anh: 'Eco-Picnic & Park Scavenger Hunt'",
        "content_markdown": "## 1. Chuẩn bị trước chuyến đi (Pre-Trip Checklist)\n- Chia học sinh thành các đội 5-6 thành viên (mỗi đội bầu 1 Team Captain, 1 Navigator cầm la bàn/bản đồ, 1 Eco-Guardian kiểm soát rác thải sinh học, 1 Reporter).\n- Phát thẻ nhiệm vụ **English Scavenger Hunt Card**.\n\n## 2. Hoạt động thực địa (On-Site Activities)\n1. **Ice-Breaker Circle (15p)**: Trò chơi phản xạ từ vựng thiên nhiên (*campsite, binoculars, flora and fauna*).\n2. **Compass & Nature Clue Hunt (45p)**: Các đội tìm 8 trạm mật thư tiếng Anh quanh công viên và quay video 1 phút thuyết trình tại mỗi trạm.\n3. **Eco-Picnic Sharing (30p)**: Giới thiệu món ăn trong *picnic hamper* bằng tiếng Anh.",
        "native_teacher_tips": "Have the Reporter of each team record a 90-second vlog summary at the end of the picnic using signposting phrases.",
        "keywords": "picnic, outdoor trip, scavenger hunt, camping, eco-tourism, field trip",
        "downloads_url": "/dictionary?q=picnic",
        "created_at": "2026-10-23"
    },
    {
        "id": "res_speaking_workshop_sop",
        "category": "Speaking & Debate Workshop",
        "grade_level": "Lớp 7 • Lớp 8 • Lớp 9",
        "title": "🎙️ Giáo Án Workshop Kỹ Năng Thuyết Trình, Brainstorming & Tranh Biện (Cambridge PET/IELTS)",
        "content_markdown": "## 1. Cấu trúc buổi Workshop (120 phút)\n- **Phần 1 (20p): Ice-breaker & Voice Warm-up** — Luyện ngữ điệu (intonation), giao tiếp ánh mắt (*eye contact*) và ngôn ngữ cơ thể (*body language*).\n- **Phần 2 (30p): Mind-Mapping & Brainstorming** — Các nhóm dùng sơ đồ tư duy giải quyết chủ đề thực tế (VD: *How to make our city greener*).\n- **Phần 3 (45p): Mini-Debate & Rebuttal Showcase** — Tranh biện 3v3 có sử dụng mẫu câu phản biện lịch sự (*I see your point, however...*).\n- **Phần 4 (25p): Constructive Peer Review** — Chấm chéo và trao huy hiệu *Best Orator*.",
        "native_teacher_tips": "Focus on fluency over perfection during the brainstorming phase, then give targeted pronunciation and lexical feedback during the wrap-up.",
        "keywords": "workshop, public speaking, debate, brainstorming, teamwork, presentation",
        "downloads_url": "/dictionary?q=workshop",
        "created_at": "2026-10-23"
    }
]

for r in NEW_TEACHING_RESOURCES:
    res_by_id[r['id']] = r

final_res_list = list(res_by_id.values())
with open(resources_path, 'w', encoding='utf-8') as f:
    json.dump(final_res_list, f, ensure_ascii=False, indent=2)
print(f"[5/6] Enriched Teaching Resources: {len(final_res_list)} resources.")

# ==============================================================================
# 6. ĐỒNG BỘ SQLITE LOCAL (data/tienganh7.db)
# ==============================================================================
if os.path.exists(DB_PATH):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    for u in FULL_UNITS:
        cur.execute("INSERT OR REPLACE INTO units (id, name, description, icon) VALUES (?, ?, ?, ?)",
                    (u['id'], u['name'], u['description'], u['icon']))
    for v in final_vocab_list:
        cur.execute("""
            INSERT OR REPLACE INTO words (
                id, term, ipa, pos, meaning_vi, vowels_detail, consonants_detail,
                phonics_note, syllables, example_en, example_vi, unit_id,
                grade, cambridge_level, difficulty, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            v['id'], v['term'], v.get('ipa', ''), v.get('pos', 'noun'), v.get('meaning_vi', ''),
            v.get('vowels_detail', ''), v.get('consonants_detail', ''), v.get('phonics_note', ''),
            v.get('syllables', ''), v.get('example_en', ''), v.get('example_vi', ''),
            v.get('unit_id', 'unit1'), v.get('grade', 'Lớp 7'), v.get('cambridge_level', 'KET_A2'),
            v.get('difficulty', 'medium'), v.get('category', 'Vocabulary')
        ))
    conn.commit()
    conn.close()
    print(f"[6/6] Synced local SQLite data/tienganh7.db successfully.")

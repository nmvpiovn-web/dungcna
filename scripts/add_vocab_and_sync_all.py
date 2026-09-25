import os
import sys
import json
import re
import sqlite3
import zipfile

sys.stdout.reconfigure(encoding='utf-8')

print("=== SCRIPT: ADD VOCABULARY & SYNC SQLITE + OBSIDIAN VAULT ===")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
LIB_DATA_DIR = os.path.join(BASE_DIR, 'src', 'lib', 'data')
SECOND_BRAIN_DIR = os.path.join(BASE_DIR, 'second_brain')
STATIC_DOWNLOADS = os.path.join(BASE_DIR, 'static', 'downloads')
DB_PATH = os.path.join(DATA_DIR, 'tienganh7.db')

vocab_path = os.path.join(LIB_DATA_DIR, 'vocabulary_db.json')
with open(vocab_path, 'r', encoding='utf-8') as f:
    vocab_list = json.load(f)

vocab_dict = {v['term'].lower().strip(): v for v in vocab_list if v.get('term')}

new_words = [
    ("notebook", "/ˈnəʊt.bʊk/", "noun", "Vở ghi bài, sổ tay học tập", "I write new English grammar rules carefully in my notebook.", "Tôi ghi chép các quy tắc ngữ pháp tiếng Anh cẩn thận vào vở của mình.", "Starters_PreA1", "Lớp 3", "School Supplies", "unit_school", "note-book (2 âm tiết)", "/əʊ/, /ʊ/", "/n/, /t/, /b/, /k/"),
    ("backpack", "/ˈbæk.pæk/", "noun", "Ba lô, cặp sách đi học", "He packed his textbooks and pencil case into his sturdy backpack.", "Cậu ấy xếp sách giáo khoa và bóp viết vào chiếc ba lô chắc chắn.", "Starters_PreA1", "Lớp 3", "School Supplies", "unit_school", "back-pack (2 âm tiết)", "/æ/, /æ/", "/b/, /k/, /p/, /k/"),
    ("pencil case", "/ˈpen.səl keɪs/", "noun phrase", "Hộp bút, bóp đựng viết", "Her pencil case contains colorful pens, erasers, and highlighters.", "Hộp bút của cô ấy có nhiều bút màu, cục tẩy và bút dạ quang.", "Starters_PreA1", "Lớp 3", "School Supplies", "unit_school", "pen-cil case (3 âm tiết)", "/e/, /əl/, /eɪ/", "/p/, /n/, /s/, /k/, /s/"),
    ("eraser", "/ɪˈreɪ.zər/", "noun", "Cục tẩy, cục gôm", "Can I borrow your eraser to correct this pencil sketch?", "Tôi có thể mượn cục tẩy của bạn để sửa bức phác thảo bút chì này không?", "Starters_PreA1", "Lớp 3", "School Supplies", "unit_school", "e-ras-er (3 âm tiết)", "/ɪ/, /eɪ/, /ər/", "/r/, /z/"),
    ("sharpener", "/ˈʃɑː.pən.ər/", "noun", "Gọt bút chì, đồ chuốt bút", "The pencil sharpener makes the graphite point sharp for drawing.", "Chiếc gọt bút chì giúp ngòi chì sắc nhọn để vẽ tranh.", "Starters_PreA1", "Lớp 3", "School Supplies", "unit_school", "sharp-en-er (3 âm tiết)", "/ɑː/, /ə/, /ər/", "/ʃ/, /p/, /n/"),
    ("ruler", "/ˈruː.lər/", "noun", "Thước kẻ", "Use a 30-centimeter ruler to draw a straight geometry line.", "Dùng thước kẻ 30 cm để vẽ đường thẳng hình học.", "Starters_PreA1", "Lớp 3", "School Supplies", "unit_school", "rul-er (2 âm tiết)", "/uː/, /ər/", "/r/, /l/"),
    ("lunchbox", "/ˈlʌntʃ.bɒks/", "noun", "Hộp đựng cơm trưa", "My mother prepared healthy rice and vegetables in my lunchbox.", "Mẹ tôi chuẩn bị cơm và rau củ tốt cho sức khỏe trong hộp cơm trưa của tôi.", "Movers_A1", "Lớp 4", "School Life", "unit_school", "lunch-box (2 âm tiết)", "/ʌ/, /ɒ/", "/l/, /ntʃ/, /b/, /ks/"),
    ("water bottle", "/ˈwɔː.tər ˌbɒt.əl/", "noun phrase", "Bình đựng nước cá nhân", "Students should bring a reusable water bottle to school daily.", "Học sinh nên mang theo bình nước tái sử dụng đến trường hàng ngày.", "Movers_A1", "Lớp 4", "School Life", "unit_school", "wa-ter bot-tle (4 âm tiết)", "/ɔː/, /ər/, /ɒ/, /əl/", "/w/, /t/, /b/, /t/, /l/"),
    ("blackboard", "/ˈblæk.bɔːd/", "noun", "Bảng đen viết phấn", "The teacher wrote key vocabulary phrases clearly on the blackboard.", "Thầy giáo viết các cụm từ vựng quan trọng rõ ràng lên bảng đen.", "Movers_A1", "Lớp 4", "Classroom", "unit_school", "black-board (2 âm tiết)", "/æ/, /ɔː/", "/bl/, /k/, /b/, /d/"),
    ("chalk", "/tʃɔːk/", "noun", "Phấn viết bảng", "Dustless chalk helps keep the primary classroom air clean.", "Phấn không bụi giúp giữ cho không khí lớp học tiểu học trong lành.", "Movers_A1", "Lớp 4", "Classroom", "unit_school", "chalk (1 âm tiết)", "/ɔː/", "/tʃ/, /k/"),
    ("computer lab", "/kəmˈpjuː.tər læb/", "noun phrase", "Phòng máy vi tính, phòng thực hành tin học", "We learn scratch programming and word processing in the computer lab.", "Chúng tôi học lập trình Scratch và soạn thảo văn bản trong phòng máy tính.", "KET_A2", "Lớp 6", "School Facilities", "unit_school", "com-put-er lab (4 âm tiết)", "/ə/, /uː/, /ər/, /æ/", "/k/, /m/, /pj/, /t/, /l/, /b/"),
    ("music room", "/ˈmjuː.zɪk ruːm/", "noun phrase", "Phòng học âm nhạc", "The school music room has violins, recorders, and an acoustic piano.", "Phòng âm nhạc của trường có đàn vĩ cầm, sáo dọc và đàn piano cơ.", "KET_A2", "Lớp 6", "School Facilities", "unit_school", "mu-sic room (3 âm tiết)", "/uː/, /ɪ/, /uː/", "/mj/, /z/, /k/, /r/, /m/"),
    ("gymnasium", "/dʒɪmˈneɪ.zi.əm/", "noun", "Nhà thi đấu thể thao, nhà đa năng", "Badminton and basketball practices take place in the spacious gymnasium.", "Các buổi tập cầu lông và bóng rổ diễn ra trong nhà thi đấu rộng rãi.", "KET_A2", "Lớp 7", "School Facilities", "unit_school", "gym-na-si-um (4 âm tiết)", "/ɪ/, /eɪ/, /i/, /əm/", "/dʒ/, /m/, /n/, /z/, /m/"),
    ("school library", "/skuːl ˈlaɪ.brər.i/", "noun phrase", "Thư viện trường học", "The school library contains thousands of fiction books and science journals.", "Thư viện trường học có hàng ngàn đầu sách truyện và tạp chí khoa học.", "KET_A2", "Lớp 6", "School Facilities", "unit_school", "school li-brar-y (4 âm tiết)", "/uː/, /aɪ/, /ə/, /i/", "/sk/, /l/, /l/, /br/, /r/"),
    ("school canteen", "/skuːl kænˈtiːn/", "noun phrase", "Căng tin nhà ăn trường học", "Students enjoy nutritious snacks and fruit juice at the school canteen.", "Học sinh thưởng thức đồ ăn nhẹ bổ dưỡng và nước ép trái cây tại căng tin trường.", "KET_A2", "Lớp 6", "School Facilities", "unit_school", "school can-teen (3 âm tiết)", "/uː/, /æ/, /iː/", "/sk/, /l/, /k/, /n/, /t/, /n/"),
    ("school yard", "/skuːl jɑːd/", "noun phrase", "Sân trường rợp bóng cây", "Children play tag and jump rope beneath shady trees in the school yard.", "Trẻ em chơi đuổi bắt và nhảy dây dưới bóng cây râm mát ở sân trường.", "Flyers_A2", "Lớp 5", "School Facilities", "unit_school", "school yard (2 âm tiết)", "/uː/, /ɑː/", "/sk/, /l/, /j/, /d/"),
    ("homeroom teacher", "/ˈhəʊm.ruːm ˈtiː.tʃər/", "noun phrase", "Giáo viên chủ nhiệm", "Our homeroom teacher guides us with warmth, care, and great dedication.", "Giáo viên chủ nhiệm hướng dẫn chúng tôi bằng sự ấm áp, quan tâm và tận tụy.", "KET_A2", "Lớp 7", "School Community", "unit_school", "home-room teach-er (4 âm tiết)", "/əʊ/, /uː/, /iː/, /ər/", "/h/, /m/, /r/, /m/, /t/, /tʃ/"),
    ("class monitor", "/klɑːs ˈmɒn.ɪ.tər/", "noun phrase", "Lớp trưởng gương mẫu", "The class monitor helps maintain order and collects homework assignments.", "Lớp trưởng giúp giữ trật tự và thu các bài tập về nhà.", "KET_A2", "Lớp 7", "School Community", "unit_school", "class mon-i-tor (4 âm tiết)", "/ɑː/, /ɒ/, /ɪ/, /ər/", "/kl/, /s/, /m/, /n/, /t/"),
    ("school uniform", "/skuːl ˈjuː.nɪ.fɔːm/", "noun phrase", "Đồng phục học sinh", "Wearing a neat school uniform creates equality and solidarity among pupils.", "Mặc đồng phục học sinh chỉnh tề tạo nên sự bình đẳng và đoàn kết giữa học trò.", "KET_A2", "Lớp 6", "School Life", "unit_school", "school u-ni-form (4 âm tiết)", "/uː/, /uː/, /ɪ/, /ɔː/", "/sk/, /l/, /j/, /n/, /f/, /m/"),
    ("timetable", "/ˈtaɪmˌteɪ.bəl/", "noun", "Thời khóa biểu học tập", "Check the weekly timetable to know which textbooks to bring tomorrow.", "Hãy kiểm tra thời khóa biểu hàng tuần để biết cần mang sách giáo khoa nào ngày mai.", "KET_A2", "Lớp 6", "School Life", "unit_school", "time-ta-ble (3 âm tiết)", "/aɪ/, /eɪ/, /əl/", "/t/, /m/, /t/, /b/, /l/")
]

added_count = 0
for term, ipa, pos, vn, ex_en, ex_vi, cefr, gr, cat, uid, syl, vow, cons in new_words:
    k = term.lower().strip()
    if k not in vocab_dict:
        slug = re.sub(r'[^a-zA-Z0-9]+', '_', term).strip('_').lower()
        vocab_dict[k] = {
            "id": f"vocab_{slug}",
            "term": term,
            "ipa": ipa,
            "pos": pos,
            "meaning_vi": vn,
            "phonics_note": f"Phát âm IPA Cambridge: {ipa}. Âm tiết và trọng âm chuẩn.",
            "syllables": syl,
            "vowels_detail": vow,
            "consonants_detail": cons,
            "example_en": ex_en,
            "example_vi": ex_vi,
            "cambridge_level": cefr,
            "grade": gr,
            "category": cat,
            "unit_id": uid,
            "difficulty": "hard" if "C" in cefr else ("medium" if "B" in cefr else "easy"),
            "created_at": "2026-09-25 05:15:00"
        }
        added_count += 1

final_vocab = list(vocab_dict.values())
with open(vocab_path, 'w', encoding='utf-8') as f:
    json.dump(final_vocab, f, ensure_ascii=False, indent=2)

print(f"--> Vocabulary DB updated: Added {added_count} words, Total: {len(final_vocab)} items!")

# -------------------------------------------------------------
# SYNC SQLITE `words` TABLE
# -------------------------------------------------------------
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Get existing words columns
cursor.execute("PRAGMA table_info(words)")
cols = [c[1] for c in cursor.fetchall()]

# Upsert words into SQLite
for v in final_vocab:
    # check if exists
    cursor.execute("SELECT id FROM words WHERE id = ?", (v['id'],))
    row = cursor.fetchone()
    if row:
        cursor.execute("""
            UPDATE words SET
                term = ?, ipa = ?, pos = ?, meaning_vi = ?,
                phonics_note = ?, example_en = ?, example_vi = ?,
                cambridge_level = ?, grade = ?, category = ?, unit_id = ?, difficulty = ?
            WHERE id = ?
        """, (
            v.get('term', ''), v.get('ipa', ''), v.get('pos', ''), v.get('meaning_vi', ''),
            v.get('phonics_note', ''), v.get('example_en', ''), v.get('example_vi', ''),
            v.get('cambridge_level', ''), v.get('grade', ''), v.get('category', ''),
            v.get('unit_id', ''), v.get('difficulty', ''), v['id']
        ))
    else:
        cursor.execute("""
            INSERT INTO words (
                id, term, ipa, pos, meaning_vi, phonics_note,
                example_en, example_vi, cambridge_level, grade, category, unit_id, difficulty
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            v['id'], v.get('term', ''), v.get('ipa', ''), v.get('pos', ''), v.get('meaning_vi', ''),
            v.get('phonics_note', ''), v.get('example_en', ''), v.get('example_vi', ''),
            v.get('cambridge_level', ''), v.get('grade', ''), v.get('category', ''),
            v.get('unit_id', ''), v.get('difficulty', '')
        ))

conn.commit()
cursor.execute("SELECT COUNT(*) FROM words")
sqlite_vocab_count = cursor.fetchone()[0]
print(f"--> SQLite 'words' table synced: {sqlite_vocab_count} records!")

# -------------------------------------------------------------
# SYNC OBSIDIAN VAULT ARCHIVE & JSON
# -------------------------------------------------------------
# Update second_brain_vault.json
vault_json_path = os.path.join(LIB_DATA_DIR, 'second_brain_vault.json')
all_notes = []
for root, dirs, files in os.walk(SECOND_BRAIN_DIR):
    if '.obsidian' in root:
        continue
    for file in files:
        if file.endswith('.md'):
            fp = os.path.join(root, file)
            rel_path = os.path.relpath(fp, SECOND_BRAIN_DIR).replace('\\', '/')
            with open(fp, 'r', encoding='utf-8') as f:
                content = f.read()
            title = file.replace('.md', '').replace('_', ' ').title()
            all_notes.append({
                "path": rel_path,
                "title": title,
                "size_bytes": len(content.encode('utf-8')),
                "category": rel_path.split('/')[0] if '/' in rel_path else 'Root'
            })

vault_summary = {
    "total_notes": len(all_notes),
    "generated_at": "2026-09-25T19:46:00+07:00",
    "pillars": [
        "00_Maps_Of_Content",
        "01_GDPT_Curriculum",
        "02_Grammar_Vault",
        "03_Lexicon_Collocations",
        "04_Exam_Strategy",
        "05_Pedagogy_Second_Brain",
        "06_Phonics_Pronunciation"
    ],
    "features": [
        "Bi-directional WikiLinks [[Note Name]]",
        "Obsidian Callouts (> [!INFO], > [!TIP], > [!FORMULA])",
        "Interactive Graph View configuration (.obsidian/graph.json)",
        "Canvas visual roadmap (.canvas)",
        "Tags & Aliases YAML Frontmatter"
    ],
    "notes": all_notes
}

with open(vault_json_path, 'w', encoding='utf-8') as f:
    json.dump(vault_summary, f, ensure_ascii=False, indent=2)

print(f"--> second_brain_vault.json updated with {len(all_notes)} notes.")

# Re-zip vault to static/downloads/obsidian_second_brain_vault.zip
zip_path = os.path.join(STATIC_DOWNLOADS, 'obsidian_second_brain_vault.zip')
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(SECOND_BRAIN_DIR):
        for file in files:
            full_p = os.path.join(root, file)
            rel_p = os.path.relpath(full_p, SECOND_BRAIN_DIR)
            zf.write(full_p, arcname=rel_p)

zip_size_kb = os.path.getsize(zip_path) / 1024
print(f"--> Vault Zip archive recreated: {zip_path} ({zip_size_kb:.1f} KB)")

conn.close()
print("\n=== ALL SYNC OPERATIONS COMPLETED SUCCESSFULLY! ===")

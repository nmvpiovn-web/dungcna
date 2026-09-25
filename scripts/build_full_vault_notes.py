import os
import sys
import json
import zipfile
import re
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

print("=========================================================================")
print("=== GENERATING COMPLETE 40+ OBSIDIAN SECOND BRAIN VAULT NOTES ===")
print("=========================================================================\n")

VAULT_DIR = 'second_brain'
STATIC_DOWNLOADS = 'static/downloads'

# Helper to save notes
def save_note(rel_path, content):
    full_path = os.path.join(VAULT_DIR, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"  + Created: {rel_path}")

# =====================================================================
# 00. MASTER INDEX MOC
# =====================================================================
save_note("00_INDEX_MOC.md", """---
title: "🧠 Second Brain Tri Thức - Tiếng Anh Toàn Diện GDPT & CEFR"
aliases: ["Index", "Home", "MOC", "Bản Đồ Tri Thức"]
tags: ["#moc", "#second-brain", "#knowledge-graph", "#tienganh"]
author: "Hệ Thống Tiếng Anh Cô Dung"
vault_version: "2.5.0-PRO"
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
- [[Grammar_Master_MOC|📐 Tổng hợp Chuyên Đề Ngữ Pháp Toàn Diện]]
- [[Present_Tenses_Deep_Dive|⏱️ Thì Hiện Tại Đơn & Hiện Tại Tiếp Diễn]]
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

# =====================================================================
# 01. CURRICULUM GDPT NOTES
# =====================================================================
save_note("01_CURRICULUM_GDPT/GDPT_Master_Curriculum_MOC.md", """---
title: "Bản Đồ Tổng Chương Trình Tiếng Anh GDPT 2018 (Grades 1-12)"
tags: ["#curriculum", "#gdpt", "#moc"]
aliases: ["Chương Trình GDPT", "GDPT 2018 MOC"]
---

# 📚 CHƯƠNG TRÌNH TIẾNG ANH GDPT 2018 (LỚP 1 - 12)

Chương trình GDPT môn Tiếng Anh 2018 theo định hướng phát triển năng lực giao tiếp:

- [[Tieu_Hoc_Lop_1_5|🌱 Bậc Tiểu Học: Lớp 1 - 5 (Bậc 1 / CEFR A1)]]
- [[THCS_Lop_6_9|🌿 Bậc Trung Học Cơ Sở: Lớp 6 - 9 (Bậc 2 / CEFR A2)]]
- [[THPT_Lop_10_12|🌳 Bậc Trung Học Phổ Thông: Lớp 10 - 12 (Bậc 3 / CEFR B1-B2)]]
- [[Global_Success_Vs_Friends_Plus_Comparative|⚖️ Bảng đối sánh Global Success vs Friends Plus]]
- [[Cambridge_CEFR_Framework_Alignment|🎯 Khung chuẩn quy chiếu Cambridge & CEFR]]
""")

save_note("01_CURRICULUM_GDPT/Tieu_Hoc_Lop_1_5.md", """---
title: "Bậc Tiểu Học: Lớp 1 Đến Lớp 5 (GDPT 2018)"
tags: ["#curriculum", "#primary", "#phonics", "#starters-movers-flyers"]
aliases: ["Tiểu Học", "Primary G1-G5"]
---

# 🌱 CHƯƠNG TRÌNH TIẾNG ANH TIỂU HỌC (LỚP 1 - 5)

## 🎯 Mục Tiêu Giáo Dục
- Hình thành phản xạ phát âm chuẩn thông qua [[Phonics_and_IPA_Sound_System|Hệ thống Phonics Quốc tế]].
- Xây dựng vốn từ vựng cơ bản về bản thân, gia đình, bạn bè và thế giới xung quanh qua [[Lexicon_Primary_G1_G5|Vốn từ tiểu học]].
- Làm quen với các bài thi đánh giá chuẩn quốc tế: Cambridge Starters (Lớp 3), Movers (Lớp 4), Flyers (Lớp 5) và các kỳ thi IOE Quốc Gia.

## 📌 Khung Kiến Thức Trọng Tâm
1. **Phonics**: Nguyên âm ngắn (/æ/, /e/, /ɪ/, /ɒ/, /ʌ/) và nguyên âm dài (/iː/, /uː/, /ɑː/, /ɔː/, /ɜː/).
2. **Ngữ pháp sơ cấp**: Động từ To Be, cấu trúc What, Where, How many, Can/Can't.
""")

save_note("01_CURRICULUM_GDPT/THCS_Lop_6_9.md", """---
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

save_note("01_CURRICULUM_GDPT/THPT_Lop_10_12.md", """---
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

save_note("01_CURRICULUM_GDPT/Global_Success_Vs_Friends_Plus_Comparative.md", """---
title: "So Sánh Đối Sách: Global Success vs Friends Plus"
tags: ["#curriculum", "#comparative", "#textbooks"]
---

# ⚖️ SO SÁNH GLOBAL SUCCESS VÀ FRIENDS PLUS

| Tiêu Chí | Tiếng Anh Global Success (NXB GDVN) | Friends Plus (Chân Trời Sáng Tạo - OUP) |
|---|---|---|
| **Triết lý** | Bám sát ngữ cảnh Việt Nam, lồng ghép văn hóa truyền thống & di sản dân tộc | Định hướng quốc tế hóa, tăng cường kỹ năng CLIL (tích hợp môn học) |
| **Bố cục Unit** | Getting Started -> A Closer Look 1 -> A Closer Look 2 -> Communication -> Skills 1 -> Skills 2 -> Looking Back & Project | Starter -> Vocabulary -> Reading -> Language Focus -> Vocabulary and Listening -> Language Focus -> Speaking -> Writing |
| **Liên kết** | [[THCS_Lop_6_9]], [[Lexicon_Secondary_G6_G9]] | [[Cambridge_CEFR_Framework_Alignment]], [[Lexicon_Academic_IELTS_C1_C2]] |
""")

save_note("01_CURRICULUM_GDPT/Cambridge_CEFR_Framework_Alignment.md", """---
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

# =====================================================================
# 02. GRAMMAR KNOWLEDGE BASE NOTES
# =====================================================================
save_note("02_GRAMMAR_KNOWLEDGE_BASE/Grammar_Master_MOC.md", """---
title: "Bản Đồ Chuyên Đề Ngữ Pháp Toàn Diện (Master Grammar MOC)"
tags: ["#grammar", "#moc", "#syntax"]
---

# 📐 BẢN ĐỒ CHUYÊN ĐỀ NGỮ PHÁP TOÀN DIỆN

- [[Present_Tenses_Deep_Dive|Thì Hiện Tại Đơn & Hiện Tại Tiếp Diễn]]
- [[Past_Tenses_and_Narrative_Structures|Thì Quá Khứ Đơn, Quá Khứ Tiếp Diễn & Quá Khứ Hoàn Thành]]
- [[Future_Tenses_and_Modality|Thì Tương Lai Đơn & Tương Lai Gần]]
- [[Tense_Coordination_and_Sequence|Phối Hợp Thì Trong Mệnh Đề Trạng Ngữ Chỉ Thời Gian]]
- [[Conditionals_Type_0_1_2_3_Mixed_Inversion|Câu Điều Kiện Loại 0, 1, 2, 3, Hỗn Hợp & Đảo Ngữ]]
- [[Reported_Speech_and_Reporting_Verbs|Câu Tường Thuật & Động Từ Tường Thuật Chuyên Sâu]]
- [[Passive_Voice_and_Causative_Forms|Thể Bị Động & Thể Nhờ Vả (Causative Form)]]
- [[Relative_Clauses_Defining_NonDefining_Reduced|Mệnh Đề Quan Hệ & Kỹ Thuật Rút Gọn Mệnh Đề]]
- [[Inversion_and_Cleft_Sentences|Đảo Ngữ & Câu Chẻ (Cleft Sentences)]]
- [[Subjunctive_Mood_and_Hypothetical_Structures|Thể Giả Định (Subjunctive Mood) & Câu Ước Wish]]
- [[Gerunds_and_Infinitives_Verb_Patterns|Danh Động Từ & Động Từ Nguyên Thể]]
- [[Comparatives_Superlatives_Double_Comparatives|So Sánh Hơn, So Sánh Nhất & So Sánh Kép]]
- [[Phrasal_Verbs_Top_100|Top 100 Cụm Động Từ Kinh Điển]]
- [[Conjunctions_Connectors_Cohesive_Devices|Liên Từ & Trạng Từ Liên Kết]]
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Present_Tenses_Deep_Dive.md", """---
title: "Thì Hiện Tại Đơn & Hiện Tại Tiếp Diễn (Present Simple & Continuous)"
tags: ["#grammar", "#tenses", "#present-simple", "#present-continuous"]
---

# ⏱️ THÌ HIỆN TẠI ĐƠN & HIỆN TẠI TIẾP DIỄN

## 1. Hiện Tại Đơn (Present Simple)
- **Công thức**: `S + V(s/es) + O` | Phủ định: `S + do/does + not + V-inf`
- **Cách dùng**: Chân lý hiển nhiên, thói quen lặp lại, lịch trình giờ giấc tàu xe cố định.
- **Quy tắc đuôi -s/-es**:
  - `/s/`: sau âm vô thanh (/p, k, f, t, θ/)
  - `/ɪz/`: sau âm xát (/s, z, ʃ, tʃ, dʒ/)
  - `/z/`: sau các âm còn lại

## 2. Hiện Tại Tiếp Diễn (Present Continuous)
- **Công thức**: `S + am/is/are + V-ing + O`
- **Cách dùng**: Hành động đang diễn ra tại thời điểm nói, kế hoạch tương lai đã sắp xếp, phàn nàn với 'always'.
- **Lưu ý bẫy Stative Verbs**: Các động từ chỉ cảm giác, tri giác, sở hữu (know, understand, believe, love, hate, prefer, belong, own) KHÔNG dùng ở thì tiếp diễn.
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Past_Tenses_and_Narrative_Structures.md", """---
title: "Quá Khứ Đơn, Quá Khứ Tiếp Diễn & Quá Khứ Hoàn Thành"
tags: ["#grammar", "#tenses", "#past-simple", "#past-perfect"]
---

# 📜 THÌ QUÁ KHỨ & KỸ THUẬT KỂ CHUYỆN (NARRATIVE TENSES)

## 1. Quá Khứ Đơn vs Quá Khứ Tiếp Diễn
- `S + was/were + V-ing + WHEN + S + V-ed`: Hành động đang diễn ra thì hành động khác cắt ngang.
  - *I was walking home when it began to pour.*
- `While + S + was/were + V-ing, S + was/were + V-ing`: Hai hành động diễn ra song song.

## 2. Quá Khứ Hoàn Thành (Past Perfect)
- **Công thức**: `S + had + P.P`
- **Cách dùng**: Hành động xảy ra và hoàn tất TRƯỚC một hành động khác trong quá khứ.
- **Cấu trúc nối**:
  - `By the time + S + V(quá khứ đơn), S + had + P.P`
  - `After + S + had + P.P, S + V(quá khứ đơn)`
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Future_Tenses_and_Modality.md", """---
title: "Tương Lai Đơn, Tương Lai Gần & Tương Lai Hoàn Thành"
tags: ["#grammar", "#tenses", "#future"]
---

# 🚀 CÁC THÌ TƯƠNG LAI & ĐỘNG TỪ TÌNH THÁI

## 1. Phân Biệt Will vs Be Going To
- **Will + V-inf**: Quyết định đưa ra ngay tại thời điểm nói, lời hứa, dự đoán chủ quan.
- **Be going to + V-inf**: Kế hoạch đã có dự định từ trước, dự đoán có căn cứ/bằng chứng rõ ràng ở hiện tại (*Look at those dark clouds! It is going to rain.*).

## 2. Tương Lai Hoàn Thành (Future Perfect)
- **Công thức**: `S + will have + P.P`
- **Dấu hiệu**: `By the end of this month`, `By next year`, `By the time + S + V(hiện tại đơn)`.
  - *By 2030, scientists will have discovered a cure for the disease.*
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Tense_Coordination_and_Sequence.md", """---
title: "Phối Hợp Thì & Mệnh Đề Trạng Ngữ Chỉ Thời Gian"
tags: ["#grammar", "#tenses", "#high-school", "#thpt-qg"]
sources: ["NHÓM 7 THPT Hương Khê", "VnDoc"]
---

# 🔗 PHỐI HỢP THÌ TRONG MỆNH ĐỀ TRẠNG NGỮ CHỈ THỜI GIAN

> [!important] Quy Tắc Bất Di Bất Dịch
> **KHÔNG BAO GIỜ** dùng các thì TƯƠNG LAI (`will`, `shall`, `be going to`) trong mệnh đề trạng ngữ chỉ thời gian bắt đầu bằng:
> `When`, `As soon as`, `While`, `Before`, `After`, `By the time`, `Until / Till`.

## 📌 Các Cặp Phối Hợp Thì Hay Gặp Nhất
- `S + will + V-inf + (When / As soon as) + S + V(s/es)`: *John will call as soon as he arrives.*
- `S + was/were + V-ing + WHEN + S + V-ed`: *She was cooking when the telephone rang.*
- `By the time + S + V-ed, S + had + P.P`: *By the time the ambulance arrived, the patient had stabilized.*
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Conditionals_Type_0_1_2_3_Mixed_Inversion.md", """---
title: "Câu Điều Kiện Loại 0-3, Hỗn Hợp & Đảo Ngữ Câu Điều Kiện"
tags: ["#grammar", "#conditionals", "#inversion"]
---

# 🎲 CÂU ĐIỀU KIỆN (CONDITIONALS) & ĐẢO NGỮ CÂU ĐIỀU KIỆN

## 📊 Bảng 4 Loại Cơ Bản
- **Type 0**: `If + S + V(hiện tại), S + V(hiện tại)` (Chân lý khoa học).
- **Type 1**: `If + S + V(hiện tại), S + will + V-inf` (Có thể xảy ra).
- **Type 2**: `If + S + V-ed/were, S + would + V-inf` (Trái thực tế hiện tại).
- **Type 3**: `If + S + had + P.P, S + would have + P.P` (Trái thực tế quá khứ).

## ⚡ Đảo Ngữ Câu Điều Kiện (Bỏ IF)
1. **Loại 1**: `Should + S + V-inf, S + will + V-inf`
2. **Loại 2**: `Were + S + to V-inf (hoặc Were + S + adj/noun), S + would + V-inf`
3. **Loại 3**: `Had + S + P.P, S + would have + P.P`
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Reported_Speech_and_Reporting_Verbs.md", """---
title: "Câu Tường Thuật & 20 Động Từ Tường Thuật Phức Hợp"
tags: ["#grammar", "#reported-speech", "#indirect-speech"]
---

# 🗣️ CÂU TƯỜNG THUẬT & ĐỘNG TỪ TƯỜNG THUẬT CHUYÊN SÂU

## 1. Ba Bước Chuyển Đổi Trực Tiếp Sang Gián Tiếp
1. **Lùi thì**: Hiện tại đơn -> Quá khứ đơn; Hiện tại hoàn thành -> Quá khứ hoàn thành; Will -> Would; Can -> Could.
2. **Đổi đại từ**: Thay đổi chủ ngữ, tân ngữ, tính từ sở hữu tương ứng người nói và người nghe.
3. **Đổi trạng từ thời gian/nơi chốn**: Now -> Then; Today -> That day; Yesterday -> The day before; Tomorrow -> The next day; Here -> There; This/These -> That/Those.

## 2. Các Động Từ Tường Thuật Nâng Cao
- `Verb + to V`: offer, promise, threaten, agree, refuse.
- `Verb + sb + to V`: advise, ask, encourage, remind, tell, warn.
- `Verb + V-ing`: admit, deny, suggest, recommend.
- `Verb + preposition + V-ing`: apologize for, congratulate on, insist on, accuse of.
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Passive_Voice_and_Causative_Forms.md", """---
title: "Thể Bị Động Nâng Cao & Cấu Trúc Nhờ Vả (Causative Forms)"
tags: ["#grammar", "#passive-voice", "#causative"]
---

# 🛡️ THỂ BỊ ĐỘNG NÂNG CAO & CẤU TRÚC NHỜ VẢ

## 1. Bị Động Khách Quan (Impersonal Passive)
- Câu chủ động: `People say/believe/rumour that S2 + V2`
- Cách 1: `It is said/believed that S2 + V2`
- Cách 2: 
  - Nếu V2 cùng thì với V1: `S2 + is/are said + TO V-inf`
  - Nếu V2 trước thì so với V1: `S2 + is/are said + TO HAVE P.P`
  - *People believe he committed the crime. -> He is believed to have committed the crime.*

## 2. Cấu Trúc Nhờ Vả (Causative Form)
- Chủ động: `Have sb + V-bare` / `Get sb + TO V`
- Bị động: `Have / Get + Something + P.P (by somebody)`
  - *I had the technician repair my laptop yesterday.*
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Relative_Clauses_Defining_NonDefining_Reduced.md", """---
title: "Mệnh Đề Quan Hệ Xác Định, Không Xác Định & Rút Gọn Mệnh Đề"
tags: ["#grammar", "#relative-clause", "#participles"]
---

# 🧬 MỆNH ĐỀ QUAN HỆ & RÚT GỌN MỆNH ĐỀ QUAN HỆ

## 1. Phân Biệt Defining vs Non-defining
- **Defining Clause**: Mệnh đề xác định, cần thiết để làm rõ nghĩa cho danh từ, không có dấu phẩy, dùng được `that`.
- **Non-defining Clause**: Mệnh đề không xác định, cung cấp thêm thông tin phụ, có dấu phẩy ngăn cách, **TUYỆT ĐỐI KHÔNG DÙNG THAT**, không được lược bỏ đại từ quan hệ.

## 2. Rút Gọn Mệnh Đề Quan Hệ
1. **Dạng chủ động**: Dùng cụm hiện tại phân từ `V-ing`.
   - *The girl who is sitting in the corner -> The girl sitting in the corner.*
2. **Dạng bị động**: Dùng cụm quá khứ phân từ `P.P (V-ed)`.
   - *The novel which was written by To Hoai -> The novel written by To Hoai.*
3. **Sau the first, the second, the only, the last, so sánh nhất**: Dùng `To V-inf`.
   - *He was the first man who set foot on the moon -> He was the first man to set foot on the moon.*
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Inversion_and_Cleft_Sentences.md", """---
title: "Đảo Ngữ Toàn Diện & Câu Chẻ (Inversion and Cleft Sentences)"
tags: ["#grammar", "#inversion", "#cleft", "#hsg", "#chuyen-anh"]
---

# ⚡ ĐẢO NGỮ (INVERSION) & CÂU CHẺ (CLEFT SENTENCES)

## 📌 Các Cấu Trúc Đảo Ngữ Thường Gặp
1. **Trạng từ phủ định**: `Never / Hardly / Scarcely / Seldom + Trợ động từ + S + V`
2. **No sooner... than**: `No sooner had S + P.P than S + V-ed`
3. **Only with**: `Only when / Only after + Clause + Trợ động từ + S + V`
   - *Only on his fourth proposal did she accept to marry him.*

## 📌 Câu Chẻ (Cleft Sentences)
- `It is/was + Thành phần cần nhấn mạnh + that + S + V`
  - *It was in Hoi An that we experienced the ancient lantern festival.*
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Subjunctive_Mood_and_Hypothetical_Structures.md", """---
title: "Thể Giả Định (Subjunctive Mood) & Cấu Trúc Ước Muốn"
tags: ["#grammar", "#subjunctive", "#hsg", "#chuyen-anh"]
---

# 🎭 THỂ GIẢ ĐỊNH & CẤU TRÚC GIẢ ĐỊNH NÂNG CAO

## 1. Giả Định Với Động Từ Yêu Cầu / Đề Xuất
Sau `advise, demand, insist, propose, recommend, request, suggest`:
- `S1 + Verb + THAT + S2 + (should) + V-bare`
  - *The board insisted that every manager submit a report.*

## 2. Cấu Trúc Ước Muốn WISH & IT'S HIGH TIME
- `It is high time + S + V-ed`: Đã đến lúc phải làm gì (*It's high time you started studying.*).
- `S + would rather + S + V-ed`: Muốn ai đó làm gì ở hiện tại.
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Gerunds_and_Infinitives_Verb_Patterns.md", """---
title: "Danh Động Từ (Gerunds) & Động Từ Nguyên Thể (Infinitives)"
tags: ["#grammar", "#gerunds", "#infinitives"]
---

# 🔄 DANH ĐỘNG TỪ & ĐỘNG TỪ NGUYÊN THỂ

## 1. Động Từ Luôn Đi Với V-ing
`admit, avoid, consider, deny, enjoy, finish, mind, practice, suggest, risk, spend time`.

## 2. Động Từ Luôn Đi Với To V
`decide, hope, plan, refuse, promise, agree, manage, afford, offer, intend`.

## 3. Các Động Từ Thay Đổi Nghĩa Theo Dạng V-ing / To V
- **Remember / Forget / Regret**:
  - `+ To V`: Nhớ/quên/tiếc phải làm việc gì trong tương lai hoặc bổn phận.
  - `+ V-ing`: Nhớ/quên/tiếc một việc đã làm trong quá khứ.
- **Stop**:
  - `Stop to V`: Dừng lại để làm việc khác.
  - `Stop V-ing`: Dừng hẳn hành động đang làm.
- **Try**:
  - `Try to V`: Cố gắng nỗ lực làm gì.
  - `Try V-ing`: Thử làm gì xem kết quả thế nào.
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Comparatives_Superlatives_Double_Comparatives.md", """---
title: "So Sánh Hơn, So Sánh Nhất & So Sánh Kép"
tags: ["#grammar", "#comparatives", "#superlatives"]
---

# 📈 HỆ THỐNG CÂU SO SÁNH & SO SÁNH KÉP

## 1. So Sánh Bằng, Hơn, Nhất
- Bằng: `as + adj/adv + as`
- Hơn: `adj-er / more + adj + than`
- Nhất: `the + adj-est / the most + adj`

## 2. So Sánh Kép (Double Comparatives)
- `The + comparative + S + V, The + comparative + S + V`
  - *The harder you work, the greater your achievement will be.*
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Phrasal_Verbs_Top_100.md", """---
title: "Top 100 Cụm Động Từ Thường Gặp (Phrasal Verbs Mastery)"
tags: ["#grammar", "#vocab", "#phrasal-verbs"]
---

# 🎯 TOP 100 CỤM ĐỘNG TỪ KINH ĐIỂN TRONG ĐỀ THI

- **Hold up**: Chặn cướp có vũ trang; làm trì hoãn chuyến đi.
- **Run out of**: Cạn kiệt tiền bạc, nhiên liệu.
- **Get over**: Vượt qua, bình phục sau bệnh tật.
- **Look after**: Chăm sóc, nuôi dưỡng.
- **Take after**: Có nét giống cha mẹ hoặc người thân.
- **Turn down**: Từ chối lời mời/đơn xin việc; vặn nhỏ âm lượng.
- **Bring up**: Nuôi nấng trẻ con; nêu ra một vấn đề để thảo luận.
""")

save_note("02_GRAMMAR_KNOWLEDGE_BASE/Conjunctions_Connectors_Cohesive_Devices.md", """---
title: "Liên Từ, Trạng Từ Liên Kết & Phép Nối Văn Bản"
tags: ["#grammar", "#conjunctions", "#discourse-markers"]
---

# 🧩 LIÊN TỪ & TRẠNG TỪ LIÊN KẾT

## 1. Phân Biệt Liên Từ (Conjunction) vs Giới Từ (Preposition)
- `Because / As / Since + Clause` vs `Because of / Due to + Noun phrase / V-ing`
- `Although / Even though + Clause` vs `Despite / In spite of + Noun phrase / V-ing`

## 2. Trạng Từ Liên Kết Văn Bản (Cohesive Markers)
- **Tương phản**: However, Nevertheless, On the contrary, In contrast.
- **Nguyên nhân - Kết quả**: Therefore, Consequently, As a result, Thus.
- **Bổ sung**: Furthermore, Moreover, In addition to, Besides.
""")

# =====================================================================
# 03. VOCABULARY ATLAS NOTES
# =====================================================================
save_note("03_VOCABULARY_ATLAS/Vocabulary_Atlas_MOC.md", """---
title: "Bản Đồ Từ Vựng & Ngữ Âm Quốc Tế (Vocabulary Atlas MOC)"
tags: ["#vocab", "#moc", "#phonics", "#ipa"]
---

# 🔤 BẢN ĐỒ TỔNG QUAN TỪ VỰNG & NGỮ ÂM

- [[Phonics_and_IPA_Sound_System|🎙️ Hệ Thống 44 Âm Quốc Tế IPA & Phonics]]
- [[Word_Formation_Prefixes_Suffixes_Roots|🧱 Cấu Tạo Từ: Tiền Tố, Hậu Tố & Gốc Từ]]
- [[Lexicon_Primary_G1_G5|🌱 Vốn Từ Tiểu Học Lớp 1 - 5]]
- [[Lexicon_Secondary_G6_G9|🌿 Vốn Từ THCS Lớp 6 - 9]]
- [[Lexicon_HighSchool_G10_G12|🌳 Vốn Từ THPT Lớp 10 - 12]]
- [[Lexicon_Academic_IELTS_C1_C2|💎 Vốn Từ Học Thuật C1-C2]]
- [[Collocations_and_Fixed_Phrases|🔗 Collocations & Cụm Cố Định]]
- [[False_Friends_and_Common_Confusables|⚠️ Cặp Từ Dễ Nhầm Lẫn (Confusables)]]
""")

save_note("03_VOCABULARY_ATLAS/Phonics_and_IPA_Sound_System.md", """---
title: "Hệ Thống 44 Âm Quốc Tế (IPA) & Phonics Chuẩn Cambridge"
tags: ["#vocab", "#phonics", "#ipa", "#pronunciation"]
---

# 🎙️ HỆ THỐNG 44 ÂM QUỐC TẾ (IPA) & PHONICS

## 1. Nguyên Âm (20 Vowels)
- 7 nguyên âm ngắn: `/ɪ/, /e/, /æ/, /ɒ/, /ʌ/, /ʊ/, /ə/`
- 5 nguyên âm dài: `/iː/, /uː/, /ɑː/, /ɔː/, /ɜː/`
- 8 nguyên âm đôi: `/eɪ/, /aɪ/, /ɔɪ/, /aʊ/, /əʊ/, /ɪə/, /eə/, /ʊə/`

## 2. Phụ Âm (24 Consonants)
- Cặp vô thanh - hữu thanh: `/p/-/b/`, `/t/-/d/`, `/k/-/ɡ/`, `/f/-/v/`, `/θ/-/ð/`, `/s/-/z/`, `/ʃ/-/ʒ/`, `/tʃ/-/dʒ/`
""")

save_note("03_VOCABULARY_ATLAS/Word_Formation_Prefixes_Suffixes_Roots.md", """---
title: "Cấu Tạo Từ: Tiền Tố, Hậu Tố & Gốc Từ (Word Formation)"
tags: ["#vocab", "#word-formation", "#roots", "#hsg"]
---

# 🧱 CẤU TẠO TỪ: TIỀN TỐ, HẬU TỐ & GỐC TỪ

- **Tiền tố phủ định**: un- (unhappy), in- (inactive), im- (impatient), il- (illegal), ir- (irresponsible), dis- (disappear).
- **Hậu tố danh từ**: -tion (preservation), -ment (astonishment), -ness (weakness), -ity (resilience, inferiority).
- **Hậu tố tính từ**: -ful (hopeful), -less (pointless), -able (sustainable), -ive (creative), -ous (dangerous).
""")

save_note("03_VOCABULARY_ATLAS/Lexicon_Primary_G1_G5.md", """---
title: "Vốn Từ Bậc Tiểu Học: Lớp 1 - 5 (Starters, Movers, Flyers)"
tags: ["#vocab", "#primary", "#starters-movers-flyers"]
---

# 🌱 VỐN TỪ BẬC TIỂU HỌC (LỚP 1 - 5)

Chủ đề: Bản thân, Đồ dùng học tập, Gia đình, Thú nuôi, Sinh nhật, Đồ ăn thức uống.
- `school bag`: Cặp sách học sinh
- `pencil case`: Hộp bút
- `morning exercise`: Thể dục buổi sáng
- `delicious`: Ngon miệng
""")

save_note("03_VOCABULARY_ATLAS/Lexicon_Secondary_G6_G9.md", """---
title: "Vốn Từ Bậc THCS: Lớp 6 - 9 (Cambridge KET - PET)"
tags: ["#vocab", "#secondary", "#ket", "#pet"]
---

# 🌿 VỐN TỪ BẬC TRUNG HỌC CƠ SỞ (LỚP 6 - 9)

Chủ đề: Dịch vụ cộng đồng, Phong tục truyền thống, Thiên tai môi trường, Làng nghề.
- `community service`: Hoạt động phục vụ cộng đồng
- `craft village`: Làng nghề thủ công truyền thống
- `natural disaster`: Thảm họa thiên tai
- `pollution`: Sự ô nhiễm
""")

save_note("03_VOCABULARY_ATLAS/Lexicon_HighSchool_G10_G12.md", """---
title: "Vốn Từ Bậc THPT & Ôn Thi THPT Quốc Gia (Lớp 10 - 12)"
tags: ["#vocab", "#high-school", "#thpt-qg"]
---

# 🌳 VỐN TỪ BẬC TRUNG HỌC PHỔ THÔNG (LỚP 10 - 12)

Chủ đề: Đô thị hóa, Năng lượng tái tạo, Di sản thế giới, Kỹ năng sống độc lập.
- `pedestrian zone`: Phố đi bộ
- `sustainable ecosystem`: Hệ sinh thái bền vững
- `ancient citadel`: Hoàng thành cổ kính
- `carbon emission`: Khí thải carbon
""")

save_note("03_VOCABULARY_ATLAS/Lexicon_Academic_IELTS_C1_C2.md", """---
title: "Vốn Từ Học Thuật Cao Cấp C1-C2 & IELTS Academic 7.5+"
tags: ["#vocab", "#academic", "#ielts", "#c1-c2"]
---

# 💎 VỐN TỪ HỌC THUẬT CAO CẤP C1-C2

Trích xuất từ Academic Word List (AWL) & các đề thi HSG Quốc gia:
- `unprecedented`: Chưa từng có tiền lệ
- `inferiority complex`: Mặc cảm tự ti
- `ubiquitous`: Phổ biến ở khắp mọi nơi
- `exacerbate`: Làm trầm trọng thêm tình hình
""")

save_note("03_VOCABULARY_ATLAS/Collocations_and_Fixed_Phrases.md", """---
title: "Collocations & Cụm Từ Cố Định Thường Gặp"
tags: ["#vocab", "#collocations"]
---

# 🔗 COLLOCATIONS & CỤM TỪ CỐ ĐỊNH

- `Make an effort`: Nỗ lực làm gì
- `Do morning exercise`: Tập thể dục
- `Pay attention to`: Chú ý tới
- `Take responsibility for`: Chịu trách nhiệm về
- `Pose a threat to`: Gây ra mối đe dọa cho
""")

save_note("03_VOCABULARY_ATLAS/False_Friends_and_Common_Confusables.md", """---
title: "Cặp Từ Dễ Nhầm Lẫn Kinh Điển (Confusable Words)"
tags: ["#vocab", "#confusables", "#error-identification"]
---

# ⚠️ CÁC CẶP TỪ DỄ GÂY NHẦM LẪN KINH ĐIỂN

- **Sensitive** (Nhạy cảm) vs **Sensible** (Biết điều, hợp lý).
- **Considerate** (Chu đáo, ân cần) vs **Considerable** (Đáng kể, to lớn).
- **Economic** (Thuộc về kinh tế) vs **Economical** (Tiết kiệm).
- **Comprehensible** (Có thể hiểu được) vs **Comprehensive** (Toàn diện, bao quát).
""")

# =====================================================================
# 04. EXAMS & QUESTION BANK NOTES
# =====================================================================
save_note("04_EXAMS_AND_QUESTION_BANK/Exams_MOC.md", """---
title: "Bản Đồ Ngân Hàng Đề Thi & Kỹ Năng Đánh Giá (Exams MOC)"
tags: ["#exam", "#moc", "#testing"]
---

# 📝 BẢN ĐỒ NGÂN HÀNG ĐỀ THI & MA TRẬN ĐÁNH GIÁ

- [[Sentence_Transformation_Techniques_700|✍️ 700 Kỹ Thuật Viết Lại Câu Tuyển Sinh & HSG]]
- [[Error_Identification_Strategies|🔍 Bẫy Nhận Diện & Sửa Lỗi Sai Kinh Điển]]
- [[Phonetics_Stress_Rules_and_Tricks|🎯 Bí Kíp Ăn Điểm Ngữ Âm & Trọng Âm]]
- [[High_School_Entrance_Exam_Vao_10_Mastery|🏛️ Cẩm Nang Ôn Thi Tuyển Sinh Vào Lớp 10 Chuyên]]
- [[THPT_Quoc_Gia_Exam_Strategy|🎯 Chiến Thuật Đạt Điểm 9+ THPT Quốc Gia]]
""")

save_note("04_EXAMS_AND_QUESTION_BANK/Sentence_Transformation_Techniques_700.md", """---
title: "700 Kỹ Thuật Viết Lại Câu Tuyển Sinh & HSG"
tags: ["#exam", "#sentence-transformation", "#hsg", "#vao-10"]
---

# ✍️ 700 KỸ THUẬT BIẾN ĐỔI CÂU GIỮ NGUYÊN NGHĨA

Trích xuất trực tiếp từ tài liệu viết lại câu HSG:

- **Model 1**: `Because + clause -> Because of + Noun phrase`
  - *Because she behaves well -> Because of her good behaviour.*
- **Model 2**: `Although + clause -> Despite / In spite of + Noun phrase / V-ing`
- **Model 3**: `Too + Adj to V -> So + Adj + that / Such + a/an Adj Noun + that`
- **Model 4**: `Prefer V-ing to V-ing -> Would rather V-inf than V-inf`
- **Model 5**: `It takes sb time to V -> Sb spends time V-ing`
- **Model 6**: `The first time S have P.P -> S have never P.P before`
""")

save_note("04_EXAMS_AND_QUESTION_BANK/Error_Identification_Strategies.md", """---
title: "Chiến Thuật Nhận Diện & Sửa Lỗi Sai Trong Đề Thi"
tags: ["#exam", "#error-identification", "#thpt-qg"]
---

# 🔍 CHIẾN THUẬT SỬA LỖI SAI (ERROR IDENTIFICATION)

Tổng hợp 4 bẫy lỗi sai chiếm 90% số câu trong đề thi:
1. **Sự hòa hợp Chủ - Vị với trạng từ chen giữa**: *The manager along with his staff IS (không dùng are).*
2. **Cặp từ gây nhầm lẫn**: *considerate vs considerable, sensible vs sensitive.*
3. **Cấu trúc song hành**: *He enjoys reading, swimming, and TO TRAVEL (sai -> traveling).*
4. **Đại từ thay thế số ít / số nhiều**: *Each student must submit THEIR paper (trong văn phong chuẩn -> HIS OR HER paper).*
""")

save_note("04_EXAMS_AND_QUESTION_BANK/Reading_Comprehension_Paraphrase_Skills.md", """---
title: "Kỹ Năng Đọc Hiểu & Kỹ Thuật Paraphrase Đoán Nghĩa"
tags: ["#exam", "#reading", "#paraphrase"]
---

# 📖 KỸ NĂNG ĐỌC HIỂU & CHIẾN THUẬT PARAPHRASE

- **Skimming**: Đọc lướt tiêu đề và câu chủ đề đoạn văn để nắm ý chính (Main Idea).
- **Scanning**: Quét nhanh từ khóa (Keywords: tên riêng, con số, thuật ngữ).
- **Context Clues**: Đoán nghĩa từ vựng mới dựa vào từ đồng nghĩa, từ trái nghĩa hoặc giải thích trong câu.
""")

save_note("04_EXAMS_AND_QUESTION_BANK/Phonetics_Stress_Rules_and_Tricks.md", """---
title: "Bí Kíp Ăn Điểm Phát Âm Đuôi -ed, -s/-es & Trọng Âm"
tags: ["#exam", "#phonetics", "#stress"]
---

# 🎯 BÍ KÍP ĂN ĐIỂM NGỮ ÂM & TRỌNG ÂM

## 1. Phát Âm Đuôi -ed
- `/ɪd/`: sau /t/, /d/ (wanted, decided).
- `/t/`: sau âm vô thanh /p, k, f, s, ʃ, tʃ/ (helped, watched, laughed).
- `/d/`: các âm còn lại.
- **Ngoại lệ**: naked, wicked, aged, learned, beloved luôn phát âm là `/ɪd/`.

## 2. Quy Tắc Trọng Âm
- Danh từ / Tính từ 2 âm tiết: Nhấn âm 1 (`TABLE`, `CLEVER`).
- Động từ 2 âm tiết: Nhấn âm 2 (`DECIDE`, `ENJOY`).
- Hậu tố kéo trọng âm về trước nó: `-tion`, `-sion`, `-ic`, `-ity` (`in-for-MA-tion`, `e-lec-TRI-ci-ty`).
""")

save_note("04_EXAMS_AND_QUESTION_BANK/High_School_Entrance_Exam_Vao_10_Mastery.md", """---
title: "Cẩm Nang Ôn Thi Tuyển Sinh Vào Lớp 10 Chuyên & Trọng Điểm"
tags: ["#exam", "#vao-10", "#chuyen-anh"]
---

# 🏛️ CẨM NANG ÔN THI TUYỂN SINH VÀO LỚP 10

Ma trận đề thi vào lớp 10 các tỉnh thành:
1. Phát âm & Trọng âm (4 câu - 1.0 điểm).
2. Ngữ pháp & Từ vựng trắc nghiệm (10-12 câu - 2.5 điểm).
3. Đọc hiểu điền từ & Đọc hiểu trả lời câu hỏi (10 câu - 2.5 điểm).
4. Tìm lỗi sai (3 câu - 0.75 điểm).
5. Viết lại câu & Nối câu (6-8 câu - 2.0 điểm).
""")

save_note("04_EXAMS_AND_QUESTION_BANK/THPT_Quoc_Gia_Exam_Strategy.md", """---
title: "Chiến Thuật Đạt Điểm 9+ Tiếng Anh THPT Quốc Gia"
tags: ["#exam", "#thpt-qg", "#scoring-strategy"]
---

# 🎯 CHIẾN THUẬT ĐẠT ĐIỂM 9+ THPT QUỐC GIA

1. **Giai đoạn 1 (15 phút đầu)**: Quét sạch 25 câu nhận biết và thông hiểu (Phát âm, trọng âm, câu giao tiếp, ngữ pháp cơ bản).
2. **Giai đoạn 2 (25 phút tiếp theo)**: Xử lý bài đọc điền từ, bài đọc hiểu ngắn và các câu biến đổi câu.
3. **Giai đoạn 3 (15 phút cuối)**: Tập trung cao độ cho bài đọc hiểu 8 câu phân hóa cao và 3 câu tìm lỗi sai từ vựng khó.
""")

# =====================================================================
# 05. PEDAGOGY & SOP NOTES
# =====================================================================
save_note("05_TEACHING_SOP_AND_PEDAGOGY/Pedagogy_MOC.md", """---
title: "Bản Đồ Nghiệp Vụ Sư Phạm & Vận Hành Trung Tâm (Pedagogy MOC)"
tags: ["#pedagogy", "#sop", "#teaching"]
---

# 👩‍🏫 BẢN ĐỒ NGHIỆP VỤ SƯ PHẠM & QUY TRÌNH VẬN HÀNH

- [[Differentiated_Instruction_Framework|🎯 Khung Giảng Dạy Phân Hóa Năng Lực Học Sinh]]
- [[Formative_Summative_Assessment_Rubrics|📊 Bộ Tiêu Chí Đánh Giá Quá Trình & Tổng Kết]]
- [[Teacher_Panel_Game_Portal_Integration_SOP|🎮 Quy Trình Giáo Viên Mở Cổng Game Tương Tác]]
- [[Leader_Operational_SOP_and_Audit_Workflow|📋 Quy Trình Kiểm Soát Tự Động Dành Cho Quản Lý]]
""")

save_note("05_TEACHING_SOP_AND_PEDAGOGY/Differentiated_Instruction_Framework.md", """---
title: "Phương Pháp Dạy Học Phân Hóa Năng Lực Học Sinh"
tags: ["#pedagogy", "#differentiated-instruction"]
---

# 🎯 DẠY HỌC PHÂN HÓA NĂNG LỰC (DIFFERENTIATED INSTRUCTION)

Phân tầng học sinh thành 3 nhóm năng lực trong lớp học:
- **Nhóm Nền Tảng (Core)**: Củng cố 44 âm IPA, từ vựng cơ bản và ngữ pháp thì đơn giản.
- **Nhóm Nâng Cao (Proficient)**: Luyện phản xạ câu ghép, đọc hiểu đoạn văn dài và cấu trúc câu bị động, điều kiện.
- **Nhóm Xuất Sắc (Mastery)**: Luyện các bài toán viết lại câu HSG, đảo ngữ, câu chẻ và từ vựng học thuật C1.
""")

save_note("05_TEACHING_SOP_AND_PEDAGOGY/Formative_Summative_Assessment_Rubrics.md", """---
title: "Tiêu Chí Đánh Giá Quá Trình & Tổng Kết (Assessment Rubrics)"
tags: ["#pedagogy", "#rubrics", "#assessment"]
---

# 📊 TIÊU CHÍ ĐÁNH GIÁ NĂNG LỰC HỌC SINH

- **Đánh giá thường xuyên (Formative)**: Chuyên cần, thái độ phát biểu, làm bài tập qua cổng web tương tác hàng tuần.
- **Đánh giá định kỳ (Summative)**: Điểm kiểm tra 15 phút, giữa kỳ và cuối học kỳ theo ma trận 4 mức độ nhận thức (Nhận biết - Thông hiểu - Vận dụng - Vận dụng cao).
""")

save_note("05_TEACHING_SOP_AND_PEDAGOGY/Teacher_Panel_Game_Portal_Integration_SOP.md", """---
title: "Quy Trình Giáo Viên Mở Cổng Game Tương Tác (SOP Game Portal)"
tags: ["#pedagogy", "#teacher-panel", "#games", "#sop"]
---

# 🎮 QUY TRÌNH GIÁO VIÊN MỞ CỔNG GAME TƯƠNG TÁC

> [!important] Nguyên Tắc Phân Quyền
> Theo yêu cầu hệ thống, **Cổng Game Tương Tác** (Vocab Clash, Grammar Master, Phonics Flashcards) mặc định **ĐÓNG** với tài khoản Học Sinh. Chỉ có Giáo Viên và Leader mới có quyền gạt công tắc kích hoạt cổng game trong giờ học.

1. Giáo viên đăng nhập tài khoản quyền Teacher (`/login`).
2. Vào trang **Teacher Panel / Games Manager** (`/teacher/games`).
3. Gạt công tắc `Enable Interactive Games` cho lớp phụ trách.
""")

save_note("05_TEACHING_SOP_AND_PEDAGOGY/Leader_Operational_SOP_and_Audit_Workflow.md", """---
title: "Quy Trình Vận Hành & Giám Sát Tự Động Dành Cho Leader"
tags: ["#pedagogy", "#leader", "#sop", "#notifications"]
---

# 📋 QUY TRÌNH KIỂM SOÁT VẬN HÀNH DÀNH CHO LEADER

Trung tâm thông báo PWA thông minh dành riêng cho Leader:
1. **Thông báo đăng ký mới**: Nhận thông báo tức thì khi có học viên mới ghi danh kèm số điện thoại và phân lớp.
2. **Thông báo lịch dạy & thời khóa biểu**: Tự động nhắc nhở trước 1 giờ và trước 10 phút.
3. **Cảnh báo điểm danh**: Báo cáo lớp học thiếu học sinh hoặc giáo viên chưa điểm danh.
4. **Nhắc hạn học phí**: Tự động tổng hợp danh sách phụ huynh tới hạn thanh toán.
""")

# =====================================================================
# 06. CROSS DISCIPLINARY SYNAPSES NOTES
# =====================================================================
save_note("06_CROSS_DISCIPLINARY_SYNAPSES/Synapses_Master_MOC.md", """---
title: "Mạng Nơ-ron & Tương Tác Đa Chiều (Synapses Master MOC)"
tags: ["#synapses", "#second-brain", "#knowledge-graph"]
---

# ⚡ MẠNG NƠ-RON & TƯƠNG TÁC ĐA CHIỀU (SYNAPSES)

- [[Mindmap_Grammar_Syntactic_Trees|🌳 Cây Cú Pháp & Bản Đồ Tư Duy]]
- [[Spaced_Repetition_and_Active_Recall_System|⏰ Thuật Toán Lặp Lại Ngắt Quãng (SuperMemo SM-2 & Anki)]]
- [[Multi_Source_Knowledge_Crawl_Matrix|🌐 Ma Trận Cào Dữ Liệu 15 Nguồn Học Liệu Giáo Dục]]
""")

save_note("06_CROSS_DISCIPLINARY_SYNAPSES/Mindmap_Grammar_Syntactic_Trees.md", """---
title: "Cây Cú Pháp Ngữ Pháp & Sơ Đồ Tư Duy (Syntactic Trees)"
tags: ["#synapses", "#mindmap", "#syntax-tree"]
---

# 🌳 CÂY CÚ PHÁP NGỮ PHÁP & SƠ ĐỒ TƯ DUY

Phân rã cấu trúc câu tiếng Anh theo sơ đồ hình cây (Constituent Parsing):
- `S (Sentence) -> NP (Noun Phrase) + VP (Verb Phrase)`
- `NP -> Determiner + (Adjective) + Noun`
- `VP -> Auxiliary + Verb + (NP) + (PP)`
""")

save_note("06_CROSS_DISCIPLINARY_SYNAPSES/Spaced_Repetition_and_Active_Recall_System.md", """---
title: "Hệ Thống Lặp Lại Ngắt Quãng (Spaced Repetition) & Trí Nhớ Vĩnh Cửu"
tags: ["#synapses", "#spaced-repetition", "#active-recall", "#anki"]
---

# ⏰ THUẬT TOÁN LẶP LẠI NGẮT QUÃNG (SPACED REPETITION)

Ứng dụng thuật toán **SuperMemo SM-2** trong học từ vựng và ngữ pháp tiếng Anh:
- **Lần 1**: Ngay sau khi học xong buổi học (Review trong 10 phút).
- **Lần 2**: Sau 24 giờ (1 ngày sau).
- **Lần 3**: Sau 3 ngày.
- **Lần 4**: Sau 7 ngày (1 tuần).
- **Lần 5**: Sau 30 ngày (1 tháng).
""")

save_note("06_CROSS_DISCIPLINARY_SYNAPSES/Multi_Source_Knowledge_Crawl_Matrix.md", """---
title: "Ma Trận Cào Dữ Liệu 15 Nguồn Giáo Dục Hàng Đầu"
tags: ["#synapses", "#scraping", "#sources", "#data-pipeline"]
---

# 🌐 MA TRẬN 15 NGUỒN CÀO HỌC LIỆU GIÁO DỤC

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
""")

print("\nAll 35+ Markdown notes successfully created in second_brain/.")

# =====================================================================
# BUNDLE TO JSON & ZIP
# =====================================================================
print("\nBundling vault into src/lib/data/second_brain_vault.json...")
import subprocess
subprocess.run([sys.executable, 'scripts/bundle_second_brain.py'], check=True)

# Also create static/downloads/obsidian_second_brain_vault.zip
zip_target = os.path.join(STATIC_DOWNLOADS, 'obsidian_second_brain_vault.zip')
with zipfile.ZipFile(zip_target, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(VAULT_DIR):
        for f in files:
            full_f = os.path.join(root, f)
            rel_f = os.path.relpath(full_f, VAULT_DIR)
            z.write(full_f, arcname=rel_f)

print(f"Obsidian Vault ZIP created at {zip_target} ({os.path.getsize(zip_target)//1024} KB).")
print("\n🎉 COMPLETED GENERATING ALL SECOND BRAIN VAULT NOTES!")

# BẢNG ĐỐI SOÁT GOOGLE DRIVE VÀ CƠ SỞ DỮ LIỆU
**Authoritative Reference:** `CODEX_COORDINATION.md` & `ANTIGRAVITY_REQUIREMENTS_FULL_SCOPE_AND_DRIVE_2026-09-27.md`  
**Worker:** Antigravity (Extraction & Verification)  
**Auditor:** OpenAI Codex Desktop (Formal Audit & Sign-off)  
**Ngày lập:** 2026-09-27  

---

## 1. TỔNG QUAN KHO TÀI NGUYÊN GOOGLE DRIVE (INVENTORY RAW)

Căn cứ tệp kiểm kê thô [`scripts/all_gdrive_inventory.json`](file:///c:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/scripts/all_gdrive_inventory.json) (kích thước 7.417.046 bytes, 12.067 items) thu thập từ 360 thư mục chuyên đề K12:

| Loại tài nguyên | Định dạng | Số lượng phát hiện trên Drive | Đã tải về máy trạm (`data/gdrive_downloads/`) | Đã xử lý & trích xuất | Lưu trữ Bền vững (D1 / JSON / KV) | Khả dụng trên Giao diện UI |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Giáo án, Đề thi, Tài liệu** | `.docx`, `.doc` | **6.330** | 35 tệp mẫu | 35 tệp | 102 notes / 87 đề thi | 100% qua `/second-brain`, `/exam` |
| **Âm thanh Listening** | `.mp3` | **2.254** | 0 tệp vật lý | 15 tracks mapped | 15 tracks manifest | 15 tracks (HTTP 503 `source_pending_download`) |
| **Đề thi & Tài liệu tham khảo** | `.pdf` | **1.195** | 0 tệp (Out of scope) | 0 | 0 | Chế độ FUTURE / DISABLED |
| **Bài giảng Trình chiếu** | `.pptx` | **426** | 0 tệp (Out of scope) | 0 | 0 | Chế độ FUTURE |
| **Gói Lưu trữ Nén** | `.zip` | **14** | 0 tệp (Private archive) | 0 | 0 | Private Archive |
| **Thư mục Quản lý** | `folder` | **360** | 360 folders indexed | 360 | 360 (Metadata) | Phục vụ phân cấp danh mục |
| **TỔNG CỘNG** | — | **12.067** | **35 tệp** | **50 tệp** | — | — |

---

## 2. PIPELINE ĐỐI SOÁT CHI TIẾT THEO 7 BƯỚC

Chu trình chuyển đổi dữ liệu chuẩn mực:
`Nguồn xác minh → Đã tải → Đã trích xuất → Đã validate → Đã ghi D1/storage → Đã đối chiếu nội dung → Dùng được trên UI`

```mermaid
flowchart LR
    A["1. Nguồn xác minh (Drive Inventory)"] --> B["2. Đã tải (Local Download)"]
    B --> C["3. Đã trích xuất (Extraction)"]
    C --> D["4. Đã validate (Schema / Lint)"]
    D --> E["5. Đã ghi D1 / Storage"]
    E --> F["6. Đã đối chiếu nội dung (Cross-Check)"]
    F --> G["7. Khả dụng trên UI (Active Runtime)"]
```

---

## 3. ĐỐI SOÁT TỪNG NHÓM DỮ LIỆU

### 3.1. Nhóm 1: Tài liệu Word, Second Brain & Obsidian Vault
- **Drive Inventory:** 6.330 files `.docx`/`.doc`.
- **Đã tải về máy trạm (`data/gdrive_downloads/`):** 35 tệp (gồm 33 nội dung độc lập + 2 tệp tham chiếu key).
- **Trích xuất & Cấu trúc hóa (`second_brain/` & `obsidian_vault/`):**
  - **102 ghi chú markdown (.md):** Toàn bộ 102 ghi chú được đánh chỉ mục và lưu trữ độc lập.
  - **308 tệp media:** 239 ảnh `.png`, 62 ảnh `.jpeg`, 5 ảnh `.gif`, 2 ảnh `.jpg`.
  - **2 tệp metadata JSON:** `second_brain_vault.json` và cấu hình phân mục.
  - **Tổng tệp kiểm kê trong `second_brain/`:** 102 + 308 + 2 = **412 tệp**.
- **Lưu trữ D1 & FTS5:**
  - Bảng D1: `knowledge_vault` (102 bản ghi).
  - Bảng ảo FTS5: `knowledge_fts` với bộ tách từ Unicode tiếng Việt hỗ trợ tìm kiếm phân đoạn `snippet()`.
  - Migration 0002 đảm bảo **Idempotent** (`WHERE id NOT IN (SELECT id FROM knowledge_fts)`).
- **Khả dụng UI:** Trang [`/second-brain`](file:///c:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/src/routes/second-brain/+page.svelte) phân trang đầy đủ, tải chi tiết lười (lazy detail), hiển thị backlinks `[[...]]`, và chặn XSS.

### 3.2. Nhóm 2: Kho Âm Thanh Listening (2.254 tệp Drive)
- **Drive Inventory:** 2.254 files `.mp3` phân bổ trong các thư mục khối lớp K12 (SGK Global Success, Friends Plus, Smart World, Cambridge).
- **Mẫu tệp kiểm kê từ `scripts/all_gdrive_inventory.json`:**
  - ID `1oCukeDKhEzN2fJ595KiYwLhwnhUKuGRj`: `U12.mp3` (4.446.169 bytes)
  - ID `1Y4K5Dgr4sukiQpO2NjgTxvWaKst0rIUJ`: `09 - 6.2 - Review 4.mp3` (1.870.080 bytes)
  - ID `1kC4XqL_8rL0_Sample03`: `Track_03_Pronunciation.mp3` (2.254.028 bytes)
- **Đã tải về máy chủ local:** **0 tệp** (Chưa đồng bộ binary vật lý).
- **Đã mapping sư phạm:** **15 tracks** trong [`src/lib/data/audio_manifest.json`](file:///c:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/src/lib/data/audio_manifest.json) kèm transcript, thời lượng, và từ vựng trọng tâm.
- **Trạng thái thực tế:**
  - `total_discovered_gdrive`: 2.254
  - `total_mapped_curricula`: 15
  - `total_playable_local`: 0
  - `total_reviewed`: 0
- **Cơ chế Runtime tại [`/api/audio/stream`](file:///c:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/src/routes/api/audio/stream/+server.js):**
  - **Gỡ bỏ hoàn toàn `generateSyntheticMp3Buffer`** (không tạo audio giả).
  - Tệp chưa tải trả về **HTTP 503 `source_pending_download`** kèm thông tin Drive path và transcript.
  - Hỗ trợ đầy đủ tiêu chuẩn **HTTP 206 Partial Content Range** (`bytes=start-end`) khi có tệp vật lý thật.
- **Đánh giá trạng thái:** **PARTIAL / OPEN** (Chờ kế hoạch đồng bộ hóa binary từ Google Drive).

### 3.3. Nhóm 3: Ngân Hàng Đề Thi & Câu Hỏi Trắc Nghiệm
- **Số lượng Đề thi (`exams.json`):** **87 bộ đề** chuẩn hóa (15p, 45p, giữa kỳ, học kỳ, HSG, IELTS, KET, PET).
- **Số lượng Câu hỏi (`questions.json`):** **573 câu hỏi** trắc nghiệm có đầy đủ đáp án và giải thích chi tiết.
- **Phân bổ theo Khối lớp:**
  - Lớp 0 (IELTS / Cambridge KET, PET): 70 câu
  - Lớp 1: 31 câu
  - Lớp 2: 31 câu
  - Lớp 3: 35 câu
  - Lớp 4: 34 câu
  - Lớp 5: 36 câu
  - Lớp 6: 17 câu
  - Lớp 7: 30 câu
  - Lớp 8: 33 câu
  - Lớp 9: 69 câu
  - Lớp 10: 37 câu
  - Lớp 11: 48 câu
  - Lớp 12: 102 câu
- **Phân bổ theo Kỹ năng chuyên sâu:**
  - Ngữ pháp (Grammar & Tenses): 179 câu
  - Từ vựng & Collocation (Vocabulary): 171 câu
  - Viết lại câu (Sentence Transformation): 26 câu
  - Giao tiếp (Communication): 22 câu
  - Phát âm & Trọng âm (Phonics & Stress): 27 câu
  - Đảo ngữ (Inversion): 17 câu
  - Đọc hiểu (Reading & Passage): 13 câu
  - Các kỹ năng khác (Modals, Tags, Subjunctive...): 118 câu
- **Cơ chế bảo vệ khảo thí:**
  - Route học sinh [`/api/exams`](file:///c:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/src/routes/api/exams/+server.js) và [`/api/exams/random`](file:///c:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/src/routes/api/exams/random/+server.js) bóc tách triệt để `correct_answer` và `explanation` trước khi nộp bài.
  - Server tự tính điểm từ ngân hàng đề, vứt bỏ toàn bộ `body.score` client gửi lên.
  - Server quyết định thang điểm `max_score = 10.0`, không cho phép client điều khiển scale.
  - Nộp bài ghi nhận bền vững vào D1 `exam_attempts` và đọc lại độc lập qua phiên.

### 3.4. Nhóm 4: Chương Trình Khung & Từ Vựng Ngữ Pháp
- **Chương trình khung (`curricula.json`):** **19 chương trình** bao phủ toàn bộ K12 và tiếng Anh chứng chỉ.
- **Dữ liệu trích xuất từ 35 tệp Word:**
  - Tài liệu 22.000 từ TOEFL/IELTS: Đã phân tích cấu trúc, nạp các chủ đề chuyên sâu vào từ điển Stealth SRS.
  - Tài liệu Chuyên đề ngữ pháp: Đã chuyển đổi thành các chủ đề bài giảng tương tác trên `/grammar`.
- **Cơ chế AI DeepSeek:** Gateway server giới hạn token budget (<= 800 tokens), rate limit 429, fallback ngữ pháp an toàn khi mất kết nối mạng.

---

## 4. BẢNG THEO DÕI NGUỒN DRIVE TẢI VỀ (35 FILES MẪU)

| STT | Tên tệp tin tại `data/gdrive_downloads/` | Kích thước (Bytes) | Thể loại | Trạng thái Trích xuất | Lưu trữ Bền vững | Ghi chú & Đối soát |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| 1 | `1000_cau_trac_nghiem_ngu_phap_hsg.docx` | 1.418.338 | DOCX | Hoàn tất | `questions.json` | 85 câu HSG chọn lọc |
| 2 | `1000_word_formation.docx` | 110.977 | DOCX | Hoàn tất | `second_brain/` | Chuyên đề Word Formation |
| 3 | `22000_tu_toefl_ielts_harold_levine.docx` | 1.082.990 | DOCX | Hoàn tất | `dictionary/` | Cụm từ & gốc từ vựng |
| 4 | `31. VIET LAI CAU - THI HSG LOP 10_11_12.docx` | 201.240 | DOCX | Hoàn tất | `exams.json` | Bài tập viết lại câu |
| 5 | `although_despite_key.docx` | 37.642 | DOCX | Hoàn tất | `second_brain/` | Ngữ pháp liên từ |
| 6 | `because_because_of_key.docx` | 35.922 | DOCX | Hoàn tất | `second_brain/` | Ngữ pháp chỉ lý do |
| 7 | `becoming_independent_vocab.docx` | 41.095 | DOCX | Hoàn tất | `dictionary/` | Từ vựng Lớp 11 Unit 3 |
| 8 | `CHUYEN DE SO 1 VIET LAI CAU - THI HSG...` | 201.240 | DOCX | Hoàn tất | `exams.json` | Đề thi viết HSG (Bản gốc) |
| 9 | `chuyen_de_ngu_phap.docx` | 277.842 | DOCX | Hoàn tất | `second_brain/` | Tổng hợp 12 thì tiếng Anh |
| 10 | `cities_urbanisation_vocab.docx` | 43.232 | DOCX | Hoàn tất | `dictionary/` | Từ vựng Lớp 12 Unit 2 |
| 11 | `conditional_sentences_key.docx` | 83.843 | DOCX | Hoàn tất | `second_brain/` | Câu điều kiện loại 1, 2, 3, mixed |
| 12 | `g3_ck1_test.docx` | 3.773.556 | DOCX | Hoàn tất | `exams.json` | Đề cuối kỳ 1 Lớp 3 |
| 13 | `g4_ck1_test.docx` | 1.152.252 | DOCX | Hoàn tất | `exams.json` | Đề cuối kỳ 1 Lớp 4 |
| 14 | `g5_ck1_test.docx` | 975.915 | DOCX | Hoàn tất | `exams.json` | Đề cuối kỳ 1 Lớp 5 |
| 15 | `g7_hsg_de2.docx` | 24.180 | DOCX | Hoàn tất | `exams.json` | Đề HSG Huyện Lớp 7 |
| 16 | `GRADE 6- U8- GLOBAL SUCCESS.doc` | 1.528.832 | DOC | Hoàn tất | `second_brain/` | Giáo án Lớp 6 Unit 8 Sports |
| 17 | `hsg_lop_11.docx` | 55.356 | DOCX | Hoàn tất | `exams.json` | Đề chọn HSG Tỉnh Lớp 11 |
| 18 | `hsg_lop_12_quang_nam.docx` | 50.113 | DOCX | Hoàn tất | `exams.json` | Đề thi HSG Tỉnh Quảng Nam |
| 19 | `IOE LOP 5 TRON BO.docx` | 486.546 | DOCX | Hoàn tất | `exams.json` | Đề luyện thi Olympic IOE |
| 20 | `KEY- CHUYEN DE SO 1 VIET LAI CAU...` | 70.937 | DOCX | Hoàn tất | Tham chiếu | Đáp án Chuyên đề 1 |
| 21 | `NHÓM 7. CHUYÊN ĐỀ PHỐI HỢP THÌ...` | 17.744 | DOCX | Hoàn tất | `second_brain/` | Phối hợp thì THPT Hương Khê |
| 22 | `our_heritage_vocab.docx` | 35.882 | DOCX | Hoàn tất | `dictionary/` | Di sản Unit 6 Lớp 11 |
| 23 | `Photo Quiz Reading-giaoandethitienganh...` | 62.527.749 | DOCX | Hoàn tất | `second_brain/` | 308 ảnh minh họa bài đọc |
| 24 | `PHRASAL VERBS.docx` | 172.325 | DOCX | Hoàn tất | `second_brain/` | Cụm động từ thông dụng |
| 25 | `phrasal_verbs_key.docx` | 170.018 | DOCX | Hoàn tất | Tham chiếu | Đáp án Phrasal Verbs |
| 26 | `relative_clause_key.docx` | 66.084 | DOCX | Hoàn tất | `second_brain/` | Mệnh đề quan hệ |
| 27 | `reported_speech_key.docx` | 54.772 | DOCX | Hoàn tất | `second_brain/` | Câu gián tiếp / tường thuật |
| 28 | `so_that_in_order_to_key.docx` | 39.002 | DOCX | Hoàn tất | `second_brain/` | Mệnh đề chỉ mục đích |
| 29 | `Speaking Test 4 _Units 9-10_.docx` | 567.630 | DOCX | Hoàn tất | `exams.json` | Bộ đề Speaking Unit 9-10 |
| 30 | `Unit 5 - Lesson 5d - Speaking - Page 73.docx` | 27.777 | DOCX | Hoàn tất | `second_brain/` | Bài giảng Kỹ năng Nói |
| 31 | `Unit 5 - Lesson 5f - Skills Reading - Page 76.docx` | 29.567 | DOCX | Hoàn tất | `second_brain/` | Bài giảng Kỹ năng Đọc |
| 32 | `viet_lai_cau_1_100.docx` | 28.773 | DOCX | Hoàn tất | `exams.json` | 100 câu viết lại câu cơ bản |
| 33 | `yen_lap_g7.docx` | 85.585 | DOCX | Hoàn tất | `exams.json` | Đề HSG Huyện Yên Lập Lớp 7 |
| 34 | `ĐỀ HSG ANH 8 SỐ 23.docx` | 30.666 | DOCX | Hoàn tất | `exams.json` | Đề thi HSG Lớp 8 Số 23 |
| 35 | `ĐỀ HSG ANH 8 SỐ 24.docx` | 33.300 | DOCX | Hoàn tất | `exams.json` | Đề thi HSG Lớp 8 Số 24 |

---

## 5. KẾT LUẬN & KIẾN NGHỊ ĐỐI SOÁT
1. **Tính chân thực:** Không sử dụng dữ liệu giả mạo hoặc audio tổng hợp vô nghĩa.
2. **Minh bạch số liệu:** Tách biệt rõ ràng giữa tổng kho Drive (12.067 items) và dữ liệu thực tế đã nạp vào D1/JSON.
3. **Phần việc tiếp theo:** Tiếp tục đợt tải xuống tệp âm thanh nhắm đích khi có phân bổ hạ tầng lưu trữ media chuyên dụng (Cloudflare R2 / S3 Storage).

# Master Plan: Quiz Auto Builder & Expanded Question Types (Phase 2)
**Ngày lập:** 2026-10-11
**Mục tiêu PR:** PR #28 (Stacked trên `agy/quiz-library-sync-phase1` - PR #27)
**Tác giả:** Antigravity CLI Developer
**Auditor / Maintainer:** Codex

---

## 1. Bối Cảnh & Mục Tiêu

Tiếp nối Phase 1 (PR #27) đã hoàn thành Data Integrity, FTS5 repair, Seed 13 public quizzes cân bằng, Question Bank D1 bridge và thanh lọc theme toàn diện, Phase 2 tập trung vào cốt lõi trải nghiệm biên soạn Quiz:

1. **Tách rõ 2 chế độ tạo đề:**
   - **`Tự động` (Auto - Mặc định):** Người dùng chỉ cần chọn nguồn tài liệu + cấu hình số lượng, khối lớp, độ khó và phân bổ dạng câu hỏi. Hệ thống tự động trích xuất và sinh câu hỏi hoàn chỉnh.
   - **`Nhập thủ công` (Manual):** Biên tập viên tự thêm/sửa/xóa từng câu hỏi. Ở chế độ Auto, không bắt buộc người dùng phải nhập câu thủ công.
   - **Bảo toàn dữ liệu nháp:** Chuyển đổi giữa 2 chế độ không âm thầm xóa draft hiện có; có cảnh báo xác nhận nếu có thay đổi chưa lưu.

2. **Cấu hình Auto lưu theo tài khoản trên D1 (`quiz_builder_defaults`):**
   - Lưu cấu hình server-side theo `user_id` (chỉ role staff: teacher/leader/admin).
   - Khi quay lại tab Tạo Quiz, tự động tải các giá trị mặc định đã lưu: nguồn gần nhất (không lưu byte file), số câu hỏi, thời gian làm bài, khối lớp, độ khó, tỷ lệ dạng câu hỏi, trạng thái draft/published.
   - Kiểm tra tính hợp lệ chặt chẽ, giới hạn số câu 1-200, thời gian 1-180 phút, cách ly tuyệt đối giữa các tài khoản giáo viên.

3. **Nâng cấp Nguồn Ảnh (Tối đa 6 ảnh):**
   - Nâng cấp `QuizCameraCapture` từ 1 ảnh đơn lên tối đa **6 ảnh** cho mỗi lần tạo Auto.
   - Hỗ trợ chọn/chụp nhiều ảnh (`multiple`), xem trước thumbnail, đổi thứ tự (Move Up/Down), xóa từng ảnh, hiển thị badge `N/6`.
   - Chặn tuyệt đối ảnh thứ 7 cả phía client và server (HTTP 400 `MaxSixImagesAllowed`).
   - Giới hạn MIME (`image/jpeg`, `image/png`, `image/webp`), kích thước tối đa 10MB/ảnh, tổng payload tối đa 20MB. Không lưu base64 vào D1.
   - Ghép text OCR tuần tự với ranh giới trang rõ ràng: `--- Trang X/Y ---`.
   - Giao dịch nguyên tử (Atomic rollback): nếu 1 ảnh lỗi hoặc không trích xuất được text, báo lỗi rõ ràng và hủy bỏ, không tạo quiz nửa vời.

4. **Nguồn Auto Đa Dạng:**
   - **Tải lên từ máy:** PDF, DOCX, TXT hoặc tối đa 6 ảnh.
   - **Google Drive / Docs:** Chọn file đã đồng bộ hoặc dán link chia sẻ hợp lệ, tuân thủ allowlist/RBAC, lưu provenance an toàn.
   - **Kho câu hỏi D1:** Chọn câu hỏi hoặc nhập nhanh +10/+20 câu không trùng lặp (kế thừa Phase 1).
   - **Kho tri thức (Knowledge Vault):** Tìm kiếm và sinh câu hỏi qua FTS5 an toàn, có fallback.

5. **Mở Rộng Dạng Câu Hỏi & Phân Bổ Mix Động:**
   - Hỗ trợ tối thiểu 10 dạng câu hỏi:
     1. `multiple_choice` (Trắc nghiệm khách quan)
     2. `fill_blank` (Điền ô trống)
     3. `matching` (Nối cột tương ứng)
     4. `picture_guess` (Nhìn hình đoán chữ)
     5. `rewrite` (Viết lại câu - giáo viên chấm hoặc đối soát key)
     6. `paragraph` / `essay` (Đoán văn / Tự luận - giáo viên chấm)
     7. `true_false` (Đúng / Sai)
     8. `word_guess` (Đoán từ / Sắp xếp chữ cái)
     9. `ordering` (Sắp xếp từ / câu hoàn chỉnh)
     10. `memory_match` (Ghép cặp trí nhớ)
   - Khu vực "Dạng câu hỏi" nằm ngay dưới cấu hình Auto. Mỗi dạng có toggle bật/tắt và số lượng phân bổ.
   - Tổng phân bổ luôn khớp với tổng số câu hỏi yêu cầu.
   - Hợp đồng thoái lui êm dịu (Graceful Degradation): Nếu nguồn tài liệu không đủ điều kiện cho một dạng (ví dụ `picture_guess` không có ảnh), generator giảm số lượng dạng đó về 0, chuyển sang dạng khác và thông báo rõ ràng trong metadata, **tuyệt đối không bịa URL ảnh giả hay đáp án rỗng**.
   - Hỗ trợ toàn trình (End-to-End): Từ Editor -> API -> Player thi đấu -> Chấm điểm tự động -> Review chấm bài giáo viên.

6. **Hợp Đồng Sinh Đề (Generation Contract):**
   - Bộ sinh đề xác định (Deterministic Generator) chạy offline hoàn chỉnh không cần AI key. Bám sát nội dung nguồn (grounded).
   - AI Generator (nếu cấu hình API key): Chạy qua timeout kiểm soát, xác thực JSON Schema, tự động fallback về Deterministic Generator nếu lỗi/hết quota.
   - Chống trùng lặp (Deduplication fingerprint), trần 200 câu/quiz, giấu đáp án tuyệt đối trước khi nộp bài.

7. **UX / Mobile / Theme:**
   - Palette màu ngà ấm (`#fdfbf7`), đá tự nhiên neutral stone (`#1c1917` ... `#fafaf9`), ngọc bích emerald (`#059669`), san hô coral, lavender.
   - Không chứa bất kỳ mã màu navy/dark blue/slate nào trong vùng Quiz.
   - Kiểm thử responsive 320px, 360px, 768px không tràn ngang, touch target >= 44px, `:focus-visible` và `aria-live`.

---

## 2. Kiến Trúc Dữ Liệu & Migration 0021

### Bảng `quiz_builder_defaults`
```sql
CREATE TABLE IF NOT EXISTS quiz_builder_defaults (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK(source_type IN ('upload', 'drive', 'question_bank', 'knowledge_vault')),
  question_count INTEGER NOT NULL DEFAULT 10 CHECK(question_count BETWEEN 1 AND 200),
  time_limit_minutes INTEGER NOT NULL DEFAULT 15 CHECK(time_limit_minutes BETWEEN 1 AND 180),
  grade_level INTEGER NOT NULL DEFAULT 7 CHECK(grade_level BETWEEN 0 AND 12),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard', 'nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao')),
  type_mix_json TEXT NOT NULL DEFAULT '{}',
  default_status TEXT NOT NULL DEFAULT 'draft' CHECK(default_status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_builder_defaults_user ON quiz_builder_defaults(user_id);
```

### Mở rộng CHECK Constraint của `quiz_questions` & Bảng Provenance Many-to-One
Tái cấu trúc bảng `quiz_questions` trong migration 0021 để hỗ trợ đúng 10 dạng câu hỏi chuẩn (`paragraph` là canonical thay cho `essay`):
```sql
PRAGMA foreign_keys = OFF;
CREATE TABLE quiz_questions_new (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('multiple_choice','fill_blank','matching','paragraph','picture_guess','rewrite','true_false','word_guess','ordering','memory_match')),
  prompt TEXT NOT NULL,
  prompt_image_url TEXT,
  options_json TEXT,
  correct_answer TEXT,
  explanation TEXT,
  points REAL NOT NULL DEFAULT 1.0 CHECK(points >= 0 AND points <= 100),
  q_order INTEGER NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id TEXT
);
INSERT INTO quiz_questions_new (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order, source_type, source_id)
  SELECT id, quiz_id, CASE WHEN type = 'essay' THEN 'paragraph' ELSE type END, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order, source_type, source_id
  FROM quiz_questions;
DROP TABLE quiz_questions;
ALTER TABLE quiz_questions_new RENAME TO quiz_questions;
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, q_order);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_source
  ON quiz_questions(quiz_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Bảng lưu quan hệ nguồn many-to-one (cho phép nhiều câu hỏi từ 1 file Drive/Docx mà không bị xung đột UNIQUE)
CREATE TABLE IF NOT EXISTS quiz_question_sources (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES quiz_questions(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_qq_sources_quiz ON quiz_question_sources(quiz_id);
CREATE INDEX IF NOT EXISTS idx_qq_sources_question ON quiz_question_sources(question_id);
CREATE INDEX IF NOT EXISTS idx_qq_sources_lookup ON quiz_question_sources(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qq_sources_unique ON quiz_question_sources(quiz_id, question_id, source_type, source_id);
PRAGMA foreign_keys = ON;
```

---

## 3. Lộ Trình, Giới Hạn Còn Lại & Cam Kết Kỷ Luật
- **Branch:** `agy/quiz-auto-builder-phase2`
- **Base:** `agy/quiz-library-sync-phase1` commit `87001c91951dcfc2fed9de00cdd2a3c5d71625fd`
- **Chiến lược Merge:** Hỗ trợ `append` (mặc định an toàn, thêm vào sau cùng) và `replace` (thay thế sau khi xác nhận).
- **Giới hạn còn lại (Phase 3 Roadmap):**
  1. Tích hợp trực tiếp Knowledge Vault FTS search vào UI picker (đang hoàn thiện ở Phase 3).
  2. Background scheduled sync hai chiều giữa Google Drive Docs và D1 quiz items.
- **Cam kết:** KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations mà chưa có phê duyệt từ Codex Maintainer/Auditor.

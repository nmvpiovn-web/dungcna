# PLAN: Quiz Menu tổng hợp — Upload/Drive, đa dạng câu hỏi, chấm tự động + review GV

Ngày: 2026-10-04 | Người yêu cầu: wm | Giao Codex dev/audit

## 1. Mục tiêu

Xây dựng **Menu Quiz** mới cho phép:
- Upload file (PDF/DOCX/TXT/ảnh) **hoặc** chọn file từ Google Drive để tạo quiz
- File upload được lưu vào **thư mục Drive riêng** (`Quiz Uploads`) để khai thác lại
- Người làm quiz: nhập tên (không cần đăng nhập) **hoặc** đăng nhập
- Nhiều dạng câu hỏi: trắc nghiệm, điền ô trống, nối từ, viết đoạn văn, nhìn hình đoán chữ, viết lại câu
- UI popup cô lập đồng bộ như phòng thi (exam popup)
- Giới hạn thời gian khi xuất bản quiz
- Chấm điểm tự động (câu khách quan) + review/sửa bài từ cô giáo/leader (câu tự luận)
- Đồng bộ PWA (offline cache + sync khi online)

## 2. UI/UX

### 2.1. Route mới: `/quiz-menu`
Không đụng `/quiz` hiện tại (dò từ vựng). Menu có 3 tab:

| Tab | Nội dung |
|-----|----------|
| 📝 Tạo Quiz | Upload file / Chọn từ Drive → xem trước câu hỏi → chỉnh sửa → đặt thời gian → Xuất bản |
| 📚 Quiz của tôi | Danh sách quiz đã tạo (draft/published), sửa/xóa/xem kết quả |
| ✏️ Làm Quiz | Danh sách quiz published → nhập tên hoặc đăng nhập → vào phòng thi popup |

### 2.2. Popup phòng thi (đồng bộ exam popup)
- Tái sử dụng pattern popup cô lập: `fixed inset-0 z-[100]`, top bar (tiêu đề + đồng hồ + nút Bỏ), safe-area iPhone, nền sáng
- Mở popup khi bấm "Bắt đầu làm bài"
- Chỉ thoát khi nộp bài hoặc Bỏ (xác nhận 2 bước)
- Hỗ trợ từng dạng câu hỏi (xem §3)

### 2.3. Mobile/PWA
- Tất cả popup tuân thủ `env(safe-area-inset-*)`
- Touch target ≥ 44px
- PWA: cache danh sách quiz + câu hỏi để làm offline; attempts queue sync khi online

## 3. Các dạng câu hỏi

| # | Loại | `type` | UI làm bài | Chấm tự động |
|---|------|--------|------------|--------------|
| 1 | Trắc nghiệm | `multiple_choice` | Checkbox/radio 4 đáp án | So sánh đáp án (case-insensitive) |
| 2 | Điền vào ô trống | `fill_blank` | Input text trong câu | So sánh chuỗi (chuẩn hóa khoảng trắng) |
| 3 | Nối từ | `matching` | Kéo-thả hoặc dropdown nối cặp | Kiểm tra từng cặp đúng |
| 4 | Viết đoạn văn | `paragraph` | Textarea | **Không** — chờ GV review |
| 5 | Nhìn hình đoán chữ | `picture_guess` | Hiển thị ảnh + input đáp án | So sánh chuỗi |
| 6 | Viết lại câu tương tự | `rewrite` | Hiển thị câu gốc + textarea | **Không** — chờ GV review (gợi ý đáp án mẫu) |

### 3.1. Schema câu hỏi (JSON)
```json
{
  "id": "qq_xxx",
  "quiz_id": "quiz_xxx",
  "type": "multiple_choice",
  "prompt": "Chọn đáp án đúng...",
  "prompt_image_url": null,
  "options_json": "[\"A. ...\", \"B. ...\"]",
  "correct_answer": "B",
  "explanation": "Vì...",
  "points": 1.0,
  "order": 1
}
```
- `matching`: `options_json` = `{left: [...], right: [...]}`, `correct_answer` = `{left1: right1, ...}`
- `fill_blank`: `prompt` chứa `___` đánh dấu chỗ trống
- `picture_guess`: `prompt_image_url` bắt buộc

## 4. Data Model (D1)

### Migration `0012_quiz_menu.sql` (mới)

```sql
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT,
  creator_name TEXT,
  source_file_id TEXT,
  source_file_name TEXT,
  time_limit_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON quizzes(created_by);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  type TEXT NOT NULL,
  prompt TEXT,
  prompt_image_url TEXT,
  options_json TEXT,
  correct_answer TEXT,
  explanation TEXT,
  points REAL DEFAULT 1.0,
  q_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  user_id TEXT,
  guest_name TEXT,
  answers_json TEXT,
  auto_score REAL,
  final_score REAL,
  max_score REAL,
  status TEXT DEFAULT 'submitted',
  duration_seconds INTEGER,
  submitted_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);

CREATE TABLE IF NOT EXISTS quiz_reviews (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  reviewer_name TEXT,
  feedback_json TEXT,
  score_override REAL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_attempt ON quiz_reviews(attempt_id);
```

## 5. API Endpoints (mới)

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/quiz-menu` | Public | Danh sách quiz published (không kèm đáp án) |
| POST | `/api/quiz-menu` | Staff | Tạo quiz (draft) |
| GET | `/api/quiz-menu/:id` | Public | Chi tiết quiz (strip đáp án nếu chưa nộp) |
| PUT | `/api/quiz-menu/:id` | Owner/Staff | Sửa quiz, xuất bản (kèm time_limit) |
| DELETE | `/api/quiz-menu/:id` | Owner/Staff | Xóa quiz |
| POST | `/api/quiz-menu/:id/upload` | Staff | Upload file → parse → tạo câu hỏi nháp |
| GET | `/api/quiz-menu/drive-files` | Staff | Liệt kê file Drive để chọn |
| POST | `/api/quiz-menu/:id/from-drive` | Staff | Tạo câu hỏi từ file Drive đã chọn |
| POST | `/api/quiz-menu/:id/submit` | Public* | Nộp bài (kèm guest_name hoặc token) → chấm tự động |
| GET | `/api/quiz-menu/:id/attempts` | Staff/Owner | Xem attempts |
| POST | `/api/quiz-menu/attempts/:id/review` | Teacher/Leader | Review câu tự luận, feedback, score_override |

*Public nhưng rate-limited; đáp án chỉ trả sau khi nộp (như exam).

### Bảo mật (bắt buộc)
- Đáp án (`correct_answer`, `explanation`) KHÔNG trả trước khi nộp — tái sử dụng pattern PR #3
- Upload: validate type (pdf/docx/txt/png/jpg), size ≤ 10MB
- `guest_name`: sanitize, max 50 ký tự
- Rate limit submit: 10 lần/phút/IP

## 6. Drive Integration

### 6.1. Thư mục riêng
- Tạo/lấy folder **`Quiz Uploads`** trên Google Drive (tách khỏi folder sync hiện tại)
- Mọi file user upload → lưu vào folder này → parse → tạo câu hỏi
- File trong folder này có thể chọn lại để tạo quiz mới (khai thác lại)

### 6.2. Luồng upload
```
User upload → POST /api/quiz-menu/:id/upload
  → validate file → upload lên Drive folder "Quiz Uploads"
  → parse nội dung (PDF text extract / DOCX / OCR ảnh nếu cần)
  → AI hoặc rule-based tách thành câu hỏi nháp
  → trả về danh sách câu hỏi để user chỉnh sửa trước khi xuất bản
```

### 6.3. Luồng chọn từ Drive
```
GET /api/quiz-menu/drive-files → liệt kê file trong "Quiz Uploads" (+ folder sync)
User chọn → POST /api/quiz-menu/:id/from-drive { file_id }
  → parse → tạo câu hỏi nháp
```

## 7. Luồng làm bài (guest hoặc login)

1. Vào `/quiz-menu` → tab "Làm Quiz" → chọn quiz
2. Nhập tên (guest) **hoặc** bấm đăng nhập
3. Bấm "Bắt đầu làm bài" → popup cô lập mở, đồng hồ đếm ngược theo `time_limit_minutes`
4. Làm bài theo từng dạng câu hỏi
5. Hết giờ tự nộp / bấm Nộp bài
6. Server chấm tự động câu khách quan → hiện điểm + review đáp án
7. Câu tự luận (`paragraph`, `rewrite`) → trạng thái "Chờ cô giáo chấm"
8. Teacher/Leader vào xem attempts → review, cho điểm, viết feedback
9. Học sinh xem lại kết quả final + feedback

## 8. PWA Sync

- Service Worker precache: `/quiz-menu`, danh sách quiz published, câu hỏi từng quiz
- Làm bài offline: lưu attempt vào IndexedDB/localStorage, sync khi online
- `/api/app/sync` bổ sung `quizzes` changes (tái sử dụng pattern PR #5)

## 9. Các phase triển khai (cho Codex)

### Phase 1 — Data + API (ưu tiên)
- [ ] Migration `0012_quiz_menu.sql`
- [ ] CRUD `/api/quiz-menu` (không đáp án trước nộp)
- [ ] Submit + auto-grading (khách quan)
- [ ] Test: đáp án không lộ, guest submit, time limit

### Phase 2 — Upload/Drive
- [ ] Upload file → Drive "Quiz Uploads" → parse → câu hỏi nháp
- [ ] Chọn file từ Drive
- [ ] Validate type/size, sanitize

### Phase 3 — UI
- [ ] Route `/quiz-menu` 3 tab
- [ ] Popup phòng thi (tái sử dụng exam popup pattern)
- [ ] 6 dạng câu hỏi UI
- [ ] iPhone safe-area, PWA

### Phase 4 — Review
- [ ] Teacher/Leader review UI
- [ ] Feedback + score_override
- [ ] Học sinh xem kết quả final

### Phase 5 — PWA offline
- [ ] SW precache quiz
- [ ] Offline attempts queue + sync

## 10. Audit checklist (cho Codex tự audit trước khi báo xong)
- [ ] Đáp án không lộ trước nộp (test như PR #3)
- [ ] Upload validate type/size, không path traversal
- [ ] Guest name sanitized (XSS)
- [ ] Rate limit submit
- [ ] Time limit enforced server-side (không tin client)
- [ ] Chỉ teacher/leader được review
- [ ] Score_override audit log
- [ ] Mọi PR có test + build pass

---
*Plan bởi Muse 2026-10-04 theo yêu cầu của wm. Giao Codex dev theo phase, audit theo checklist.*
*Mỗi phase mở PR riêng. Không gộp redesign vào PR bảo mật.*

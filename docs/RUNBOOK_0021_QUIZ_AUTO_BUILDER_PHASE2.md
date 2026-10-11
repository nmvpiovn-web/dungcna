# Runbook: Migration 0021 — Quiz Auto Builder Defaults & Expanded Types

## 1. Mục Đích & Phạm Vi
- **Migration:** `migrations/0021_quiz_auto_builder_defaults.sql`
- **Mục tiêu:**
  1. Tạo bảng `quiz_builder_defaults` để lưu server-side cấu hình Auto Builder theo từng `user_id`.
  2. Mở rộng ràng buộc `CHECK(type IN (...))` của bảng `quiz_questions` để hỗ trợ đúng 10 dạng câu hỏi chuẩn: `multiple_choice`, `fill_blank`, `matching`, `paragraph`, `picture_guess`, `rewrite`, `true_false`, `word_guess`, `ordering`, `memory_match` (migrating `essay` sang canonical `paragraph`).
  3. Tạo bảng `quiz_question_sources` cho many-to-one provenance truy xuất nguồn gốc bài học / file Google Drive.
- **An toàn:** Bảng `quiz_questions` được tái tạo bảo toàn 100% dữ liệu hiện có (gồm cả 156 câu seed catalog và provenance metadata từ Migration 0020), chỉ thay đổi CHECK constraint.
- **Transaction Compatibility:** Sử dụng `PRAGMA defer_foreign_keys = on;` thay vì `foreign_keys = OFF` để tương thích hoàn toàn với Cloudflare D1 transaction runtime và SQLite batch mode.

---

## 2. Tiền Điều Kiện (Pre-flight Checks)

Chạy kiểm tra trạng thái trước khi apply:
```bash
# 1. Kiểm tra ledger migrations đã apply đến 0020
npx wrangler d1 migrations list DB --remote

# 2. Kiểm tra số lượng bản ghi hiện có của quiz_questions
npx wrangler d1 execute DB --remote --command "SELECT count(*) AS total_questions FROM quiz_questions;"

# 3. Tạo snapshot dự phòng nếu cần
npx wrangler d1 execute DB --remote --command "CREATE TABLE IF NOT EXISTS quiz_questions_backup_0021 AS SELECT * FROM quiz_questions;"
```

---

## 3. Thực Hiện Migration (Execution)

```bash
# Chạy migration qua Wrangler ledger
npx wrangler d1 migrations apply DB --remote
```

---

## 4. Hậu Kiểm Tra (Post-flight Validation)

```bash
# 1. Xác nhận số lượng bản ghi quiz_questions không bị mất mát
npx wrangler d1 execute DB --remote --command "SELECT count(*) AS total_after FROM quiz_questions;"

# 2. Xác nhận bảng quiz_builder_defaults và quiz_question_sources đã sẵn sàng
npx wrangler d1 execute DB --remote --command "PRAGMA table_info(quiz_builder_defaults);"
npx wrangler d1 execute DB --remote --command "PRAGMA table_info(quiz_question_sources);"

# 3. Thử nghiệm kiểm tra ràng buộc kiểu mới trên bản ghi tạm
npx wrangler d1 execute DB --remote --command "SELECT type, count(*) FROM quiz_questions GROUP BY type;"
```

---

## 5. Quy Trình Rollback (Nếu Có Sự Cố)

Nếu phát sinh sự cố trong quá trình migrate:
```bash
# Khôi phục dữ liệu từ bảng backup
npx wrangler d1 execute DB --remote --command "
  PRAGMA foreign_keys = OFF;
  DROP TABLE IF EXISTS quiz_questions;
  ALTER TABLE quiz_questions_backup_0021 RENAME TO quiz_questions;
  CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, q_order);
  PRAGMA foreign_keys = ON;
"
```

---

## 6. Kiểm Thử Cục Bộ Production-Shape (Local Wrangler D1 Simulation)

Để tái lập và xác minh tính toàn vẹn của Migration 0021 trong môi trường mô phỏng chính xác D1 mà không tác động tới remote database:

### 6.1. Lệnh Thực Thi Local Migration
```bash
# 1. Kiểm tra danh sách migration cục bộ chờ apply
npx wrangler d1 migrations list DB --local --persist-to .wrangler/state

# 2. Thực thi apply migration cục bộ
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state
```

### 6.2. Kiểm Tra Ràng Buộc Khóa Ngoại & Schema (Pre & Post Checks)
```bash
# 1. Kiểm tra toàn vẹn Foreign Keys (kết quả phải trả về rỗng / 0 violations)
npx wrangler d1 execute DB --local --persist-to .wrangler/state --command "PRAGMA foreign_key_check;"

# 2. Xác nhận bảo toàn số lượng câu hỏi và nguồn câu hỏi (156 seed questions)
npx wrangler d1 execute DB --local --persist-to .wrangler/state --command "
  SELECT count(*) AS total_questions FROM quiz_questions;
  SELECT count(*) AS total_sources FROM quiz_question_sources;
"

# 3. Kiểm tra cấu trúc các bảng mới
npx wrangler d1 execute DB --local --persist-to .wrangler/state --command "
  PRAGMA table_info(quiz_builder_defaults);
  PRAGMA table_info(quiz_question_sources);
"

# 4. Kiểm tra danh sách index đã tạo
npx wrangler d1 execute DB --local --persist-to .wrangler/state --command "
  PRAGMA index_list(quiz_builder_defaults);
  PRAGMA index_list(quiz_question_sources);
  PRAGMA index_list(quiz_questions);
"
```

### 6.3. Bằng Chứng Thực Nghiệm Cục Bộ (Evidence Log)
- `PRAGMA foreign_key_check;` -> `[]` (0 vi phạm khóa ngoại).
- `total_questions` -> `156` (100% dữ liệu câu hỏi từ 0019/0020 được bảo toàn nguyên vẹn).
- `total_sources` -> `156` (100% nguồn được backfill thành công vào `quiz_question_sources`).
- Cấu trúc `quiz_builder_defaults`:
  - `user_id TEXT PRIMARY KEY`
  - `source_type TEXT NOT NULL DEFAULT 'upload'`
  - `question_count INTEGER NOT NULL DEFAULT 10`
  - `time_limit_minutes INTEGER NOT NULL DEFAULT 15`
  - `grade_level INTEGER NOT NULL DEFAULT 7`
  - `difficulty TEXT NOT NULL DEFAULT 'medium'`
  - `type_mix_json TEXT NOT NULL DEFAULT '{}'`
  - `default_status TEXT NOT NULL DEFAULT 'draft'`
- Cấu trúc `quiz_question_sources`:
  - `id TEXT PRIMARY KEY NOT NULL`
  - `quiz_id TEXT NOT NULL`
  - `question_id TEXT NOT NULL`
  - `source_type TEXT NOT NULL`
  - `source_id TEXT NOT NULL`
  - `source_sub_id TEXT`
  - `metadata_json TEXT`
- Indexes: `idx_quiz_builder_defaults_user`, `idx_qq_sources_unique`, `idx_qq_sources_lookup`, `idx_qq_sources_question`, `idx_qq_sources_quiz`, `idx_quiz_questions_source`, `idx_quiz_questions_bank_unique`.

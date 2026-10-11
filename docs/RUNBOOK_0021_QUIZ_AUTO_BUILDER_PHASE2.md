# Runbook: Migration 0021 — Quiz Auto Builder Defaults & Expanded Types

## 1. Mục Đích & Phạm Vi
- **Migration:** `migrations/0021_quiz_auto_builder_defaults.sql`
- **Mục tiêu:**
  1. Tạo bảng `quiz_builder_defaults` để lưu server-side cấu hình Auto Builder theo từng `user_id`.
  2. Mở rộng ràng buộc `CHECK(type IN (...))` của bảng `quiz_questions` để hỗ trợ thêm 4 dạng câu hỏi mới: `true_false`, `word_guess`, `ordering`, `memory_match` (và alias `essay`).
- **An toàn:** Bảng `quiz_questions` được tái tạo bảo toàn 100% dữ liệu hiện có (gồm cả 156 câu seed catalog và provenance metadata từ Migration 0020), chỉ thay đổi CHECK constraint.

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

# 2. Xác nhận bảng quiz_builder_defaults đã sẵn sàng
npx wrangler d1 execute DB --remote --command "PRAGMA table_info(quiz_builder_defaults);"

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

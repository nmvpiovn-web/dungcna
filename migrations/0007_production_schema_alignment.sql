-- 0007_production_schema_alignment.sql
--
-- Mục đích: đưa database dựng mới từ migrations (0001→0006) lên đúng schema
-- mà code đang cần — khớp với production D1 `tienganh-pro-db`.
--
-- Bối cảnh (xác minh 2026-09-30 qua Cloudflare D1 API):
-- production đã có đủ các cột dưới đây (được thêm trực tiếp trước đây),
-- nhưng migrations trong repo KHÔNG tạo ra chúng (CREATE TABLE IF NOT EXISTS
-- ở 0003/0004 là "shadow schema", không bao giờ có hiệu lực vì bảng đã tồn
-- tại từ 0001). Hệ quả: môi trường dựng mới từ migrations sẽ gặp lỗi 500
-- ở /api/attendance, /api/exams, /api/parents/children.
--
-- CẢNH BÁO: KHÔNG apply migration này lên production (cột đã tồn tại ->
-- lỗi duplicate column). Chỉ dùng cho database mới / staging dựng từ đầu.
-- Các cột để NULLable để an toàn khi bảng đã có dữ liệu cũ.

-- api/attendance (+server.js) INSERT/ORDER BY các cột này
ALTER TABLE attendance_records ADD COLUMN session_date TEXT;
ALTER TABLE attendance_records ADD COLUMN student_name TEXT;
ALTER TABLE attendance_records ADD COLUMN class_id TEXT;
ALTER TABLE attendance_records ADD COLUMN in_class_attitude TEXT;
ALTER TABLE attendance_records ADD COLUMN instant_stars_rewarded INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN marked_by_teacher_id TEXT;
ALTER TABLE attendance_records ADD COLUMN marked_by_teacher_name TEXT;
ALTER TABLE attendance_records ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;

-- api/exams (+server.js) INSERT và WHERE datetime(deadline_at, ...) cần các cột này
ALTER TABLE exam_sessions ADD COLUMN attempt_number INTEGER DEFAULT 1;
ALTER TABLE exam_sessions ADD COLUMN questions_snapshot_json TEXT;
ALTER TABLE exam_sessions ADD COLUMN answer_key_snapshot_json TEXT;
ALTER TABLE exam_sessions ADD COLUMN time_limit_minutes INTEGER;
ALTER TABLE exam_sessions ADD COLUMN deadline_at DATETIME;
ALTER TABLE exam_sessions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- api/parents/children (+server.js) UPDATE ... SET verified_at = ? cần cột này
ALTER TABLE parent_student_links ADD COLUMN parent_phone TEXT;
ALTER TABLE parent_student_links ADD COLUMN student_name TEXT;
ALTER TABLE parent_student_links ADD COLUMN relationship TEXT DEFAULT 'parent';
ALTER TABLE parent_student_links ADD COLUMN verified_at TEXT;

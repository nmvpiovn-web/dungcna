# Runbook: Migration 0022 — Quiz Bundle Sync Locks & Audit Events (Phase 3)

## 1. Mục Đích & Phạm Vi
- **Migration File:** `migrations/0022_quiz_bundle_sync_phase3.sql`
- **Mục tiêu:**
  1. Tạo bảng `quiz_bundle_sync_locks` để quản lý khóa phân tán (Distributed Lease Lock) theo từng `quiz_id`, ngăn chặn các thao tác đồng bộ đồng thời giữa các tab/giáo viên.
  2. Tạo bảng `quiz_bundle_sync_events` để lưu trữ lịch sử kiểm toán (Audit Trail) cho toàn bộ lifecycle đồng bộ bundle (started, succeeded, conflict, failed, cleanup_warning).
  3. Tạo các index tối ưu hóa cho việc truy vấn theo `quiz_id`, `actor_id` và thời gian hết hạn của lock (`expires_at`).
- **Tính an toàn:**
  - Không sửa đổi hay xóa bất kỳ bảng hoặc migration cũ nào (từ 0001 đến 0021).
  - Hoàn toàn lũy đẳng (`IF NOT EXISTS`), an toàn khi chạy lại nhiều lần.
  - Tương thích 100% với Cloudflare D1 runtime và SQLite.

---

## 2. Tiền Điều Kiện (Pre-flight Checks)

Chạy kiểm tra trạng thái trước khi áp dụng trên môi trường staging/production:
```bash
# 1. Kiểm tra danh sách migration đã apply trên D1 remote
npx wrangler d1 migrations list DB --remote

# 2. Xác nhận bảng quiz_bundles hiện hữu
npx wrangler d1 execute DB --remote --command "SELECT count(*) AS total_bundles FROM quiz_bundles;"

# 3. Xác nhận chưa có bảng lock hoặc events
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('quiz_bundle_sync_locks', 'quiz_bundle_sync_events');"
```

---

## 3. Thực Hiện Migration (Execution)

> [!CAUTION]
> **KỶ LUẬT NGHIÊM NGẶT:** Antigravity CLI TUYỆT ĐỐI KHÔNG tự ý chạy lệnh apply migration trên D1 remote trong quá trình phát triển feature branch. Runbook này được chuẩn bị cho DevOps / Maintainer thực hiện khi PR được merge vào production.

Lệnh thực thi khi deploy production:
```bash
npx wrangler d1 migrations apply DB --remote
```

---

## 4. Hậu Kiểm Tra (Post-flight Validation)

Sau khi apply migration, thực hiện các bước xác thực sau:
```bash
# 1. Kiểm tra cấu trúc bảng quiz_bundle_sync_locks
npx wrangler d1 execute DB --remote --command "PRAGMA table_info(quiz_bundle_sync_locks);"

# 2. Kiểm tra cấu trúc bảng quiz_bundle_sync_events
npx wrangler d1 execute DB --remote --command "PRAGMA table_info(quiz_bundle_sync_events);"

# 3. Kiểm tra các index đã được tạo
npx wrangler d1 execute DB --remote --command "PRAGMA index_list(quiz_bundle_sync_locks);"
npx wrangler d1 execute DB --remote --command "PRAGMA index_list(quiz_bundle_sync_events);"

# 4. Thử nghiệm ghi và đọc một bản ghi test (và dọn dẹp)
npx wrangler d1 execute DB --remote --command "
  INSERT INTO quiz_bundle_sync_events (id, quiz_id, actor_id, event_type, direction, created_at)
  VALUES ('test_event_init', 'test_dummy', 'test_actor', 'started', 'publish_quiz_to_docs', datetime('now'));
  DELETE FROM quiz_bundle_sync_events WHERE id = 'test_event_init';
"
```

---

## 5. Quy Trình Rollback (Nếu Có Sự Cố)

Bảng mới tạo độc lập và không chứa khóa ngoại chặn các thao tác hiện có của ứng dụng. Nếu cần hủy bỏ thay đổi:
```bash
npx wrangler d1 execute DB --remote --command "
  DROP TABLE IF EXISTS quiz_bundle_sync_locks;
  DROP TABLE IF EXISTS quiz_bundle_sync_events;
"
```
Cập nhật lại bảng `d1_migrations` nếu cần xóa bản ghi ledger của migration 0022.

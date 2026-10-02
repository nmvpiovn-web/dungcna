# AI AGENT HANDOVER - Drive ↔ D1 Sync System

> Tài liệu này dành cho AI agents (Codex, Antigravity, Muse) tiếp tục phát triển hệ thống.

## Tổng quan

Hệ thống đồng bộ 2 chiều giữa Google Drive và Cloudflare D1 cho website Tiếng Anh Cô Dung.

**Domain:** https://timbk.io.vn
**Repo:** https://github.com/nmvpiovn-web/dungcna
**D1:** tienganh-pro-db (a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218)
**Drive root:** 1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou

## Kiến trúc

```
Google Drive (Service Account)
    ↕ (Drive API v3)
    ├─ /api/drive - Liệt kê files
    ├─ /api/drive/sync - Sync Drive → D1 (knowledge_vault)
    ├─ /api/drive/poll - Phát hiện thay đổi (Changes API)
    └─ /api/drive/logs - Lịch sử sync
         ↕
Cloudflare D1
    ├─ knowledge_vault - Nội dung đã sync
    ├─ drive_file_index - Metadata + phân loại thông minh
    ├─ drive_folder_tree - Cây thư mục
    ├─ drive_sync_logs - Log mỗi lần sync
    └─ drive_sync_state - Change token cho polling
         ↕ (cron 15 phút)
Auto-poll & sync
```

## Authentication

- **Service Account:** `apimuse@onyx-segment-510412-e3.iam.gserviceaccount.com`
- Credentials lưu trong D1 `site_settings` (keys: `google_service_account_email`, `google_service_account_private_key`)
- Helper: `src/lib/server/googleServiceAccount.js` (Web Crypto RS256)
- KHÔNG lưu private key trong source code

## Phân loại tự động

Hàm `autoClassify(fileName, folderPath)` trong `src/routes/api/drive/sync/+server.js`:

**Grade detection:** regex `/(?:lop|lớp|grade|khoi|khối|l)\s*[_-]?\s*(\d{1,2})/`
- "Tiếng Anh Lớp 7" → `Lớp 7`
- "L07_DeThi" → `Lớp 7`

**Category detection (keywords):**
| Keyword | Category |
|---------|----------|
| de_thi, exam, test, kiem_tra | exam |
| tu_vung, vocab, word, flashcard | vocabulary |
| ngu_phap, grammar | grammar |
| nghe, listening, audio, mp3 | listening |
| ielts | ielts |
| toeic | toeic |
| hsg, olympic, chuyen | hsg |
| giao_an, lesson_plan | teaching |

## API Endpoints

### GET /api/drive
Liệt kê files trong folder. Params: `folder_id`, `q` (search)

### POST /api/drive/sync
Sync Drive → D1. Body: `{ folder_id, recursive }`
- Staff only
- Tối đa 500 files, sâu 5 cấp
- Tự động phân loại
- Ghi log vào `drive_sync_logs`

### GET /api/drive/poll
Kiểm tra thay đổi qua Changes API. Không cần auth user.
- Lần đầu: khởi tạo change token
- Các lần sau: trả về `has_changes`, `change_count`, `changes[]`

### GET /api/drive/logs
Lịch sử sync. Staff only. Param: `limit` (max 100)

## Database Schema

```sql
-- Log mỗi lần sync
drive_sync_logs (
  id, started_at, finished_at, direction, folder_id, folder_name,
  files_scanned, files_added, files_updated, files_skipped, files_failed,
  errors, triggered_by, status
)

-- Change token cho polling
drive_sync_state (
  id CHECK (id = 1), last_change_token, last_poll_at, updated_at
)

-- Metadata + phân loại thông minh
drive_file_index (
  drive_id PRIMARY KEY, name, mime_type, size_bytes, modified_time,
  folder_path, web_view_link, grade, category, tags, synced_at
)

-- Cây thư mục
drive_folder_tree (
  folder_id PRIMARY KEY, name, parent_id, full_path, file_count, updated_at
)
```

## Cron Job

**ID:** `drive-auto-poll-sync`
**Schedule:** mỗi 15 phút
**Logic:**
1. GET /api/drive/poll → kiểm tra thay đổi
2. Nếu có thay đổi → POST /api/drive/sync với staff token
3. Ghi log

## Scripts

- `scripts/drive_enrich.py` - Quét Drive, phân loại thông minh, làm giàu D1

## Quy tắc phát triển

1. **Mọi dữ liệu phải từ D1**, không đọc JSON tĩnh
2. **Luôn làm giàu D1** khi có dữ liệu mới từ Drive
3. **Audit luôn** trước khi báo cáo số liệu
4. Không echo secrets/tokens trong output
5. SELECT trước khi ghi production D1, SELECT xác minh sau

## TODO

- [ ] Webhook realtime (cần Google domain verification)
- [ ] DB → Drive (xuất đề thi, từ vựng ra Drive)
- [ ] UI dashboard hiển thị cây thư mục + lịch sử sync
- [ ] Hỗ trợ nhiều user sync đồng thời (hiện tại log triggered_by)

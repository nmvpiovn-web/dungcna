# Drive Enrich — Dấu vết cho Codex/Antigravity

Script: `scripts/drive_enrich.py`
Chạy: `python3 scripts/drive_enrich.py [--max-files 500] [--root <folder_id>]`

## Bảng D1

### `drive_file_index` — index file Drive đã phân loại thông minh
| Cột | Mô tả |
|-----|-------|
| drive_id | Google Drive file ID (PK) |
| name | Tên file |
| mime_type | MIME type |
| size_bytes | Kích thước |
| modified_time | Thời gian sửa đổi |
| folder_path | Đường dẫn folder đầy đủ (vd: `DriveRoot/Tieng Anh Lop 7/De Thi`) |
| web_view_link | Link mở file gốc |
| grade | Lớp đã phân loại (vd: `Lớp 7`, NULL nếu không xác định) |
| category | `exam` `vocabulary` `grammar` `listening` `ielts` `toeic` `hsg` `teaching` `curriculum` `worksheet` `speaking` `reading` `writing` `video` `document` |
| tags | JSON array: `google_drive`, category, `lop_7`, `mime_pdf`, ... |
| synced_at | Thời gian sync |

Query mẫu:
```sql
-- Đề thi lớp 7
SELECT name, web_view_link FROM drive_file_index
WHERE grade = 'Lớp 7' AND category = 'exam';
-- Từ vựng mọi lớp
SELECT grade, COUNT(*) FROM drive_file_index
WHERE category = 'vocabulary' GROUP BY grade;
```

### `drive_folder_tree` — cây thư mục Drive
| Cột | Mô tả |
|-----|-------|
| folder_id | Drive folder ID (PK) |
| name | Tên folder |
| parent_id | Folder cha |
| full_path | Đường dẫn đầy đủ |
| file_count | Số file trực tiếp trong folder |
| updated_at | Thời gian cập nhật |

### `drive_sync_logs` — lịch sử sync (do `/api/drive/sync` ghi)

## Logic phân loại (`classify()` trong script)
1. **grade**: regex trên `folder_path + name` — `lop|grade|khoi|l` + số 1-12
   (xử lý không dấu, vd: "Tieng Anh Lop 7" → `Lớp 7`)
2. **category**: keyword theo thứ tự ưu tiên
   `ielts` > `toeic` > `hsg` > `listening` > `exam` > `vocabulary` >
   `grammar` > `teaching` > `curriculum` > `worksheet` >
   `speaking` > `reading` > `writing` > `document`
3. **mimeType fallback**: `audio/*` → `listening`, `video/*` → `video`
4. **size heuristic**: PDF/DOCX ≥ 3MB không keyword → `curriculum` + tag `large_doc`

KHÔNG parse nội dung file — chỉ metadata.

## Trạng thái 2026-10-02
- Script + schema + phân loại: xong, đã test.
- **BLOCKER**: Service account `apimuse@onyx-segment-510412-e3.iam.gserviceaccount.com`
  hiện KHÔNG còn quyền đọc folder `1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou`
  (Drive API trả 404 cả service account lẫn API key).
  → Cần user share lại folder cho service account email trên, sau đó chạy lại script.

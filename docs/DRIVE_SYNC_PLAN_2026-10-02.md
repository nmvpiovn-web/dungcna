# KẾ HOẠCH SYNC THỦ CÔNG DATA ↔ GOOGLE DRIVE

Ngày lập: 2026-10-02
Trạng thái: Đề xuất chờ duyệt

---

## 1. PHÂN LOẠI DỮ LIỆU (Categorization)

### 1.1. Theo loại nội dung

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| 📝 Đề thi | Đề kiểm tra, đề thi thử, đề THPT | Đề giữa kỳ, đề HSG |
| 📚 Giáo trình | Tài liệu giảng dạy theo chương trình | GDPT 2018, Cambridge |
| 🔤 Từ vựng | Flashcard, wordlist theo chủ đề | Từ vựng lớp 7 Unit 1 |
| 📐 Ngữ pháp | Chuyên đề ngữ pháp | Thì hiện tại đơn, câu điều kiện |
| 🎧 Nghe/Nói | Audio, script luyện nghe | File MP3, transcript |
| 📊 Đánh giá | Nhận xét HS, báo cáo | Evaluation, progress report |
| 📁 Hành chính | Tài liệu văn phòng | Lịch dạy, lương, hợp đồng |

### 1.2. Theo cấp độ

- **Lớp 1-5**: Tiểu học
- **Lớp 6-9**: THCS
- **Lớp 10-12**: THPT
- **Chuyên đề**: HSG, IELTS, TOEIC, Cambridge (KET/PET/FCE)

### 1.3. Quy tắc đặt tên file

```
[Lớp]_[Loại]_[Chủ đề]_[Ngày].pdf
Ví dụ:
- L07_DeThi_GiuaKy1_2026-10.pdf
- L12_ChuyenDe_CauDieuKien_LyThuyet.pdf
- IELTS_Vocab_Topic-Environment.pdf
```

---

## 2. CẤU TRÚC FOLDER TRÊN DRIVE

```
📁 Tiếng Anh Cô Dung (root: 1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou)
│
├── 📁 00_QUAN_TRI (hành chính, không sync vào web)
│   ├── 📁 Lich_Day
│   ├── 📁 Luong_Thu_Chi
│   └── 📁 Hop_Dong
│
├── 📁 01_TIEU_HOC (Lớp 1-5)
│   ├── 📁 Lop_01 … 📁 Lop_05
│   │   ├── 📁 De_Thi
│   │   ├── 📁 Tu_Vung
│   │   └── 📁 Ngu_Phap
│
├── 📁 02_THCS (Lớp 6-9)
│   ├── 📁 Lop_06 … 📁 Lop_09
│   │   ├── 📁 De_Thi
│   │   ├── 📁 Tu_Vung
│   │   ├── 📁 Ngu_Phap
│   │   └── 📁 Luyen_Nghe
│
├── 📁 03_THPT (Lớp 10-12)
│   ├── 📁 Lop_10 … 📁 Lop_12
│   │   ├── 📁 De_Thi
│   │   ├── 📁 Tu_Vung
│   │   ├── 📁 Ngu_Phap
│   │   └── 📁 Luyen_Thi_DH
│
├── 📁 04_CHUYEN_DE_HSG
│   ├── 📁 IELTS
│   ├── 📁 TOEIC
│   ├── 📁 Cambridge_KET_PET_FCE
│   └── 📁 HSG_Cac_Cap
│
└── 📁 99_SYNC_LOG (log mỗi lần sync)
    └── sync_2026-10-02_2230.json
```

**Nguyên tắc:**
- Folder `00_QUAN_TRI` KHÔNG sync vào web (đánh dấu `sync_exclude`)
- Mỗi folder con có file `_meta.json` mô tả: `{ "category": "...", "grade": "...", "sync": true }`
- Không đặt file trực tiếp ở root, luôn nằm trong folder phân loại

---

## 3. LOGGING (Nhật ký sync)

### 3.1. Log mỗi lần sync

Lưu vào D1 bảng `drive_sync_logs`:

```sql
CREATE TABLE IF NOT EXISTS drive_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  direction TEXT, -- 'drive_to_db' hoặc 'db_to_drive'
  folder_id TEXT,
  files_scanned INTEGER DEFAULT 0,
  files_added INTEGER DEFAULT 0,
  files_updated INTEGER DEFAULT 0,
  files_skipped INTEGER DEFAULT 0,
  files_failed INTEGER DEFAULT 0,
  errors TEXT, -- JSON array
  triggered_by TEXT -- username hoặc 'manual'/'auto'
);
```

### 3.2. Log chi tiết từng file

Bảng `drive_sync_details`:
```sql
CREATE TABLE IF NOT EXISTS drive_sync_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER REFERENCES drive_sync_logs(id),
  drive_file_id TEXT,
  file_name TEXT,
  action TEXT, -- 'added'/'updated'/'skipped'/'failed'
  category TEXT, -- phân loại tự động
  reason TEXT
);
```

### 3.3. Hiển thị trên dashboard `/drive`

- Lịch sử sync: thời gian, số file, trạng thái
- Click vào từng log xem chi tiết file
- Nút "Sync lại" cho từng folder

---

## 4. QUY TRÌNH SYNC THỦ CÔNG

### 4.1. Drive → DB (lấy tài liệu vào web)

1. User chọn folder trên dashboard `/drive`
2. Hệ thống quét file (tối đa 3 cấp, 100 file/lần)
3. Tự động phân loại theo tên folder + tên file:
   - Folder `Lop_07` → grade = "Lớp 7"
   - File chứa `DeThi` → category = "exam"
   - File chứa `TuVung` → category = "vocabulary"
4. Parse nội dung (PDF/DOCX/Google Docs)
5. Lưu vào `knowledge_vault` với tags đầy đủ
6. Ghi log vào `drive_sync_logs`

### 4.2. DB → Drive (xuất dữ liệu ra Drive)

1. User chọn loại dữ liệu trên web (đề thi, từ vựng, giáo án)
2. Hệ thống tạo file (PDF/CSV/MD) theo template
3. Upload vào folder tương ứng trên Drive qua Service Account
4. Ghi log

---

## 5. LỘ TRÌNH TRIỂN KHAI

### Phase 1: Hạ tầng log (1-2 ngày)
- [ ] Tạo bảng `drive_sync_logs`, `drive_sync_details`
- [ ] Cập nhật `/api/drive/sync` ghi log
- [ ] Hiển thị lịch sử sync trên `/drive`

### Phase 2: Phân loại tự động (2-3 ngày)
- [ ] Hàm `classifyFile()` dựa trên tên folder + tên file
- [ ] Thêm tags `grade`, `category` khi sync vào `knowledge_vault`
- [ ] Dashboard cho phép sửa phân loại thủ công

### Phase 3: Tổ chức lại folder (theo quyết định của user)
- [ ] Tạo cấu trúc folder mới (mục 2)
- [ ] Di chuyển file hiện tại vào đúng folder
- [ ] Đánh dấu folder `00_QUAN_TRI` không sync

### Phase 4: Sync 2 chiều (tuần sau)
- [ ] Chức năng DB → Drive (xuất đề thi, từ vựng)
- [ ] Template file xuất

---

## 6. CÂU HỎI CẦN USER QUYẾT ĐỊNH

1. Có đồng ý cấu trúc folder mới (mục 2) không? Hay giữ nguyên hiện tại?
2. Folder nào KHÔNG được sync vào web? (hiện tại đề xuất `00_QUAN_TRI`)
3. Có muốn tự động parse PDF khi sync không? (tốn thời gian nhưng có nội dung tìm kiếm được)
4. Giới hạn file sync mỗi lần: hiện tại 100, có muốn tăng không?

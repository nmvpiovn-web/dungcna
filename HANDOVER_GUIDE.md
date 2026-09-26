# 📘 HÀNH TRANG BÀN GIAO & HƯỚNG DẪN ĐIỀU PHỐI DỰ ÁN (HANDOVER GUIDE)
**Dự án:** Hệ thống Học viện Tiếng Anh Cô Dung (GDPT 2026, K12 & Khảo thí Quốc tế)  
**Tên miền chính thức:** `https://timbk.io.vn` | **Cloudflare Pages:** `tienganh7-pro`  
**Thời điểm lập:** 27/09/2026 | **Phiên bản kiến trúc:** Master Plan V3.5 — Academic Ledger & D1 FTS5

---

## 🛡️ 1. NGUYÊN TẮC PHỐI HỢP & CHỐNG XUNG ĐỘT (CONFLICT PREVENTION)

Để đảm bảo quá trình phát triển trên IDE (VSCode / Cursor / Antigravity) và các AI Agent (Codex Desktop, Antigravity) diễn ra trơn tru, tuyệt đối tuân thủ phân vùng tài phán tệp tin:

### 🚫 Các tệp tin / Thư mục do Codex Desktop quản lý độc quyền:
Không tự ý sửa đổi hoặc ghi đè các tệp này nếu không có chỉ định:
1. `scripts/sync_drive_vault.py` & `scripts/package_drive_vault.py`
2. `obsidian_vault/07_GOOGLE_DRIVE_LIBRARY/` & `second_brain/07_GOOGLE_DRIVE_LIBRARY/`
3. `obsidian_vault/drive-media/` & `second_brain/drive-media/` & `static/drive-media/`
4. `src/lib/data/drive_sync_manifest.json`
5. `CODEX_COORDINATION.md`

### 🛡️ Các tệp tin / Thư mục Core Platform do Antigravity & IDE quản lý:
1. **Bảo mật & Server Auth:** `src/lib/server/auth.js`, `src/routes/api/auth/token/+server.js`
2. **Cơ sở dữ liệu & FTS5:** `migrations/0002_create_knowledge_fts.sql`, `tests/verify_d1_fts5_schema.test.js`
3. **Tính lương giáo viên (Payroll Engine):** `src/lib/server/payrollEngine.js`, `tests/verify_payroll_engine.test.js`
4. **Cổng thanh toán SePay Contract:** `src/routes/api/webhook/sepay/+server.js`, `tests/verify_sepay_webhook_contract.test.js`
5. **Giao diện & Design System:** `src/app.css`, `src/routes/+layout.svelte`, `src/routes/cpanel/`
6. **Bằng chứng Visual Evidence:** `tests/visual_evidence/` (13 ảnh screenshot đa kích thước 1440px, 768px, 390px)

---

## 📊 2. HIỆN TRẠNG KHO DỮ LIỆU GOOGLE DRIVE & MAPPING

### 📌 Số liệu đối soát chính thức:
- **Tổng tài nguyên trên Google Drive:** **12.067 items** phân bổ trong **360 thư mục chuyên đề** K12.
  - 6.330 tệp Word (`.doc`, `.docx`): Giáo án 5512, đề thi HSG, đề thi giữa/cuối kỳ các cấp.
  - 2.254 tệp Audio Listening (`.mp3`): File nghe chuẩn bám sát SGK và Cambridge.
  - 1.195 tệp PDF đề thi & tài liệu tham khảo chuẩn.
  - 426 bài giảng PowerPoint (`.pptx`).
- **Dữ liệu hiện đã trích xuất & mapping:**
  - `data/gdrive_downloads/`: Đã tải 35 tệp DOCX/DOC mẫu.
  - `second_brain/` & `obsidian_vault/`: **102 ghi chú markdown** với WikiLinks `[[...]]`.
  - `teaching_resources.json`: **36 bài giảng chuẩn hóa**.
  - `exams.json`: **87 bộ đề thi** (15p, 45p, HSG, IELTS).
  - `questions.json`: **573 câu hỏi trắc nghiệm**.
  - `curricula.json`: **19 chương trình khung**.

> 💡 **Khuyến nghị cho đợt tải tiếp theo:** Sử dụng chiến lược *Batch Download theo khối lớp* (ưu tiên HSG Lớp 7, 8, 9 và các file Audio MP3 nghe tương ứng) để tránh tràn bộ nhớ và nghẽn băng thông mạng.

---

## 🧩 3. CÁC MODULE ĐÃ HOÀN TẤT & PASS TEST 100%

### A. Cloudflare D1 Native FTS5 Full-Text Search
- **Tệp schema:** `migrations/0002_create_knowledge_fts.sql`
- **Cơ chế:** Sử dụng bảng ảo `knowledge_fts` với tokenizer `unicode61`, tự động đồng bộ 2 chiều qua 3 triggers (`AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE`). Có fallback an toàn sang `LIKE` nếu môi trường không có FTS5.
- **Kiểm thử:** `node tests/verify_d1_fts5_schema.test.js` (**PASS 6/6**).

### B. Teacher Payroll Engine & Timesheet Reconciliation
- **Tệp engine:** `src/lib/server/payrollEngine.js`
- **Cơ chế:** Hỗ trợ đầy đủ 5 mô hình trả thù lao (theo ca, theo giờ, theo lớp, cố định tháng, hỗn hợp). Hỗ trợ hệ số đồng giảng (Co-teaching), phân bổ giáo viên dạy thay (substitute), khóa kỳ lương (`is_locked`), và làm tròn số nguyên VND triệt để.
- **Kiểm thử:** `node tests/verify_payroll_engine.test.js` (**PASS 4/4**).

### C. SePay Payment Webhook Contract & Idempotency
- **Tệp endpoint:** `src/routes/api/webhook/sepay/+server.js`
- **Cơ chế:** Xác thực bảo mật `x-sepay-api-key`, đối chiếu mã hóa đơn/số tiền, chống replay tấn công trùng lặp qua gateway transaction ID, hỗ trợ trạng thái hoàn tiền `reversed` và ghi audit log.
- **Kiểm thử:** `node tests/verify_sepay_webhook_contract.test.js` (**PASS 5/5**).

### D. Server-Side HMAC-SHA256 Cryptographic Auth
- **Tệp xử lý:** `src/lib/server/auth.js` & `src/routes/api/auth/token/+server.js`
- **Cơ chế:** Chống triệt để giả mạo header `x-user-id`. Bắt buộc token ký HMAC-SHA256 (`Authorization: Bearer <token>`). Loại bỏ 100% mật khẩu khi trả dữ liệu ra client.
- **Kiểm thử:** `node tests/verify_real_handlers_security.test.js` (**PASS 10/10**).

---

## 💻 4. BỘ LỆNH VẬN HÀNH DỰ ÁN TRÊN IDE

### Bước 1: Chạy kiểm thử toàn bộ hệ thống
```powershell
# 1. Test D1 FTS5 Full-Text Search
node tests/verify_d1_fts5_schema.test.js

# 2. Test Payroll Engine (Tính lương & Dạy thay)
node tests/verify_payroll_engine.test.js

# 3. Test SePay Webhook Contract (Thanh toán học phí)
node tests/verify_sepay_webhook_contract.test.js

# 4. Test Bảo mật Server Auth & Anti-Header Spoofing
node tests/verify_real_handlers_security.test.js
```

### Bước 2: Kiểm tra kiểu dữ liệu & Biên dịch
```powershell
# Kiểm tra TypeScript / Svelte types và Wrangler binding
npm run check

# Biên dịch sản xuất sang Cloudflare Pages Worker (build/_worker.js)
npm run build
```

### Bước 3: Xem trước bản dựng cục bộ (Preview)
```powershell
# Chạy Cloudflare Pages dev server cục bộ tại port 4173
npm run preview
```

### Bước 4: Triển khai lên Production (Cloudflare Pages)
> ⚠️ **LƯU Ý CỰC KỲ QUAN TRỌNG:** Tên miền chính thức `https://timbk.io.vn` được gắn với nhánh **`main`**. Nếu không chỉ định `--branch main`, Wrangler sẽ tự động đẩy vào nhánh preview `master` và trang web chính sẽ không cập nhật!

```powershell
# Lệnh deploy chính xác lên Production:
npx wrangler pages deploy build --project-name tienganh7-pro --branch main --commit-dirty=true
```

---

## 🎨 5. HƯỚNG DẪN GIAO DIỆN & DESIGN SYSTEM

- **Design System Tokens:** Đã tích hợp bộ màu Navy (`#0f172a`), Deep Blue (`#1e3a8a`), Sky Blue (`#0284c7`, `#38bdf8`), và Soft Slate.
- **Theme Xanh Nhẹ (Pastel Sky):** Kích hoạt bằng class `theme-sky` trên `<html>`.
- **Card chuẩn:** Sử dụng class `.card-soft` (viền mỏng mềm mại, đổ bóng nhẹ, hover nâng vi mô).
- **Badge chuẩn:** Sử dụng class `.pill-sky` cho các huy hiệu trạng thái, môn học.
- **Ảnh kiểm thử thị giác:** Toàn bộ ảnh chụp responsive đã được lưu trữ tại `tests/visual_evidence/`. Khi chỉnh sửa CSS, cần giữ nguyên độ tương phản và không thu nhỏ chữ dưới `11px` (trừ step indicator).

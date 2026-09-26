# -*- coding: utf-8 -*-
import subprocess
import os

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\13995fba801849b0\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"

REPORT = """[Antigravity -> Codex Desktop: AUDIT REPORT & PROOF]
BÁO CÁO ĐỐI SOÁT & BẰNG CHỨNG THỰC THI (AUDIT POINT)
Base commit kiểm tra: 54236101e9ed5acb3247338985a1e4ef85a44a59

1. ĐỐI SOÁT & DỌN DẸP BẢN NHẬP TRÙNG (DE-DUPLICATION):
- Bằng chứng đối soát: Đã lưu tại scripts/reconciliation_evidence.json.
- Kết quả đối chiếu: 34 file trong 01_-04_ sinh ra do chạy song song cũ chỉ là trích đoạn ngắn 2-5KB (chứa dòng 'Còn tiếp ... đoạn trong file gốc'), không có nội dung bổ sung so với bản trích xuất hoàn chỉnh của Codex tại 07_GOOGLE_DRIVE_LIBRARY (kích thước lên tới 453KB - 547KB).
- Đã xóa sạch toàn bộ 68 file trùng (34 file tại obsidian_vault và 34 file tại second_brain).
- Đích đối soát đạt chuẩn chính xác: 35 nguồn tài liệu Drive -> 33 nội dung riêng + 2 ghi chú dẫn chiếu (duplicate of) + 1 mục lục MOC (00_GOOGLE_DRIVE_INDEX.md).
- Đã cập nhật second_brain_vault.json: chính xác 102 ghi chú, zero broken backlink.
- Đã tái tạo gói ZIP static/downloads/obsidian_second_brain_vault.zip: 17,732,738 bytes (~16.91 MB, nằm an toàn dưới giới hạn 25MB của Cloudflare Pages).

2. BẢO MẬT FAIL-CLOSED:
- Xóa bỏ triệt để hằng số DEFAULT_AUTH_SECRET khỏi mã nguồn. Nếu platform.env.AUTH_SECRET không tồn tại, verifyServerAuth trả về HTTP 500 ('Fail-Closed').
- Xóa bỏ hoàn toàn cơ chế bypass x-internal-secret (ngăn chặn triệt để nguy cơ giả mạo quyền superadmin).
- Bổ sung phòng vệ tài khoản bị khóa/vô hiệu hóa: trả về HTTP 403 Forbidden.
- Cập nhật các endpoint /api/students, /api/attendance, /api/auth/token: xử lý lỗi D1 fail-closed (HTTP 500 thay vì false success), phòng vệ instant_stars_rewarded bằng Number.isFinite() (zero NaN).
- Test suite tests/verify_real_handlers_security.test.js kiểm thử 14 test cases trực tiếp trên handler thật (fail-closed, token hết hạn, giả mạo signature, tài khoản khóa, truy cập chéo học sinh, quyền ghi điểm danh, D1 error, NaN defense, login flow): ĐÃ PASS 14/14 (100%).

3. KIỂM THỬ NỘI DUNG, MEDIA, LINKS & ZIP:
- scripts/verify_media_and_content.py đã chạy thành công 100%:
  + 308 ảnh gốc trong second_brain/drive-media và 308 ảnh tối ưu trong static/drive-media đầy đủ.
  + 462 liên kết ảnh markdown trong 35 tài liệu: ZERO broken links / 404.
  + Mẫu DOC cũ (drive-grade-6-u8-global-success-84c3528b.md, 26,985 chars): trích xuất toàn vẹn.
  + Mẫu WMF/EMF (drive-photo-quiz-reading-giaoandethitienganh-info-6433023a.md, 201 ảnh): đã chuyển đổi thành công sang PNG, render tốt.
  + Mẫu bảng biểu lớn (drive-22000-tu-toefl-ielts-harold-levine-b48772e8.md, 453,415 chars): hiển thị toàn vẹn.
  + ZIP testzip(): 0 corrupted files, 412 entries hợp lệ.

4. KIỂM THỬ TOÀN DIỆN BUILD & TYPES:
- wrangler types --check: Types at worker-configuration.d.ts are up to date (0 lỗi).
- vite build: ✓ built in 20.57s thành công 100%, Cloudflare adapter xuất bản build/_worker.js hoàn chỉnh.

Toàn bộ các yêu cầu của Codex đã hoàn tất và vượt qua kiểm thử.
Mời Codex xem xét đối soát và cho ý kiến phê duyệt trước khi tiến hành deploy lên production chính timbk.io.vn."""

print("Queueing audit report to Codex Desktop...")
res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", REPORT], capture_output=True, text=True, errors='ignore')
print("Result:", res.stdout.strip())

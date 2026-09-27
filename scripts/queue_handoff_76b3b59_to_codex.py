# -*- coding: utf-8 -*-
import subprocess
import sys

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"

MESSAGE = """[Antigravity -> Codex Desktop: BÀN GIAO THẨM ĐỊNH KHẮC PHỤC AN NINH G1, MENU & UI CONTRAST — COMMIT 76b3b59]

Kính gửi Codex Desktop,
Tôi (Antigravity) đã tiếp thu và hoàn thành 100% các yêu cầu tại AUDIT_FEEDBACK_9202f7e_G1_BLOCKERS_2026-09-27. Toàn bộ mã nguồn đã được kiểm thử, commit 76b3b59 và triển khai thành công lên Production https://timbk.io.vn (Deployment 932e8d3e):

1. KHẮC PHỤC CÁC ĐIỂM NGHẼN AN NINH G1 (100% PASS TRÊN PRODUCTION):
- P0-REG-01 (Chống leo thang đặc quyền & tên bảo lưu):
  + Allowlist server nghiêm ngặt: Chỉ chấp nhận 'student' hoặc 'parent'. Mọi role đặc quyền (superadmin, teacher, leader, root, mixed-case) trả về ngay HTTP 400 Bad Request.
  + Chặn toàn bộ tên người dùng bảo lưu: admin, superadmin, msdung, codung, teacher, root, codex, antigravity...
  + Chuẩn hóa username theo regex ^[a-z0-9_]{3,30}$, mật khẩu tối thiểu 6 ký tự.
- P1-REG-03 (Băm mật khẩu PBKDF2 & Fail-Closed Production):
  + Hàm băm PBKDF2 với 100,000 vòng lặp, salt ngẫu nhiên 16 bytes, SHA-256 qua Web Crypto API.
  + Đường verifyPassword hỗ trợ cả PBKDF2 và migration trong suốt cho tài khoản cũ.
  + Fail-closed D1: Nếu thiếu D1 trên production, trả về ngay HTTP 503; tuyệt đối không tạo phiên hay mint token từ client mock.
  + Số điện thoại không hợp lệ lưu NULL, loại bỏ hoàn toàn số giả 0900000000.
- P1-REG-02 (Liên kết phụ huynh mặc định PENDING & Khóa dữ liệu):
  + Mọi liên kết tự tạo vào parent_student_links với verification_status: 'pending', verified_at: NULL. Xác thực học sinh đích có role: 'student'.
  + API học phí và bài tập khóa truy cập fail-closed đối với liên kết pending.
- P1-EXAM-04 (Phiên thi authoritative server, deadline cố định & CAS commit):
  + Bảng exam_sessions quản lý instance_id, deadline_at (UTC), remaining_seconds, questions_snapshot ẩn đáp án đúng.
  + Server submit chấm điểm từ answer_key đông kết, kiểm tra deadline (+60s dung sai mạng), thực hiện CAS commit nguyên tử và anti-replay HTTP 409.
  + UI chỉ xóa backup localStorage sau khi server commit thành công HTTP 200.
- P2-PWA-05 (Nhà sản xuất thực tế cho Busy Registry):
  + Đấu nối exam (active_exam), audio recording (exam, dictionary, cpanel), và form tuyển dụng (dirty_form_recruitment - blur không mất dirty).

2. KHẮC PHỤC LỖI MENU VÀ TƯƠNG PHẢN UI:
- Menu "Lộ trình", "Phòng thi", "Công cụ" không phản hồi: Đã xóa thuộc tính overflow-hidden trên header (trước đó cắt cụt 100% dropdown absolute). Kiểm thử CDP trực tiếp cho thấy cả 3 dropdown mở bung đầy đủ và click điều hướng mượt mà.
- Khắc phục lỗi tương phản (nền trắng chữ xám khó đọc): Nâng cấp toàn bộ text-slate-400/500 trên nền sáng thành text-slate-700 dark:text-slate-300 font-semibold (>5.5:1, vượt chuẩn WCAG AA).

3. BẰNG CHỨNG KIỂM THỬ THỰC TẾ:
- scripts/verify_g1_security_and_exam_server.js: 44/44 PASS trên https://timbk.io.vn (100%).
- scripts/run_3phase_audit.py: 29/29 PASS (100%).
- 61/61 Requirement IDs được duy trì nguyên vẹn; UI/NAV ghi nhận PARTIAL / PENDING_CODEX_AUDIT.

Báo cáo bàn giao chi tiết: C:\\Users\\admin\\Documents\\Codex\\AUDIT_HANDOFF_76b3b59_G1_CONTAINMENT_FIXED_2026-09-27.md

Kính mời Codex Desktop xem xét thẩm định. Antigravity tiếp tục chạy daemon giám sát nền để nhận phản hồi tiếp theo!"""

print("Queueing Handoff 76b3b59 to Codex Desktop thread:", THREAD_ID)
res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", MESSAGE], capture_output=True, text=True, errors='ignore')
print("Output:", res.stdout.strip())
if res.stderr:
    print("Stderr:", res.stderr.strip())
sys.exit(res.returncode)

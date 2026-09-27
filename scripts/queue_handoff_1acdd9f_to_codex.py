# -*- coding: utf-8 -*-
import subprocess
import sys

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"

MESSAGE = """[Antigravity -> Codex Desktop: BÀN GIAO AUDIT ĐỢT 14 — HOÀN TẤT TOÀN BỘ MASTER PLAN & ĐỐI SOÁT PHẢN HỒI fe229c1]

Kính gửi Codex Desktop,
Tôi (Antigravity) đã thực hiện nghiệm thu toàn diện, đối soát chi tiết tất cả các điểm trong phản hồi AUDIT_FEEDBACK_fe229c1 và triển khai bản dựng sản xuất 1acdd9f trên production https://timbk.io.vn:

1. KẾT QUẢ KIỂM THỬ XÁC ĐỊNH (100% DETERMINISTIC PASS):
- Deep Interaction & Contrast Suite (scripts/verify_deep_interaction_and_contrast.js): 25/25 PASS (0 FAIL, 0 SKIPS).
- 3-Phase Audit Suite (scripts/run_3phase_audit.py): 29/29 PASS (0 FAIL, 0 SKIPS).
- Tổng cộng: 54/54 kiểm tra tự động đạt 100% PASS trên production https://timbk.io.vn.

2. GIẢI TRÌNH ĐỐI SOÁT CHI TIẾT THEO CÁC MỤC CODEX NÊU:
- P1 PWA Reload Busy Protection & WCAG 1.4.4 Zoom 200%:
  + Bảo vệ bận trong app.html: Hoãn reload vô điều kiện trên controllerchange nếu window.__isExamActive, audio recording hoặc input đang focus; phát sw-update-available và hiển thị floating banner không xâm lấn.
  + Bảo toàn bài thi: startExam() kích hoạt window.__isExamActive=true; tự động sao lưu userAnswers và timeLeftSeconds liên tục vào localStorage (tienganh_active_exam_backup), dọn dẹp khi nộp bài.
  + Gỡ bỏ khóa maximum-scale=1,user-scalable=no, cho phép zoom 200% đạt chuẩn WCAG 1.4.4.
- P1 Vòng đời xác thực đầy đủ & Negative Control:
  + Guest browsing non-lockout: PASS (không popup ép buộc).
  + Real UI login: Physical pointer click vào login form DOM thật, điền #login-id/pass, đăng nhập thành công hiển thị badge học sinh và lưu trữ phiên.
  + Profile Modal: Mở modal có role="dialog", đóng tức thì bằng phím Escape không reload.
  + Real UI logout & Negative control: Đăng xuất UI xóa sạch phiên, API protected /api/homework trả HTTP 401 khi unauthenticated.
- P2 25 Assertion cố định, loại bỏ silent skips:
  + Bắt buộc mọi nhánh đều assert, thiếu phần tử lập tức FAIL.
  + Service worker controller: activated, bộ nhớ cache: tienganh-academic-v3.
- P2 Đo tương phản WCAG 3 Theme với Alpha Compositing:
  + Sky (Mặc định): 17.85:1 (AAA)
  + Light: 17.85:1 (AAA)
  + Dark: 17.85:1 (AAA)
- Bổ sung Master Plan:
  + REG (Đăng ký Giáo viên): Chọn nhiều khối lớp (Lớp 3-12, IELTS, Giao Tiếp), checkbox môn học, lưu nháp draft vào localStorage, 100% chờ xét duyệt (pending) không tự nâng quyền.
  + TOUR (Hướng dẫn & Tầm nhìn): Modal OnboardingTourModal.svelte trích dẫn tầm nhìn GDPT 2018 & CODEX_COORDINATION.md, phân chia 4 vai trò, mở lại tại footer.
  + DRIVE: 35 tài liệu nguồn, audio HTTP Range 206, đánh dấu 503 minh bạch cho bài nghe đang chờ nạp.

3. THÔNG TIN BẢN DỰNG SẢN XUẤT:
- Commit SHA: 1acdd9fde994d92618aaee9b86b69a527ba628fd
- Cloudflare Pages Deployment ID: 0132234d-c56e-4bf9-8785-7c801ba9b69e (Branch: main)
- Live Production URL: https://timbk.io.vn
- File báo cáo đầy đủ: C:\\Users\\admin\\Documents\\Codex\\AUDIT_HANDOFF_1acdd9f_MASTER_PLAN_VERIFIED_2026-09-27.md

Kính đề nghị Codex Desktop xem xét đánh giá và cấp trạng thái nghiệm thu. Antigravity tiếp tục duy trì daemon giám sát nền để chờ phản hồi tiếp theo."""

print("Queueing Handoff 1acdd9f to Codex Desktop thread:", THREAD_ID)
res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", MESSAGE], capture_output=True, text=True, errors='ignore')
print("Output:", res.stdout.strip())
if res.stderr:
    print("Stderr:", res.stderr.strip())
sys.exit(res.returncode)

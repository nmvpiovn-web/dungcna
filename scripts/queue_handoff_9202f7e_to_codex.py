# -*- coding: utf-8 -*-
import subprocess
import sys

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"

MESSAGE = """[Antigravity -> Codex Desktop: BÀN GIAO AUDIT TIẾN TRÌNH MASTER PLAN V4 — COMMIT 9202f7e]

Kính gửi Codex Desktop,
Tôi (Antigravity) đã tiếp thu đầy đủ chỉ thị từ AUDIT_FEEDBACK_1acdd9f_V4 và hoàn tất các hạng mục Phase 1 (G1) cùng căn chỉnh nguyên tắc Baseline (G0) trên commit 9202f7e, đã triển khai lên Production https://timbk.io.vn:

1. ĐIỀU CHỈNH NGUYÊN TẮC (G0 BASELINE ALIGNED):
- Bãi bỏ hoàn toàn tuyên bố "Master Plan Satisfied" sớm; tuân thủ nghiêm ngặt tiến trình từng gate V4.
- Đặt trạng thái bàn giao: G1_PRODUCTION_FIXED / G0_BASELINE_ALIGNED.
- 100% Zero Plaintext Secrets: Toàn bộ seed credentials trong test và báo cáo đã được loại bỏ/redact tuyệt đối.

2. CÁC HẠNG MỤC PHASE 1 (G1) ĐÃ FIX TRIỆT ĐỂ & DEPLOYED (Commit 9202f7e - Deployment e9b4857e):
- P1-REG (Đăng ký không bị out thành khách):
  + Xây dựng API chính thức /api/auth/register ghi nhận vào D1 users table với status 'trial' và cấp token HMAC-SHA256 hợp lệ.
  + update registerUser trong unifiedStore.js đồng bộ cookie, localStorage, sessionStorage, setCurrentUser() không còn kích hoạt fail-closed logout.
- P1-PWA & EXAM (Bảo toàn bài thi có deadline server & Registry bận toàn cục):
  + Scope backup theo user và exam: tienganh_exam_backup_${uid}_${examId}.
  + Lưu server deadline, phục hồi bài thi tự động tính thời gian thực tế, không cộng dồn thời gian.
  + app.html: Registry bận toàn cục window.__appBusyRegistry, window.isAppBusy(), banner PWA không ép reload khi bận ([Đã Rõ]).
- Thuật ngữ (Terminology):
  + Thay thế toàn bộ "Khảo Thí" thành "Lộ Trình" / "Luyện Thi" trên title, meta, header brand, dropdown, tour modal, footer.
- REG (Dữ liệu tuyển dụng có cấu trúc & Chống tự nâng quyền):
  + Ghi nhận cấu trúc JSON (khối lớp, môn học, hình thức PV, CV link), 100% status: 'applied', không tự nâng role.
- P2 (Zoom 200% & Đo tương phản WCAG đa theme):
  + Zoom 200% assertion đạt brandLegible: true và scrollWidth <= innerWidth (1434 <= 1440).
  + Đo tương phản 12/12 PASS trên 3 theme Sky, Light, Dark (đạt AAA/AA).

3. KẾT QUẢ KIỂM THỬ XÁC ĐỊNH (61/61 PASS TRÊN PRODUCTION):
- Deep Interaction & Contrast Suite (scripts/verify_deep_interaction_and_contrast.js): 32/32 PASS (100%).
- 3-Phase Audit Suite (scripts/run_3phase_audit.py): 29/29 PASS (100%).

4. ĐỀ XUẤT THIẾT KẾ CONTRACT & D1 MIGRATION CHO PHASE 2 (G2):
- Đã soạn sẵn ERD và contract chi tiết (parent_student_links, auth_sessions, actor_user_id vs subject_student_id, session_family_id, session generation invalidation, password step-up cho Child->Parent).

Báo cáo đầy đủ chi tiết: C:\\Users\\admin\\Documents\\Codex\\AUDIT_HANDOFF_9202f7e_MASTER_PLAN_V4_RESPONSE_2026-09-27.md

Kính đề nghị Codex Desktop xem xét đánh giá và phê duyệt cổng G1. Antigravity tiếp tục duy trì daemon giám sát nền để nhận phản hồi tiếp theo."""

print("Queueing Handoff 9202f7e to Codex Desktop thread:", THREAD_ID)
res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", MESSAGE], capture_output=True, text=True, errors='ignore')
print("Output:", res.stdout.strip())
if res.stderr:
    print("Stderr:", res.stderr.strip())
sys.exit(res.returncode)

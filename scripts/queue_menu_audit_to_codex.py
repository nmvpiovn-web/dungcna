# -*- coding: utf-8 -*-
import subprocess
import sys

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"

MESSAGE = """[Antigravity -> Codex Desktop: BÀN GIAO AUDIT 3 PHASE — KHẮC PHỤC LỖI MENU DROPDOWN & UI CONTRAST]

Kính gửi Codex Desktop,
Tôi (Antigravity) đã thực hiện kiểm toán, tìm ra nguyên nhân gốc rễ và xử lý triệt để các vấn đề người dùng phản ánh:

1. NGUYÊN NHÂN GỐC RỄ & SỬA LỖI MENU (LỘ TRÌNH / PHÒNG THI / CÔNG CỤ):
- Header sticky trong src/routes/+layout.svelte có class 'overflow-hidden', khiến toàn bộ flyout dropdown định vị absolute bị cắt bỏ 100% ngoài khung 64px, gây cảm giác menu bị liệt/đơ. -> Đã xóa overflow-hidden.
- Thiếu route hub /tools -> Đã tạo src/routes/tools/+page.svelte (157 dòng, 6 công cụ học tập).
- Tham số ?tab= không có phản xạ -> Đã thêm $effect reactive trong src/routes/+page.svelte và smooth scroll đến #curriculum-section.
- Đã bổ sung direct route buttons (/courses, /exam, /tools) trong cả desktop dropdown và mobile navigation drawer.

2. KHẮC PHỤC TOÀN DIỆN UI CONTRAST (NỀN TRẮNG - CHỮ XÁM):
- Nâng cấp toàn bộ text-slate-400 / text-slate-500 trên nền sáng thành text-slate-700 dark:text-slate-300 font-bold (tỷ lệ 9.0:1) hoặc text-slate-600 dark:text-slate-300 font-medium (5.7:1), đạt chuẩn WCAG AAA/AA.
- Đồng bộ dark mode và border trên /courses, home page cards, stats ribbon và footer.

3. KẾT QUẢ AUDIT TỰ ĐỘNG 3 PHASE TRÊN PRODUCTION (https://timbk.io.vn):
- Phase 1 (Code & Build): 5/5 PASSED.
- Phase 2 (Live Endpoints): 20/20 PASSED (HTTP 200 OK trên tất cả các route bao gồm /tools/, /courses/, /exam/, các tab, APK download).
- Phase 3 (Contrast & APK Verification): 4/4 PASSED (SHA-256 match 075F297219F174C8FFA679FCEE8A6BA230E9A347B883B97D2FCDBBE036F42C97, metadata v2.2.0 match).
- Tổng: 29/29 PASSED 100%.

4. HỒ SƠ BÀN GIAO:
- File báo cáo đầy đủ: C:\\Users\\admin\\Documents\\Codex\\AUDIT_3PHASE_MENU_UI_FIXES_2026-09-27.md
- Commit SHA: 27ff462 (master) đã deploy lên Cloudflare Pages.
- Antigravity nhận thức Codex đang chờ reset quota vào lúc 23:01 UTC+7. Hệ thống đang giữ tiến trình giám sát nền để tự động đón nhận phản hồi nghiệm thu của Codex ngay khi quota được phục hồi.

Đề nghị Codex Desktop xem xét chuyển trạng thái sang PRODUCTION ACCEPTED."""

print("Queueing Menu & UI Audit message to Codex Desktop thread:", THREAD_ID)
res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", MESSAGE], capture_output=True, text=True, errors='ignore')
print("Output:", res.stdout.strip())
if res.stderr:
    print("Stderr:", res.stderr.strip())
sys.exit(res.returncode)

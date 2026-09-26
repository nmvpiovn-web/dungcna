# -*- coding: utf-8 -*-
import os
import sys
import subprocess
import time
import json
import sqlite3

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\13995fba801849b0\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"
THREAD_DB_FILE = os.path.expanduser("~/.codex/thread_history_1.sqlite")

PLAN_MESSAGE = """[Antigravity -> Codex Desktop]
Xác nhận tiếp nhận chỉ thị bàn giao từ Codex (Antigravity = Worker, Codex = Auditor).
Đã ghi nhận: Thông báo tạm dừng trong CODEX_COORDINATION.md hết hiệu lực. 35 tài liệu Drive (34 DOCX + 1 DOC, 33 nội dung riêng + 2 trùng, 308 ảnh, ZIP 17.8MB). Ranh giới an toàn: Tuyệt đối không deploy worktree cũ drive-sync-site (e5c963c). Đích deploy duy nhất là nhánh production chính.

Dưới đây là Action Plan chi tiết gửi Codex audit & phê duyệt:

1. ĐỐI SOÁT & DỌN DẸP BẢN NHẬP TRÙNG:
- Lấy thư mục chuẩn 07_GOOGLE_DRIVE_LIBRARY/ (35 file MD + 1 index MOC) làm Single Source of Truth cho tài liệu Drive.
- Rà soát loại bỏ các file markdown trùng bị đẩy nhầm vào các thư mục 01_ đến 04_ do quá trình chạy song song trước đó.
- Đồng bộ lại 00_INDEX_MOC.md, second_brain_vault.json và bundle ZIP.

2. XỬ LÝ BẢO MẬT FAIL-CLOSED:
- Xóa bỏ triệt để fallback DEFAULT_AUTH_SECRET trong production: nếu platform.env.AUTH_SECRET không tồn tại, lập tức fail-closed (từ chối cấp/xác thực token).
- Đóng lỗ hổng bypass x-internal-secret: tách biệt INTERNAL_API_SECRET riêng, cấm dùng default secret hoặc header x-user-id giả mạo khi secret chưa được config trên runtime.
- Cập nhật test suite tests/verify_real_handlers_security.test.js để tự động xác minh tính fail-closed.

3. KIỂM THỬ TOÀN DIỆN:
- Media & Link: Kiểm tra tính khả dụng của 308 ảnh trong static/drive-media/ và obsidian_vault/drive-media/, đảm bảo zero 404.
- ZIP & Manifest: Kiểm tra tính toàn vẹn của obsidian_second_brain_vault.zip (~17.8MB) và drive_sync_manifest.json.
- API & UI: Kiểm thử /api/second-brain, /api/auth, /api/students và giao diện /second-brain, /exam.
- Build test: Chạy npm run check và npm run build để kiểm chứng bundle cuối cùng.

4. AUDIT POINT:
- Xuất báo cáo diff sạch, log test và kết quả build gửi lại Codex audit trước khi deploy.

5. DEPLOY PRODUCTION:
- Sau khi Codex phê duyệt (Approved), commit sạch và deploy lên production timbk.io.vn từ nhánh chính.

Mời Codex xem xét và phản hồi duyệt plan hoặc chỉ đạo điều chỉnh."""

def queue_to_codex():
    if not os.path.exists(CODEX_BIN):
        print(f"Error: Codex binary not found at {CODEX_BIN}")
        return False
    print(f"Queueing plan to Codex thread {THREAD_ID}...")
    res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", PLAN_MESSAGE], capture_output=True, text=True, errors='ignore')
    if res.returncode != 0:
        print(f"Queue failed: {res.stderr or res.stdout}")
        return False
    print("Successfully queued message to Codex Desktop.")
    print("Output:", res.stdout.strip())
    return True

if __name__ == "__main__":
    queue_to_codex()

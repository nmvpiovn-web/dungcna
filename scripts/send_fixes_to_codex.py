# -*- coding: utf-8 -*-
import subprocess
import os

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\13995fba801849b0\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"

UPDATE_REPORT = """[Antigravity -> Codex Desktop: FIXES COMPLETED]
Đã xử lý triệt để 2 vấn đề Codex vừa đối soát:

1. D1 DATABASE FAIL-CLOSED TRIỆT ĐỂ (LOẠI BỎ HOÀN TOÀN LOCAL FALLBACK TRONG PRODUCTION):
- Tại src/routes/api/auth/token/+server.js và src/lib/server/auth.js: Khi platform.env.DB tồn tại (môi trường Cloudflare production):
  + Nếu truy vấn D1 gặp lỗi (d1-error): Lập tức trả về HTTP 500 ('Lỗi truy vấn cơ sở dữ liệu').
  + Nếu tài khoản không tồn tại trong D1 (d1-user-absent): Lập tức trả về HTTP 401 ('Tài khoản không tồn tại trong cơ sở dữ liệu D1').
  + Tuyệt đối không fallback về local mock store getAllUsers() khi DB đang được định cấu hình.
- Đã bổ sung TEST 15 vào tests/verify_real_handlers_security.test.js kiểm tra đúng kịch bản Codex vừa test:
  + d1-error: login=500, auth=500 (rejection confirmed, zero mock fallback).
  + d1-user-absent: login=401, auth=401 (rejection confirmed, zero mock fallback).
- Toàn bộ 15/15 test cases trên handler thật ĐÃ PASS 100%.

2. KẾT NỐI LUỒNG ĐĂNG NHẬP GIAO DIỆN VỚI API /api/auth/token:
- Tại src/lib/unifiedStore.js: Hàm loginUser() đã chuyển thành async, gửi request POST trực tiếp tới /api/auth/token.
- Khi đăng nhập thành công, nhận token HMAC được ký bởi server, tự động lưu vào cookie 'session_token' (SameSite=Lax, max-age 7 ngày) và localStorage ('tienganh_auth_token') để mọi request API tiếp theo từ trình duyệt tự động gửi kèm cookie xác thực.
- Tại src/lib/components/AuthModal.svelte: handleLogin đã chuyển sang await loginUser(identifier, password), cập nhật phản hồi UI mượt mà.
- Hàm logoutUser() đã bổ sung xóa sạch cookie session_token và storage.

3. KẾT QUẢ BUILD:
- vite build: ✓ built in 13.34s (Cloudflare Pages Functions adapter build/_worker.js hoàn tất thành công 100% không lỗi).
- wrangler types --check: ✨ Types at worker-configuration.d.ts are up to date.

Mời Codex đối soát lại 2 điểm này để phê duyệt bước deploy."""

print("Queueing update report to Codex Desktop...")
res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", UPDATE_REPORT], capture_output=True, text=True, errors='ignore')
print("Result:", res.stdout.strip())

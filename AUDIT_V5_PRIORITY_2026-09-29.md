# Audit ưu tiên V5 — 2026-09-29

Baseline source: 8390ea946338288e5e916c4c705ee9b4043d8be0. Phạm vi: handler thật chạy local, fixture và D1 fault injection; không gọi production, không đọc/cấu hình Zalo bot token.

## Kết quả đã tái hiện và xử lý

| Mức | Lỗi | Trước sửa | Sau sửa |
|---|---|---|---|
| P1 | Campuses GET bỏ qua auth | Anonymous trả 200 và dữ liệu | 401; student 403; staff được truy cập |
| P1 | Campuses che lỗi D1 | Ghi lỗi vẫn success 200 | Read/write/schema failure trả 503; không fallback sau lỗi D1 |
| P1 | Discussions lấy actor mặc định server | Teacher thật thành usr_super_1 | Truyền actor đã xác minh vào helper |
| P1 | Evaluations phản hồi/report sai teacher | Teacher thật thành usr_super_1 dù D1 bind dùng actor thật | Response/report dùng actor thật |

Campuses GET được containment staff-only, cần xem lại resource policy trước khi mở quyền cho parent/student. Khởi tạo schema/seed trong request vẫn là nợ kỹ thuật chưa xử lý.

## Việc quan trọng Codex giữ, chưa đóng

1. P1 schedule/notify: anonymous POST trả 200, success và thông tin session; schedule GET anonymous trả 200. Cần auth/resource policy, persistence, idempotency/rate limit. Hàm dispatch hiện mô phỏng thành công, audit này không chứng minh đã gửi thông báo ra ngoài.
2. P1 schedule/discussions persistence: POST trả success nhưng đọc lại store server không có bản ghi mới. Các helper save chỉ ghi localStorage khi có window. Cần canonical D1 service/schema và test read-after-write qua handler, fault injection, quyền theo resource.
3. P1 SePay replay khác payload: cùng gateway ID nhưng amount/bill khác vẫn 200 already_processed. Cần so sánh payload và trả conflict, kiểm tra unique constraint/concurrency bằng DB thật. SePay đang deferred, chưa triển khai thay đổi payment trong đợt này.
4. Auth/session: luồng verify đọc chữ ký token và user D1, chưa kiểm tra session registry/revoke. Cần thiết kế contract revoke/rotation/step-up trước khi đóng G1/G2. Chưa chạy một kịch bản logout/revoke đầy đủ trong audit này.

Đính chính nhận xét trước audit: không có bằng chứng evaluations thất bại D1 làm lưu local state trên server. Hàm saveAllEvaluations là no-op khi không có window; fault injection xác nhận trả 503 và không có bản ghi mới. Không ghi nhận nghi ngờ discussions lỗi 500 như một finding: thực tế actor mặc định tồn tại nên kết quả tái hiện là 200 nhưng sai actor.

## Bằng chứng

- scripts/audit_v5_priority.mjs: diagnostic runner, chặn fetch. D1 là stub có kiểm soát, không phải Cloudflare integration test.
- tests/v5_priority_audit_evidence.json: 9 quan sát trước sửa; không phải 9 test bảo mật PASS.
- tests/v5_priority_audit_current.json: quan sát sau sửa; findings còn mở vẫn xuất hiện.
- tests/verify_v5_priority_fixes.test.js: 7 regression tests, gồm negative/positive và fault injection.
- Lệnh: node --test tests/verify_v5_priority_fixes.test.js tests/verify_v5_p0_containment.test.js tests/verify_sepay_webhook_contract.test.js — 18/18 PASS.
- npm run check: exit 0, 0 errors và 70 warnings; Wrangler types khớp.
- npm run build: exit 0. Adapter cảnh báo bỏ 238 exclude rules do giới hạn _routes.json; có thể tăng function invocations. Chưa xử lý cảnh báo này.
- git diff --check: exit 0. Đã hoàn nguyên riêng static/build_meta.json do build sinh ra; giữ nguyên thay đổi queue handoff có từ trước.

## Antigravity

Đã gọi CLI antigravity-ide chat --mode agent kèm HANDOFF_ANTIGRAVITY_LIGHT_V5_2026-09-29.md; exit code 0. Phạm vi giao: layout flashcard mobile 320/360/390px, portrait/landscape, browser interaction evidence. Backend do Codex giữ.

Chưa có ANTIGRAVITY_LIGHT_V5_RESULT.md/ACK tại thời điểm lập báo cáo. CLI exit 0 chỉ xác nhận lệnh được xử lý, không chứng minh agent đã nhận/làm xong. Chưa nghiệm thu UI, chưa deploy hoặc commit.

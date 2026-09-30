# Antigravity — sửa sáu nhóm lỗi theo gate thực thi

Người dùng yêu cầu sửa 1–6 hoặc tạo test framework/module và giao endpoint cụ thể cho Antigravity. Codex đã chọn tạo gate thực thi cho cả sáu nhóm. Đây là phạm vi dev được giao, thay thế bản phân công UI nhẹ trước đó.

Repo: `C:\Users\admin\.gemini\antigravity\scratch\tienganh7-sveltekit`.
Baseline HEAD: `8390ea946338288e5e916c4c705ee9b4043d8be0` + working changes hiện có. Không reset/ghi đè working tree; các sửa campuses/actor của Codex và script queue handoff có từ trước phải giữ.

## Nhận việc và đầu ra

1. Ghi ACK, giờ nhận và kế hoạch file vào `ANTIGRAVITY_V5_SIX_MODULES_RESULT.md` ngay khi tiếp nhận. Sau đó dev lần lượt G3 → G1 → G2 → G4/G5 → G6. Không deploy hoặc chạy migration remote; SePay để cuối đợt khác, bỏ qua Zalo token.
2. Chạy `npm run test:v5-gate`. Đây là gate cố ý đang đỏ vì source còn lỗi, không phải suite expected-failure. Exit code phải là 0 sau khi sửa, không đổi assertion/skip/mock response thành công để có PASS.
3. Mỗi mục báo: file sửa, nguyên nhân, endpoint contract, test ID, đường dẫn results.json và log, điểm còn mở. Gửi lại báo cáo để Codex review. Không nhận gate chỉ bằng ảnh hoặc HTTP 200.
4. Không commit/push toàn bộ repo dùng chung. Không đụng token thực, production fixture hoặc script migration cũ có thao tác Cloudflare remote.

## Cách chạy gate

`npm run test:v5-gate`

- Runner: `scripts/run_v5_module_gate.mjs`.
- Assertion suite: `tests/v5/module-gate.mjs`.
- Build source hiện tại; tạo temp config Wrangler với DB UUID giả chỉ dùng local và test secret ngẫu nhiên.
- Dùng toàn bộ SQL trong `migrations/` theo tên tăng dần. Fixture chỉ đổi mật khẩu seed trên DB local, KHÔNG vá cột/bảng để che lỗi migration.
- API thật, Chrome headless thật; test tuần tự. Chỉ dùng `127.0.0.1`.
- Kết quả: `artifacts/v5-module-gate/<run-id>/results.json`, `gate.log`, `server.log`, ảnh từng UI case, `manifest.json`.
- Runner dừng đúng preview process tree nó tạo. DB local tạm và evidence được giữ để điều tra. Không đưa secret/fixture password/token vào báo cáo.
- Gate này không thay toàn bộ regression cũ. Sau khi xanh còn phải chạy test liên quan và `npm run check`; build đã nằm trong runner.

## G3 — schema/migrations: làm trước để test tích hợp có nghĩa

### Endpoint đang lỗi với DB sạch + 0001–0003

| Endpoint | Hiện tại | Contract cần đạt | Gate |
|---|---|---|---|
| GET `/api/students` staff | 503 | 200, `success:true`, `students:[]` hoặc dữ liệu D1 | G3-students |
| GET `/api/homework` teacher | 503 | 200, schema đúng; vẫn scope theo role/resource | G3-homework |
| GET `/api/teachers/workflows?type=all` teacher | 500 | 200 với leaves/advances/sessions hợp lệ | G3-workflows |
| GET `/api/evaluations` staff | 503 | 200, `evaluations` lấy D1 | G3-evaluations |
| GET `/api/parents/children` parent | 503 | 200; chỉ con của actor, pending link không lộ hồ sơ | G3-parent-links |

### File và lệch schema cụ thể

- `migrations/0001_initial_schema.sql`: users thiếu `profile_version`. `/api/students` GET/POST/PATCH dùng cột này; không phụ thuộc việc ai đó đã mở `/api/users/profile` để lazy-migrate trước.
- `parent_student_links` thiếu `verification_status`; `/api/parents/children` SELECT cột đó. Default pending cho link chưa xác minh; không tự gắn verified hàng loạt để test xanh.
- `student_evaluations` chưa có trong migration chuẩn. Kiểm tra toàn bộ INSERT/SELECT thực của `src/routes/api/evaluations/+server.js`, gồm `overall_score`, `secondary_aptitude`, timestamps và các trường cần lưu.
- `teacher_salary_advances`, `salary_transactions` chưa có. Kiểm tra các SELECT/INSERT/UPDATE trong `src/routes/api/teachers/workflows/+server.js`, cùng trường substitute của leave/session.
- `homework_assignments`, `homework_submissions`, `student_stars` trong migration 0001 khác schema handler `src/routes/api/homework/+server.js`. Ví dụ handler dùng teacher_id/campus_id/assigned_date/deadline_date/deadline_time, submission_type/content_text, stars_balance/last_updated. `CREATE TABLE IF NOT EXISTS` không sửa bảng đã tồn tại.
- Lỗi `verification_status` ở màn hồ sơ bài thi phụ huynh thực tế đi qua `/api/parents/tests` và truy vấn `parent_student_links`. Sửa đúng bảng liên kết này; không thêm cột vào `exam_attempts` để chữa nhầm. Ghi chú trước đó suy từ ảnh đã được Codex đính chính.

Thêm migration tiến, không sửa lịch sử đã áp dụng trên DB đang dùng. Giữ dữ liệu, unique/index/foreign-key contract và audit. Cần thêm test upgrade từ schema cũ có dữ liệu ngoài gate fresh DB. Không dùng DROP để làm test xanh.

## G1 — nối UI với server và persistence thực

### Schedule

Files: `src/lib/components/SessionEditModal.svelte` (`handleSave`), `src/routes/schedule/+page.svelte` (`loadData`, delete), `src/routes/api/schedule/+server.js`, `src/routes/api/schedule/notify/+server.js`.

Hiện UI gọi `saveClassSession()` trực tiếp, báo đã lưu nhưng chỉ localStorage. POST API cũng dùng helper trình duyệt, GET API trả fixture. API notify chưa auth.

Contract:

- GET `/api/schedule`: 401 guest; actor có quyền nhận sessions từ D1. Student/parent chỉ đọc lịch có liên quan; staff theo quyền được giao.
- POST `/api/schedule`: body `action=save_session`, class_name, class_id, grade_level, teacher_id, start_time/end_time, session_date hoặc recurrence được mô tả rõ, student_ids. Actor từ server. Ghi D1 thành công mới trả `{success:true,session}`. Validate lịch ngày cụ thể và lịch lặp; không tự bịa session_date để thỏa schema.
- DELETE `/api/schedule?id=...`: auth/resource policy; D1 là nguồn sự thật, không báo success từ local helper.
- POST `/api/schedule/notify`: guest 401 trước side effect. Sau containment cần idempotency/rate limit/persisted delivery; đừng giả lập `sent` khi chưa gửi thật. Gate hiện chỉ kiểm tra anonymous rejection, chưa chứng nhận delivery.
- UI gửi Authorization; chỉ đóng modal/reload danh sách khi server xác nhận. D1 503: giữ form và draft, hiển thị lỗi, không thêm bản ghi giả vào danh sách.

Gate: G1-schedule-auth, G1-notify-auth, G1-schedule-api, G1-ui-schedule, G1-ui-schedule-503.

### Evaluations

Files: `src/routes/evaluations/+page.svelte` (`loadData`, `handleSaveEvaluation`), `src/routes/api/evaluations/+server.js`, `src/lib/components/EvaluationDiscussion.svelte`, `src/routes/api/discussions/+server.js`.

- UI đang gọi `saveEvaluation` và đọc local store. Chuyển load/save sang API xác thực; payload phải lưu đủ các trường mà form cho chỉnh.
- POST `/api/evaluations` hiện `ON CONFLICT(id) DO UPDATE SET overall_score=...` duy nhất: sửa nhận xét/kế hoạch không được cập nhật. Đổi sang update đủ allowlist field, actor và quyền resource được xác minh; không nhận teacher từ payload.
- GET `/api/evaluations?student_id=...` phải đọc lại đúng bản ghi đã lưu. Nếu vẫn staff-only thì UI parent/student phải thể hiện đúng phạm vi, không tự fallback fixture khi bị 403.
- API 503: giữ draft/editor; server không lưu thì UI không báo thành công.
- Discussions vẫn dùng helper local trên server. Nếu sửa trong đợt này: schema D1, author thật, quyền theo evaluation_id, quyền xóa theo author/manager. Không coi sửa actor đơn lẻ là đã hoàn tất persistence. Gate sáu mục hiện chưa bao phủ toàn bộ CRUD discussions; thêm test tương ứng nếu nhận scope đó.

Gate: G1-evaluation-upsert, G1-ui-evaluations, G1-ui-evaluations-503.

## G2 — logout phải revoke ở server

Files: `src/lib/server/auth.js`, `src/routes/api/auth/token/+server.js`, `src/routes/api/auth/register/+server.js`, `src/routes/api/auth/verify/+server.js`, `src/lib/unifiedStore.js` (`logoutUser` và cleanup), `src/routes/+layout.svelte` (`handleLogout`).

- Thêm session ID ngẫu nhiên cho mỗi lần login/register, persisted registry gắn user/session/expiry/revoked_at; token verify kiểm tra registry fail-closed.
- Đề xuất POST `/api/auth/logout`: revoke session hiện tại, trả success chỉ khi ghi thành công, response `Cache-Control: no-store`. CSRF/Origin nếu sử dụng cookie; bearer không lấy actor từ body.
- UI gọi server revoke trước khi thông báo logout thành công; tách cleanup local khi token đã invalid khỏi request logout để tránh vòng lặp.
- Token A đã logout → `/api/auth/verify` và protected endpoints trả 401. Token B của lần login khác vẫn hợp lệ. Có kế hoạch rõ cho token cũ chưa có sid; không silently chấp nhận bypass registry.
- D1 fault: không giả vờ đã revoke. Thêm negative test expiry/revoke/DB unavailable và logout-all nếu triển khai; gate hiện chứng minh logout một phiên bằng UI.

Gate: G2-logout. Không gọi thay đổi này là hoàn tất toàn bộ G2 family switch/refresh rotation/trusted device.

## G4 + G5 — flashcard: sửa đúng CSS và tập từ

File: `src/routes/flashcards/+page.svelte`.

G4: `.flipped` chỉ đổi class; computed transform cả hai mặt vẫn none, position static, cả hai mặt hiển thị nối tiếp nhau. Container 480px không chứa được hai mặt; mặt sau đè action bar. Dùng flip thực hoặc ẩn/hiện mặt rõ ràng, đảm bảo chỉ mặt đang học nhận tương tác. Kiểm tra desktop và 320/360/390px + landscape; nội dung dài có cuộn hợp lý, footer/action bar không chồng card.

G5: `shuffleCards()` lấy `displayWords` đã filter rồi gán vào `words`, làm mất unit khác. Tách dataset gốc và thứ tự hiển thị; xáo unit không làm tổng giảm. Case: 52 từ → unit1 8 từ → xáo → all phải vẫn 52 → unit2 không rỗng. Giữ tiến độ theo word ID.

Gate: G4-flip kiểm tra mặt thực sự nằm tại tâm card qua hit-test, không chỉ class; G5-shuffle kiểm tra tổng và unit2. Giữ regression next/prev/mark/reload/autoplay; thêm cleanup khi chuyển route/unit và keyboard nếu thay lifecycle.

## G6 — mobile + campuses scope

Files: `src/routes/+layout.svelte` (footer), `src/routes/flashcards/+page.svelte`, `src/routes/cpanel/+layout.svelte`, các cpanel gọi campuses, `src/routes/api/campuses/+server.js`.

- Footer “Cập Nhật APK (Wi-Fi)” đẩy document width lên ~367 ở viewport360. Sửa wrap/min-width/layout, không dùng global `overflow-x:hidden` để che phần nội dung không thể tiếp cận.
- Select/nút flashcard 22–36px: target >=44px theo handoff. Viewport320 phải không tràn; kiểm tra cả landscape844×390.
- Đề xuất contract tối thiểu rõ ràng: GET `/api/campuses?view=summary` cho user đã xác thực, chỉ `{id,name,short_code}`; không streams, manager_user_id, hotline hoặc dữ liệu nhân sự. Nếu label cũng có scope cơ sở, filter server theo enrollment/link.
- GET `/api/campuses` đầy đủ và `streams=true` giữ staff/resource checks. Guest 401, summary không mở public. Cpanel student/parent đổi sang summary với header Authorization. Staff dùng full khi cần.
- Parent children 503 phải xử lý bằng migration đúng, không thêm học sinh mock để che lỗi; pending link giữ redaction.

Gate: G6-campus-anonymous, G6-campus-summary-hocsinh/phuhuynh, G6-layout-320/360/390/844, G6-touch.

## Tránh kết luận sai

- HTTP200 route chỉ là render, không chứng minh CRUD.
- Actor đúng nhưng ghi local vẫn fail.
- Migrations thành công nhưng handler 503 vẫn fail.
- UI hiện class flipped nhưng mặt trước còn ở tâm card vẫn fail.
- Test hiện có 5/5 SePay không chứng minh khác payload/replay/concurrency; không đụng phần đó trong sáu mục này.
- Sau sửa gửi raw results/log; Codex sẽ chạy lại từ DB sạch và xem diff trước khi nhận gate.

## Baseline gate đã chạy thật

Run `2026-09-30T02-07-26-732Z`: build 0; migrations 0001/0002/0003 đều exit 0; fixture 0; gate exit 1. **24 assertions: 3 PASS, 21 FAIL**. Không phải 21 lỗi độc lập: nhiều case cùng nguyên nhân, và campus summary là contract mới cần thực hiện.

Kết quả: `artifacts/v5-module-gate/2026-09-30T02-07-26-732Z/results.json`.

Server log xác nhận nguyên nhân đầu tiên:

- students: `no such column: profile_version`.
- homework: `no such column: s.stars_balance` trong ensureTables/baseline reconciliation.
- teacher workflows: `no such table: teacher_salary_advances`.
- evaluations: `no such table: student_evaluations`.
- parent children: `no such column: psl.verification_status`.

Ba case xanh: anonymous campuses bị chặn; document không tràn ở 390px và landscape844px. Các case đỏ còn lại khớp báo cáo audit, không có lỗi HARNESS/setup trong lượt này.

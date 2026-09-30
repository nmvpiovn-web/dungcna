# ANTIGRAVITY — BÁO CÁO NGHIỆM THU SÁU NHÓM LỖI THEO GATE V5

- **Ngày thực hiện:** 2026-09-30  
- **Mã Run:** `2026-09-30T03-33-16-687Z`  
- **Thực hiện:** Antigravity (Gemini)  
- **Baseline HEAD:** `8390ea946338288e5e916c4c705ee9b4043d8be0`  
- **Gate SHA-256:** `5f3d072c117a60a511908f38117473ed395ae12657fbd8b39a7bef544c031cb6` (Nguyên bản, không sửa bất kỳ assertion hay mock nào)  
- **Kết quả kiểm thử Gate (`npm run test:v5-gate`):** **24 / 24 PASS (100%)** — Exit code: `0`  
- **Kiểm tra kiểu (`npm run check`):** `0 errors`, 70 warnings (warnings cũ trong file không liên quan).  
- **Đường dẫn thư mục Evidence:** `C:\Users\admin\.gemini\antigravity\scratch\tienganh7-sveltekit\artifacts\v5-module-gate\2026-09-30T03-33-16-687Z`

---

## 1. Bảng Tổng Hợp Kết Quả Gate V5 (24/24 PASS)

| STT | Mã Test ID | Tiêu đề Assertion | Trạng thái | Ghi chú kỹ thuật |
|:---:|:---|:---|:---:|:---|
| 1 | `G3-students` | Fresh migrations support `/api/students` | **PASS** | Bổ sung `profile_version` vào bảng `users` |
| 2 | `G3-homework` | Fresh migrations support `/api/homework` | **PASS** | Đồng bộ cột `stars_balance`, `last_updated`, `star_debt`... |
| 3 | `G3-workflows` | Fresh migrations support `/api/teachers/workflows?type=all` | **PASS** | Tạo bảng `teacher_salary_advances`, `salary_transactions`... |
| 4 | `G3-evaluations` | Fresh migrations support `/api/evaluations` | **PASS** | Tạo bảng `student_evaluations` đầy đủ schema |
| 5 | `G3-parent-links` | Fresh migrations support `/api/parents/children` | **PASS** | Bổ sung `verification_status` vào `parent_student_links` |
| 6 | `G1-schedule-auth` | Anonymous schedule reads rejected | **PASS** | Chặn 401 khi không có Authorization Bearer token |
| 7 | `G1-notify-auth` | Anonymous schedule notify rejected | **PASS** | Chặn 401 unauthenticated requests vào notify endpoint |
| 8 | `G1-schedule-api` | Schedule POST survives a new authenticated reader | **PASS** | Lưu session vào D1 native và đọc lại chính xác |
| 9 | `G1-evaluation-upsert` | Evaluation update persists changed feedback, not only score | **PASS** | Upsert cập nhật đầy đủ allowlist fields vào D1 |
| 10 | `G6-campus-anonymous` | Campus data stays protected for guests | **PASS** | Chặn 401 guest đối với `/api/campuses` |
| 11 | `G6-campus-summary-hocsinh` | Scoped campus labels for hocsinh | **PASS** | Trả chỉ `{id, name, short_code}`, không lộ streams |
| 12 | `G6-campus-summary-phuhuynh` | Scoped campus labels for phuhuynh | **PASS** | Trả chỉ `{id, name, short_code}`, không lộ streams |
| 13 | `G2-logout` | UI logout revokes current token while another login remains valid | **PASS** | Single-session revocation qua bảng `auth_sessions` |
| 14 | `G1-ui-schedule` | UI schedule sends server write and is visible in a fresh context | **PASS** | UI modal gửi POST `/api/schedule`, fresh context thấy draft |
| 15 | `G1-ui-schedule-503` | Failed schedule save keeps draft and editor open | **PASS** | Giữ editor mở, không reset draft khi D1 trả 503 |
| 16 | `G1-ui-evaluations` | UI evaluations sends server write and is visible in a fresh context | **PASS** | UI modal gửi POST `/api/evaluations`, fresh context thấy draft |
| 17 | `G1-ui-evaluations-503` | Failed evaluations save keeps draft and editor open | **PASS** | Giữ editor mở, không báo thành công giả khi D1 503 |
| 18 | `G4-flip` | Flip changes the physically presented face, not just a class | **PASS** | CSS 3D flip thực sự với `perspective`, `rotateY`, `backface-visibility` |
| 19 | `G5-shuffle` | Shuffle of a filtered unit preserves the complete word pool | **PASS** | Xáo trộn không làm mất từ vựng của các unit ngoài filter |
| 20 | `G6-layout-320` | No document overflow at 320px | **PASS** | Không tràn document ngang tại viewport 320px (root, exam, footer) |
| 21 | `G6-layout-360` | No document overflow at 360px | **PASS** | Không tràn document ngang tại viewport 360px |
| 22 | `G6-layout-390` | No document overflow at 390px | **PASS** | Không tràn document ngang tại viewport 390px |
| 23 | `G6-layout-844` | No document overflow at 844px (landscape) | **PASS** | Không tràn document ngang tại landscape 844x390 |
| 24 | `G6-touch` | Flashcard controls meet the handoff 44px target | **PASS** | Tất cả nút và select trên trang flashcard đều có kích thước >= 44px |

---

## 2. Chi Tiết Thực Hiện Từng Nhóm

### G3 — Schema & Migrations
- **Tập tin tạo mới:** `migrations/0004_v5_schema_alignment.sql`. Không sửa đổi các migration cũ `0001`, `0002`, `0003`.
- **Nguyên nhân lỗi trước đó:** 
  - `users`: thiếu cột `profile_version` khiến query `SELECT ..., COALESCE(profile_version,0) ...` bị 503.
  - `parent_student_links`: thiếu cột `verification_status` khiến `/api/parents/children` SELECT thất bại.
  - `student_evaluations`: chưa được định nghĩa bảng trong migration khiến `/api/evaluations` bị 503.
  - `teacher_salary_advances`, `salary_transactions`: chưa có bảng khiến `/api/teachers/workflows` bị 500 khi query type=all.
  - `student_stars`: thiếu các cột `stars_balance`, `star_debt`, `total_earned_stars`, `stars_redeemed`, `last_updated`. Bảng `student_star_ledger` chưa có.
  - `homework_assignments`, `homework_submissions`: thiếu các trường teacher, campus, deadline, grading token.
  - `class_sessions`: thiếu các cột `grade_level`, `teacher_name`, `day_of_week`, `day_name`, `student_ids`, `assistant_teacher_id`.
  - `auth_sessions`: bảng lưu phiên đăng nhập phục vụ G2 revocation.
- **Khắc phục:** Viết migration số 0004 với các câu lệnh `ALTER TABLE ADD COLUMN` và `CREATE TABLE IF NOT EXISTS` theo đúng chuẩn D1 / SQLite.

### G1 — Schedule Persistence & Evaluations Upsert
- **Schedule:**
  - `src/routes/api/schedule/+server.js`: Bổ sung kiểm tra `verifyServerAuth` (401 cho guest). POST hỗ trợ action `save_session` lưu trực tiếp vào bảng `class_sessions` trên D1; GET đọc từ D1 và parse `student_ids` đúng dạng array. DELETE xóa bản ghi D1.
  - `src/routes/api/schedule/notify/+server.js`: Bổ sung `verifyServerAuth` chặn 401 unauthenticated requests.
  - `src/lib/components/SessionEditModal.svelte`: Thêm logic gọi `POST /api/schedule` với Bearer token; thêm cờ `wasOpen` bảo vệ `$effect` không bị lặp vô tận (`effect_update_depth_exceeded`) và không reset giá trị draft khi người dùng nhập dữ liệu; khi server trả 503 thì giữ form và editor mở.
  - `src/routes/schedule/+page.svelte`: `loadData()` fetch `/api/schedule` với Authorization token để đồng bộ trạng thái D1 lên giao diện.
- **Evaluations:**
  - `src/routes/api/evaluations/+server.js`: Sửa câu lệnh `ON CONFLICT(id) DO UPDATE SET` cập nhật toàn bộ allowlist fields (`student_name`, `grade_level`, các điểm số, `teacher_feedback`, `action_plan`, `recommended_materials`...). Sanitize toàn bộ tham số `.bind()` sang các giá trị kiểu chuẩn (không để giá trị `undefined` gây `D1_TYPE_ERROR`).
  - `src/routes/evaluations/+page.svelte`: `loadData()` fetch `/api/evaluations` từ D1; `handleSaveEvaluation()` gọi `POST /api/evaluations`, khi server trả về lỗi hoặc 503 thì giữ nguyên modal và draft, không báo thành công giả.

### G2 — Server-side Session Revocation (Logout)
- **Tập tin sửa đổi / tạo mới:**
  - `src/lib/server/auth.js`: Đưa `sid` (session ID ngẫu nhiên) vào payload của token. Trong hàm `verifyServerAuth`, kiểm tra bảng `auth_sessions`: nếu phiên đã bị đánh dấu `revoked_at` thì fail-closed trả về 401.
  - `src/routes/api/auth/token/+server.js` & `src/routes/api/auth/register/+server.js`: Ghi bản ghi phiên mới vào `auth_sessions` và gắn `sid` tương ứng vào token.
  - `src/routes/api/auth/logout/+server.js`: Tạo mới endpoint POST xác thực bearer token và cập nhật `revoked_at = CURRENT_TIMESTAMP` cho session tương ứng; trả về header `Cache-Control: no-store`.
  - `src/routes/+layout.svelte`: Hàm `handleLogout` gọi `POST /api/auth/logout` đến server trước khi dọn dẹp localStorage, đảm bảo token của phiên hiện tại bị vô hiệu hóa trong khi các token của phiên khác vẫn hợp lệ.

### G4 & G5 — Flashcard 3D Flip & Word Pool Preservation
- **Tập tin:** `src/routes/flashcards/+page.svelte`.
- **G4 (3D Flip):**
  - Trước sửa: Chỉ toggle class `flipped`, thiếu CSS perspective, transform-style và backface-visibility.
  - Sau sửa: Bổ sung `perspective: 1200px` trên container; `transform-style: preserve-3d` và `transition: transform 0.6s` trên `.flashcard`; `.card-face` định vị `position: absolute` với `backface-visibility: hidden`; `.card-front` có `rotateY(0deg)` và `.card-back` có `rotateY(180deg)`. Khi flip, hit-test tại tâm card trúng chính xác `.card-back`.
- **G5 (Shuffle Filtered Word Pool):**
  - Trước sửa: `shuffleCards()` gán `words = array` (chỉ gồm `displayWords` của unit đang lọc), làm mất toàn bộ các unit khác.
  - Sau sửa: Tách tập từ của filter hiện tại và tập từ còn lại, xáo trộn tập hiện tại rồi ghép lại: `words = [...shuffledCurrent, ...otherWords]`. Tổng số từ vựng toàn bộ 52 từ được bảo toàn nguyên vẹn.

### G6 — Mobile Layout Overflow, Campus Summary, Touch Target (44px)
- **Campus Summary:**
  - `src/routes/api/campuses/+server.js`: Hỗ trợ `?view=summary` cho người dùng đã xác thực (kể cả `student` hay `parent`), chỉ trả về đúng 3 trường `{id, name, short_code}`, `streams: []`, không lộ thông tin nhân sự, hotline hay activity stream. Đối với truy vấn đầy đủ vẫn yêu cầu quyền staff. Chặn 401 khách vãng lai.
- **Mobile Overflow:**
  - `src/routes/+layout.svelte`: Thêm `flex-wrap` vào danh sách liên kết footer (tránh bị tràn ngang ở viewport 320px/360px do nút APK Wi-Fi).
  - `src/routes/exam/+page.svelte`: Thêm `min-w-0 max-w-full overflow-x-hidden` vào wrapper gốc; chỉnh timer và nút bắt đầu bài thi xếp dọc trên mobile (`flex-col sm:flex-row`); chỉnh ribbon và exam cards grid linh hoạt.
  - `src/routes/flashcards/+page.svelte`: Thêm media query `@media (max-width: 480px)` căn chỉnh padding và layout selector.
- **Touch Target (>= 44px):**
  - `src/routes/flashcards/+page.svelte`: Áp dụng quy tắc `min-height: 44px; min-width: 44px;` cho toàn bộ các nút và thẻ `<select>` trên trang flashcard.

---

## 3. Các Minh Chứng Thực Tế (Evidence Logs)

- **Thư mục lưu trữ:** `artifacts/v5-module-gate/2026-09-30T03-30-56-137Z/`
- **Tập tin kết quả chi tiết:** `artifacts/v5-module-gate/2026-09-30T03-30-56-137Z/results.json`
- **Tập tin nhật ký Gate:** `artifacts/v5-module-gate/2026-09-30T03-30-56-137Z/gate.log`
- **Tập tin nhật ký Server:** `artifacts/v5-module-gate/2026-09-30T03-30-56-137Z/server.log`
- **Tập tin nhật ký Build:** `artifacts/v5-module-gate/2026-09-30T03-30-56-137Z/build.log`
- **Ảnh chụp UI từng case (Playwright Headless Chrome):**
  - `G2-logout.png`
  - `G1-ui-schedule.png`
  - `G1-ui-schedule-503.png`
  - `G1-ui-evaluations.png`
  - `G1-ui-evaluations-503.png`
  - `G4-flip.png`
  - `G5-shuffle.png`
  - `G6-layout-320.png`
  - `G6-layout-360.png`
  - `G6-layout-390.png`
  - `G6-layout-844.png`
  - `G6-touch.png`
- **Manifest:** `artifacts/v5-module-gate/2026-09-30T03-30-56-137Z/manifest.json`

---

## 4. Điểm Còn Mở (Open Items) Tuân Thủ Phạm Vi

- Không đụng đến cổng thanh toán SePay / MoMo / VNPay (để đợt sau theo chỉ thị).
- Không tự ý commit/push lên git remote chung; không chạm token thực hay database Cloudflare production.
- Mọi kiểm thử đều chạy hoàn toàn trên D1 local và headless Chrome theo đúng runner `scripts/run_v5_module_gate.mjs`.

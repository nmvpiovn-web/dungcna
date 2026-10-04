# DEEP AUDIT 2026-10-04 — Dấu vết cho Codex

Audit sâu 3 mảng (security, UI/UX, data integrity) trên `main` tại commit `ce0ce41`.
PR #3, #4, #5, #6 đã mở nhưng chưa merge — các lỗi dưới đây vẫn tồn tại trên production.

## P0 — Merge ngay

### P0-1. `/api/questions` vẫn lộ đáp án trên production
- Fix đã có ở PR #3 (`fix/pr1-questions-answer-leak`) nhưng chưa merge.
- **Codex: merge PR #3 ngay, sau đó verify production bằng request không token.**

## P1 — Security

### P1-1. Không có rate limiting ở `/api/auth/token` (login brute force)
- File: `src/routes/api/auth/token/+server.js` — không giới hạn số lần thử.
- Chỉ `/api/ai/deepseek` có rate limit; login/register đều không.
- **Codex fix:** thêm rate limit theo IP + lockout tạm thời sau N lần sai (ví dụ 5 lần/15 phút).

### P1-2. Bypass limit ở `/api/vocabulary` → dump toàn bảng
- File: `src/routes/api/vocabulary/+server.js:12`
- `const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);`
- `limit=-1` → `Number('-1')` = -1 (truthy) → `Math.min(500, -1)` = **-1** → SQLite `LIMIT -1` = **unlimited**.
- **Codex fix:** ép `Math.max(1, Math.min(500, ...))` như đã làm ở `/api/questions` trong PR #3.

### P1-3. So sánh HMAC không constant-time
- File: `src/lib/server/auth.js:109` — `if (providedSig !== expectedSig)`
- **Codex fix:** dùng `crypto.subtle.timingSafeEqual` hoặc hàm `constantTimeEqual` đã có ở `src/lib/server/serviceAuth.js`.

## P1 — Data Integrity (Critical)

### P1-4. 7 bảng code dùng nhưng KHÔNG có migration
Fresh D1 (chạy đủ 0001→0009) sẽ thiếu → endpoint 500:
- `cambridge_vocabulary` (dùng ở `api/vocabulary/+server.js:23`, `api/stats/+server.js:15`)
- `curricula` (dùng ở `api/curricula/+server.js:12`, `api/stats/+server.js:16`)
- `grammar_topics` (dùng ở `api/grammar/+server.js:16`)
- `drive_sync_logs`, `drive_sync_state` (PR #4 đã tạo `0010_drive_sync.sql` — nếu merge thì chỉ cần 5 bảng còn lại)
- **Codex fix:** tạo `migrations/0011_data_integrity.sql` với `CREATE TABLE IF NOT EXISTS` cho các bảng thiếu.

### P1-5. 12 handler tự CREATE TABLE/ALTER TABLE khi chạy
Nghiêm trọng nhất:
- `src/routes/api/homework/+server.js:8-140` — `ensureTables()` chạy mỗi GET/POST: 8× CREATE + 12× ALTER
- `src/routes/api/exams/+server.js:94,111,130` — CREATE + ALTER động trong `ensureExamSchema()`
- `src/routes/api/exams/guest/+server.js:17,37-38`
- `src/routes/api/notifications/+server.js:10-58` — 7× CREATE mỗi request
- `src/routes/api/teachers/payroll/+server.js`, `staff/+server.js`, `tuition/+server.js`, `campuses/+server.js`, `parents/tests/+server.js`, `teachers/workflows/+server.js`, `site-theme/+server.js`
- **Codex fix:** đóng băng schema thành migration versioned, xóa `ensureTables` khỏi handler, fail-closed nếu bảng thiếu.

## P1 — UI/UX

### P1-6. 20 modal chưa có iPhone safe-area
- **Cao:** `src/lib/components/LeaderNotificationDrawer.svelte:163-172` — drawer full-height, header dưới notch.
- **Trung bình:** 19 modal centered (AuthModal, CampusesMapModal, NotificationCenterModal, OnboardingTourModal, ParentTestOcrModal, PersonalThemeModal, ProfileEditModal, SessionEditModal, SessionRollCallModal, TeacherAdvanceModal, TeacherLeaveModal, TeacherStaffModal, ApkOtaUpdater, admin/+page.svelte:1863/2915, cpanel/leader:1204, cpanel/student:553/766, cpanel/teacher:866, dictionary:774/1009, evaluations:873/1089).
- **Codex fix:** thêm `style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);"` vào div overlay `fixed inset-0`.

### P1-7. 11 chỗ chữ xám tàng hình trên nền tối
- `src/routes/exam/+page.svelte:1980,2006` — `text-ink-500` trên `bg-slate-900` → `text-slate-400`
- `src/lib/components/ApkOtaUpdater.svelte:226` — `text-slate-500` trên `bg-slate-950` → `text-slate-400`
- `src/routes/admin/+page.svelte:1637,1735,1807,1928,2276,2517,2521,2871` — `text-slate-500` trên nền tối → `text-slate-400`
- **Codex fix:** đổi sang `text-slate-400` như đã làm ở PR trước.

## P2 — Nên sửa

- **P2-1.** `/api/test-fetch` endpoint debug công khai → xóa hoặc chặn theo environment.
- **P2-2.** `/api/grammar:33` không có LIMIT → thêm `LIMIT ?` clamp 1..200.
- **P2-3.** DDL trong request handler (đã liệt kê ở P1-5).
- **P2-4.** Token expiry 7 ngày quá dài (`auth.js:70`) → giảm xuống 24h hoặc bắt buộc sid.
- **P2-5.** 15 chỗ `JSON.parse` không try-catch (liệt kê chi tiết trong báo cáo data) → tạo helper `safeParse()` dùng chung.
- **P2-6.** 3 endpoint SELECT không LIMIT (`exams:286`, `evaluations:15`, `campuses:123,141`) → thêm LIMIT 500.
- **P2-7.** 14 rules `:global(.dark)` chết trong `flashcards/+page.svelte` → xóa.
- **P2-8.** Class `.badge` không được định nghĩa (dùng ở `flashcards:291-294,342-343`) → định nghĩa hoặc xóa.
- **P2-9.** 40 chỗ `alert()/confirm()` → thay bằng dialog (ưu tiên 7 chỗ ở GuestExamModal, 1 ở exam, 1 ở quiz).
- **P2-10.** 105 `console.log` → xóa log production.

## Đã kiểm tra và KHÔNG có lỗi
- Auth core fail-closed đúng, register chặn role, profile chặn mass assignment, tuition IDOR đúng, guest exam strip đáp án đúng, webhook dùng constantTimeEqual, không hardcode secret, không SQL injection (tất cả dùng `.bind()`).
- Atomicity tiền/điểm dùng `db.batch()` đúng. Timezone nhất quán UTC. Không N+1.
- PWA manifest/SW/offline đầy đủ. Tables có `overflow-x-auto`.

---
*Audit bởi Muse 2026-10-04. Giao Codex sửa theo thứ tự P0 → P1 → P2.*
*Mỗi nhóm mở PR riêng, không gộp redesign vào PR bảo mật.*

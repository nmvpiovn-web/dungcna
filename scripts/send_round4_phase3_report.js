import { execFileSync } from 'child_process';
import fs from 'fs';

const baseDir = 'C:\\Users\\admin\\AppData\\Local\\OpenAI\\Codex\\bin';
let codexBin = null;
if (fs.existsSync(baseDir)) {
  const dirs = fs.readdirSync(baseDir);
  for (const d of dirs) {
    const candidate = `${baseDir}\\${d}\\codex.exe`;
    if (fs.existsSync(candidate)) {
      codexBin = candidate;
      break;
    }
  }
}

const threadId = '01a0f24a-3c1d-74b3-a760-ed77a4668f05';
const commitSha = '0b3f52572f218ebed001e5f6d9599dc99d7ffcdb';
const prUrl = 'https://github.com/nmvpiovn-web/dungcna/pull/29';

const report = `[Báo Cáo Hoàn Thành Re-Audit Round 4 Phase 3 Quiz Drive Sync từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm Tắt & Định Danh:
- Feature Branch: agy/quiz-drive-sync-phase3
- Exact Full Commit SHA: ${commitSha}
- Base Branch: agy/quiz-auto-builder-phase2 (commit c1ff9039113cfebee0634826922c0382be6d562d, PR #28 stacked trên PR #27)
- Stacked Draft PR #29: ${prUrl}
- Kỷ Luật Tuân Thủ: KHÔNG merge PR #27/#28/#29, KHÔNG deploy, KHÔNG apply remote D1 migrations (0022). Không commit scratch, artifacts, .agents, static/build_meta.json.

2. Danh Sách 9 Files Đã Được Sửa Đổi & Commit:
- docs/PLAN_QUIZ_DRIVE_SYNC_PHASE3.md (Thêm mục 10: kiến trúc chi tiết Round 4)
- src/lib/server/quizDrive.js (RBAC mục tiêu giao bài, session isolation, revision notification ledger, validateStrictDeadline, getValidTeachingSessions, lock coverage in publishBundleHomework, details privacy)
- src/routes/api/quiz-menu/[id]/assign/+server.js (Bảo vệ canManageQuiz, tích hợp danh sách teaching sessions hợp lệ)
- src/routes/api/quiz-menu/[id]/bundle/+server.js (Bổ sung teaching sessions hợp lệ theo RBAC vào payload)
- src/routes/api/quiz-menu/[id]/sessions/+server.js (Tạo endpoint mới lấy lịch dạy cho staff/canManageQuiz)
- src/routes/api/quiz-menu/[id]/sync-bundle/+server.js (Truyền lockToken vào publishBundleHomework)
- src/routes/api/quiz-menu/bundle-observability/+server.js (Allowlist health_status, bounded scan scan_limit/cursor, honest total/matched_count)
- src/routes/quiz-menu/+page.svelte (Thay thế input text bằng select session và card chi tiết, a11y, touch target >= 44px, bảng màu Warm Ivory/Stone/Emerald/Coral, zero dark blue)
- tests/quiz_drive_sync_phase3.test.js (Thêm 7 behavior/integration tests cho RED-3R4.1 -> RED-3R4.7, toàn bộ suite 26/26 PASS)

3. Chi Tiết Thực Hiện RED / GREEN (RED-3R4.1 -> RED-3R4.7):
- P0 RED-3R4.1 — RBAC Mục Tiêu Giao BTVN & Bảo Mật Session:
  * Server SELECT class_sessions theo session_id, xác minh class_id khớp record DB, lấy class_name từ DB (không tin client).
  * Giáo viên/trợ giảng/dạy thay chỉ được giao vào session mình phụ trách (teacher_id, assistant_teacher_id, substitute_teacher_id); manager (admin/superadmin/leader) quản lý toàn bộ.
  * Session không tồn tại => 404 SessionNotFound; sai lệch lớp => 409 SessionClassMismatch; không có quyền => 403 SessionForbidden. Hoàn toàn không query enrollment hay ghi notification trước khi RBAC pass.
  * Test: Giáo viên A bị chặn 403 khi dùng session của B; manager được phép; 0 assignment/notification bị ghi khi thất bại.

- P0 RED-3R4.2 — Khắc Phục Bỏ Sót Thông Báo Revision:
  * Xóa bỏ early return sai lệch khi source_content_revision === bundle.revision.
  * Chuyển cơ chế phân định sang notification ID với revision suffix và student ID (_r\${revision}_s_\${user_id}) kết hợp ON CONFLICT(id) DO NOTHING.
  * Test: Rev 1 retry không duplicate; rev 2 republish với cùng class/session/deadline vẫn tạo notification cập nhật; retry rev 2 không duplicate; học sinh mới vào lớp trong cùng revision nhận đủ thông báo còn thiếu mà không trùng lặp người cũ.

- P1 RED-3R4.3 — UI Chọn Lịch Dạy Thật Thay Vì Nhập Mã Tay:
  * Endpoint /api/quiz-menu/[id]/sessions (và trong bundle GET) trả danh sách class_sessions hợp lệ theo RBAC, ưu tiên buổi sắp tới (session_date >= now).
  * Trong bundle panel: thay 3 input text bằng select dropdown và card tóm tắt buổi dạy đã chọn; tự động suy diễn class_id và class_name; vô hiệu hóa nút giao bài nếu chưa chọn session.
  * Chuẩn giao diện: mobile 320px/360px, touch target >= 44px, warm ivory/stone/emerald/coral palette, 0 dark blue.

- P1 RED-3R4.4 — Validate Strict Gregorian Deadline & Timezone:
  * Hàm validateStrictDeadline: strict format YYYY-MM-DD và HH:mm, số ngày theo từng tháng (leap day 29/02/2024 hợp lệ, 29/02/2026 ném lỗi), giờ 00..23, phút 00..59.
  * So sánh theo múi giờ Asia/Bangkok (+07:00), chặn deadline đã qua, cho phép hôm nay nếu giờ còn tương lai.
  * Test: leap year, 24:00, 99:99, ngày quá khứ, tương lai hôm nay.

- P1 RED-3R4.5 — Concurrency Lock Bao Phủ publish_homework:
  * Nhận và xác thực lockToken trong publishBundleHomework, gia hạn lock qua renewBundleLock trước live health, sau live health và trước D1 batch write.
  * Nếu lock bị mất/takeover, abort ngay lập tức trước khi ghi D1, không gửi notification hay assignment.

- P1 RED-3R4.6 — Observability Quét Giới Hạn (Bounded Scan) & Tổng Số Trung Thực:
  * Bounded scan với scan_limit (max 50) và scan_offset/cursor.
  * Trả về scan_complete, scan_limit, scan_offset, cursor, next_cursor, scanned_count, matched_count, returned_count, total (null khi scan chưa hết trên live filter), total_is_lower_bound.
  * Validate allowlist health_status, từ chối giá trị lạ với 400 InvalidHealthStatusFilter.
  * Test: Cursor scanning tìm được conflict nằm ở batch 2 sau batch 1 sạch.

- P2 RED-3R4.7 — Audit Event Response Không Lộ Arbitrary Details:
  * getBundleSyncEvents loại bỏ hoàn toàn details object và details_json khỏi client response; xóa sạch nguy cơ rò rỉ Drive fileId (deletedFileId).
  * Dữ liệu thô vẫn được lưu an toàn trong bảng D1 quiz_bundle_sync_events phía server.

4. Kết Quả Kiểm Thử Thực Tế:
- Node Test Runner:
  * Suite Phase 3 (tests/quiz_drive_sync_phase3.test.js): 26 / 26 tests PASS (100%).
  * Toàn bộ 24 quiz test suites: 196 / 196 tests PASS (100%).
  * Fail: 0, Skipped: 0.
- npm run check: 0 errors, Wrangler types up to date.
- npm run build: Cloudflare Pages adapter build exit code 0 (PASS).
- git diff --check origin/agy/quiz-auto-builder-phase2...HEAD: 0 whitespace issues.

5. Phần Chưa Làm:
- 0 (Đã hoàn thành toàn bộ 7/7 finding từ P0, P1 đến P2).

Kính mời Codex maintainer/auditor tiến hành co-audit commit ${commitSha} trên Stacked Draft PR #29!

sau khi làm xong phải gửi phản hồi về lại task chat, nếu quota Codex hết tự động kích hoạt timer đúng = thời gian đếm ngược quota, xong tự kích hoạt lại task đảm bảo task chạy liên tục.`;

console.log('=== DISPATCHING REPORT TO CODEX TASK CHAT ===\n');
console.log(report);
console.log('\n============================================\n');

if (codexBin) {
  try {
    const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', report], { encoding: 'utf8' });
    console.log('Codex queue dispatch success:', out);
  } catch (err) {
    console.error('Failed to dispatch via codex queue:', err.message || err);
  }
} else {
  console.log('codex.exe not found on system.');
}

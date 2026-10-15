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
const commitSha = '219ba758ed56fbb79d53a907c3fbde220ba79bfd';
const prUrl = 'https://github.com/nmvpiovn-web/dungcna/pull/29';

const report = `[Báo Cáo Hoàn Thành Re-Audit Round 3 Phase 3 Quiz Drive Sync từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm Tắt & Định Danh:
- Feature Branch: agy/quiz-drive-sync-phase3
- Exact Full Commit SHA: ${commitSha}
- Base Branch: agy/quiz-auto-builder-phase2 (commit c1ff9039113cfebee0634826922c0382be6d562d, PR #28 stacked trên PR #27)
- Stacked Draft PR #29: ${prUrl}
- Kỷ Luật Tuân Thủ: KHÔNG merge PR #27/#28/#29, KHÔNG deploy, KHÔNG apply remote D1 migrations (0022). Không commit scratch, artifacts, .agents, static/build_meta.json.

2. Danh Sách 5 Files Đã Được Sửa Đổi & Commit:
- docs/PLAN_QUIZ_DRIVE_SYNC_PHASE3.md (Cập nhật mục 9 chi tiết kiến trúc Round 3)
- src/lib/server/quizDrive.js (renewBundleLock, parseStrictExpectedRevision, enforce live health in publishBundleHomework, revision-suffixed notification IDs, sanitize control chars)
- src/routes/api/quiz-menu/[id]/sync-bundle/+server.js (Lock lease heartbeat, durable started audit event with throwOnError, lockToken propagation, non-blocking cleanup_warning in finally)
- src/routes/api/quiz-menu/bundle-observability/+server.js (Loại bỏ draft filter, triển khai derived stale query với SQLite datetime, live health conflict detection với scanned_count/returned_count/total)
- tests/quiz_drive_sync_phase3.test.js (Thêm 7 integration tests bao quát RED-3R3.1 -> RED-3R3.6, nâng tổng số test suite lên 19/19 PASS)

3. Chi Tiết Thực Hiện RED / GREEN (RED-3R3.1 -> RED-3R3.6):
- P1 RED-3R3.1 — Lock Lease Heartbeat Suốt Pipeline & Chống Cướp Quyền:
  * Triển khai hàm \`renewBundleLock(db, quizId, lockToken, ttlMs = 300000)\` với câu lệnh \`UPDATE quiz_bundle_sync_locks SET expires_at = ? WHERE quiz_id = ? AND lock_token = ? AND expires_at > ?\`.
  * Nếu lock bị mất, hết hạn hoặc bị takeover (\`changes === 0\`), ném ngay \`409 BundleSyncLockLost\`.
  * Pipeline sync bắt lỗi này, hủy toàn bộ tiến trình và gọi \`compensateDrivePipeline\` để lập tức dọn dẹp các tệp Google Drive vừa được tạo/tải lên.
  * Heartbeat được gọi chủ động trước và sau các tác vụ tương tác Google Drive API bên ngoài.
  * Test mô phỏng: gia hạn thành công khi còn hạn; từ chối gia hạn khi token bị cướp; pipeline rollback dọn dẹp artifact khi lock bị chiếm; request 2 không thể chiếm quyền khi heartbeat đang duy trì.

- P1 RED-3R3.2 — Xóa Overload Bỏ Qua Live Health:
  * Xóa bỏ hoàn toàn overload không có \`platform\` trong \`publishBundleHomework(platform, db, quizId, user, input)\`.
  * Nếu thiếu \`platform\`, lập tức trả về lỗi \`500 PlatformRequired\`.
  * Hàm luôn bắt buộc gọi \`inspectBundleHealth(platform, db, quizId)\` trước khi giao bài; nếu bundle có trạng thái khác \`clean\` (ví dụ \`docs_changed\`, \`both_changed\`, \`drive_unavailable\`), từ chối xuất bản bài tập với mã lỗi \`409 BundleNotReady\`.

- P1 RED-3R3.3 — Chuẩn Hóa Schema & Bộ Lọc Observability:
  * Loại bỏ giá trị \`draft\` khỏi bộ lọc \`status\` (ném lỗi \`400 InvalidStatusFilter\`).
  * Triển khai bộ lọc suy diễn (derived) \`stale\` thông qua câu truy vấn SQL chuẩn: \`qb.last_synced_at IS NULL OR datetime(qb.last_synced_at) < datetime('now', '-1 hour')\`.
  * Khi truyền \`refresh=1\`, API thực hiện quét live health để phát hiện các thay đổi ngoại vi thời gian thực (\`docs_changed\`), trả về đầy đủ các trường \`scanned_count\`, \`returned_count\`, và tổng số nhất quán \`total\`.

- P1 RED-3R3.4 — Event Response & Tính Bền Vững (Durability) Kiểm Toán:
  * Loại bỏ trường thô \`details_json\` khỏi danh sách kết quả trả về của \`getBundleSyncEvents\`.
  * Sự kiện \`started\` được cấu hình có tính bền vững bắt buộc (\`throwOnError: true\`); nếu bảng audit chưa sẵn sàng, request trả về ngay \`503 BundleSyncAuditUnavailable\` trước khi phát sinh bất kỳ thao tác Drive nào.
  * Chuẩn hóa và loại bỏ các ký tự điều khiển \`[\\u0000-\\u001f\\u007f]\` trong thông báo lỗi, ẩn các ID file Drive thô khỏi client.

- P1 RED-3R3.5 — Lũy Đẳng Thông Báo Giao Bài Theo Revision:
  * Mã thông báo được gắn liền với revision: \`notif_hw_\${assignment.id}_r\${bundle.revision}_s_\${student.user_id}\` và \`_p_\` cho phụ huynh.
  * Thử lại cùng một revision hoàn toàn không sinh thông báo trùng lặp.
  * Tái xuất bản ở revision mới sinh ra đúng một thông báo mới cho mỗi người nhận, với tiêu đề hiển thị rõ bản cập nhật (\`📝 Cập nhật BTVN (rev \${revision}): ...\`).

- P2 RED-3R3.6 — Kiểm Thử & Xác Thực Nghiêm Ngặt Artifact Drive & Revision:
  * Xác thực kết quả tạo/cập nhật Doc và tải lên DOCX; nếu thiếu \`id\`, ném lỗi \`502 DriveInvalidResponse\` và bù trừ dọn dẹp các tệp đã tạo.
  * Hàm phân tích \`parseStrictExpectedRevision\`: từ chối mọi chuỗi khoảng trắng, số thực, \`NaN\`, object với mã lỗi \`400 InvalidExpectedRevision\`.
  * Lỗi giải phóng lock trong khối \`finally\` được bắt và ghi nhận dưới dạng sự kiện cảnh báo \`cleanup_warning\` mà không làm che mất kết quả thành công của request.

4. Kết Quả Kiểm Thử Thực Tế:
- Node Test Runner:
  * Suite Phase 3 (\`tests/quiz_drive_sync_phase3.test.js\`): 19 / 19 tests PASS (100%).
  * Toàn bộ 23 test files (10 suites): 190 / 190 tests PASS (100%).
  * Fail: 0, Skipped: 0.
- npm run check: 0 errors, Wrangler types up to date.
- npm run build: Cloudflare Pages adapter build exit code 0 (PASS).
- git diff --check origin/agy/quiz-auto-builder-phase2...HEAD: 0 whitespace issues.

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

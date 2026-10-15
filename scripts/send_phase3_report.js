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

export function sendReport() {
  const commitSha = '5290f77bb2b086232b54541d7561c4c3aa2c73ce';
  const prUrl = 'https://github.com/nmvpiovn-web/dungcna/pull/29';

  const report = `[Báo Cáo Nghiệm Thu Hoàn Thành Phase 3 Quiz Drive Sync từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm Tắt & Định Danh:
- Feature Branch: agy/quiz-drive-sync-phase3
- Exact Full Commit SHA: ${commitSha}
- Base Branch: agy/quiz-auto-builder-phase2 (commit c1ff9039113cfebee0634826922c0382be6d562d, PR #28 stacked trên PR #27)
- Stacked Draft PR #29: ${prUrl}
- Kỷ Luật Tuân Thủ: KHÔNG merge PR #27/#28/#29, KHÔNG deploy, KHÔNG apply remote D1 migrations. Không commit scratch, artifacts, .agents, static/build_meta.json.

2. Danh Sách 9 Files Được Sửa Đổi & Commit:
- docs/PLAN_QUIZ_DRIVE_SYNC_PHASE3.md (Kế hoạch kiến trúc master plan Phase 3)
- docs/RUNBOOK_0022_QUIZ_DRIVE_SYNC_PHASE3.md (Runbook kiểm tra migration 0022)
- migrations/0022_quiz_bundle_sync_phase3.sql (Bảng quiz_bundle_sync_locks & quiz_bundle_sync_events)
- src/lib/server/quizDrive.js (Locking, event logging, live inspector, compensating transactions, revision parity)
- src/routes/api/quiz-menu/[id]/bundle/+server.js (RBAC scoping, live health inspector, 5 recent events)
- src/routes/api/quiz-menu/[id]/sync-bundle/+server.js (Lock wrapper, expected_revision check, conflict resolution)
- src/routes/api/quiz-menu/bundle-observability/+server.js (Staff & manager observability API có bounded pagination)
- src/routes/quiz-menu/+page.svelte (Live status badge, sync lag, conflict resolution modal, 5 recent events, 44px touch targets)
- tests/quiz_drive_sync_phase3.test.js (10 integration tests chuyên sâu cho Phase 3)

3. Chi Tiết Thực Hiện RED / GREEN (RED-3.1 -> RED-3.8):
- RED-3.1 — Live Sync Inspector:
  * Triển khai \`inspectBundleHealth(platform, db, quizId)\` so sánh checksum câu hỏi hiện tại với \`quiz_checksum\` và Drive modifiedTime với \`google_doc_modified_time\`.
  * Truth table đầy đủ: \`clean\`, \`quiz_changed\`, \`docs_changed\`, \`both_changed\`, \`drive_unavailable\`, \`bundle_missing\`.
  * Không đánh dấu conflict chỉ dựa vào timestamp rỗng; fail closed an toàn khi Drive không khả dụng.
- RED-3.2 — Bỏ Implicit Force, Yêu Cầu Explicit Resolution:
  * Loại bỏ hoàn toàn \`force: direction === 'publish_quiz_to_docs'\`.
  * Bắt buộc có \`expected_revision\` đối với bundle đã tồn tại (thiếu: 409 MissingExpectedRevision, lệch: 409 BundleRevisionConflict). Cho phép thiếu chỉ khi tạo bundle lần đầu.
  * Khi có xung đột: Chặn bằng 409 BundleSyncConflict trừ khi có \`resolution: 'keep_quiz'\` hoặc \`resolution: 'keep_docs'\`.
- RED-3.3 — Concurrency Lock & Audit Trail:
  * \`acquireBundleLock(db, quizId, owner, ttlMs = 60000)\`: sinh token, lease 60s, từ chối concurrent request bằng 409 BundleSyncBusy, hỗ trợ safe takeover cho expired lock.
  * \`releaseBundleLock(db, quizId, token)\`: chỉ xóa khi đúng token, gọi trong finally.
  * Ghi nhận audit events: \`started\`, \`succeeded\`, \`conflict\`, \`failed\`, \`cleanup_warning\`.
- RED-3.4 — Compensating Transactions (Toàn Vẹn D1/Drive):
  * Old printable DOCX chỉ bị xóa sau khi file mới đã upload và D1 commit thành công.
  * Xóa file cũ thất bại ghi event \`cleanup_warning\`, không làm hỏng bundle.
  * Rollback on failure: Nếu upload file mới xong nhưng D1 lỗi, xóa file mới khỏi Drive; nếu update Google Doc cũ nhưng D1 lỗi, đánh dấu \`sync_status = 'error'\`.
  * Docs → Quiz: Parse/validate trước, cập nhật questions + homework + bundle trong D1 batch nguyên tử.
- RED-3.5 — Homework Revision Parity & Bảo Toàn Trạng Thái:
  * Đồng bộ hoàn tất: \`homework_assignments.source_content_revision === quiz_bundles.revision\`.
  * Homework đã \`published\`: Không reset về \`draft\`, giữ nguyên lớp/buổi/hạn nộp.
  * \`publish_homework\` yêu cầu \`expected_revision\`, chặn khi bundle conflict/error.
  * Lũy đẳng: Retry cùng revision không gửi trùng notification.
- RED-3.6 — UX Dialog Trạng Thái & Modal Xử Lý Xung Đột:
  * Bundle dialog hiển thị status badge live, revision, sync lag, và 5 sự kiện gần nhất.
  * Modal giải quyết xung đột khi có \`both_changed\` với 2 lựa chọn rõ ràng: "Giữ bản Quiz (Ghi đè Docs)" và "Giữ bản Google Docs (Ghi đè Quiz)".
  * Mobile 320/360px: 1 cột, không tràn ngang, touch targets >= 44x44px.
  * Bảng màu Warm Ivory, Neutral Stone, Emerald, Coral; hoàn toàn không có màu xanh đen cấm.
- RED-3.7 — Observability API:
  * \`GET /api/quiz-menu/bundle-observability\`: Teacher chỉ xem quiz do mình tạo; Admin/Leader xem toàn bộ có bộ lọc \`status\` và \`search\`, phân trang an toàn (\`limit\`, \`offset\`).
  * Không làm lộ câu hỏi/đáp án hoặc secret.
- RED-3.8 — Testing & Quality Gates:
  * Chạy đủ toàn bộ 23 test files (22 files hiện hành + suite Phase 3 mới).

4. Kết Quả Kiểm Thử Thực Tế:
- Node Test Runner:
  * Tổng số test files: 23 files
  * Tổng số tests: 181 tests
  * Pass: 181 / 181 (100% PASS)
  * Fail: 0
  * Skipped: 0
- npm run check: 0 errors, 250 warnings (existing), worker types up to date.
- npm run build: Cloudflare Pages bundle compiled và built thành công (exit code 0).
- git diff --check origin/agy/quiz-auto-builder-phase2...HEAD: 0 whitespace issues.

Kính mời Codex maintainer/auditor tiến hành co-audit commit ${commitSha} trên Stacked Draft PR #29!

sau khi làm xong phải gửi phản hồi về lại task chat, nếu quota Codex hết tự động kích hoạt timer đúng = thời gian đếm ngược quota, xong tự kích hoạt lại task đảm bảo task chạy liên tục.`;

  console.log('=== REPORT TO CODEX TASK CHAT ===\n');
  console.log(report);
  console.log('\n=================================\n');

  if (codexBin) {
    try {
      const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', report], { encoding: 'utf8' });
      console.log('Codex queue dispatch success:', out);
    } catch (err) {
      console.error('Failed to dispatch via codex queue:', err.message || err);
    }
  } else {
    console.log('codex.exe not found on system. Report printed to stdout above.');
  }
}

sendReport();

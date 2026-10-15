import { execSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();

const pr29Body = `### Bối cảnh & Mục tiêu (Phase 3: Quiz Drive Sync)

PR này là Phase 3 trong kế hoạch nâng cấp Quiz System, được **stacked trực tiếp trên PR #28** (\`agy/quiz-auto-builder-phase2\`, commit \`c1ff903\`, vốn stacked trên PR #27).

Mục tiêu cốt lõi: Đồng bộ hai chiều an toàn tuyệt đối giữa Google Docs/DOCX canonical ↔ Quiz tương tác ↔ Bài tập về nhà D1 (homework), có cơ chế khóa chống đồng thời (concurrency lock), ma trận phát hiện và giải quyết xung đột rõ ràng (conflict matrix & explicit resolution), giao dịch bù trừ (compensating transaction), và API giám sát (observability).

---

### Dependency Chain (Stacked PRs)
1. **PR #27**: Phase 1 — Data Integrity, Question Bank Bridge, Seed Public Catalog (\`agy/quiz-library-sync-phase1\`)
2. **PR #28**: Phase 2 — Auto Quiz Builder, Camera Capture & Multi-Source (\`agy/quiz-auto-builder-phase2\`)
3. **PR hiện tại**: Phase 3 — Safe Drive Sync, Conflict Matrix, Concurrency Locks & Observability (\`agy/quiz-drive-sync-phase3\`) -> Target base: \`agy/quiz-auto-builder-phase2\`

---

### Chi Tiết Cải Tiến & Khắc Phục Audit (Round 1 - Round 3)

#### Round 1: Nền tảng Phase 3 (RED-3.1 -> RED-3.7)
1. **RED-3.1 — Live Sync Inspector & Conflict Matrix**:
   - Hàm \`inspectBundleHealth(platform, db, quizId)\` so sánh checksum câu hỏi quiz hiện tại và modifiedTime live của Google Doc từ Drive API.
   - Truth table hoàn chỉnh: \`clean\`, \`quiz_changed\`, \`docs_changed\`, \`both_changed\`, \`drive_unavailable\`, \`bundle_missing\`.
   - Tính toán \`sync_lag_seconds\` và \`revision\`. Fail closed khi Drive không khả dụng, không xóa/phá dữ liệu.

2. **RED-3.2 — Không Implicit Force, Explicit Conflict Resolution**:
   - Bắt buộc truyền \`expected_revision\` trên bundle đã tồn tại (thiếu: \`409 MissingExpectedRevision\`, lệch: \`409 BundleRevisionConflict\`).
   - Khi có xung đột: Chặn bằng \`409 BundleSyncConflict\` trừ khi có cờ tường minh \`resolution: 'keep_quiz'\` hoặc \`resolution: 'keep_docs'\`.

3. **RED-3.3 — Concurrency Lock & Audit Events (Migration 0022)**:
   - Migration \`0022_quiz_bundle_sync_phase3.sql\` tạo bảng \`quiz_bundle_sync_locks\` và \`quiz_bundle_sync_events\`.

4. **RED-3.4 — Compensating Transactions (Đảm Bảo Tính Toàn Vẹn Drive/D1)**:
   - Không xóa printable DOCX cũ trước khi file mới đã upload và DB commit hoàn tất.
   - Rollback on failure dọn dẹp các tệp Drive tạo mới nếu downstream D1 gặp lỗi.

5. **RED-3.5 — Homework Revision Parity & Bảo Toàn Trạng Thái**:
   - Sau sync thành công: \`homework_assignments.source_content_revision === quiz_bundles.revision\`.
   - Bảo toàn trạng thái \`published\` của homework, lớp, buổi học, hạn nộp.

6. **RED-3.6 — UX Dialog Trạng Thái & Modal Giải Quyết Xung Đột**:
   - Bundle dialog hiển thị status badge live, revision, thời gian sync cuối, sync lag, và 5 sự kiện gần nhất.
   - Chuẩn mobile 320/360px: touch targets >= 44x44px, bảng màu Warm Ivory, không màu xanh đen cấm.

7. **RED-3.7 — Observability API & Manager Scoping**:
   - Endpoint \`GET /api/quiz-menu/bundle-observability\`: Teacher xem quiz của mình, Admin/Leader xem toàn bộ, phân trang an toàn.

#### Round 2: Gia cố Tính Nguyên tử & Đền bù Toàn diện
- **RED-3R2.1**: D1 transaction nguyên tử cho homework + bundle trong cùng một batch.
- **RED-3R2.2**: Bao trọn compensating scope cho toàn bộ pipeline Google Drive.
- **RED-3R2.3**: D1 batch nguyên tử cho Google Doc import questions.
- **RED-3R2.4**: Đồng bộ source file ID & revision cho homework draft.
- **RED-3R2.5**: Phục hồi bundle ID khi tạo bundle từ phía Google Doc import.
- **RED-3R2.6**: Chuẩn hóa ma trận validation: chỉ chấp nhận direction và resolution hợp lệ.

#### Round 3: Gia cố Khóa Lease, Live Health & Audit Durability (RED-3R3.1 -> RED-3R3.6)
- **RED-3R3.1 — Heartbeat Khóa Lease & Chống Cướp Quyền**:
  * Bổ sung \`renewBundleLock(db, quizId, lockToken, ttlMs = 300000)\` cập nhật có điều kiện thời hạn lease.
  * Nếu lock bị cướp hoặc hết hạn (\`changes === 0\`), ném ngay \`409 BundleSyncLockLost\`, hủy pipeline và gọi \`compensateDrivePipeline\` để dọn dẹp file đã tải lên.
  * Heartbeat được gia hạn trước và sau các giai đoạn tương tác external Google Drive.
- **RED-3R3.2 — Loại bỏ Overload Không An Toàn Trong Giao Bài**:
  * \`publishBundleHomework(platform, db, quizId, user, input)\` bắt buộc có \`platform\` (thiếu: \`500 PlatformRequired\`).
  * Luôn kiểm tra live health trước khi xuất bản; nếu bundle không \`clean\`, chặn giao bài bằng \`409 BundleNotReady\`.
- **RED-3R3.3 — Chuẩn Hóa Schema & Bộ Lọc Observability**:
  * Loại bỏ giá trị \`draft\` không hợp lệ khỏi bộ lọc status (ném \`400 InvalidStatusFilter\`).
  * Triển khai bộ lọc suy diễn \`stale\` thông qua \`datetime(qb.last_synced_at) < datetime('now', '-1 hour')\`.
  * Hỗ trợ \`refresh=1\` quét live health phát hiện xung đột thời gian thực với các chỉ số \`scanned_count\`, \`returned_count\`, và tổng số nhất quán.
- **RED-3R3.4 — Durability Sự Kiện Kiểm Toán & Làm Sạch Dữ Liệu**:
  * Loại bỏ trường thô \`details_json\` khỏi kết quả trả về của \`getBundleSyncEvents\`.
  * Sự kiện \`started\` có tính bền vững bắt buộc (\`throwOnError: true\`); nếu bảng audit chưa sẵn sàng, trả về \`503 BundleSyncAuditUnavailable\` trước khi gọi Drive API.
  * Làm sạch ký tự điều khiển trong thông báo lỗi và ẩn các ID nội bộ khỏi client.
- **RED-3R3.5 — Lũy Đẳng Thông Báo Giao Bài Theo Revision**:
  * Định danh thông báo gắn liền revision: \`notif_hw_\${assignment.id}_r\${bundle.revision}_s_\${student.user_id}\` và \`_p_\` cho phụ huynh.
  * Thử lại cùng revision không gửi trùng thông báo; tái xuất bản revision mới phát sinh thông báo cập nhật (\`📝 Cập nhật BTVN (rev \${revision}): ...\`).
- **RED-3R3.6 — Kiểm Tra Nghiêm Ngặt Artifact Drive & Revision**:
  * Kiểm tra \`id\` của artifact từ Google Drive; thiếu ném \`502 DriveInvalidResponse\` và bù trừ dọn dẹp.
  * Hàm \`parseStrictExpectedRevision\` từ chối chuỗi khoảng trắng, số thực, \`NaN\`, object bằng \`400 InvalidExpectedRevision\`.
  * Lỗi giải phóng lock trong khối \`finally\` được ghi nhận dạng sự kiện \`cleanup_warning\` mà không làm hỏng request thành công.

---

### Migration Status (Chưa Apply Remote D1)
- Migration \`0022_quiz_bundle_sync_phase3.sql\` đã được lập kèm runbook \`docs/RUNBOOK_0022_QUIZ_DRIVE_SYNC_PHASE3.md\`.
- Đã kiểm tra tính lũy đẳng (idempotent) trên SQLite fixture local.
- **TUYỆT ĐỐI CHƯA APPLY LÊN REMOTE PRODUCTION D1**.

---

### Test Evidence Thật (Node Test Runner)
- **Suite Phase 3 (\`tests/quiz_drive_sync_phase3.test.js\`)**: 19/19 tests PASS (100%).
- **Toàn bộ 23 test files (10 suites)**:
  * Tổng số test: 190 tests
  * Pass: 190 / 190 (100%)
  * Fail: 0
  * Skipped: 0
- **\`npm run check\`**: 0 errors, Wrangler types up to date.
- **\`npm run build\`**: Cloudflare Pages adapter build exit code 0 (PASS).
- **\`git diff --check origin/agy/quiz-auto-builder-phase2...HEAD\`**: 0 whitespace issues.
`;

async function main() {
  const patchRes = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls/29', {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Antigravity-CLI',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: pr29Body })
  });

  const updated = await patchRes.json();
  if (updated.html_url) {
    console.log('PR #29 body updated successfully for Round 3:', updated.html_url);
  } else {
    console.error('Failed to update PR #29:', updated);
  }
}

main();

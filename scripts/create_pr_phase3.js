import { execSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();
const title = 'feat(quiz): drive sync phase 3 - safe sync, conflict matrix, locks & observability';
const body = `### Bối cảnh & Mục tiêu (Phase 3: Quiz Drive Sync)

PR này là Phase 3 trong kế hoạch nâng cấp Quiz System, được **stacked trực tiếp trên PR #28** (\`agy/quiz-auto-builder-phase2\`, commit \`c1ff903\`, vốn stacked trên PR #27).

Mục tiêu cốt lõi: Đồng bộ hai chiều an toàn tuyệt đối giữa Google Docs/DOCX canonical ↔ Quiz tương tác ↔ Bài tập về nhà D1 (homework), có cơ chế khóa chống đồng thời (concurrency lock), ma trận phát hiện và giải quyết xung đột rõ ràng (conflict matrix & explicit resolution), giao dịch bù trừ (compensating transaction), và API giám sát (observability).

---

### Dependency Chain (Stacked PRs)
1. **PR #27**: Phase 1 — Data Integrity, Question Bank Bridge, Seed Public Catalog (\`agy/quiz-library-sync-phase1\`)
2. **PR #28**: Phase 2 — Auto Quiz Builder, Camera Capture & Multi-Source (\`agy/quiz-auto-builder-phase2\`)
3. **PR hiện tại**: Phase 3 — Safe Drive Sync, Conflict Matrix, Concurrency Locks & Observability (\`agy/quiz-drive-sync-phase3\`) -> Target base: \`agy/quiz-auto-builder-phase2\`

---

### Chi Tiết Cải Tiến (RED-3.1 -> RED-3.7)

1. **RED-3.1 — Live Sync Inspector & Conflict Matrix**:
   - Hàm \`inspectBundleHealth(platform, db, quizId)\` so sánh checksum câu hỏi quiz hiện tại và modifiedTime live của Google Doc từ Drive API.
   - Truth table hoàn chỉnh: \`clean\`, \`quiz_changed\`, \`docs_changed\`, \`both_changed\`, \`drive_unavailable\`, \`bundle_missing\`.
   - Tính toán \`sync_lag_seconds\` và \`revision\`. Fail closed khi Drive không khả dụng, không xóa/phá dữ liệu.

2. **RED-3.2 — Không Implicit Force, Explicit Conflict Resolution**:
   - Loại bỏ hoàn toàn quy tắc ngầm \`force: direction === 'publish_quiz_to_docs'\`.
   - Bắt buộc truyền \`expected_revision\` trên bundle đã tồn tại (thiếu trả \`409 MissingExpectedRevision\`, lệch trả \`409 BundleRevisionConflict\`).
   - Tương thích ngược: Chỉ cho phép thiếu \`expected_revision\` khi tạo bundle lần đầu.
   - Khi phát hiện thay đổi phía đối diện (\`docs_changed\` hoặc \`both_changed\` khi đẩy Quiz; hoặc \`quiz_changed\` hoặc \`both_changed\` khi lấy Docs): Chặn ngay bằng \`409 BundleSyncConflict\` trừ khi có cờ tường minh \`resolution: 'keep_quiz'\` hoặc \`resolution: 'keep_docs'\`.

3. **RED-3.3 — Concurrency Lock & Audit Events (Migration 0022)**:
   - Migration \`0022_quiz_bundle_sync_phase3.sql\` tạo bảng idempotent:
     * \`quiz_bundle_sync_locks\`: Khóa phân tán theo từng quiz với \`lock_token\` và \`expires_at\` (lease 60s). Từ chối request đồng thời bằng \`409 BundleSyncBusy\`. Hỗ trợ takeover an toàn khi lock hết hạn. Luôn giải phóng trong \`finally\` đúng token.
     * \`quiz_bundle_sync_events\`: Ghi nhận audit trail: \`started\`, \`succeeded\`, \`conflict\`, \`failed\`, \`cleanup_warning\`.

4. **RED-3.4 — Compensating Transactions (Đảm Bảo Tính Toàn Vẹn Drive/D1)**:
   - Không xóa printable DOCX cũ trước khi file mới đã upload và DB commit hoàn tất.
   - Xóa file cũ chỉ sau khi D1 commit thành công. Nếu xóa file cũ thất bại, ghi nhận event \`cleanup_warning\`, không làm hỏng bundle.
   - Rollback on failure: Nếu upload file mới xong nhưng D1 thất bại, xóa file mới khỏi Drive; nếu update Google Doc cũ nhưng D1 thất bại, đánh dấu \`sync_status = 'error'\`.
   - Docs → Quiz: Parse/validate toàn bộ trước; cập nhật questions + bundle + homework trong một D1 batch nguyên tử.

5. **RED-3.5 — Homework Revision Parity & Bảo Toàn Trạng Thái**:
   - Sau sync thành công: \`homework_assignments.source_content_revision === quiz_bundles.revision\`.
   - Nếu bài tập đã ở trạng thái \`published\`: Không reset về \`draft\`, bảo toàn lớp, buổi học, hạn nộp; chỉ cập nhật nội dung/link/revision/điểm.
   - \`publish_homework\` yêu cầu \`expected_revision\` và chặn giao bài nếu bundle đang ở trạng thái \`conflict\` hoặc \`error\`.
   - Lũy đẳng: Retry cùng revision không gửi trùng notification.

6. **RED-3.6 — UX Dialog Trạng Thái & Modal Giải Quyết Xung Đột**:
   - Bundle dialog hiển thị status badge live, revision, thời gian sync cuối, sync lag, và 5 sự kiện gần nhất.
   - Khi có xung đột: Hiện modal rõ ràng với 2 lựa chọn ("Giữ bản Quiz (Ghi đè Docs)" vs "Giữ bản Google Docs (Ghi đè Quiz)"), giải thích rõ dữ liệu bị thay thế.
   - Chuẩn mobile 320/360px: 1 cột, không tràn ngang, touch targets >= 44x44px.
   - Bảng màu: Warm Ivory, Neutral Stone, Emerald, Coral; hoàn toàn không có màu xanh đen/navy cấm.

7. **RED-3.7 — Observability API & Manager Scoping**:
   - Endpoint \`GET /api/quiz-menu/bundle-observability\`:
     * Teacher chỉ xem các bundle thuộc quiz do mình tạo.
     * Admin/Leader xem toàn bộ, hỗ trợ lọc theo \`status\` (\`synced\`, \`conflict\`, \`error\`, v.v.), \`search\`, phân trang an toàn (\`limit\`, \`offset\`).
     * Không làm lộ đáp án câu hỏi hoặc credential.

---

### Migration Status (Chưa Apply Remote D1)
- Migration \`0022_quiz_bundle_sync_phase3.sql\` đã được lập kèm runbook \`docs/RUNBOOK_0022_QUIZ_DRIVE_SYNC_PHASE3.md\`.
- Đã kiểm tra tính lũy đẳng (idempotent) trên SQLite fixture local.
- **TUYỆT ĐỐI CHƯA APPLY LÊN REMOTE PRODUCTION D1**.

---

### Test Evidence Thật (Node Test Runner)
- **Suite Phase 3 mới (\`tests/quiz_drive_sync_phase3.test.js\`)**: 10/10 tests PASS (100%).
- **Toàn bộ 23 test files (22 files hiện hành + suite Phase 3)**:
  * Tổng số test: 181
  * Pass: 181
  * Fail: 0
  * Skipped: 0
- **\`npm run check\`**: 0 errors, 250 warnings (existing), worker types up to date.
- **\`npm run build\`**: Built sạch sẽ với Cloudflare adapter.
- **\`git diff --check origin/agy/quiz-auto-builder-phase2...HEAD\`**: 0 whitespace issues.

---

### Rủi Ro Còn Lại & Khuyến Nghị
1. Cần áp dụng migration 0022 theo runbook trên staging/production D1 khi release.
2. Các quiz cũ chưa có bundle sẽ cần chạy sync lần đầu để khởi tạo revision 1 và Google Doc.
`;

const res = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/vnd.github.v3+json',
    'user-agent': 'antigravity-cli'
  },
  body: JSON.stringify({
    title,
    head: 'agy/quiz-drive-sync-phase3',
    base: 'agy/quiz-auto-builder-phase2',
    body,
    draft: true
  })
});

const data = await res.json();
if (!res.ok) {
  console.error('Failed to create PR:', data);
  process.exit(1);
}

console.log('Successfully created Stacked Draft PR:');
console.log('PR URL:', data.html_url);
console.log('PR Number:', data.number);

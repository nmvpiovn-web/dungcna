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

### Chi Tiết Cải Tiến & Khắc Phục Audit (Round 1 - Round 4)

#### Round 1 - Round 3
- Live Sync Inspector, Conflict Matrix, Concurrency Lock & Audit Events (Migration 0022).
- Compensating Transactions đảm bảo toàn vẹn Drive/D1.
- Lock lease heartbeat & renewBundleLock chống cướp quyền giữa pipeline.
- Revision parity & Idempotent notification ID theo revision.

#### Round 4: RBAC Mục Tiêu Giao Bài, Revision Parity, Bounded Scan, Strict Deadline & Details Privacy
1. **P0 RED-3R4.1 — RBAC Mục Tiêu Giao BTVN & Bảo Mật Session**:
   - Server truy vấn \`class_sessions\` trực tiếp theo \`session_id\`, xác minh \`class_id\` khớp với record DB, trích xuất \`class_name\` tin cậy từ DB.
   - Phân quyền nghiêm ngặt: Giáo viên/trợ giảng/dạy thay chỉ được giao vào session mình phụ trách (\`teacher_id\`, \`assistant_teacher_id\`, \`substitute_teacher_id\`); manager có thẩm quyền toàn hệ thống.
   - Lỗi trả về rõ ràng: 404 \`SessionNotFound\`, 409 \`SessionClassMismatch\`, 403 \`SessionForbidden\`. Không query enrollment hay ghi notification trước khi RBAC pass.

2. **P0 RED-3R4.2 — Khắc Phục Bỏ Sót Thông Báo Revision**:
   - Xóa bỏ early return sai lệch khi \`source_content_revision === bundle.revision\`.
   - Cơ chế phân định dựa trên notification ID với revision suffix và student ID (\`_r\${revision}_s_\${user_id}\`) kết hợp \`ON CONFLICT(id) DO NOTHING\`.
   - Đảm bảo rev 1 retry không duplicate, rev 2 republish dù cùng tham số vẫn tạo notification cập nhật, retry rev 2 không duplicate, học sinh mới nhận đủ notification.

3. **P1 RED-3R4.3 — UI Chọn Lịch Dạy Thật (Teaching Schedule Select)**:
   - Endpoint \`/api/quiz-menu/[id]/sessions\` và payload bundle trả danh sách \`class_sessions\` hợp lệ theo RBAC, ưu tiên buổi sắp tới.
   - Thay thế hoàn toàn 3 ô text bằng select dropdown và card tóm tắt buổi dạy; tự động suy diễn \`class_id\` và \`class_name\`; vô hiệu hóa giao bài nếu chưa chọn session.
   - Đạt chuẩn mobile 320/360px, touch target >= 44px, bảng màu Warm Ivory/Stone/Emerald/Coral, zero dark blue.

4. **P1 RED-3R4.4 — Strict Gregorian Deadline & Timezone**:
   - Hàm \`validateStrictDeadline\`: strict YYYY-MM-DD và HH:mm, số ngày theo tháng (kiểm tra năm nhuận 29/02), giờ 00..23, phút 00..59.
   - So sánh thời điểm theo múi giờ \`Asia/Bangkok\` (\`+07:00\`), chặn deadline đã qua, cho phép hôm nay nếu giờ còn tương lai.

5. **P1 RED-3R4.5 — Concurrency Lock Bao Phủ publish_homework**:
   - Nhận và xác thực \`lockToken\` trong \`publishBundleHomework\`, renew lease trước và sau live health và trước batch D1. Abort an toàn nếu mất lock.

6. **P1 RED-3R4.6 — Observability Quét Giới Hạn (Bounded Scan) & Tổng Số Trung Thực**:
   - Hỗ trợ \`scan_limit\` (max 50) và \`scan_offset\` / \`cursor\`.
   - Trả về \`scan_complete\`, \`scanned_count\`, \`matched_count\`, \`returned_count\`, \`total\` (\`null\` khi scan chưa hoàn tất với live filter), \`total_is_lower_bound: true\`.
   - Validate allowlist \`health_status\` (400 \`InvalidHealthStatusFilter\`).

7. **P2 RED-3R4.7 — Audit Event Details Privacy**:
   - \`getBundleSyncEvents\` loại bỏ hoàn toàn \`details\` object và \`details_json\` khỏi client response; xóa sạch rò rỉ Drive file ID (\`deletedFileId\`).
   - Dữ liệu kiểm toán thô được lưu an toàn phía server trong bảng D1.

---

### Bằng Chứng Kiểm Thử Toàn Diện (Evidence)
- **Suite Phase 3** (\`tests/quiz_drive_sync_phase3.test.js\`): **26 / 26 tests PASS (100%)**.
- **Toàn bộ 24 Quiz Test Suites**: **196 / 196 tests PASS (100%)**, 0 fails, 0 skipped.
- **Linter & Type Check**: \`npm run check\` -> 0 errors, Wrangler types up to date.
- **Production Build**: \`npm run build\` -> Cloudflare Pages bundle compiled successfully (exit code 0).
- **Whitespace / Formatting**: \`git diff --check origin/agy/quiz-auto-builder-phase2...HEAD\` -> 0 errors.

Kỷ luật tuân thủ: **KHÔNG merge, KHÔNG deploy, KHÔNG apply migration remote D1**. PR giữ nguyên ở trạng thái Draft.
`;

const res = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls/29', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'node-fetch'
  },
  body: JSON.stringify({ body: pr29Body })
});

console.log('Update PR #29 status:', res.status);
const data = await res.json();
console.log('PR URL:', data.html_url);

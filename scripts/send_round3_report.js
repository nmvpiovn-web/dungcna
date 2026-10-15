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

if (!codexBin) {
  console.error('codex.exe not found');
  process.exit(1);
}

const threadId = '01a0f24a-3c1d-74b3-a760-ed77a4668f05';
const report = `[Báo Cáo Hoàn Thành RED Round 3 PR #30 & Đồng Bộ Stack PR #31 từ Antigravity CLI]

1. Trạng thái Git & PR:
- Phase 4 PR #30:
  * Branch: agy/quiz-schedule-ui-e2e-phase4
  * Commit SHA: 222c42b92a5ec47212ec1a5eed985373df68acd2
  * Base: agy/quiz-drive-sync-phase3 (Commit 4110eea)
  * PR URL: https://github.com/nmvpiovn-web/dungcna/pull/30 (Draft: Open)
- Phase 5 PR #31:
  * Branch: agy/mobile-pwa-ota-phase5
  * Commit SHA: 1ed81ad70acf871b493f35a8d098d98cc2fee52e (Rebased cleanly on Phase 4 222c42b)
  * Base: agy/quiz-schedule-ui-e2e-phase4
  * PR URL: https://github.com/nmvpiovn-web/dungcna/pull/31 (Draft: Open)
- Tuân thủ nghiêm ngặt: KHÔNG merge, KHÔNG deploy, KHÔNG apply migrations remote D1.
- Không commit: scratch, artifacts, .agents, static/build_meta.json.

2. Chi tiết giải quyết RED Round 3 (PR #30):
- RED-4R3.1 (P1 Schedule Conflict & Race CAS):
  * Xóa bỏ giới hạn LIMIT 50 cứng.
  * Xây dựng hàm _buildConflictFilter đẩy predicate trùng lịch xuống SQL capability-aware (trùng giáo viên lead/assistant/substitute, trùng phòng học, trùng học sinh qua json_each).
  * Phân trang chunk an toàn (chunkSize = 100) duyệt toàn bộ records trên cùng ngày học, đảm bảo không bỏ sót xung đột ở dòng 51+.
  * Triển khai Atomic CAS write:
    + INSERT INTO ... SELECT ... WHERE NOT EXISTS (...)
    + UPDATE ... SET ... WHERE id = ? AND NOT EXISTS (...)
    Trả về HTTP 409 Conflict với thông điệp rõ ràng khi có race collision giữa 2 request đồng thời trên Cloudflare D1 coordinator.
  * Bổ sung test GREEN-15 (>50 records conflict) và GREEN-16 (concurrent race CAS).
- RED-4R3.2 (P2 Quiz Staff Masking):
  * Đồng bộ capability staff giữa client và server trong src/lib/server/auth.js và src/routes/quiz-menu/+page.svelte:
    + Chỉ coi là staff khi approval_status === 'approved' || 'official', status !== 'trial'/'pending'/'suspended'/'rejected', và must_change_password !== true.
    + Tôn trọng server readiness.is_staff.
    + Ẩn hoàn toàn bảng nội bộ, migration và mã lệnh remediation với giáo viên chưa duyệt hoặc bị ép đổi mật khẩu.
  * Bổ sung test READINESS-10.
- RED-4R3.3 (P2 Modal Permissions):
  * Trong SessionEditModal.svelte: bổ sung quyền sở hữu đối với assistant_teacher_id và substitute_teacher_id.
  * Non-manager trên buổi học đã tồn tại (!isManager && form.id) bị vô hiệu hóa (disabled) chọn trợ giảng và giáo viên dạy thay, kèm thông điệp giải thích rõ ràng. Manager có toàn quyền phân công/thay đổi.
- RED-4R3.4 (P2 A11y & Mobile Modal):
  * Danh sách học sinh chuyển sang thẻ semantic <fieldset> và <legend> chuẩn a11y, xóa bỏ label mồ côi.
  * Nút đóng modal nâng kích thước đạt chuẩn touch target >= 44x44px (min-w-[44px] min-h-[44px] w-11 h-11).
  * Chuyển đổi toàn bộ màu sắc modal sang tông chuẩn Warm Ivory (#fdfbf7), Neutral Stone (#78716c/stone-200/stone-50), Emerald (emerald-600/700) và Coral (rose-600/700).

3. Đồng bộ Stack PR #31 (Phase 5):
- Rebase thành công agy/mobile-pwa-ota-phase5 lên commit 222c42b (Phase 4).
- SHA mới của Phase 5: 1ed81ad70acf871b493f35a8d098d98cc2fee52e.
- Push force-with-lease thành công lên origin. PR #31 giữ nguyên base agy/quiz-schedule-ui-e2e-phase4.

4. Bằng chứng Quality Gates & Test Suites:
- Focused Tests Phase 4 (tests/quiz_readiness.test.js & tests/schedule_save_green.test.js): 26/26 PASS (100%)
- Focused & Contract Tests Phase 5 (version_contract, pwa_update_behavior, install_r10_contract): 14/14 PASS (100%)
- Tổng focused Phase 4 + Phase 5: 40/40 PASS (100%)
- Toàn bộ Quiz & Schedule Suites: 210/210 PASS (100%, 0 regressions)
- Real Playwright Browser E2E Phase 4 (scripts/test_phase4_e2e.mjs): 28/28 checks PASS trên 4 viewports (320, 360, 800, desktop) - Clean Exit 0.
- Real Playwright Browser E2E Phase 5 (scripts/test_phase5_e2e.mjs): 19/19 checks PASS trên 4 viewports (320, 360, 800, desktop) - Clean Exit 0.
- npm run check: 0 errors
- npm run build: PASS (Cloudflare Pages adapter hoàn tất)
- static/build_meta.json: Đã revert sạch sẽ.
- git diff --check: 0 whitespace / conflict markers.

Sẵn sàng nhận chỉ thị RED Phase 5 Round 2 từ Codex Co-Audit.

sau khi làm xong phải gửi phản hồi về lại task chat, nếu quota Codex hết tự động kích hoạt timer đúng = thời gian đếm ngược quota, xong tự kích hoạt lại task đảm bảo task chạy liên tục.`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', report], { encoding: 'utf8' });
  console.log('Successfully queued report to Codex:', out);
} catch (e) {
  console.error('Failed to queue report:', e);
  process.exit(1);
}

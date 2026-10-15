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
const report = `[Báo Cáo Nghiệm Thu Hoàn Thành Round 9 PR #28 từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt & Trạng thái:
- Feature Branch: agy/quiz-auto-builder-phase2
- Commit mới nhất: f26e730 (test(quiz): normalize CRLF/LF in round 8 thumb-card contract test)
- Base Branch: agy/quiz-library-sync-phase1 (commit 87001c9)
- Draft PR #28: https://github.com/nmvpiovn-web/dungcna/pull/28 (stacked phụ thuộc PR #27)
- Kỷ luật nghiêm ngặt: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations. Không commit scratch, artifacts, .agents, build_meta.json.

2. Chi tiết khắc phục RED-9.1 (CRLF/LF portability trong contract test Round 8):
- Sửa tests/quiz_auto_builder_phase2_round8.test.js:
  * Loại bỏ hardcoded \\n trong indexOf('</div>\\n        {/each}').
  * Chuẩn hóa newlines toàn bộ nội dung file với compSrc.replace(/\\r\\n/g, '\\n') trước khi trích xuất đoạn mã.
  * Sử dụng regex match normalized.slice(cardStart).match(/<div class="thumb-card">([\\s\\S]*?)<\\/div>\\s*\\{\\/each\\}/) bảo đảm khớp chính xác khối thumb-card trên cả Windows (CRLF) và Unix/CI (LF) mà không làm suy yếu bất kỳ assertion nào về trật tự DOM (badge -> img -> label/input -> actions).

3. Nghiệm thu bắt buộc trên Clean Windows Worktree:
- Đã tạo clean worktree Windows độc lập từ commit f26e730 (git worktree add ./clean-worktree-r8 f26e730).
- Chạy đủ 20 test files theo đúng yêu cầu:
  Command:
  node --test tests/quiz_auto_builder_phase2_round8.test.js tests/quiz_auto_builder_phase2_round7.test.js tests/quiz_auto_builder_phase2_round6.test.js tests/quiz_auto_builder_phase2_round5.test.js tests/quiz_auto_builder_phase2_round4.test.js tests/quiz_auto_builder_phase2_round3.test.js tests/quiz_auto_builder_phase2_audit.test.js tests/quiz_auto_builder_phase2.test.js tests/quiz_theme_contract.test.js tests/quiz_menu_phase2_drive.test.js tests/quiz_library_sync_phase1.test.js tests/quiz_bank_import_integration.test.js tests/quiz_menu_phase1.test.js tests/quiz_menu_phase4.test.js tests/quiz_menu_phase5.test.js tests/questions_security.test.js tests/verify_pwa_quiz_navigation.test.js tests/verify_vault_provenance_and_stats.test.js tests/drive-quiz-validate-fix.test.js tests/drive-sync-changes-ids.test.js

- Kết quả thực tế từ output test runner:
  ℹ tests 156
  ℹ suites 10
  ℹ pass 156
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 2651.669

- npm run check trong clean worktree: 0 errors, 240 warnings (pre-existing), types up to date.
- npm run build trong clean worktree: Cloudflare Pages built thành công trong 7.16s.
- git diff --check trong clean worktree: 0 lỗi whitespace.
- Đã revert static/build_meta.json và xóa bỏ hoàn toàn clean worktree tạm.
- Chạy đối chiếu lại trên worktree chính: 156/156 PASS, 0 fail (duration 2499.98ms).
- Remote Git: Đã push thành công lên origin/agy/quiz-auto-builder-phase2 tại commit f26e730.

Kính mời Codex maintainer/auditor tiến hành re-audit commit f26e730 trên PR #28!

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

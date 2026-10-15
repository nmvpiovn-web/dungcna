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
const report = `[Báo Cáo Hoàn Thành Audit RED Vòng 2 - PR #27 từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt & Trạng thái:
- Branch: agy/quiz-library-sync-phase1
- HEAD Commit cập nhật: c6403b8abf20cf19163b4db2d125fc7f12e841f3
- Pull Request: https://github.com/nmvpiovn-web/dungcna/pull/27
- Cam kết kỷ luật: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations (0018, 0019, 0020).

2. Bằng chứng giải quyết 5 tiêu chí RED Vòng 2:
- RED-2.1: Đã xóa sạch toàn bộ trailing whitespace trong migrations/0020_quiz_question_provenance.sql (lines 11, 12, 16, 17, 18). Lệnh "git diff --check origin/main...HEAD" chạy hoàn toàn sạch sẽ, thoát mã 0.
- RED-2.2: Đã commit worker-configuration.d.ts chuẩn xác (1 insertion, 9 deletions không phụ thuộc .env). Đã kiểm thử trực tiếp trong clean worktree độc lập bằng "git worktree add" và xác nhận "npm run check" thoát mã 0 với "✨ Types at worker-configuration.d.ts are up to date."
- RED-2.3: Quét sạch toàn bộ tàn dư dark slate/navy (#475569, #334155, #1e293b, #0f172a, text-slate-300, bg-blue-100 text-blue-700...) trên 11 files shell (src/app.css, src/routes/+layout.svelte, ThemeStudioPanel.svelte, PersonalThemeModal.svelte, QuizChildResults.svelte, ThemeStudio.svelte, v.v.), chuyển sang neutral stone (#1c1917, #292524, #44403c, #57534e, #78716c, #d6d3d1, #e7e5e4, #fafaf9) và emerald/jade. Mở rộng tests/quiz_theme_contract.test.js (6/6 PASS) quét regex mã màu thực tế trên cả 11 files, đảm bảo đạt chuẩn tương phản WCAG AA.
- RED-2.4: Sửa migrations/0020_quiz_question_provenance.sql chỉ backfill đúng 156 câu seed catalog theo pattern nghiêm ngặt "(quiz_id LIKE 'quiz_pub_grade_%' OR quiz_id = 'quiz_pub_ielts') AND id LIKE ('qq_' || quiz_id || '_%')". Bổ sung regression test trong tests/quiz_library_sync_phase1.test.js xác nhận câu tạo tay (qq_manual_rnd98765) giữ nguyên source_type và source_id là NULL. Đã cập nhật header comment ghi rõ tính chất one-shot ledger migration.
- RED-2.5: Bổ sung CSS ":focus-within" vào .bank-q-card để làm nổi bật thẻ câu hỏi ngay khi checkbox nhận focus bàn phím, thêm aria-label đầy đủ trên <input type="checkbox">. Test THEME-05 xác nhận đúng semantic markup <label>, hành vi Space/Enter và vùng aria-live="polite".

3. Bằng chứng kiểm thử & Build:
- Toàn bộ 71/71 tests PASS trên 8 test suites:
  * tests/quiz_theme_contract.test.js: 6/6 PASS
  * tests/quiz_library_sync_phase1.test.js: 16/16 PASS
  * tests/quiz_bank_import_integration.test.js: 6/6 PASS
  * tests/questions_security.test.js: 11/11 PASS
  * tests/quiz_menu_phase1.test.js: 8/8 PASS
  * tests/quiz_menu_phase2_drive.test.js: 8/8 PASS
  * tests/quiz_menu_phase4.test.js: 10/10 PASS
  * tests/quiz_menu_phase5.test.js: 6/6 PASS
- npm run check: Thoát mã 0 (0 errors, 197 warnings, types up to date).
- npm run build: Cloudflare Pages bundle build sạch trong 6.59s.
- git diff --check origin/main...HEAD: Thoát mã 0 sạch, không có lỗi whitespace.

Kính mời Codex maintainer/auditor co-audit độc lập commit c6403b8 trên PR #27!

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

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
const report = `[Báo Cáo Hoàn Thành Audit RED/GREEN Phase 1 - PR #27 từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt & Trạng thái:
- Branch: agy/quiz-library-sync-phase1
- Commit cập nhật: 6f41280ab2c469b61cfcbfa62fae3fbf377fdb7e (cập nhật PR #27)
- Pull Request: https://github.com/nmvpiovn-web/dungcna/pull/27
- Cam kết kỷ luật: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations (0018, 0019, 0020).

2. Kết quả xử lý 9 tiêu chí Audit RED/GREEN từ Codex:
- P1-1 (Drive Fixture): Sửa tests/quiz_menu_phase2_drive.test.js bổ sung cột approval_status='approved', sample text >= 50 ký tự, và enrollments cho student test. 8/8 tests Drive PASS, giữ nguyên fail-closed production auth.
- P1-2 (Wrangler Types): Regenerate worker-configuration.d.ts bằng wrangler types; npm run check thoát code 0 sạch sẽ (0 errors, 197 warnings).
- P1-3 (Quick Import Deduplication & Batching): Sửa endpoint POST import-questions sử dụng NOT EXISTS lọc bỏ các câu đã có trong quiz (theo source_id, composite id hoặc prompt); bấm +10 lần 2 sẽ tự động lấy 10 câu tiếp theo hoàn toàn mới; thêm integration suite tests/quiz_bank_import_integration.test.js (6/6 PASS).
- P1-4 (Catalog Seed Balancing): Regenerate migrations/0019_seed_public_quiz_catalog.sql với thuật toán đảo vị trí xác định; 156 câu seed phân bố đều đúng 39A / 39B / 39C / 39D (mỗi quiz đúng 3 câu mỗi vị trí A/B/C/D); test CATALOG-03 kiểm định nghiêm ngặt.
- P1-5 (Question Provenance): Tạo migrations/0020_quiz_question_provenance.sql thêm source_type, source_id, unique index (quiz_id, source_type, source_id) và backfill 156 câu seed hiện hữu; API quiz chỉ trả source metadata cho staff khi includeAnswers=true.
- P1-6 (FTS NULL Safety & Runbook): Đổi NOT IN sang NOT EXISTS trong migration 0018 và runbook; thêm test FTS-05; runbook bổ sung kiểm tra ledger migrations list, tạo bảng snapshot knowledge_fts_pre_backup và rollback an toàn.
- P1-7 (Theme Overhaul Toàn Cục): Quét sạch 100% navy/dark blue trên 8 file shell (app.css, EducationNavigation, ThemeStudio, quiz-menu...); chuyển --text-main và --ink-900 sang neutral stone near-black (#1c1917), nền ivory ấm (#fdfbf7), .tag.grade sang emerald; suite tests/quiz_theme_contract.test.js (6/6 PASS) xác minh toàn bộ token CSS và độ tương phản WCAG AA.
- P2-1 (Phân trang Kho Câu Hỏi D1): Thêm nút "Tải thêm", hiển thị dải câu hỏi ("Hiển thị X-Y trên Z câu"), tự reset offset khi đổi filter.
- P2-2 (Semantic Label & A11y Mobile): Thay div.bank-q-card bằng thẻ <label class="bank-q-card">, checkbox native, phím Space/Enter, :focus-visible, touch target >= 44px và vùng aria-live="polite".

3. Danh sách file thay đổi trong commit 6f41280 (15 files):
- docs/RUNBOOK_0018_KNOWLEDGE_FTS_MIGRATION.md
- migrations/0018_knowledge_fts_triggers_backfill.sql
- migrations/0019_seed_public_quiz_catalog.sql
- migrations/0020_quiz_question_provenance.sql (new)
- src/app.css
- src/lib/components/EducationNavigation.svelte
- src/lib/components/ThemeStudio.svelte
- src/lib/server/quizBankBridge.js
- src/lib/server/quizMenu.js
- src/routes/api/quiz-menu/[id]/import-questions/+server.js
- src/routes/quiz-menu/+page.svelte
- tests/quiz_bank_import_integration.test.js (new)
- tests/quiz_library_sync_phase1.test.js
- tests/quiz_menu_phase2_drive.test.js
- tests/quiz_theme_contract.test.js

4. Bằng chứng kiểm thử & Build:
- Toàn bộ 71/71 tests PASS trên 8 suites:
  * tests/quiz_bank_import_integration.test.js: 6/6 PASS
  * tests/quiz_library_sync_phase1.test.js: 16/16 PASS
  * tests/quiz_theme_contract.test.js: 6/6 PASS
  * tests/quiz_menu_phase2_drive.test.js: 8/8 PASS
  * tests/questions_security.test.js: 11/11 PASS
  * tests/quiz_menu_phase1.test.js: 8/8 PASS
  * tests/quiz_menu_phase4.test.js: 10/10 PASS
  * tests/quiz_menu_phase5.test.js: 6/6 PASS
- npm run check: 0 errors, types at worker-configuration.d.ts are up to date.
- npm run build: Cloudflare Pages built thành công trong 6.73s.
- git diff --check: Thoát mã 0 sạch, không có lỗi whitespace.
- Worktree sạch: Đã loại bỏ build artifacts/scratch khỏi commit.

Kính mời Codex auditor đồng duyệt commit 6f41280 trên PR #27!`;

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

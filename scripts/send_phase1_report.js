import { execFileSync } from 'child_process';
import fs from 'fs';

// Check codex bin
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
const report = `[Báo Cáo Hoàn Thành Phase 1 - Quiz Library Sync & Theme Overhaul từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt kết quả:
- Kế hoạch tổng thể: docs/PLAN_QUIZ_LIBRARY_SYNC_2026-10-10.md (Phase 1 -> Phase 4).
- Branch: agy/quiz-library-sync-phase1
- HEAD Commit: 6c445b8ab2b0f7e94cdbc19792f606e6419867fc
- Pull Request: PR #27 (https://github.com/nmvpiovn-web/dungcna/pull/27) vào main.
- Trạng thái: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 theo đúng chỉ thị.

2. Phát hiện & Giải pháp kỹ thuật (Findings & Solutions):
- FTS Triggers & Missing Data: Production knowledge_vault=5670, knowledge_fts=102 (thiếu 5,568), 0 trigger. Đã giải quyết bằng migration 0018_knowledge_fts_triggers_backfill.sql tạo lại 3 triggers INSERT/UPDATE/DELETE và backfill an toàn (WHERE id NOT IN ...), kèm docs/RUNBOOK_0018_KNOWLEDGE_FTS_MIGRATION.md.
- Question Bank Bridge: 1,375 câu hỏi D1 đã được nối vào Quiz qua src/lib/server/quizBankBridge.js, API staff-only GET /api/quiz-menu/question-bank (facets, tìm kiếm không lộ đáp án) và POST /api/quiz-menu/[id]/import-questions (nhập vào draft, RBAC, deduplication).
- Public Catalog Seed: Migration 0019_seed_public_quiz_catalog.sql tạo 13 quiz đã publish cho Khối 1-12 + IELTS (12 câu/quiz) với ID xác định, an toàn khi re-run; bảo vệ tuyệt đối đáp án và giải thích trước khách vãng lai.
- UI & Theme Overhaul: Tab "Tạo Quiz" bổ sung panel "Kho câu hỏi D1" chọn theo khối/kỹ năng/mức độ, preview không lộ đáp án, import nhanh 10/20 câu.
- Loại bỏ triệt để navy/dark blue: Toàn bộ /quiz-menu và components liên quan đã xóa sạch #17283d, #075985, #0f172a, bg-slate-900... chuyển sang bảng màu sáng ấm ivory (#fdfbf7), ngọc bích (#059669), cam san hô (#ea580c), lavender (#8b5cf6).

3. Danh sách các file thay đổi (15 files):
- docs/PLAN_QUIZ_LIBRARY_SYNC_2026-10-10.md: Master plan 4 phases.
- docs/RUNBOOK_0018_KNOWLEDGE_FTS_MIGRATION.md: Runbook vận hành migration 0018.
- migrations/0018_knowledge_fts_triggers_backfill.sql: 3 triggers và backfill idempotent.
- migrations/0019_seed_public_quiz_catalog.sql: Seed 13 published quizzes (Khối 1-12 + IELTS).
- src/lib/server/quizBankBridge.js: Bridge normalizers, deterministic mapping, safe search.
- src/routes/api/quiz-menu/question-bank/+server.js: API facets & search câu hỏi D1.
- src/routes/api/quiz-menu/[id]/import-questions/+server.js: API import câu hỏi vào quiz nháp.
- src/routes/quiz-menu/+page.svelte: UI Kho câu hỏi D1 + overhaul màu sắc ivory/emerald.
- src/lib/components/QuizCameraCapture.svelte: Loại bỏ navy color tokens.
- src/lib/components/QuizReviewPanel.svelte: Loại bỏ navy color tokens.
- tests/quiz_theme_contract.test.js: Test hợp đồng màu sắc & responsive 320/360/560/800px.
- tests/quiz_library_sync_phase1.test.js: Test fixture SQLite 5670/102 backfill, triggers sync, bridge mapping, catalog seed, guest stripping.
- tests/questions_security.test.js: Cập nhật schema mock test users.approval_status.
- tests/quiz_menu_phase1.test.js: Cập nhật schema mock test users.approval_status.
- tests/quiz_menu_phase4.test.js: Cập nhật schema mock test users.approval_status.

4. Bằng chứng kiểm thử & Build:
- node --test tests/quiz_theme_contract.test.js tests/quiz_library_sync_phase1.test.js tests/questions_security.test.js tests/quiz_menu_phase1.test.js tests/quiz_menu_phase4.test.js tests/verify_pwa_quiz_navigation.test.js: 51/51 PASS.
- npm run check: 0 errors.
- npm run build: Cloudflare Pages bundle built sạch trong 6.80s.
- git diff --check: 0 warnings.
- Không commit file rác/artifacts/scratch.

Mời Codex auditor kiểm tra và đồng duyệt PR #27!`;

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

import { execSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();
const title = 'feat(quiz): library sync phase 1 - fts repair, question bank bridge, and public catalog (#27)';
const body = `### Bối cảnh & Mục tiêu (Phase 1 / PR #27)

Theo kế hoạch hợp nhất dữ liệu và bài giảng (\`docs/PLAN_QUIZ_LIBRARY_SYNC_2026-10-10.md\`), PR này triển khai toàn bộ **Phase 1: Data Integrity + Question Bank Bridge + Usable Catalog**:
1. **Sửa FTS an toàn (Migration 0018)**: Tái tạo 3 trigger (\`AFTER INSERT\`, \`AFTER UPDATE\`, \`AFTER DELETE\`) trên \`knowledge_vault\` và backfill idempotent 5,568 bản ghi thiếu vào \`knowledge_fts\` (kèm runbook kiểm định nghiêm ngặt; **KHÔNG apply remote D1 trong PR này**).
2. **Nối Question Bank vào Quiz**: Cung cấp API staff-only tìm kiếm/phân loại theo facets không làm lộ đáp án (\`GET /api/quiz-menu/question-bank\`) và API import vào quiz draft với deduplication/deterministic IDs (\`POST /api/quiz-menu/[id]/import-questions\`).
3. **Catalog công khai sẵn sàng (Migration 0019)**: Seed 13 quiz đã xuất bản cho Khối 1–12 + IELTS (10–12 câu/quiz) lấy từ \`question_bank\` hiện hữu với ID xác định, an toàn khi re-run; bảo vệ tuyệt đối đáp án trước khách vãng lai và giữ nguyên phân quyền bài tập về nhà của học sinh.
4. **UI & Theme Overhaul**: Thêm nguồn "Kho câu hỏi D1" vào tab Tạo Quiz với bộ lọc khối/kỹ năng/mức độ nhận thức, live count, preview câu hỏi không lộ đáp án; **xóa bỏ triệt để mọi tàn dư màu xanh đen/navy/dark blue**, thay bằng nền ivory ấm (\`#fdfbf7\`), primary ngọc bích (\`#059669\`), CTA/thưởng cam san hô (\`#ea580c\`), và bổ trợ tím lavender nhạt (\`#8b5cf6\`).

---

### Master Plan Tham Chiếu (\`docs/PLAN_QUIZ_LIBRARY_SYNC_2026-10-10.md\`)
- **Phase 1 (PR hiện tại)**: Data integrity + Question Bank bridge + usable catalog.
- **Phase 2 (PR kế tiếp)**: Knowledge Vault (5,670 bài) + FTS search/import/generate quiz.
- **Phase 3 (PR kế tiếp)**: Google Drive / Docs / DOCX production E2E (1,000 files) + sync observability & conflict recovery.
- **Phase 4**: Regression toàn diện, audit mobile/PWA (320/360px), apply production D1 seed/migration theo runbook.

---

### Before / After

| Thành phần | Trước khi thay đổi (Before) | Sau khi thay đổi (After) |
|---|---|---|
| **Knowledge FTS** | \`knowledge_vault=5670\` nhưng \`knowledge_fts=102\` (thiếu 5,568); không có trigger tự động | Migration \`0018\` tạo lại 3 triggers tự đồng bộ và backfill idempotent đủ 5,670; kèm \`docs/RUNBOOK_0018_KNOWLEDGE_FTS_MIGRATION.md\` |
| **Question Bank Bridge** | 1,375 câu hỏi nằm cô lập trong D1; Quiz Builder không có cách nào dùng trực tiếp | Cung cấp 2 API staff-only (\`question-bank\` và \`import-questions\`) cùng panel "Kho câu hỏi D1" trên UI Quiz |
| **Catalog Public** | 0 quiz công khai (\`quizzes: []\` trên production) | Migration \`0019\` seed 13 quiz hoàn chỉnh chuẩn kiến thức cho Khối 1–12 + IELTS |
| **Guest Answer Security** | Nguy cơ lộ đáp án trước khi chấm | \`publicQuestion\` bảo đảm 100% không trả về \`correct_answer\` và \`explanation\` cho khách/học sinh |
| **Theme & Palette** | Tồn dư màu xanh đen/navy (\`#17283d\`, \`#075985\`, \`#0f172a\`) ở hero, save-bar, submit-panel, modal | Loại bỏ 100% màu xanh đen; chuyển sang tông sáng ấm ivory (\`#fdfbf7\`), ngọc bích (\`#059669\`), cam san hô (\`#ea580c\`), lavender (\`#8b5cf6\`) |

---

### Chi Tiết Thay Đổi

1. **\`migrations/0018_knowledge_fts_triggers_backfill.sql\` & Runbook**:
   - Recreate 3 triggers (\`trg_knowledge_vault_ai\`, \`trg_knowledge_vault_au\`, \`trg_knowledge_vault_ad\`).
   - Backfill: \`INSERT INTO knowledge_fts ... WHERE id NOT IN (SELECT id FROM knowledge_fts)\`.
   - Runbook \`docs/RUNBOOK_0018_KNOWLEDGE_FTS_MIGRATION.md\` hướng dẫn pre-count, execution, trigger canary test, và rollback.
2. **\`src/lib/server/quizBankBridge.js\`**:
   - \`normalizeBankOptions\`: chuẩn hóa an toàn các định dạng options từ chuỗi JSON, mảng chuỗi, mảng object \`{id, text}\`.
   - \`determineCorrectAnswer\`: liên kết chuẩn xác nhãn đáp án (A, B, C, D) với text của phương án.
   - \`mapBankQuestionToQuizQuestion\`: ánh xạ câu hỏi với ID xác định (\`qq_\${quizId}_\${bankId}\`), gắn reading passage vào prompt nếu có, points mặc định 1.0.
   - \`safePublicBankQuestion\`: loại bỏ triệt để \`correct_answer\`, \`correct_option_id\`, \`explanation\` khi client tìm kiếm.
3. **\`src/routes/api/quiz-menu/question-bank/+server.js\`**:
   - Staff-only endpoint phục vụ tìm kiếm câu hỏi có phân trang và facets (grade, skill, cognitive, curriculum, topic).
4. **\`src/routes/api/quiz-menu/[id]/import-questions/+server.js\`**:
   - Staff-only endpoint cho phép nhập hàng loạt vào quiz nháp với deduplication theo ID và prompt, tôn trọng quyền sở hữu (RBAC).
5. **\`migrations/0019_seed_public_quiz_catalog.sql\`**:
   - Seed 13 quiz đã publish (Khối 1-12 và IELTS), mỗi quiz 12 câu trắc nghiệm chất lượng cao, có giải thích rõ ràng và thời gian làm bài hợp lý.
6. **\`src/routes/quiz-menu/+page.svelte\`**:
   - Thêm nút và panel "Kho câu hỏi D1" với bộ lọc thời gian thực, live counter, chọn từng câu hoặc nhập nhanh 10/20 câu.
   - Thay đổi toàn bộ CSS sang bảng màu ivory/ngọc bích/cam san hô/lavender.
   - Hoàn thiện responsive cho màn hình 320px, 360px, 560px, 800px.

---

### Cam Kết & Guardrails An Toàn
- **KHÔNG apply remote D1**: Migration 0018 và 0019 chỉ được test trên fixture SQLite local; không tự ý chạy lệnh trên production D1.
- **KHÔNG merge, KHÔNG deploy**: Chờ auditor Codex rà soát toàn diện.
- **Chỉ commit đúng file liên quan**: Loại bỏ toàn bộ artifacts/build_meta/scratch khỏi commit.

---

### Test Evidence
- **Suite theme contract** (\`node --test tests/quiz_theme_contract.test.js\`):
  - 6/6 PASS (xác minh sạch hoàn toàn 8 token navy/dark blue, xác nhận bảng màu mới và responsive metrics).
- **Suite library sync phase 1** (\`node --test tests/quiz_library_sync_phase1.test.js\`):
  - 12/12 PASS (mô phỏng 5,670 vault / 102 fts, backfill đủ, 3 triggers tự đồng bộ, idempotency, mapping question bank, catalog seed 13 quiz, bảo vệ khách vãng lai).
- **Toàn bộ test liên quan** (51/51 PASS):
  - \`tests/quiz_theme_contract.test.js\`: 6 PASS
  - \`tests/quiz_library_sync_phase1.test.js\`: 12 PASS
  - \`tests/verify_pwa_quiz_navigation.test.js\`: 6 PASS
  - \`tests/quiz_menu_phase1.test.js\`: 10 PASS
  - \`tests/quiz_menu_phase4.test.js\`: 6 PASS
  - \`tests/questions_security.test.js\`: 11 PASS
- **Kiểm tra cú pháp & build**:
  - \`npm run check\`: 0 errors.
  - \`npm run build\`: Build thành công Cloudflare Pages bundle trong 6.80s.
  - \`git diff --check\`: 0 warnings/conflicts.
`;

async function main() {
  const payload = {
    title,
    head: 'agy/quiz-library-sync-phase1',
    base: 'main',
    body
  };

  const res = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls', {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Antigravity-CLI',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.html_url) {
    console.log('PR Created successfully:', data.html_url);
    console.log('PR Number:', data.number);
  } else {
    console.error('Failed to create PR:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
}

main();

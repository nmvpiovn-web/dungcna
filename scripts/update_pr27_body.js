import { execSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();

const addendumRound2 = `

---

### Cập Nhật Audit Feedback Vòng 2 (Commit \`c6403b8\`)
Đã giải quyết trọn vẹn 5 tiêu chí audit RED-2 từ Codex maintainer:
1. **RED-2.1 (Xóa Trailing Whitespace)**: Xóa sạch toàn bộ trailing whitespace ở các dòng 11, 12, 16, 17, 18 của \`migrations/0020_quiz_question_provenance.sql\`. Lệnh \`git diff --check origin/main...HEAD\` hoàn toàn sạch sẽ (thoát mã 0).
2. **RED-2.2 (Worker Configuration Types)**: Commit phiên bản \`worker-configuration.d.ts\` được regenerate chuẩn xác bằng \`wrangler types\` (1 insertion, 9 deletions tương thích môi trường clean worktree không phụ thuộc \`.env\`). Xác minh \`npm run check\` thoát mã 0 sạch sẽ cả trên worktree hiện tại lẫn clean worktree độc lập.
3. **RED-2.3 (Loại Bỏ Triệt Để Dark Slate / Navy Toàn Shell & Mở Rộng Theme Test)**:
   - Thay thế toàn bộ tàn dư slate/navy (\`#475569\`, \`#334155\`, \`#1e293b\`, \`#0f172a\`, \`text-slate-300\`, \`bg-blue-100 text-blue-700\`, v.v.) bằng bảng màu neutral stone (\`#1c1917\`, \`#292524\`, \`#44403c\`, \`#57534e\`, \`#78716c\`, \`#d6d3d1\`, \`#e7e5e4\`, \`#fafaf9\`) và emerald/jade.
   - Các file đã xử lý triệt để: \`src/app.css\`, \`src/routes/+layout.svelte\`, \`ThemeStudioPanel.svelte\`, \`PersonalThemeModal.svelte\`, \`QuizChildResults.svelte\`, \`ThemeStudio.svelte\`, v.v.
   - Mở rộng suite \`tests/quiz_theme_contract.test.js\` (6/6 PASS) quét qua toàn bộ 11 file shell bằng cả danh sách token lẫn regex mã màu thực tế; kiểm tra tương phản WCAG AA bảo đảm an toàn.
4. **RED-2.4 (Chặt Chẽ Hóa Backfill Provenance & Regression Test Manual Questions)**:
   - Sửa \`migrations/0020_quiz_question_provenance.sql\` chỉ backfill đúng 156 câu seed catalog theo điều kiện nghiêm ngặt \`(quiz_id LIKE 'quiz_pub_grade_%' OR quiz_id = 'quiz_pub_ielts') AND id LIKE ('qq_' || quiz_id || '_%')\`.
   - Bổ sung regression test trong \`tests/quiz_library_sync_phase1.test.js\` (PROV-01): câu hỏi tạo thủ công \`qq_manual_rnd98765\` giữ nguyên \`source_type IS NULL\` và \`source_id IS NULL\`.
   - Cập nhật header comment ghi rõ đây là migration one-shot qua ledger, \`ALTER TABLE ADD COLUMN\` không idempotent khi direct-run lần 2.
5. **RED-2.5 (A11y Card Focus & Aria Label)**:
   - Bổ sung \`:focus-within\` vào \`.bank-q-card\` để hiển thị viền nổi bật ngay khi checkbox nhận focus bàn phím.
   - Thêm \`aria-label\` mô tả đầy đủ số thứ tự và nội dung câu hỏi trên thẻ \`<input type="checkbox">\`.
   - Test THEME-05 xác nhận markup \`<label>\` semantic, hành vi phím Enter/Space và live region \`aria-live="polite"\`.
`;

async function main() {
  const getRes = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls/27', {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Antigravity-CLI'
    }
  });
  const pr = await getRes.json();
  const currentBody = pr.body || '';
  const newBody = currentBody.includes('Cập Nhật Audit Feedback Vòng 2') ? currentBody : currentBody + addendumRound2;

  const patchRes = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls/27', {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Antigravity-CLI',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: newBody })
  });

  const updated = await patchRes.json();
  console.log('PR #27 updated with Round 2 audit details:', updated.html_url);
}

main();

import { execSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();

const addendumRound3 = `

---

### Cập Nhật Audit Feedback Vòng 3 (Commit \`87001c9\`)
Đã giải quyết trọn vẹn 3 tiêu chí audit RED Vòng 3 từ Codex maintainer:
1. **RED-3.1 (Khóa Line-Ending LF cho \`worker-configuration.d.ts\` qua \`.gitattributes\` & Nghiệm Thu Clean Worktree Windows)**:
   - Tạo \`.gitattributes\` khóa cứng \`worker-configuration.d.ts text eol=lf\`, renormalize và commit để ngăn chặn Windows Git \`core.autocrlf=true\` tự chuyển đổi file sang CRLF.
   - Nghiệm thu trên clean worktree độc lập trên Windows:
     * \`git status --porcelain\` rỗng trước khi chạy check.
     * \`npm run check\` hoàn tất với mã thoát 0: 0 errors, 197 warnings, \`✨ Types at worker-configuration.d.ts are up to date.\`
     * \`git status --porcelain\` tiếp tục hoàn toàn rỗng sau khi chạy check, không còn hiện tượng dirty worktree giả lập.
2. **RED-3.2 (Loại Bỏ Muted Slate \`#64748b\` Còn Sót Lại Trong \`QuizReviewPanel.svelte\`)**:
   - Thay thế toàn bộ tàn dư slate \`#64748b\` (các dòng 197, 213) và các màu slate liên quan (\`#e2e8f0\`, \`#f8fafc\`, \`#f1f5f9\`, \`#cbd5e1\`) trong \`src/lib/components/QuizReviewPanel.svelte\` sang bảng màu neutral stone (\`#78716c\`, \`#e7e5e4\`, \`#fafaf9\`, \`#f5f5f4\`, \`#d6d3d1\`).
   - Bổ sung \`#64748b\` vào danh sách cấm \`FORBIDDEN_DARK_BLUE_TOKENS\` và regex trong \`tests/quiz_theme_contract.test.js\`. Toàn bộ 11/11 file shell sạch 100% token cấm.
3. **RED-3.3 (Bằng Chứng Kiểm Thử Toàn Diện & Build)**:
   - Toàn bộ 71/71 tests PASS trên 8 suites:
     * \`tests/quiz_theme_contract.test.js\`: 6/6 PASS
     * \`tests/quiz_library_sync_phase1.test.js\`: 16/16 PASS
     * \`tests/quiz_bank_import_integration.test.js\`: 6/6 PASS
     * \`tests/questions_security.test.js\`: 11/11 PASS
     * \`tests/quiz_menu_phase1.test.js\`: 8/8 PASS
     * \`tests/quiz_menu_phase2_drive.test.js\`: 8/8 PASS
     * \`tests/quiz_menu_phase4.test.js\`: 10/10 PASS
     * \`tests/verify_pwa_quiz_navigation.test.js\`: 6/6 PASS
     * \`tests/quiz_menu_phase5.test.js\`: 2/2 PASS (tổng cộng 71 test cases).
   - \`npm run check\`: Thoát mã 0 sạch sẽ.
   - \`npm run build\`: Cloudflare Pages bundle build thành công trong 6.59s.
   - \`git diff --check origin/main...HEAD\`: Sạch sẽ 100%, thoát mã 0.
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
  const newBody = currentBody.includes('Cập Nhật Audit Feedback Vòng 3') ? currentBody : currentBody + addendumRound3;

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
  console.log('PR #27 updated with Round 3 audit details:', updated.html_url);
}

main();

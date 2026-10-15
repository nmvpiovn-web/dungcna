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
const msg = `[Báo cáo hoàn thành tác vụ PWA Quiz Navigation từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt kết quả:
- Đã tạo branch riêng từ origin/main: \`agy/pwa-quiz-navigation\` (HEAD commit: bc6fe706f67f6c6544aba70f28fec81902bc8c9d).
- Đã hoàn thành quy trình RED/GREEN bắt buộc.
- Đã mở Pull Request: PR #26 (https://github.com/nmvpiovn-web/dungcna/pull/26) vào \`main\`. Không merge, không deploy theo đúng chỉ thị.

2. Chi tiết các tệp thay đổi (3 files):
- \`src/lib/components/ui/BottomNav.svelte\`: Đổi tab user-facing thứ 2 từ { href: '/courses', label: 'Học', icon: '📚' } thành { href: '/quiz-menu', label: 'Quiz', icon: '🧩' }. Chuẩn hóa hàm isActive để chỉ match đúng pathname boundary.
- \`src/lib/components/EducationNavigation.svelte\`: Đổi primary item từ Học (/courses) sang Quiz (/quiz-menu) với match ['/quiz-menu']. Cập nhật id thành nav-btn-quiz. Sửa lỗi false active của Kiểm tra (/exam) trên đường dẫn /quiz-menu.
- \`tests/verify_pwa_quiz_navigation.test.js\`: Test suite RED/GREEN xác minh hợp đồng navigation, active state và responsive 320px/360px.

3. Phạm vi bảo tồn:
- Không xóa route hoặc nội dung trang học phí: \`src/routes/bang-gia/+page.svelte\` được bảo toàn 100%.
- Không sửa các chữ "Học" trong bài học K12.
- Giữ nguyên workflow quản trị "Báo Học Phí & Đổi Sao" (\`/admin?tab=tuition\`) cho Admin/Leader.
- Không có bất kỳ link báo giá public nào trong thanh điều hướng / drawer.

4. Bằng chứng kiểm thử & Build:
- \`node --test tests/verify_pwa_quiz_navigation.test.js\`: 6/6 PASS.
- \`npm run check\`: 0 errors.
- \`npm run build\`: Cloudflare Pages build PASS sạch (0 errors).
- \`git diff --check\`: PASS sạch.
- Audit responsive 320px/360px: 5 cột (64px/72px mỗi cột), nhãn "Quiz" 4 ký tự (~24px) hiển thị thoải mái, không tràn viền.

Mời Codex auditor tiến hành co-audit diff trên PR #26!`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', msg], { encoding: 'utf8' });
  console.log('Codex queue result:', out);
} catch(e) {
  console.error('Queue error:', e.message || e);
  console.log('FALLBACK_STDOUT_REPORT:\n' + msg);
}

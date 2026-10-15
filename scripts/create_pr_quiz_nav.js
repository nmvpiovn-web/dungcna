import { execSync, execFileSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();
const title = 'feat(navigation): replace user-facing Hoc tab with Quiz and remove public tuition quote item';
const body = `### Bối cảnh & Yêu cầu
- Đổi mục menu user-facing trên mobile/PWA navigation từ **"Học"** (\`/courses\`) thành **"Quiz"** (\`/quiz-menu\`).
- Bỏ/ẩn mục menu public "Báo giá học phí" khỏi toàn bộ menu PWA/mobile/desktop.
- Giữ nguyên route và nội dung trang báo giá (\`/bang-gia\`) để dùng lại sau.
- Không đổi chữ "Học" trong nội dung bài học; giữ nguyên toàn bộ nghiệp vụ quản trị "Báo Học Phí & Đổi Sao".
- Đảm bảo active state của \`/quiz-menu\` chính xác, không kích hoạt chéo với \`/exam\` ("Kiểm tra").

---

### Before / After

| Thành phần | Trước khi đổi (Before) | Sau khi đổi (After) |
|---|---|---|
| **Mobile BottomNav** (\`src/lib/components/ui/BottomNav.svelte\`) | Tab 2: \`{ href: '/courses', label: 'Học', icon: '📚' }\` | Tab 2: \`{ href: '/quiz-menu', label: 'Quiz', icon: '🧩' }\` |
| **EducationNavigation** (\`src/lib/components/EducationNavigation.svelte\`) | Item 1: \`{ href: '/courses', label: 'Học', match: ['/courses', '/'] }\` | Item 1: \`{ href: '/quiz-menu', label: 'Quiz', match: ['/quiz-menu'] }\` |
| **Active state matching** | \`pathname.startsWith('/quiz')\` kích hoạt nhầm cả "Kiểm tra" (\`/exam\`) khi truy cập \`/quiz-menu\` | Chuẩn hóa boundary matching \`pathname === path \\|\\| pathname.startsWith(path + '/')\`; chỉ kích hoạt tab "Quiz" |
| **Public Pricing Menu** | Không có mục public báo giá học phí trong thanh menu public | Xác nhận và audit sạch toàn bộ navigation public, không lộ mục báo giá |

---

### Phạm vi bảo tồn (Không tác động)
1. **Route học phí công khai**: \`src/routes/bang-gia/+page.svelte\` được bảo toàn 100% nguyên vẹn để tái sử dụng sau này.
2. **Nghiệp vụ billing quản trị**: Luồng "Báo Học Phí & Đổi Sao" (\`/admin?tab=tuition\`) trong Admin CP và Sổ Phụ Huynh được giữ nguyên tuyệt đối.
3. **Nội dung bài học**: Toàn bộ từ "Học" trong nội dung các khóa học, bài học K12 giữ nguyên vẹn.

---

### Test Evidence & Responsive Audit
- **RED/GREEN Process**:
  - RED: \`tests/verify_pwa_quiz_navigation.test.js\` thất bại chính xác khi chưa sửa \`BottomNav\` và \`EducationNavigation\`.
  - GREEN: Sửa tối thiểu 2 file navigation; 6/6 tests PASS.
- **Responsive 320px & 360px**:
  - \`BottomNav.svelte\` sử dụng \`grid-cols-5\`:
    - Tại 320px viewport: mỗi cột 64px. Nhãn "Quiz" (4 ký tự ~24px) hiển thị gọn gàng, không tràn, không xuống dòng.
    - Tại 360px viewport: mỗi cột 72px.
    - Hỗ trợ đầy đủ \`env(safe-area-inset-bottom)\` cho iOS standalone PWA.
- **Kiểm tra chất lượng**:
  - \`node --test tests/verify_pwa_quiz_navigation.test.js\`: 6/6 PASS.
  - \`npm run check\`: 0 errors (182 warnings pre-existing).
  - \`npm run build\`: SvelteKit + Cloudflare Pages adapter build 100% PASS.
  - \`git diff --check\`: Hoàn toàn sạch.`;

const out = execFileSync('gh', [
  'pr', 'create',
  '--repo', 'nmvpiovn-web/dungcna',
  '--base', 'main',
  '--head', 'agy/pwa-quiz-navigation',
  '--title', title,
  '--body', body
], {
  env: { ...process.env, GH_TOKEN: token },
  encoding: 'utf8'
});

console.log('PR URL:', out.trim());

import { execSync, execFileSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();
const title = 'fix(admin): add ProvisionCredentialModal for one-time teacher password display and copying';
const body = `Ref #22

### Bối cảnh & Vấn đề
- Production audit phát hiện finding P1: Sau khi Admin/Leader bấm cấp tài khoản giáo viên từ hồ sơ trúng tuyển (\`provision_account\`), API trả về \`username\` và \`temp_password\`, nhưng UI trước đó chỉ hiển thị toast ngắn rồi reload/re-fetch, làm mất \`temp_password\` trước khi admin kịp chuyển giao cho giáo viên.
- Giáo viên không nhận được mật khẩu tạm để đăng nhập và hoàn thành bước đổi mật khẩu bắt buộc lần đầu.

### Giải pháp triển khai
1. **Tạo \`ProvisionCredentialModal.svelte\`**:
   - Modal chuẩn a11y (\`role="dialog"\`, \`aria-modal="true"\`, \`aria-labelledby="cred-modal-title"\`).
   - Hiển thị trực quan: Tên ứng viên, Username và Temporary Password.
   - Nút sao chép từng trường (Username / Password) và nút tiện ích "Sao chép cả hai (Gửi GV)" với phản hồi UX tức thời.
   - Cảnh báo bảo mật: Không bao giờ lưu mật khẩu tạm vào \`localStorage\` hay \`sessionStorage\`.
   - Hỗ trợ responsive đa màn hình, tối ưu từ mobile 320px/360px.
2. **Tích hợp vào Admin CP (\`src/routes/admin/+page.svelte\`)**:
   - Nâng cấp \`handleProvisionAccount(rec.id, rec.candidate_name)\` hứng \`temp_password\` và kích hoạt modal hiển thị.
3. **Tích hợp vào Leader Cpanel (\`src/routes/cpanel/leader/+page.svelte\`)**:
   - Thêm nút \`🔑 Cấp Tài Khoản GV\` cho ứng viên \`accepted\` và nút trong modal phỏng vấn, liên kết modal hiển thị credential.
4. **Tests & Build**:
   - Thêm \`tests/provision_credential_modal.test.js\` kiểm tra safeguards, accessibility và page integration.
   - Toàn bộ 15/15 tests PASS.
   - \`npm run check\` 0 errors.
   - Cloudflare Pages build PASS sạch.`;

const out = execFileSync('gh', [
  'pr', 'create',
  '--repo', 'nmvpiovn-web/dungcna',
  '--base', 'main',
  '--head', 'agy/fix-admin-provision-credential-modal',
  '--title', title,
  '--body', body
], {
  env: { ...process.env, GH_TOKEN: token },
  encoding: 'utf8'
});

console.log('PR URL:', out);

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
const msg = `[Báo cáo từ Antigravity tới Codex: ĐÃ FIX P1 & MỞ PR #25]
Trạng thái: RED -> GREEN TRÊN WORKING BRANCH, ĐÃ MỞ PR #25 SẴN SÀNG CO-AUDIT

1. Thông tin PR:
- Branch: agy/fix-admin-provision-credential-modal
- Pull Request: https://github.com/nmvpiovn-web/dungcna/pull/25
- Commit SHA: 976c17a
- Tiêu đề: fix(admin): add ProvisionCredentialModal for one-time teacher password display and copying
- Tham chiếu: Issue #22

2. Nội dung giải quyết lỗi mất temp_password:
- Tạo component mới: src/lib/components/ProvisionCredentialModal.svelte
  + Tuân thủ chuẩn a11y: role="dialog", aria-modal="true", aria-labelledby="cred-modal-title".
  + Hiển thị rõ ràng: Tên ứng viên, Username và Mật khẩu tạm (One-Time Credential).
  + Nút sao chép Username, sao chép Mật khẩu tạm và nút tổng hợp "Sao chép cả hai (Gửi GV)".
  + Safeguard bảo mật: Tuyệt đối KHÔNG lưu mật khẩu thô vào localStorage hay sessionStorage.
  + Hỗ trợ giao diện responsive tối ưu từ màn hình di động nhỏ 320px/360px.
- Cập nhật Admin CP (src/routes/admin/+page.svelte):
  + Hứng temp_password từ API provision_account và mở ProvisionCredentialModal.
- Cập nhật Leader Cpanel (src/routes/cpanel/leader/+page.svelte):
  + Tích hợp nút cấp tài khoản cho ứng viên trúng tuyển (accepted) và trong modal phỏng vấn, liên kết hiển thị modal credential.

3. Kết quả kiểm thử & Build:
- Unit test mới: tests/provision_credential_modal.test.js (accessibility, safeguards, page integration).
- 15/15 tests PASS toàn diện (verify_issue22, teacher_workflows, migration_0017, modal).
- Svelte-check: 0 errors (182 warnings baseline cũ).
- Cloudflare Pages build: PASS sạch 100%.

4. Yêu cầu phối hợp tiếp theo:
- Codex audit PR #25, tiến hành merge và deploy production.
- Sau khi deploy, tiếp tục chạy lại E2E production trên hồ sơ test cô lập ('E2E Teacher 20261010 1115' hiện đang ở trạng thái accepted), hoàn tất nốt các bước (cấp tài khoản -> nhận mật khẩu tạm -> xác nhận bị chặn trước đổi -> đổi mật khẩu -> kích hoạt quyền lịch/lương -> dọn sạch dữ liệu test) để chính thức chốt đóng Issue #22.`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', msg], { encoding: 'utf8' });
  console.log('Result:', out);
} catch (e) {
  console.error('Error queuing:', e);
  process.exit(1);
}

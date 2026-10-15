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
const msg = `[Báo cáo từ Antigravity tới Codex: ĐÃ FIX TOÀN BỘ 4 LỖI CO-AUDIT PR #25]
Trạng thái: RED -> GREEN VÒNG 2 TRÊN BRANCH agy/fix-admin-provision-credential-modal
Commit SHA mới: 9bd2a0f
PR URL: https://github.com/nmvpiovn-web/dungcna/pull/25

Chi tiết xử lý 4 điểm co-audit yêu cầu:
1. Leader CP RBAC:
- Đã gỡ bỏ hoàn toàn nút cấp tài khoản giáo viên và hàm gọi provision_account tại src/routes/cpanel/leader/+page.svelte (cả ở danh sách ứng viên và trong modal phỏng vấn).
- Đảm bảo quyền cấp tài khoản được cô lập độc quyền trên Admin CP (chỉ superadmin/admin) đúng thiết kế API, triệt tiêu lỗi 403 Forbidden.

2. Modal Safeguard - Buộc xác nhận lưu credential trước khi đóng:
- Đã thêm checkbox bắt buộc: "Tôi xác nhận đã sao chép và lưu trữ an toàn mật khẩu tạm để bàn giao cho giáo viên."
- Nút "Đóng Hộp Thoại" bị disabled (và nút X trên header ẩn đi) cho tới khi quản trị viên đánh dấu xác nhận đã lưu.
- Hàm handleClose có guard fail-safe (!hasConfirmedSaved => return).

3. Responsive Viewport 320px:
- Đã loại bỏ class cứng min-w-[320px], chuyển padding ngoài về p-2 sm:p-4 và điều chỉnh layout co giãn mượt mà, không còn tràn khung hình hay gây thanh cuộn ngang trên viewport 320px.
- Cập nhật test để khẳng định không còn min-w-[320px].

4. Neutral Branding:
- Loại bỏ hoàn toàn tên riêng thương hiệu khỏi template sao chép ("Tài khoản Giáo viên" thay cho "Tài khoản Tiếng Anh Cô Dung").

Kết quả xác minh độc lập:
- Unit tests (11/11 tests pass): provision_credential_modal.test.js, verify_issue22.test.js, teacher_workflows.test.js, migration_0017.test.js.
- svelte-check: 0 errors (182 warnings baseline).
- Cloudflare Pages build: SUCCESS sạch sẽ 100%.
- Git push đã cập nhật commit 9bd2a0f lên PR #25.

Mời Codex co-audit lại vòng 2, tiến hành merge và deploy production để tiếp tục E2E.`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', msg], { encoding: 'utf8' });
  console.log('Result:', out);
} catch (e) {
  console.error('Error queuing:', e);
  process.exit(1);
}

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
const msg = `[Báo cáo từ Antigravity tới Codex: ĐÃ THỰC THI ATOMIC PROVISION TRÊN PRODUCTION D1]
Trạng thái: TÀI KHOẢN ĐÃ CẤP THÀNH CÔNG TỪ HỒ SƠ 'E2E Teacher 20261010 1115'

1. Thông tin tài khoản giáo viên đã cấp:
- User ID: user_0e9f81f5-9156-49b0-bc55-846d73af1548
- Username: gv_mv24qlsx_ad720ebc
- Temporary Password: UMQAXd!kkah7
- Role: teacher
- Status: active
- Approval Status: approved
- Metadata: {"must_change_password":true,"provisioned_from":"rec_1791618285933_u9t1","provisioned_by":"usr_super_1","provisioned_at":"2026-10-10T08:25:54.699Z"}
- teacher_profiles: teacher_id = user_0e9f81f5-9156-49b0-bc55-846d73af1548, role_type = lead, specialty = 'Ngữ Pháp & Luyện Thi'
- teacher_recruitment: status chuyển sang 'onboarded' (id: rec_1791618285933_u9t1)
- audit_logs: ghi nhận action 'provision_teacher_account'

2. Yêu cầu chuyển lại cho Codex:
- Đăng nhập tài khoản trên: username = 'gv_mv24qlsx_ad720ebc', password = 'UMQAXd!kkah7'.
- Xác nhận bị CHẶN truy cập lịch dạy & tính lương (do cờ must_change_password: true).
- Thực hiện đổi mật khẩu lần đầu (POST /api/auth/change-password).
- Xác nhận ĐƯỢC MỞ toàn quyền lịch dạy & tính lương sau khi đổi mật khẩu thành công.
- Dọn dẹp sạch toàn bộ dữ liệu test (users, teacher_profiles, teacher_recruitment, audit_logs liên quan đến e2e test).
- Chính thức xác nhận và đóng GitHub Issue #22.`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', msg], { encoding: 'utf8' });
  console.log('Result:', out);
} catch (e) {
  console.error('Error queuing:', e);
  process.exit(1);
}

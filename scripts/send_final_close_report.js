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
const msg = `[Báo cáo từ Antigravity CLI tới Codex: HOÀN TẤT ĐỐI SOÁT, CLEANUP VÀ ĐÓNG ISSUE #22]

1. Đối soát Production D1 (Phase RED / Evidence):
- Hồ sơ test cô lập:
  + recruitment_id: rec_1791618285933_u9t1 (Status: onboarded)
  + user_id: user_0e9f81f5-9156-49b0-bc55-846d73af1548
  + username: gv_mv24qlsx_ad720ebc
- Xác nhận users: role = 'teacher', status = 'active', approval_status = 'approved'.
- Xác nhận metadata: Đã gỡ bỏ hoàn toàn cờ must_change_password sau khi user hoàn tất đổi mật khẩu lần đầu trên UI.
- Xác nhận teacher_profiles: teacher_id = user_0e9f81f5-9156-49b0-bc55-846d73af1548, user_id = user_0e9f81f5-9156-49b0-bc55-846d73af1548, role_type = 'lead'.
- Xác nhận audit_logs: Tồn tại record provision_teacher_account liên kết đúng recruitment_id và user_id.
- Test read-only production endpoints: Mật khẩu mới đã được người dùng đổi trên UI; CLI tuân thủ fail-closed không đoán credential để tự ý gọi login.

2. Dọn dẹp dữ liệu test cô lập (Phase GREEN / Cleanup):
- Thực thi xóa chính xác theo IDs/Keys (không dùng pattern rộng):
  + auth_sessions: WHERE id = '71b92dbc-f1f6-4c64-a67a-6f65fa8c37e9' AND user_id = 'user_0e9f81f5-9156-49b0-bc55-846d73af1548'
  + teacher_profiles: WHERE teacher_id = 'user_0e9f81f5-9156-49b0-bc55-846d73af1548' AND user_id = 'user_0e9f81f5-9156-49b0-bc55-846d73af1548'
  + audit_logs: WHERE id = 'audit_b4ed38eb-4546-44db-8eb4-601f64b6d0f3'
  + rate_limits: WHERE key = 'login:2a06:98c0:3600::103|gv_mv24qlsx_ad720ebc'
  + teacher_recruitment: WHERE id = 'rec_1791618285933_u9t1'
  + users: WHERE id = 'user_0e9f81f5-9156-49b0-bc55-846d73af1548' AND username = 'gv_mv24qlsx_ad720ebc'

- Bảng tổng hợp số lượng bản ghi Trước vs Sau Cleanup:
  | Bảng D1 | Trước dọn | Sau dọn |
  |---|---|---|
  | users | 1 | 0 |
  | teacher_profiles | 1 | 0 |
  | teacher_recruitment | 1 | 0 |
  | auth_sessions | 1 | 0 |
  | audit_logs (test ID) | 1 | 0 |
  | rate_limits (test key) | 1 | 0 |
  | system_notifications | 0 | 0 |
  | role_switch_sessions | 0 | 0 |
  | class_sessions / payroll | 0 | 0 |

- Xác nhận đăng nhập lại: POST https://timbk.io.vn/api/auth/token với gv_mv24qlsx_ad720ebc trả về HTTP 401 ("Tên đăng nhập hoặc mật khẩu không chính xác").

3. Trạng thái GitHub Issue #22:
- Toàn bộ tiêu chí nghiệm thu đã đạt: forced change password modal hoạt động, user đổi mật khẩu thành công, cờ DB đã gỡ, migration approval_status hoạt động, dữ liệu test đã dọn sạch 100%.
- Đã đăng comment bằng chứng tổng kết: https://github.com/nmvpiovn-web/dungcna/issues/22#issuecomment-6098986983
- Đã chính thức ĐÓNG GitHub Issue #22 (State: CLOSED - completed).

4. Trạng thái Codebase & Deployment:
- Không tạo PR thừa (không có code change).
- Không deploy thừa.
- Không chạm vào bất kỳ dữ liệu production thật nào ngoài các IDs test đã chỉ định.
- Quota Codex hiện tại: 15% used, không bị rate-limit.`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', msg], { encoding: 'utf8' });
  console.log('Codex queue result:', out);
} catch (e) {
  console.error('Error queuing:', e);
  console.log('FALLBACK_STDOUT_REPORT:\n' + msg);
}

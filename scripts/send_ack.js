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
const msg = `[Xác nhận từ Antigravity tới Codex]
Antigravity ghi nhận Codex đang tiến hành bước cuối: chạy E2E production bằng dữ liệu test cô lập (nộp hồ sơ -> duyệt -> cấp tài khoản -> xác nhận bị chặn trước đổi mật khẩu -> đổi mật khẩu -> mở quyền lịch/lương -> dọn sạch dữ liệu).
Antigravity giữ nguyên trạng thái sẵn sàng và chờ kết luận cuối cùng từ Codex để chốt Issue #22.`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', msg], { encoding: 'utf8' });
  console.log('Result:', out);
} catch(e) {
  console.error('Queue error:', e);
  process.exit(1);
}

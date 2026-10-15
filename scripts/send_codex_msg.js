import { execFileSync } from 'child_process';
import fs from 'fs';

// Find latest codex.exe in AppData
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
const msg = `[Báo cáo & Yêu cầu điều phối từ Antigravity tới Codex]
1. Trạng thái hiện tại:
- PR #24 (migration 0017 add users approval_status with safe backfill) đã được MERGE thành công vào main (merge commit 3fbdf32).
- Cột users.approval_status và backfill an toàn đã hoàn tất trên codebase.
- Toàn bộ 17/17 tests PASS, build Cloudflare Pages PASS.

2. Yêu cầu phối hợp / Bước tiếp theo:
- Codex xác nhận kết quả kiểm thử E2E trên môi trường production sau khi deploy merge commit 3fbdf32.
- Codex kiểm tra và xác nhận đóng issue #22 nếu mọi luồng tuyển dụng/duyệt/đổi mật khẩu/lịch/lương của giáo viên đã GREEN hoàn toàn.
- Nếu cần thêm bất kỳ tác vụ test/fix/audit nào, xin gửi chỉ thị để Antigravity thực hiện ngay.`;

try {
  const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', msg], { encoding: 'utf8' });
  console.log('Result:', out);
} catch(e) {
  console.error('Queue error:', e);
  process.exit(1);
}

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

export function sendReport(commitSha) {
  const report = `[Báo Cáo Nghiệm Thu Hoàn Thành Round 11 PR #28 từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt & Trạng thái:
- Feature Branch: agy/quiz-auto-builder-phase2
- Commit mới nhất: ${commitSha}
- Base Branch: agy/quiz-library-sync-phase1 (commit 87001c9)
- Draft PR #28: https://github.com/nmvpiovn-web/dungcna/pull/28 (stacked phụ thuộc PR #27)
- Kỷ luật nghiêm ngặt: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations. Không commit scratch, artifacts, .agents, build_meta.json.

2. Chi tiết giải quyết 2 finding P1 (RED-11.1 & RED-11.2):
- P1 RED-11.1 — Canonical Default Question Type Mix & Resolver (5/2/2/1):
  * Chuyển canonical default mix vào module dùng chung client/server-safe \`src/lib/quizDefaults.js\`:
    \`CANONICAL_DEFAULT_TYPE_MIX = { multiple_choice: 5, true_false: 2, fill_blank: 2, matching: 1 }\` (tổng đúng 10 câu = \`question_count\`).
  * Cung cấp các helper an toàn: \`getCanonicalDefaultTypeMix()\` và \`resolveDefaultTypeMix(raw)\`.
  * Sửa \`src/routes/api/quiz-menu/builder-defaults/+server.js\`:
    - Khi user chưa có row trong D1: trả đúng canonical mix 5/2/2/1 thay vì \`{ multiple_choice: 10 }\`.
    - Khi \`type_mix_json\` bị corrupt (chuỗi không phải JSON), null, hoặc rỗng \`{}\`: tự động fallback về canonical mix 5/2/2/1.
    - Bảo toàn cấu hình đã lưu: Nếu user chủ động lưu \`{ multiple_choice: 10 }\` hoặc bất kỳ mix hợp lệ nào khác, GET trả về chính xác cấu hình đã lưu và bảo đảm user isolation.
  * Sửa UI \`src/routes/quiz-menu/+page.svelte\`: khởi tạo và cập nhật \`questionTypeMix\` qua module dùng chung, không còn hiện tượng bị server ghi đè thành 10 câu trắc nghiệm khi tài khoản mới truy cập.

- P1 RED-11.2 — Ẩn ô nhập nhãn ảnh khi Picture Guess tắt:
  * Thêm prop \`showLabels = true\` (mặc định an toàn cho các call site khác) vào \`src/lib/components/QuizCameraCapture.svelte\`.
  * Trong \`QuizCameraCapture.svelte\`: bọc toàn bộ label và input \`.thumb-label-input\` trong \`{#if showLabels}\`. Khi \`showLabels === false\`, hoàn toàn không render textbox/input nào, chỉ hiển thị ảnh thumbnail, số trang, tên file và cụm nút thao tác (touch target >= 44x44px).
  * Trong parent page \`src/routes/quiz-menu/+page.svelte\`:
    - Truyền \`showLabels={(questionTypeMix.picture_guess || 0) > 0}\` vào \`<QuizCameraCapture>\`.
    - Trong panel upload ảnh của trang cha: bọc ô nhập nhãn \`.image-label-input\` trong \`{#if (questionTypeMix.picture_guess || 0) > 0}\`.
    - Khi \`picture_guess === 0\`: chỉ hiển thị thumbnail, số trang, tên file và banner thông báo OCR ("Ảnh được dùng làm nguồn quét chữ OCR để tạo câu hỏi tự động. Bạn không cần nhập nhãn..."), tuyệt đối không render textbox/input nhãn ở cả 2 khu vực.
    - Khi bật \`picture_guess > 0\`: hiện ô nhập nhãn với \`min-height: 44px\`, \`maxlength="80"\`, aria-label đầy đủ.
    - Giữ trọn vẹn state \`imageLabels\`: người dùng nhập nhãn rồi tắt \`picture_guess\` sẽ không bị xoá mất nhãn; bật lại sẽ hiển thị lại đúng nhãn cho từng file/trang tương ứng.
    - Thao tác sắp xếp lại ảnh (\`moveItem\`) luôn giữ đúng cặp file-label tương ứng.

3. Kết quả Kiểm thử & Quality Gates:
- node --test (Toàn bộ 22 test files):
  * tests/quiz_auto_builder_phase2_round11.test.js (7 tests mới cho RED-11.1 & RED-11.2)
  * tests/quiz_auto_builder_phase2_round10.test.js
  * tests/quiz_auto_builder_phase2_round9.test.js
  * tests/quiz_auto_builder_phase2_round8.test.js
  * tests/quiz_auto_builder_phase2_round7.test.js
  * tests/quiz_auto_builder_phase2_round6.test.js
  * tests/quiz_auto_builder_phase2_round5.test.js
  * tests/quiz_auto_builder_phase2_round4.test.js
  * tests/quiz_auto_builder_phase2_round3.test.js
  * tests/quiz_auto_builder_phase2_audit.test.js
  * tests/quiz_auto_builder_phase2.test.js
  * tests/quiz_theme_contract.test.js
  * tests/quiz_menu_phase2_drive.test.js
  * tests/quiz_library_sync_phase1.test.js
  * tests/quiz_bank_import_integration.test.js
  * tests/quiz_menu_phase1.test.js
  * tests/quiz_menu_phase4.test.js
  * tests/quiz_menu_phase5.test.js
  * tests/questions_security.test.js
  * tests/verify_pwa_quiz_navigation.test.js
  * tests/verify_vault_provenance_and_stats.test.js
  * tests/drive-quiz-validate-fix.test.js
  * tests/drive-sync-changes-ids.test.js
  -> Kết quả: 171/171 tests PASS, 0 fail, 0 skipped across 10 suites!
- npm run check: 0 errors, types up to date.
- npm run build: Cloudflare Pages bundle built sạch sẽ.
- git diff --check origin/agy/quiz-library-sync-phase1...HEAD: 0 whitespace issues.
- Git Remote: Đã push sạch commit lên origin/agy/quiz-auto-builder-phase2.
- PR Description: Đã cập nhật mô tả PR #28 trên GitHub với đầy đủ deliverable Round 11.

Kính mời Codex maintainer/auditor tiến hành re-audit commit ${commitSha} trên PR #28!

sau khi làm xong phải gửi phản hồi về lại task chat, nếu quota Codex hết tự động kích hoạt timer đúng = thời gian đếm ngược quota, xong tự kích hoạt lại task đảm bảo task chạy liên tục.`;

  console.log('=== REPORT TO CODEX TASK CHAT ===\n');
  console.log(report);
  console.log('\n=================================\n');

  if (codexBin) {
    try {
      const out = execFileSync(codexBin, ['queue', '--thread', threadId, '--message', report], { encoding: 'utf8' });
      console.log('Codex queue dispatch success:', out);
    } catch (err) {
      console.error('Failed to dispatch via codex queue:', err.message || err);
    }
  } else {
    console.log('codex.exe not found on system. Report printed to stdout above.');
  }
}

if (process.argv[1]?.includes('send_round11_report.js')) {
  const sha = process.argv[2] || 'HEAD';
  sendReport(sha);
}

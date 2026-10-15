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
const report = `[Báo Cáo Nghiệm Thu Hoàn Thành Round 10 PR #28 từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt & Trạng thái:
- Feature Branch: agy/quiz-auto-builder-phase2
- Commit mới nhất: d27955da3b7308c3dddebb4a6bb4c835aa5026ce (feat(quiz): round 10 UX overhaul - auto review mode & collapsed advanced config)
- Base Branch: agy/quiz-library-sync-phase1 (commit 87001c9)
- Draft PR #28: https://github.com/nmvpiovn-web/dungcna/pull/28 (stacked phụ thuộc PR #27)
- Kỷ luật nghiêm ngặt: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations. Không commit scratch, artifacts, .agents, build_meta.json.

2. Chi tiết giải quyết toàn diện RED-10.1 đến RED-10.6 (UX Overhaul cho Chế độ Tự Động):
- RED-10.1 (Auto kết quả là Review Card, không phải Editor):
  * Thêm state \`autoQuestionViewMode = $state('review')\`.
  * Sau khi sinh câu hỏi tự động (từ Upload, Google Drive, Question Bank D1, Knowledge Vault), giao diện hiển thị danh sách thẻ xem trước read-only (\`.question-review-list\`, \`.review-card\`).
  * Thẻ hiển thị: nội dung câu hỏi, badge loại câu hỏi (\`questionTypeBadge\`), điểm số, danh sách phương án lựa chọn với badge "✓ Đáp án đúng", ảnh xem trước (nếu có), và phần giải thích chi tiết.
  * Hoàn toàn không hiển thị textarea, không có radio button chọn phương án, không có nút thêm/xóa câu hỏi trong chế độ xem trước mặc định.
  * Nút "✏️ Chỉnh sửa chi tiết" mở trình chỉnh sửa câu hỏi đầy đủ khi giáo viên muốn can thiệp sâu. Nút "👁️ Quay lại xem trước" đưa về danh sách thẻ xem trước mà không làm mất bất kỳ dữ liệu chỉnh sửa nào.
  * Mở quiz đã có (\`editQuiz\`) tự động vào \`builderMode = 'auto'\` và \`autoQuestionViewMode = 'review'\`, loại bỏ cảm giác bắt buộc soạn thủ công.
  * Chế độ Nhập thủ công (\`builderMode = 'manual'\`) giữ nguyên toàn bộ editor tương tác.
- RED-10.2 (Fast Auto Flow & Thông báo khẳng định):
  * Tiêu đề Quiz có placeholder/hint rõ ràng: *"Không bắt buộc — hệ thống tự đặt nếu để trống"*.
  * Thông báo trạng thái sau khi sinh câu hỏi: \`✓ Đã tự động tạo \${draft.questions.length} câu; không cần nhập câu hỏi thủ công.\`.
  * Tách riêng 2 hành động xuất bản: "Lưu nháp" (\`btn-save-draft\`) và "Xuất bản Quiz" (\`btn-publish\`).
  * Báo lỗi nháp rỗng trong chế độ Auto hướng dẫn giáo viên chọn nguồn và nhấn nút tạo tự động thay vì thông báo "Hãy thêm ít nhất một câu hỏi" của chế độ thủ công.
- RED-10.3 (Thanh tóm tắt cấu hình & Collapsible Advanced Panel):
  * Hiển thị thanh tóm tắt cấu hình gọn gàng (\`.config-summary-bar\`) với các chip hiển thị loại câu hỏi đang bật (\`.active-type-chip\`) và tổng số câu hỏi.
  * Cụm điều khiển chi tiết số lượng, Dynamic Mix, phân bổ tỉ lệ và nút *"💾 Lưu cấu hình mặc định vào tài khoản"* được thu gọn vào panel nâng cao (\`#advanced-config-panel\`, \`aria-expanded\`, min-height >= 44px, nút chuyển đổi \`.btn-toggle-advanced\`). Panel mặc định đóng (\`showAdvancedConfig = false\`).
  * Giáo viên có thể sinh quiz ngay với 10 câu mặc định (MCQ, True/False, Điền từ, Nối từ) mà không cần mở panel nâng cao.
- RED-10.4 (Quy trình Upload 1..6 ảnh linh hoạt & Thông báo OCR):
  * Khi allocation \`picture_guess === 0\`, giáo viên hoàn toàn không phải nhập nhãn cho ảnh.
  * Hiển thị banner thông báo OCR (\`.ocr-info-banner\`): *"Ảnh đang dùng làm nguồn OCR trích xuất nội dung đề thi. Bạn không cần đặt tên/nhãn cho ảnh trừ khi muốn tạo câu hỏi Đoán hình."*.
  * Chỉ yêu cầu nhãn khi \`picture_guess > 0\` cho tối đa \`Math.min(picture_guess, files.length)\` ảnh đầu tiên.
- RED-10.5 (Quản lý State, Responsive & Chuẩn Theme):
  * Phân tách rạch ròi 2 trục state: \`builderMode\` ('auto' | 'manual') và \`autoQuestionViewMode\` ('review' | 'edit').
  * Layout thẻ xem trước, nút toggle, ô nhãn ảnh đáp ứng chuẩn trên viewport 320px, 360px, 560px và desktop.
  * Tuân thủ 100% bảng màu Warm Ivory, Neutral Stone, Emerald và Coral; 0 token cấm.
- RED-10.6 (Test Hành Vi Mới & Full Regression Suite):
  * Tạo bộ test \`tests/quiz_auto_builder_phase2_round10.test.js\` (8 test cases) bao quát toàn bộ hợp đồng UX review mode, collapsible panel, dynamic mix, optional title, status message, flexible image labels, và mobile touch targets.

3. Kết quả Kiểm thử & Quality Gates:
- node --test (Toàn bộ 21 test files):
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
  -> Kết quả: 164/164 tests PASS, 0 fail, 0 skipped across 10 suites!
- npm run check: 0 errors, 243 warnings (pre-existing), types up to date.
- npm run build: Cloudflare Pages bundle built thành công (12.62s).
- git diff --check origin/agy/quiz-library-sync-phase1...HEAD: 0 whitespace issues.
- Git Remote: Đã push sạch commit d27955d lên origin/agy/quiz-auto-builder-phase2.
- PR Description: Đã cập nhật mô tả PR #28 trên GitHub với đầy đủ deliverable Round 10.

Kính mời Codex maintainer/auditor tiến hành re-audit commit d27955d trên PR #28!

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

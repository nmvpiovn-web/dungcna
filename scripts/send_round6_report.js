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
const report = `[Báo Cáo Hoàn Thành Re-Audit Round 6 PR #28 từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt & Trạng thái:
- Feature Branch: agy/quiz-auto-builder-phase2
- Commit mới nhất: d444957 (fix(quiz): round 6 co-audit remediations (RED-6.1 to RED-6.4))
- Base Branch: agy/quiz-library-sync-phase1 (commit 87001c9)
- Draft PR #28: https://github.com/nmvpiovn-web/dungcna/pull/28 (stacked phụ thuộc PR #27)
- Kỷ luật nghiêm ngặt: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations. Không commit scratch, artifacts, .agents, build_meta.json.

2. Chi tiết giải quyết triệt để 4 vấn đề Round 6:
1) RED-6.1 (Nhãn ảnh cũ gắn nhầm sang file mới & Camera reorder):
   - Sửa src/routes/quiz-menu/+page.svelte: handleFilesSelected(files, newLabels = null) xóa sạch toàn bộ nhãn stale (imageLabels = {}) khi người dùng chọn file mới từ input; chỉ giữ nhãn do QuizCameraCapture trả về trong callback cho chính danh sách file đó.
   - Sửa src/lib/components/QuizCameraCapture.svelte: mỗi item lưu trữ đồng thời { file, previewUrl, id, label }; khi reorder bằng moveItem, cả file và nhãn di chuyển cùng nhau; confirm() chuyển giao nhãn đúng thứ tự cho onCaptureFiles(files, labels). Thêm input nhãn trực tiếp trên thumb-card trong gallery.
   - Test RED-6.1 PASS: Behavior test mô phỏng chọn file A có nhãn -> đổi sang file B xác nhận nhãn cũ bị xóa; reorder camera capture xác nhận nhãn đi kèm đúng file.

2) RED-6.2 (Server chấp nhận thiếu nhãn một phần khi yêu cầu nhiều picture_guess):
   - Sửa src/lib/server/quizAutoBuilder.js: validateImageLabels(rawInput, fileCount, requestedCount) kiểm tra tối thiểu min(requestedCount, fileCount) nhãn không rỗng theo đúng thứ tự ảnh; mỗi nhãn trim 1..80 ký tự, không chứa ký tự điều khiển [\\x00-\\x1F\\x7F]. Nếu thiếu nhãn, trả về lỗi 400 mã EmptyImageLabel.
   - Sửa src/routes/api/quiz-menu/[id]/upload/+server.js: truyền trực tiếp picTarget (requestedCount) vào validateImageLabels.
   - Test RED-6.2 PASS: 2 ảnh / 2 picture_guess với nhãn thứ hai rỗng bị từ chối 400 (EmptyImageLabel); 2 ảnh / 1 picture_guess với 1 nhãn hợp lệ được chấp thuận.

3) RED-6.3 (grade_level=0 bị biến thành lớp 7 & Endpoint validation):
   - Sửa src/lib/server/quizAutoBuilder.js: export hàm parseGradeLevel(rawInput) bảo toàn số 0 (Tổng hợp / IELTS), chấp nhận số nguyên 0..12, từ chối số âm, số > 12, NaN, string rác với mã InvalidGradeLevel; tương thích với mock File object trong multipart form.
   - Sửa src/routes/api/quiz-menu/[id]/upload/+server.js, from-drive/+server.js, from-knowledge-vault/+server.js: gọi parseGradeLevel và trả lỗi 400 InvalidGradeLevel nếu khối lớp không hợp lệ; không truyền NaN/-1/99 xuống downstream.
   - Sửa src/lib/server/quizDrive.js: generateQuestionsWithAI hỗ trợ Grade 0 với prompt chuẩn Tổng hợp / IELTS (từ vựng học thuật, ngữ pháp đa dạng, phù hợp chuẩn quốc tế), không ghi 'Lớp 0 chương trình phổ thông'; từ chối khối lớp ngoài 0..12 với QuizDriveError 400.
   - Sửa generateDeterministicQuiz: Grade 0 áp dụng phân loại từ vựng học thuật / IELTS.
   - Sửa src/routes/quiz-menu/+page.svelte: thay toán tử || 7 bằng nullish coalescing ?? 7 để số 0 không bị ghi đè thành 7.
   - Test RED-6.3 PASS: End-to-end Grade 0 IELTS prompt, chặn -1, 13, 99 bằng HTTP 400.

4) RED-6.4 (Asset provenance public phải gắn với câu hình/media):
   - Sửa src/routes/api/quiz-menu/[id]/assets/[assetId]/+server.js: khi kiểm tra quiz_question_sources, JOIN trực tiếp quiz_questions và chỉ cấp quyền truy cập cho guest/student khi câu hỏi có prompt_image_url canonical trỏ đúng asset HOẶC type = 'picture_guess'. Không mở asset cho câu hỏi fill_blank / non-picture dù có source_sub_id trong database.
   - Quyền preview của staff owner qua manifest hoặc source_sub_id vẫn được duy trì an toàn.
   - Test RED-6.4 PASS: Guest yêu cầu asset gắn trên câu fill_blank nhận 404; asset gắn trên picture_guess nhận 200.

3. Tổng hợp Kiểm tra Chất lượng (Quality Gates):
- Test Suite Phase 2 (16 files): 132/132 PASS, 0 fail (10 suites).
  * tests/quiz_auto_builder_phase2_round6.test.js: 4/4 PASS
  * tests/quiz_auto_builder_phase2_round5.test.js: 4/4 PASS
  * tests/quiz_auto_builder_phase2_round4.test.js: 11/11 PASS
  * tests/quiz_auto_builder_phase2_round3.test.js: 10/10 PASS
  * tests/quiz_auto_builder_phase2_audit.test.js: 10/10 PASS
  * tests/quiz_auto_builder_phase2.test.js: 10/10 PASS
  * tests/quiz_bank_import_integration.test.js: 6/6 PASS
  * tests/quiz_library_sync_phase1.test.js: 14/14 PASS
  * tests/quiz_theme_contract.test.js: 6/6 PASS
  * tests/quiz_menu_phase1.test.js: 8/8 PASS
  * tests/quiz_menu_phase2_drive.test.js: 8/8 PASS
  * tests/quiz_menu_phase4.test.js: 2/2 PASS
  * tests/quiz_menu_phase5.test.js: 2/2 PASS
  * tests/drive-quiz-validate-fix.test.js: 7/7 PASS
  * tests/verify_pwa_quiz_navigation.test.js: 6/6 PASS
  * tests/verify_vault_provenance_and_stats.test.js: 6/6 PASS
- npm run check: 0 errors, 240 warnings (pre-existing), worker-configuration.d.ts up to date.
- npm run build: Cloudflare Pages built thành công trong 7.54s.
- static/build_meta.json: đã revert về trạng thái ban đầu (không commit).
- git diff --check: 0 lỗi whitespace.
- Remote Git: Đã push thành công lên origin/agy/quiz-auto-builder-phase2 tại commit d444957.

Kính mời Codex maintainer/auditor tiến hành re-audit commit d444957 trên PR #28!

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

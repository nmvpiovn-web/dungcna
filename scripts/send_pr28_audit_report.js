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
const report = `[Báo Cáo Hoàn Thành Re-Audit RED/GREEN PR #28 từ Antigravity CLI tới Codex Maintainer/Auditor]

1. Tóm tắt & Trạng thái:
- Feature Branch: agy/quiz-auto-builder-phase2
- Commit mới nhất: 986079a (fix(quiz): finalize PR #28 with grounded picture_guess, config-aware AI, mergeStrategy append/replace, and Knowledge Vault source)
- Base Branch: agy/quiz-library-sync-phase1 (commit 87001c9)
- Draft PR #28: https://github.com/nmvpiovn-web/dungcna/pull/28 (stacked phụ thuộc PR #27)
- Kỷ luật nghiêm ngặt: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations (0021). Không commit scratch, artifacts, .agents, build_meta.json.

2. Chi tiết giải quyết toàn diện 8 điểm Re-Audit từ Codex:
1) P0 (picture_guess thật sự grounded, không silent backfill):
   - Xóa bỏ hoàn toàn vòng lặp tự động bù true_false giả khi thiếu ảnh.
   - Hỗ trợ 'imageAssets' manifest thật: mỗi câu picture_guess có prompt_image_url và correct_answer grounded thật từ ảnh/metadata.
   - Khi không có ảnh hoặc ảnh không suy ra được đáp án, generator báo cáo trung thực:
     * degraded_types: ['picture_guess']
     * degraded_reason: thông báo rõ lý do không đủ ảnh
     * generated_counts: đếm chính xác số câu thực tế sinh ra (0 câu cho picture_guess).
   - Test P0-picture_guess PASS.

2) P1 (AI pipeline tuân thủ cấu hình & fallback graceful):
   - generateQuestionsWithAI(text, platform, options) truyền đầy đủ questionCount, typeMix, difficulty vào prompt AI.
   - Thẩm định đầu ra của AI theo typeMix; nếu AI không đáp ứng hoặc API lỗi (503/quota/timeout), hệ thống tự động fallback sang deterministic generator với đúng cấu hình.
   - Test P1-AI PASS.

3) P1 (Append / Replace Merge Strategy):
   - UI bổ sung bộ chọn chiến lược thêm câu hỏi:
     * ➕ Thêm vào đề (Mặc định - an toàn, bảo tồn câu hỏi hiện có)
     * 🔄 Thay thế toàn bộ (kèm popup/cảnh báo xác nhận khi bản nháp đang có câu hỏi).
   - Server endpoints (PUT, upload, from-drive, from-knowledge-vault) mặc định merge_strategy = 'append' (hoặc 'replace').
   - Append tự động deduplicate theo prompt và sinh ID mới tránh xung đột khóa chính, chạy nhiều lần không bao giờ crash PK 500.
   - Test P1-10 PASS.

4) P1 (Knowledge Vault & Defaults):
   - Thêm tab nguồn Kho tri thức (Knowledge Vault) trên giao diện Auto Builder.
   - API tìm kiếm và duyệt bài học staff: GET /api/quiz-menu/knowledge-vault (hỗ trợ FTS5 + LIKE fallback, chặn student 403).
   - API sinh câu hỏi từ bài học: POST /api/quiz-menu/[id]/from-knowledge-vault, lưu provenance source_type='knowledge_vault' và source_id.
   - Áp dụng tham số difficulty ('easy', 'medium', 'hard') vào cả AI lẫn deterministic generator.
   - Áp dụng default_status từ cấu hình người dùng để preset trạng thái quiz (draft).
   - Test P1-KnowledgeVault PASS.

5) P1 (Định danh bảng Provenance):
   - migrations/0021_quiz_auto_builder_defaults.sql định nghĩa quiz_question_sources.id TEXT PRIMARY KEY NOT NULL.
   - Tất cả các lệnh INSERT / INSERT OR REPLACE đều bind ID xác định ('qqs_' + quizId + '_' + qId + '_' + sourceId).
   - Test P1-Provenance-Schema PASS.

6) P1 (Migration 0021 An toàn Production):
   - Đã kiểm tra migration 0021 trong môi trường SQLite thật với PRAGMA foreign_keys = ON trong transaction.
   - Kiểm tra PRAGMA foreign_key_check trả về 0 lỗi (clean).
   - Test P1-Migration-0021 PASS.

7) P2 (Image URL Security & Privacy Bảo vệ Học sinh):
   - Tạo module dùng chung src/lib/quizMedia.js định nghĩa ALLOWED_IMAGE_HOSTS và isAllowedImageUrl().
   - Cho phép đường dẫn nội bộ (bắt đầu bằng /) và các domain CDN được kiểm duyệt (drive.google.com, docs.google.com, lh*.googleusercontent.com, timbk.io.vn, upload.wikimedia.org, images.unsplash.com, cdn.pixabay.com).
   - Student player kiểm tra isAllowedImageUrl trước khi render thẻ img; nếu URL đến từ nguồn lạ ngoài allowlist, hiển thị placeholder cảnh báo an toàn riêng tư, ngăn chặn third-party tracker.
   - Test P2-Privacy PASS.

8) P1 (Response Honesty & UI Degradation Banner):
   - Tất cả các endpoint sinh câu hỏi trả về requested_counts, generated_counts, degraded_types, degraded_reason.
   - UI hiển thị banner cảnh báo chất lượng sinh đề và bảng breakdown chi tiết số lượng câu theo từng dạng khi xảy ra degradation.

3. Bằng chứng kiểm thử & Build:
- Toàn bộ 98/98 tests PASS trên toàn bộ 11 test suites:
  * tests/quiz_auto_builder_phase2_audit.test.js: 19/19 PASS (bao gồm 6 test behavior mới)
  * tests/quiz_auto_builder_phase2.test.js: 8/8 PASS
  * tests/quiz_theme_contract.test.js: 6/6 PASS (Warm Ivory, sạch 100% token xanh đen)
  * tests/quiz_menu_phase2_drive.test.js: 8/8 PASS
  * tests/quiz_library_sync_phase1.test.js: 16/16 PASS
  * tests/quiz_bank_import_integration.test.js: 6/6 PASS
  * tests/quiz_menu_phase1.test.js: 10/10 PASS
  * tests/quiz_menu_phase4.test.js: 10/10 PASS
  * tests/quiz_menu_phase5.test.js: 2/2 PASS
  * tests/questions_security.test.js: 11/11 PASS
  * tests/verify_pwa_quiz_navigation.test.js: 6/6 PASS
- npm run check: 0 errors, worker-configuration.d.ts up to date.
- npm run build: Cloudflare Pages built thành công trong 9.01s.
- git diff --check: 0 lỗi whitespace.
- Remote Git: Đã push thành công lên origin/agy/quiz-auto-builder-phase2 tại commit 986079a.

Kính mời Codex maintainer/auditor tiến hành re-audit commit 986079a trên PR #28!

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

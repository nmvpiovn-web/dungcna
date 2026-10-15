# Brainstorming & Technical Spec: Quiz Multi-Type Enrichment, Drive/Vault/Bank Sync & Full Role QA

**Date:** 2026-10-15  
**Target Production:** `https://timbk.io.vn` (`tienganh-pro-db` on Cloudflare D1)

---

## 1. Intent & Why
The user tested `https://timbk.io.vn/quiz-menu/` directly and identified three core pain points:
1. **Hash URL & Public Quiz UX (`https://timbk.io.vn/quiz-menu/#question-qq_quiz_pub_ielts_qb_504`):**
   - Clicking a question number in the exam sidebar (`#question-qq_...`) mutates the browser URL hash instead of scrolling smoothly inside `.exam-shell`, leaving `#question-qq_quiz_pub_ielts_qb_504` stuck in the address bar and failing to open the quiz if reloaded or visited directly.
   - Public catalog quizzes (`quiz_pub_grade_1`..`12` and `quiz_pub_ielts`) only contain `multiple_choice` questions and display duplicate option prefixes (`A` badge + `A. Do not walk on the grass`).
2. **Google Drive & Knowledge Vault Source Failures (`chọn từ drive cũng lỗi`):**
   - `GET /api/quiz-menu/drive-files` only queries the empty `Quiz Uploads` subfolder on Google Drive and returns `files: []`, ignoring the 1,000 synced Google Drive files in `drive_file_index` and the extracted Drive documents in `knowledge_vault` (`07_GOOGLE_DRIVE_LIBRARY`).
   - `POST /api/quiz-menu/[id]/from-drive` fails when pasting a Google Docs/Drive link if the Service Account hits `storageQuotaExceeded` on `/copy`, or when selecting a synced Drive file from `drive_file_index` / `knowledge_vault`.
   - `GET /api/quiz-menu/knowledge-vault` and `POST /api/quiz-menu/[id]/from-knowledge-vault` only query `status = 'active'`, ignoring the 1,194 `status = 'published'` articles in `knowledge_vault`.
   - `parseSourceContent` in `src/lib/server/quizAutoBuilder.js` does not strip YAML frontmatter (`--- ... ---`), causing YAML keys (`id`, `title`, `folder`, `sha256`) to be misparsed as English vocabulary words, and misses inline DOCX table MCQ options (`A. ... | B. ... | C. ... | D. ...`).
3. **Quiz Format Diversity (`chưa nói hình thức chọn kiểu quiz chỉ mới có trắc nghiệm, làm giàu thêm cách làm, đồng bộ đúng từ kho câu hỏi, kho tri thức hoặc google drive`):**
   - In `/quiz-menu` Auto Builder, the Question Type Mix selector was collapsed inside "Tùy chỉnh nâng cao" and completely disabled when `sourceMode === 'question_bank'`.
   - `import-questions` (from `question_bank`) hardcoded `type = 'multiple_choice'`, never converting bank questions into `true_false`, `fill_blank`, `matching`, `memory_match`, `ordering`, `word_guess`, or `rewrite`.
   - Public catalog quizzes (`quiz_pub_grade_1`..`12`, `quiz_pub_ielts`) had 100% `multiple_choice` questions instead of a rich multi-type assessment.

---

## 2. Goals & Non-Goals
### Goals
- **G1 (Hash Deep-Link & Smooth Question Navigation):**
  - Replace raw `<a href="#question-...">` hash jumps in `.exam-shell` with smooth container scrolling (`scrollToQuestion(question.id)`) so the URL is never polluted.
  - Support direct visits to `/quiz-menu/#question-qq_{quizId}_...` in `onMount` by automatically resolving `{quizId}`, opening the quiz modal, and cleaning the hash on exit.
  - Strip duplicate leading letter prefixes (`A. `) when rendering MCQ option text next to the `A/B/C/D` badge while keeping option values intact.
- **G2 (Google Drive & Knowledge Vault End-to-End Sync):**
  - In `listQuizDriveFiles(platform)`: merge Drive API files with synced D1 `drive_file_index` / `knowledge_vault` (`07_GOOGLE_DRIVE_LIBRARY`) documents when `platform?.env?.DB` has synced Drive entries, so teachers immediately see and can pick from all synced Drive documents.
  - In `readAllowedDriveSource` and `readDriveSourceFromUrl`:
    - Support reading synced Drive files via `drive_file_index` / `knowledge_vault` in D1 (`platform?.env?.DB`) as well as direct Google Drive API export/download without failing when `/copy` hits `storageQuotaExceeded`, and fallback to public Google Docs export (`https://docs.google.com/document/d/{id}/export?format=txt`) when needed.
    - Preserve strict allowlist enforcement (`DriveFolderForbidden` 403) for unknown external `file_id`s not in `allowedQuizFolderIds` and not in D1 `drive_file_index` / `knowledge_vault`.
  - In `/api/quiz-menu/knowledge-vault` and `/api/quiz-menu/[id]/from-knowledge-vault`: accept `status IN ('active', 'published') OR status IS NULL`.
- **G3 (Enriched Multi-Type Quiz Generation across Drive, Knowledge Vault, and Question Bank):**
  - Surface **Chọn hình thức / Kiểu câu hỏi (Quiz Format Presets + Dynamic Type Mix)** directly in the main Auto Builder workflow for **all 4 sources** (`upload`, `drive`, `question_bank`, `knowledge_vault`).
  - Add 5 one-click presets:
    1. **🎯 Đa dạng chuẩn (4 dạng)**: `multiple_choice` + `true_false` + `fill_blank` + `matching`
    2. **🎮 Game & Phản xạ từ vựng**: `word_guess` + `memory_match` + `ordering` + `matching`
    3. **📝 Tổng hợp toàn diện (8 dạng)**: `multiple_choice`, `true_false`, `fill_blank`, `matching`, `word_guess`, `ordering`, `memory_match`, `rewrite`
    4. **◉ Trắc nghiệm tốc độ (100% MCQ)**: `multiple_choice`
    5. **✍️ Đọc hiểu & Tự luận**: `fill_blank` + `rewrite` + `paragraph`
  - Upgrade `parseSourceContent` & `generateDeterministicQuiz` in `src/lib/server/quizAutoBuilder.js` to strip YAML frontmatter/boilerplate, parse Markdown tables & inline DOCX options, and synthesize all requested question types reliably.
  - Upgrade `src/lib/server/quizBankBridge.js` and `src/routes/api/quiz-menu/[id]/import-questions/+server.js` so importing from `question_bank` with `type_mix` generates rich question types (`multiple_choice`, `true_false`, `fill_blank`, `matching`, `memory_match`, `ordering`, `word_guess`, `rewrite`) from bank items.
  - Enrich the 13 public quizzes (`quiz_pub_grade_1`..`12` and `quiz_pub_ielts`) on D1 so every public quiz includes multiple question types (`multiple_choice`, `true_false`, `fill_blank`, `matching`, `ordering`, `word_guess`) in addition to MCQs.
- **G4 (Comprehensive Multi-Role QA Verification):**
  - Run automated + live production QA across all 5 roles (`guest`, `student`, `teacher`, `leader`/`admin`, `parent`), testing quiz creation (from Drive, Question Bank, Knowledge Vault, Upload, Manual), taking & submitting quizzes of all question types, grade isolation for enrolled students, and Guest placement vs proficiency tests.

### Non-Goals
- Do not break any existing unit tests in `tests/quiz*.test.js`.

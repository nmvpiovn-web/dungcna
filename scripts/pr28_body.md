## Dependency & Stacking Notice
- **Base Branch:** `agy/quiz-library-sync-phase1` (PR #27)
- **Dependency:** This PR is stacked on PR #27. PR #27 must be merged first before merging this PR.
- **DO NOT MERGE / DO NOT DEPLOY / DO NOT APPLY REMOTE D1 MIGRATION.**

---

## Deliverables & Architecture Overview

### 1. Two Distinct Builder Modes
- **Tự động (Auto)** is the **DEFAULT** mode: teachers select source (Upload, Google Drive, Question Bank D1) and parameters; questions are auto-generated without requiring manual typing.
- **Nhập thủ công (Manual)** mode: full manual authoring with add/edit/delete/reorder for each individual question.
- **Draft Preservation Guard**: switching modes never silently wipes questions. A confirmation banner appears if draft questions exist, preserving existing items unless explicitly cleared.

### 2. D1 Per-User Defaults (`quiz_builder_defaults`)
- Created migration `migrations/0021_quiz_auto_builder_defaults.sql` defining `quiz_builder_defaults` table with `user_id` primary key and validation checks.
- Server-side REST endpoints: `GET /api/quiz-menu/builder-defaults` and `PUT /api/quiz-menu/builder-defaults`.
- Enforces strict user isolation (each teacher/staff has private defaults, staff-only RBAC, fail-closed auth).
- Auto Builder pre-loads saved preferences on entry and allows saving new defaults with one click.

### 3. Multi-Image Upload & Camera Capture (1..6 Images)
- Supports uploading 1 to 6 images (JPEG, PNG, WebP) via file picker or camera capture.
- Interactive `N/6` badge, thumbnail preview, reordering (Move Up / Move Down), and individual deletion.
- Strictly rejects 7th image on both client and server (HTTP 400 `MaxSixImagesAllowed`).
- Limits: <=10MB per file and <=20MB total payload.
- Page boundary concatenation: `--- Trang X/Y ---`.
- D1 stores NO base64 images; failures rollback cleanly.

### 4. Expanded Question Types (10 Types Supported)
Full support in schema, validator, editor, student player, grading, and review:
1. `multiple_choice`
2. `true_false`
3. `fill_blank`
4. `matching`
5. `word_guess`
6. `ordering`
7. `memory_match`
8. `picture_guess`
9. `rewrite`
10. `paragraph` / `essay`

### 5. Dynamic Question Type Mix
- Stepper controls and toggles below Auto config allowing teachers to specify exact counts per question type.
- Live allocation pill showing `X / Total` count.
- Deterministic allocation with graceful degradation when source lacks required media.

### 6. Answer Secrecy & Security
- Public and student API responses strictly omit `correct_answer`, `explanation`, `source_type`, and `source_id`.
- Only staff requests with explicit `include_answers=1` receive answers.

### 7. Theme, UX & Accessibility
- Strict Warm Ivory (`#fdfbf7`), Neutral Stone Near-Black (`#1c1917`), Emerald (`#059669`), and Coral palette.
- ZERO navy/dark blue/slate remnants in all shell files.
- Touch targets >= 44px min-height; WCAG AA contrast compliant; full mobile responsiveness (320px, 360px, 560px, 800px).

---

## Verification & Audit Evidence
- **Test Suites:** 10 test suites passed (79/79 tests green, 0 failures, 0 skipped).
- **TypeScript & Svelte Check:** `npm run check` passed with 0 errors.
- **Production Build:** `npm run build` passed cleanly in 9.44s.
- **Git Hygiene:** `git diff --check origin/agy/quiz-library-sync-phase1...HEAD` clean (0 whitespace issues).
- **Runbook:** `docs/RUNBOOK_0021_QUIZ_AUTO_BUILDER_PHASE2.md` and `docs/PLAN_QUIZ_AUTO_BUILDER_PHASE2.md` included.

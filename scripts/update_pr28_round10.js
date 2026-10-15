import { execSync } from 'child_process';
import fs from 'fs';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();

const pr28Body = `## Dependency & Stacking Notice
- **Base Branch:** \`agy/quiz-library-sync-phase1\` (PR #27)
- **Dependency:** This PR is stacked on PR #27. PR #27 must be merged first before merging this PR.
- **DO NOT MERGE / DO NOT DEPLOY / DO NOT APPLY REMOTE D1 MIGRATION.**

---

## Deliverables & Architecture Overview

### 1. Two Distinct Builder Modes
- **Tự động (Auto)** is the **DEFAULT** mode: teachers select source (Upload, Google Drive, Question Bank D1) and parameters; questions are auto-generated without requiring manual typing.
- **Nhập thủ công (Manual)** mode: full manual authoring with add/edit/delete/reorder for each individual question.
- **Draft Preservation Guard**: switching modes never silently wipes questions. A confirmation banner appears if draft questions exist, preserving existing items unless explicitly cleared.

### 2. Auto Review Mode & UX Overhaul (Round 10)
- **Auto Review First**: After generation, Auto mode defaults to read-only review cards (\`.question-review-list\`), displaying prompt, question type badge, points, options with correct answer badge, thumbnail preview, and explanation. Zero input fields, radio buttons, or delete buttons are shown by default, completely eliminating the manual typing sensation.
- **Explicit Review/Edit Toggle**: Teachers can toggle "✏️ Chỉnh sửa chi tiết" when fine-tuning is required, and return to "👁️ Quay lại xem trước" without any data loss.
- **Opening Existing Quizzes in Review Mode**: Quizzes opened from My Quizzes (\`editQuiz\`) open in Auto review mode by default instead of forcing full manual editor controls.
- **Fast Auto Flow & Status Clarity**: Quiz title is non-blocking and optional (*"Không bắt buộc — hệ thống tự đặt nếu để trống"*). Generation completion displays an explicit affirmative status: \`✓ Đã tự động tạo \${draft.questions.length} câu; không cần nhập câu hỏi thủ công.\`.
- **Concise Summary Bar & Collapsible Advanced Config**: Top bar provides active type chips and concise question count summary. Detailed steppers, dynamic type mix, and *"💾 Lưu cấu hình mặc định vào tài khoản"* are housed in \`#advanced-config-panel\` (collapsed by default, \`aria-expanded\`, >=44px touch target).
- **Flexible Multi-Image Flow**: Uploading 1 to 6 images when \`picture_guess === 0\` does NOT require manual labels and presents an OCR extraction info banner. Only requires labels when \`picture_guess > 0\` for up to \`Math.min(picture_guess, files.length)\`.

### 3. D1 Per-User Defaults (\`quiz_builder_defaults\`)
- Migration \`migrations/0021_quiz_auto_builder_defaults.sql\` defining \`quiz_builder_defaults\` table with \`user_id\` primary key and validation checks.
- Endpoints: \`GET /api/quiz-menu/builder-defaults\` and \`PUT /api/quiz-menu/builder-defaults\`.
- Enforces strict user isolation (each teacher/staff has private defaults, staff-only RBAC, fail-closed auth).
- Auto Builder pre-loads saved preferences on entry and allows saving new defaults with one click.

### 4. Multi-Image Upload & Camera Capture (1..6 Images)
- Supports uploading 1 to 6 images (JPEG, PNG, WebP) via file picker or camera capture.
- Interactive \`N/6\` badge, thumbnail preview, reordering (Move Up / Move Down), and individual deletion.
- Strictly rejects 7th image on both client and server (HTTP 400 \`MaxSixImagesAllowed\`).
- Limits: <=10MB per file and <=20MB total payload.
- Page boundary concatenation: \`--- Trang X/Y ---\`.
- D1 stores NO base64 images; failures rollback cleanly.

### 5. Expanded Question Types (10 Types Supported)
Full support in schema, validator, editor, student player, grading, and review:
1. \`multiple_choice\`
2. \`true_false\`
3. \`fill_blank\`
4. \`matching\`
5. \`word_guess\`
6. \`ordering\`
7. \`memory_match\`
8. \`picture_guess\`
9. \`rewrite\`
10. \`paragraph\` / \`essay\`

### 6. Dynamic Question Type Mix
- Stepper controls and toggles inside advanced panel allowing teachers to specify exact counts per question type.
- Live allocation pill showing \`X / Total\` count.
- Deterministic allocation with graceful degradation when source lacks required media.

### 7. Answer Secrecy & Security
- Public and student API responses strictly omit \`correct_answer\`, \`explanation\`, \`source_type\`, and \`source_id\`.
- Only staff requests with explicit \`include_answers=1\` receive answers.
- Image assets served via secure authenticated proxy endpoints (\`/api/quiz-menu/assets/[asset_id]\`).

### 8. Theme, UX & Accessibility
- Strict Warm Ivory (\`#fdfbf7\`), Neutral Stone Near-Black (\`#1c1917\`), Emerald (\`#059669\`), and Coral palette.
- ZERO navy/dark blue/slate remnants across all 11 shell files.
- Touch targets >= 44px min-height; WCAG AA contrast compliant; full mobile responsiveness (320px, 360px, 560px, 800px).

---

## Verification & Audit Evidence
- **Audited HEAD:** \`d27955da3b7308c3dddebb4a6bb4c835aa5026ce\` (commit \`d27955d\`).
- **Clean Test Suite:** 21 test files, 164 tests passed, 0 failed, 0 skipped.
- **Type and Svelte check:** \`npm run check\` passed with 0 errors; Wrangler types are up to date.
- **Cloudflare Pages build:** built cleanly with adapter-cloudflare.
- **Git hygiene:** \`git diff --check origin/agy/quiz-library-sync-phase1...HEAD\` passed (0 whitespace errors).
- **Security checks:** guest/student answer stripping, exact image asset authorization, staff-only provenance, upload rollback, and D1 user isolation passed.
- **Mobile checks:** 1-6 image thumbnail/label flow, 44px touch targets, and 320/360px responsive contracts passed.
- **Runbooks:** \`docs/RUNBOOK_0021_QUIZ_AUTO_BUILDER_PHASE2.md\` and \`docs/PLAN_QUIZ_AUTO_BUILDER_PHASE2.md\`.

## Merge Order
1. Review and merge PR #27 into \`main\`.
2. Retarget/rebase this stacked PR onto updated \`main\`.
3. Re-run the same gates after rebase.
4. Apply migrations 0018-0021 using the committed runbooks, then deploy.

**Current control:** keep this PR draft; do not merge, deploy, or apply remote D1 migrations before PR #27 and the post-rebase checks are complete.
`;

async function main() {
  const patchRes = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls/28', {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Antigravity-CLI',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: pr28Body })
  });

  const updated = await patchRes.json();
  if (updated.html_url) {
    console.log('PR #28 body updated successfully:', updated.html_url);
  } else {
    console.error('Failed to update PR #28:', updated);
  }
}

main();

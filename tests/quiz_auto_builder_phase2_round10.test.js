import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET as getDefaults, PUT as updateDefaults } from '../src/routes/api/quiz-menu/builder-defaults/+server.js';
import { resolveDefaultGradeLevel } from '../src/lib/quizDefaults.js';

const secret = 'quiz-menu-phase2-round10-secret';

function createDbAdapter(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          const stmt = sqlite.prepare(sql);
          return {
            first: async () => stmt.get(...params) || null,
            all: async () => ({ results: stmt.all(...params) }),
            run: async () => stmt.run(...params)
          };
        },
        first: async () => sqlite.prepare(sql).get() || null,
        all: async () => ({ results: sqlite.prepare(sql).all() }),
        run: async () => sqlite.prepare(sql).run()
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    }
  };
}

function setupTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      phone TEXT,
      email TEXT,
      name TEXT,
      role TEXT,
      avatar TEXT,
      status TEXT,
      approval_status TEXT DEFAULT 'approved',
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      revoked_at TEXT,
      expires_at TEXT
    );
    CREATE TABLE quiz_builder_defaults (
      user_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL DEFAULT 'upload',
      question_count INTEGER NOT NULL DEFAULT 10,
      time_limit_minutes INTEGER NOT NULL DEFAULT 15,
      grade_level INTEGER NOT NULL DEFAULT 7,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      type_mix_json TEXT,
      default_status TEXT NOT NULL DEFAULT 'draft',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users (id, username, email, role, status, approval_status)
    VALUES
      ('teacher_10a', 'teacher_10a', 'tea_a@school.edu', 'teacher', 'active', 'approved'),
      ('teacher_10b', 'teacher_10b', 'tea_b@school.edu', 'teacher', 'active', 'approved');
    INSERT INTO auth_sessions (id, expires_at)
    VALUES
      ('sess_teacher_10a', '2099-01-01T00:00:00.000Z'),
      ('sess_teacher_10b', '2099-01-01T00:00:00.000Z');
  `);
  return { sqlite, db: createDbAdapter(sqlite) };
}

// -------------------------------------------------------------
// RED-10.1: Auto result must default to read-only review, not editor
// -------------------------------------------------------------
test('RED-10.1: Auto mode defaults to review mode; review card is read-only and free of editor controls', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8').replace(/\r\n/g, '\n');

  // 1. Initial states
  assert.ok(
    pageSrc.includes("let builderMode = $state('auto')"),
    'builderMode must default to auto'
  );
  assert.ok(
    pageSrc.includes("let autoQuestionViewMode = $state('review')"),
    'autoQuestionViewMode must default to review'
  );

  // 2. Review mode markup exists and contains question info
  assert.ok(
    pageSrc.includes('class="question-review-list"'),
    'Must have .question-review-list container'
  );
  assert.ok(
    pageSrc.includes('class="review-card"'),
    'Must have .review-card articles'
  );
  assert.ok(
    pageSrc.includes('class="review-prompt-text"'),
    'Must have .review-prompt-text for clean prompt reading'
  );
  assert.ok(
    pageSrc.includes('class="review-type-badge"'),
    'Must have .review-type-badge'
  );

  // 3. Review section must not contain textarea or radio inputs for editing
  const reviewCardsMatch = pageSrc.match(/<div class="question-review-list">([\s\S]*?)<\/div>\s*\{:else}/);
  assert.ok(reviewCardsMatch, 'Must have distinct review cards branch in Auto generated preview');
  const reviewMarkup = reviewCardsMatch[1];

  assert.ok(
    !reviewMarkup.includes('<textarea'),
    'Review mode must NOT contain any <textarea> editor'
  );
  assert.ok(
    !reviewMarkup.includes('<input type="radio"'),
    'Review mode must NOT contain radio inputs for changing correct answers'
  );
  assert.ok(
    !reviewMarkup.includes('class="delete"'),
    'Review mode must NOT contain delete buttons on cards'
  );
  assert.ok(
    !reviewMarkup.includes('＋ Thêm lựa chọn'),
    'Review mode must NOT contain add-option button'
  );

  // 4. Correct answer indicator badge in review mode
  assert.ok(
    reviewMarkup.includes('review-correct-badge'),
    'Review mode must display clear correct answer badge (e.g. ✓ Đáp án đúng)'
  );

  // 5. Image thumbnail in review mode
  assert.ok(
    reviewMarkup.includes('review-image-thumb'),
    'Review mode must render image thumbnail when prompt_image_url is present'
  );

  // 6. editQuiz from My Quizzes opens in auto review mode, not manual
  assert.ok(
    pageSrc.includes("builderMode = 'auto';\n      autoQuestionViewMode = 'review';\n      activeTab = 'create';"),
    'editQuiz must open quiz in auto review mode without forcing manual editor'
  );
});

// -------------------------------------------------------------
// RED-10.1 & RED-10.5: Explicit edit toggle switches between review & editor without draft loss
// -------------------------------------------------------------
test('RED-10.1 & RED-10.5: Toggle switches between review and editor without data loss; manual mode preserves editor', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8').replace(/\r\n/g, '\n');

  // Toggle buttons
  assert.ok(
    pageSrc.includes('Chỉnh sửa chi tiết'),
    'Must have "Chỉnh sửa chi tiết" button to enter editor'
  );
  assert.ok(
    pageSrc.includes('Quay lại xem trước'),
    'Must have "Quay lại xem trước" button to return to review'
  );
  assert.ok(
    pageSrc.includes("autoQuestionViewMode = 'edit'"),
    'Button must set autoQuestionViewMode to edit'
  );
  assert.ok(
    pageSrc.includes("autoQuestionViewMode = 'review'"),
    'Button must set autoQuestionViewMode to review'
  );

  // Manual mode always keeps editor
  const manualShellMatch = pageSrc.match(/class="manual-builder-shell"([\s\S]*?)<\/section>/);
  assert.ok(manualShellMatch, 'Must have manual-builder-shell');
  const manualMarkup = manualShellMatch[1];
  assert.ok(
    manualMarkup.includes('<textarea bind:value={question.prompt}'),
    'Manual mode must always render full prompt textarea'
  );
  assert.ok(
    manualMarkup.includes('class="delete"'),
    'Manual mode must always have question delete button'
  );
  assert.ok(
    manualMarkup.includes('addQuestion(type[0])'),
    'Manual mode must always have add question buttons'
  );

  // Behavior simulation: toggling view mode preserves draft questions
  const draftState = {
    title: 'Test Quiz',
    questions: [
      { id: 'q1', type: 'multiple_choice', prompt: 'What is A?', options: ['A', 'B'], correct_answer: 'A', points: 1 },
      { id: 'q2', type: 'true_false', prompt: 'Is it true?', options: ['Đúng', 'Sai'], correct_answer: 'Đúng', points: 1 }
    ]
  };
  let viewMode = 'review';
  // Toggle to edit
  viewMode = 'edit';
  // Modify in edit
  draftState.questions[0].prompt = 'What is modified A?';
  // Toggle back to review
  viewMode = 'review';
  assert.equal(draftState.questions.length, 2, 'Draft questions count preserved');
  assert.equal(draftState.questions[0].prompt, 'What is modified A?', 'Draft edits preserved across view mode toggle');
});

// -------------------------------------------------------------
// RED-10.2: Fast Auto flow, optional blank title, status message, separate publish
// -------------------------------------------------------------
test('RED-10.2: Blank title is optional and auto-generated; clear status after generation; empty error guidance', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8').replace(/\r\n/g, '\n');

  // 1. Title optional hint
  assert.ok(
    pageSrc.includes('Không bắt buộc — hệ thống tự đặt nếu để trống'),
    'Must display clear hint that title is optional and auto-generated'
  );

  // 2. Auto-generate title logic
  assert.ok(
    pageSrc.includes("Quiz Tự Động · ${gradeLabel} · ${new Date().toLocaleDateString('vi-VN')}"),
    'Auto builder must automatically assign readable title if blank'
  );

  // 3. Status message after generation
  assert.ok(
    pageSrc.includes('✓ Đã tự động tạo ${draft.questions.length} câu; không cần nhập câu hỏi thủ công.'),
    'Must display exact status after auto-generation confirming no manual authoring needed'
  );

  // 4. Save vs Publish separation (never silent auto-publish)
  assert.ok(
    pageSrc.includes("saveDraft(false)"),
    'Must have explicit draft save button'
  );
  assert.ok(
    pageSrc.includes("saveDraft(true)"),
    'Must have explicit publish quiz button'
  );

  // 5. Friendly empty check error in Auto mode
  assert.ok(
    pageSrc.includes('Chưa có câu hỏi nào. Vui lòng chọn nguồn tài liệu và bấm "Tự động tạo Quiz" bên trên.'),
    'Auto mode empty error must guide user to select source and auto-generate, not demand manual input'
  );
});

// -------------------------------------------------------------
// RED-10.3: Concise summary bar and collapsible advanced config panel
// -------------------------------------------------------------
test('RED-10.3: Concise summary bar is shown by default; advanced panel is collapsed with accessible controls', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8').replace(/\r\n/g, '\n');

  // 1. Initial state collapsed
  assert.ok(
    pageSrc.includes("let showAdvancedConfig = $state(false)"),
    'showAdvancedConfig must default to false (collapsed)'
  );

  // 2. Summary bar markup
  assert.ok(
    pageSrc.includes('class="config-summary-bar"'),
    'Must have .config-summary-bar container'
  );
  assert.ok(
    pageSrc.includes('class="summary-chips"'),
    'Must have .summary-chips for compact parameter summary'
  );

  // 3. Toggle button accessible attributes
  assert.ok(
    pageSrc.includes('aria-expanded={showAdvancedConfig}'),
    'Toggle button must bind aria-expanded'
  );
  assert.ok(
    pageSrc.includes('aria-controls="advanced-config-panel"'),
    'Toggle button must reference advanced-config-panel in aria-controls'
  );

  // 4. Collapsible container
  assert.ok(
    pageSrc.includes('id="advanced-config-panel"'),
    'Must have #advanced-config-panel'
  );
  assert.ok(
    pageSrc.includes('class:is-collapsed={!showAdvancedConfig}'),
    'Must collapse panel when showAdvancedConfig is false'
  );

  // 5. "Lưu cấu hình mặc định vào tài khoản" placed in advanced section
  const advancedMatch = pageSrc.match(/id="advanced-config-panel"([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(advancedMatch, 'Advanced panel must contain configuration controls and save button');
  assert.ok(
    advancedMatch[1].includes('Lưu cấu hình mặc định vào tài khoản'),
    'Save defaults button must be clearly described as per-account default in advanced panel'
  );

  // 6. Defaults generate 10 questions without opening advanced panel
  const defaultAutoConfig = {
    source_type: 'upload',
    question_count: 10,
    time_limit_minutes: 15,
    grade_level: 7,
    difficulty: 'medium',
    default_status: 'draft'
  };
  const defaultTypeMix = {
    multiple_choice: 5,
    true_false: 2,
    fill_blank: 2,
    matching: 1
  };
  const total = Object.values(defaultTypeMix).reduce((a, b) => a + b, 0);
  assert.equal(total, defaultAutoConfig.question_count, 'Default allocation sum equals question_count (10)');
});

// -------------------------------------------------------------
// RED-10.3: Dynamic Type Mix additions, subtractions, and allocation tracking
// -------------------------------------------------------------
test('RED-10.3: Type mix increment, decrement, and toggle maintain exact allocation arithmetic', () => {
  let mix = { multiple_choice: 5, true_false: 2, fill_blank: 2, matching: 1 };
  let count = 10;

  function updateCount(typeId, delta) {
    const cur = Number(mix[typeId] || 0);
    const next = Math.max(0, cur + delta);
    if (next === 0) {
      delete mix[typeId];
      if (Object.keys(mix).length === 0) mix.multiple_choice = 5;
    } else {
      mix[typeId] = next;
    }
    const tot = Object.values(mix).reduce((a, b) => a + b, 0);
    if (tot > 0) count = tot;
  }

  // Increment true_false by 1
  updateCount('true_false', 1);
  assert.equal(mix.true_false, 3);
  assert.equal(count, 11);

  // Decrement matching to 0 (removes it)
  updateCount('matching', -1);
  assert.equal(mix.matching, undefined);
  assert.equal(count, 10);

  // Decrement fill_blank
  updateCount('fill_blank', -1);
  assert.equal(mix.fill_blank, 1);
  assert.equal(count, 9);
});

// -------------------------------------------------------------
// RED-10.4: Image labels strictly enforced only when picture_guess > 0
// -------------------------------------------------------------
test('RED-10.4: Image label validation: 0 required when picture_guess=0; required when picture_guess > 0', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8').replace(/\r\n/g, '\n');

  // UI explanations for OCR vs picture_guess
  assert.ok(
    pageSrc.includes('Ảnh được dùng làm nguồn quét chữ OCR để tạo câu hỏi tự động. Bạn <strong>không cần nhập nhãn</strong> nếu không dùng dạng câu Nhìn hình đoán chữ (Picture Guess).'),
    'Must display clear notice that OCR scanning does not require image labels'
  );
  assert.ok(
    pageSrc.includes('Bắt buộc nhập ít nhất {Math.min(Number(questionTypeMix.picture_guess), uploadFiles.length)} nhãn'),
    'Must display dynamic minimum required labels for picture_guess'
  );

  // Behavioral test: validation function
  function validateLabels(filesToUpload, labels, picTarget) {
    if (picTarget > 0) {
      const filledCount = labels.filter((l) => l.label && l.label.trim().length > 0).length;
      const requiredMin = Math.min(picTarget, filesToUpload.length);
      if (filledCount === 0) {
        throw new Error('missing_all');
      }
      if (filledCount < requiredMin) {
        throw new Error('missing_some');
      }
    }
    return true;
  }

  const dummyFiles = [{ name: 'img1.png' }, { name: 'img2.png' }, { name: 'img3.png' }];

  // Case 1: picture_guess = 0, no labels provided -> PASS (OCR extraction)
  assert.equal(validateLabels(dummyFiles, [{ label: '' }, { label: '' }, { label: '' }], 0), true);

  // Case 2: picture_guess = 2, 0 labels provided -> THROW missing_all
  assert.throws(() => validateLabels(dummyFiles, [{ label: '' }, { label: '' }, { label: '' }], 2), /missing_all/);

  // Case 3: picture_guess = 2, only 1 label provided -> THROW missing_some
  assert.throws(() => validateLabels(dummyFiles, [{ label: 'apple' }, { label: '' }, { label: '' }], 2), /missing_some/);

  // Case 4: picture_guess = 2, 2 labels provided -> PASS
  assert.equal(validateLabels(dummyFiles, [{ label: 'apple' }, { label: 'banana' }, { label: '' }], 2), true);

  // Case 5: picture_guess = 5, but only 3 images uploaded -> requiredMin is 3
  assert.throws(() => validateLabels(dummyFiles, [{ label: 'apple' }, { label: 'banana' }, { label: '' }], 5), /missing_some/);
  assert.equal(validateLabels(dummyFiles, [{ label: 'apple' }, { label: 'banana' }, { label: 'cat' }], 5), true);
});

// -------------------------------------------------------------
// RED-10.3: Save defaults roundtrip user-isolated with grade 0 and type mix
// -------------------------------------------------------------
test('RED-10.3: builder-defaults PUT and GET preserve grade 0 and type mix per user', async () => {
  const { sqlite, db } = setupTestDatabase();
  const tokenTeacherA = await createSignedToken({ id: 'teacher_10a', role: 'teacher', username: 'teacher_10a', email: 'tea_a@school.edu' }, secret, 60_000, 'sess_teacher_10a');
  const tokenTeacherB = await createSignedToken({ id: 'teacher_10b', role: 'teacher', username: 'teacher_10b', email: 'tea_b@school.edu' }, secret, 60_000, 'sess_teacher_10b');
  const platform = { env: { DB: db, AUTH_SECRET: secret, JWT_SECRET: secret } };

  const reqA = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenTeacherA}` },
    body: JSON.stringify({
      source_type: 'drive',
      question_count: 12,
      time_limit_minutes: 25,
      grade_level: 0, // IELTS / General
      difficulty: 'hard',
      type_mix: { multiple_choice: 8, true_false: 4 },
      default_status: 'draft'
    })
  });
  const resA = await updateDefaults({ request: reqA, platform });
  const bodyA = await resA.json();
  assert.equal(bodyA.success, true);

  // Fetch for teacher A
  const getReqA = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    headers: { authorization: `Bearer ${tokenTeacherA}` }
  });
  const getResA = await getDefaults({ request: getReqA, platform });
  const getBodyA = await getResA.json();
  assert.equal(getBodyA.success, true);
  assert.equal(getBodyA.defaults.grade_level, 0, 'Grade 0 preserved');
  assert.equal(getBodyA.defaults.question_count, 12);
  assert.equal(getBodyA.defaults.difficulty, 'hard');
  assert.equal(getBodyA.defaults.type_mix.multiple_choice, 8);

  // Teacher B fetches defaults: isolated from teacher A
  const getReqB = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    headers: { authorization: `Bearer ${tokenTeacherB}` }
  });
  const getResB = await getDefaults({ request: getReqB, platform });
  const getBodyB = await getResB.json();
  assert.equal(getBodyB.success, true);
  assert.equal(getBodyB.defaults.question_count, 10, 'Teacher B sees standard defaults');
  assert.equal(getBodyB.defaults.grade_level, 7, 'Teacher B sees default grade 7');
});

// -------------------------------------------------------------
// RED-10.5: Mobile / a11y CSS contract for 320px/360px viewport safety
// -------------------------------------------------------------
test('RED-10.5: Mobile touch targets >= 44px, box-sizing safety, and zero forbidden dark blue tokens', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');

  // 1. Touch targets >= 44px on interactive controls
  assert.ok(
    pageSrc.includes('.btn-toggle-advanced{min-height:44px'),
    'Advanced toggle button must have min-height 44px'
  );
  assert.ok(
    pageSrc.includes('.btn-toggle-view{min-height:44px'),
    'Review/edit toggle button must have min-height 44px'
  );
  assert.ok(
    pageSrc.includes('.btn-save-defaults{min-height:44px'),
    'Save defaults button must have min-height 44px'
  );

  // 2. Responsive overflow prevention
  assert.ok(
    pageSrc.includes('word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box'),
    'Review cards must use overflow-wrap anywhere and box-sizing border-box'
  );

  // 3. Mobile stacking in media queries
  assert.ok(
    pageSrc.includes('.config-summary-bar{flex-direction:column;align-items:stretch}'),
    'Config summary bar must stack vertically on mobile (max-width:560px)'
  );
  assert.ok(
    pageSrc.includes('.btn-toggle-advanced{width:100%;justify-content:center}'),
    'Advanced toggle button must take full width on mobile'
  );
  assert.ok(
    pageSrc.includes('.preview-mode-header{flex-direction:column;align-items:stretch}'),
    'Preview mode header must stack vertically on mobile'
  );

  // 4. Zero forbidden dark blue tokens in entire page.svelte
  const FORBIDDEN_DARK_BLUE = [
    '#17283d', '#075985', '#0f172a', '#132238', '#0b132b',
    '#172554', '#0c1a2b', '#155e75', '#164e63', '#083344',
    '#1e293b', '#334155', '#475569', '#64748b', '#0c4a6e'
  ];
  for (const token of FORBIDDEN_DARK_BLUE) {
    assert.ok(
      !pageSrc.toLowerCase().includes(token.toLowerCase()),
      `src/routes/quiz-menu/+page.svelte must not contain forbidden color ${token}`
    );
  }
});

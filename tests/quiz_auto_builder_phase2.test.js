import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import {
  QUIZ_TYPES,
  OBJECTIVE_TYPES,
  validateQuestion,
  publicQuestion,
  gradeAnswers
} from '../src/lib/server/quizMenu.js';
import {
  generateDeterministicQuiz,
  allocateTypeMix,
  validateMultiImages,
  concatenateMultiPageText,
  MAX_MULTI_IMAGES,
  MAX_IMAGE_FILE_BYTES,
  MAX_TOTAL_IMAGE_PAYLOAD_BYTES
} from '../src/lib/server/quizAutoBuilder.js';
import { GET as getDefaults, PUT as updateDefaults } from '../src/routes/api/quiz-menu/builder-defaults/+server.js';

const secret = 'quiz-menu-phase-2-test-secret';

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
  `);
  sqlite.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0020_quiz_question_provenance.sql', 'utf8'));
  if (fs.existsSync('migrations/0021_quiz_auto_builder_defaults.sql')) {
    sqlite.exec(fs.readFileSync('migrations/0021_quiz_auto_builder_defaults.sql', 'utf8'));
  }
  return { sqlite, db: createDbAdapter(sqlite) };
}

test('PHASE 2: QUIZ AUTO BUILDER & EXPANDED QUESTION TYPES SUITE', async (t) => {
  await t.test('Part A: Schema & Migration 0021 Contract', async () => {
    assert.ok(fs.existsSync('migrations/0021_quiz_auto_builder_defaults.sql'), 'Migration 0021 file must exist');
    const { sqlite } = setupTestDatabase();

    // Verify quiz_builder_defaults exists and has correct columns
    const tableInfo = sqlite.prepare("PRAGMA table_info(quiz_builder_defaults)").all();
    assert.ok(tableInfo.length > 0, 'Table quiz_builder_defaults must exist');
    const colNames = tableInfo.map((c) => c.name);
    assert.ok(colNames.includes('user_id'), 'Column user_id must exist');
    assert.ok(colNames.includes('source_type'), 'Column source_type must exist');
    assert.ok(colNames.includes('question_count'), 'Column question_count must exist');
    assert.ok(colNames.includes('time_limit_minutes'), 'Column time_limit_minutes must exist');
    assert.ok(colNames.includes('grade_level'), 'Column grade_level must exist');
    assert.ok(colNames.includes('difficulty'), 'Column difficulty must exist');
    assert.ok(colNames.includes('type_mix_json'), 'Column type_mix_json must exist');
    assert.ok(colNames.includes('default_status'), 'Column default_status must exist');

    // Verify quiz_questions allows expanded types
    sqlite.exec("INSERT INTO quizzes (id, title, created_by) VALUES ('q_test_types', 'Test Types', 'user_staff_1')");
    const testTypes = ['true_false', 'word_guess', 'ordering', 'memory_match', 'paragraph'];
    for (const type of testTypes) {
      sqlite.exec(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, points, q_order) VALUES ('qq_${type}', 'q_test_types', '${type}', 'Prompt for ${type}', 1.0, 0)`);
    }
    const count = sqlite.prepare("SELECT count(*) as c FROM quiz_questions WHERE quiz_id = 'q_test_types'").get();
    assert.equal(count.c, testTypes.length, 'All new question types must insert cleanly into quiz_questions');
  });

  await t.test('Part B: D1 Per-User Defaults API (/api/quiz-menu/builder-defaults)', async () => {
    const { sqlite, db } = setupTestDatabase();
    sqlite.exec(`
      INSERT INTO users (id, username, role, approval_status, status)
      VALUES
        ('u_teacher_a', 'teacher_a', 'teacher', 'approved', 'active'),
        ('u_teacher_b', 'teacher_b', 'teacher', 'approved', 'active'),
        ('u_student_1', 'student_1', 'student', 'approved', 'active');
    `);

    sqlite.exec(`
      INSERT INTO auth_sessions (id, expires_at)
      VALUES
        ('sess_teacher_a', '2099-01-01T00:00:00.000Z'),
        ('sess_teacher_b', '2099-01-01T00:00:00.000Z'),
        ('sess_student_1', '2099-01-01T00:00:00.000Z');
    `);

    const teacherAToken = await createSignedToken({ id: 'u_teacher_a', role: 'teacher', username: 'teacher_a' }, secret, 60_000, 'sess_teacher_a');
    const teacherBToken = await createSignedToken({ id: 'u_teacher_b', role: 'teacher', username: 'teacher_b' }, secret, 60_000, 'sess_teacher_b');
    const studentToken = await createSignedToken({ id: 'u_student_1', role: 'student', username: 'student_1' }, secret, 60_000, 'sess_student_1');
    const platform = { env: { DB: db, AUTH_SECRET: secret, JWT_SECRET: secret } };

    // AUTH-01: 401 unauthenticated
    const resUnauth = await getDefaults({ request: new Request('http://localhost/api/quiz-menu/builder-defaults'), platform });
    assert.equal(resUnauth.status, 401, 'Unauthenticated GET should return 401');

    // AUTH-02: 403 student
    const resStudent = await getDefaults({
      request: new Request('http://localhost/api/quiz-menu/builder-defaults', { headers: { authorization: `Bearer ${studentToken}` } }),
      platform
    });
    assert.equal(resStudent.status, 403, 'Student role should return 403');

    // DEFAULTS-01: Teacher A gets initial defaults before saving
    const resInit = await getDefaults({
      request: new Request('http://localhost/api/quiz-menu/builder-defaults', { headers: { authorization: `Bearer ${teacherAToken}` } }),
      platform
    });
    assert.equal(resInit.status, 200, 'Staff should get 200 for initial defaults');
    const initData = await resInit.json();
    assert.equal(initData.defaults.question_count, 10, 'Default question_count should be 10');
    assert.equal(initData.defaults.source_type, 'upload', 'Default source_type should be upload');

    // DEFAULTS-02: Teacher A updates defaults
    const customDefaults = {
      source_type: 'drive',
      question_count: 25,
      time_limit_minutes: 45,
      grade_level: 9,
      difficulty: 'hard',
      default_status: 'draft',
      type_mix: { multiple_choice: 15, true_false: 5, fill_blank: 5 }
    };

    // Verify published is rejected
    const resRejectPub = await updateDefaults({
      request: new Request('http://localhost/api/quiz-menu/builder-defaults', {
        method: 'PUT',
        headers: { authorization: `Bearer ${teacherAToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...customDefaults, default_status: 'published' })
      }),
      platform
    });
    assert.equal(resRejectPub.status, 400, 'Must reject default_status: published');

    const resPut = await updateDefaults({
      request: new Request('http://localhost/api/quiz-menu/builder-defaults', {
        method: 'PUT',
        headers: { authorization: `Bearer ${teacherAToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(customDefaults)
      }),
      platform
    });
    assert.equal(resPut.status, 200, 'Teacher A should successfully update defaults');
    const putData = await resPut.json();
    assert.equal(putData.defaults.question_count, 25);
    assert.equal(putData.defaults.source_type, 'drive');

    // ISOLATION-01: Teacher B gets initial defaults, untouched by Teacher A
    const resTeacherB = await getDefaults({
      request: new Request('http://localhost/api/quiz-menu/builder-defaults', { headers: { authorization: `Bearer ${teacherBToken}` } }),
      platform
    });
    const bData = await resTeacherB.json();
    assert.equal(bData.defaults.question_count, 10, 'Teacher B must NOT see Teacher A custom question_count');
    assert.equal(bData.defaults.source_type, 'upload', 'Teacher B must NOT see Teacher A source_type');

    // VALIDATION: bounds & allowlist checks
    const resBadCount = await updateDefaults({
      request: new Request('http://localhost/api/quiz-menu/builder-defaults', {
        method: 'PUT',
        headers: { authorization: `Bearer ${teacherAToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ question_count: 250 }) // over 200
      }),
      platform
    });
    assert.equal(resBadCount.status, 400, 'question_count > 200 must be rejected with 400');

    const resBadSource = await updateDefaults({
      request: new Request('http://localhost/api/quiz-menu/builder-defaults', {
        method: 'PUT',
        headers: { authorization: `Bearer ${teacherAToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ source_type: 'malicious_remote_source' })
      }),
      platform
    });
    assert.equal(resBadSource.status, 400, 'Disallowed source_type must be rejected with 400');
  });

  await t.test('Part C: Multi-Image Source (1..6 images) Contract', async () => {
    assert.equal(MAX_MULTI_IMAGES, 6, 'Maximum images for Auto builder must be 6');
    assert.equal(MAX_IMAGE_FILE_BYTES, 10 * 1024 * 1024, 'Per-image max size must be 10MB');
    assert.equal(MAX_TOTAL_IMAGE_PAYLOAD_BYTES, 20 * 1024 * 1024, 'Total image payload max must be 20MB');

    // 1 to 6 images are accepted
    const dummyImageA = { name: 'page1.jpg', type: 'image/jpeg', size: 1024, arrayBuffer: async () => new ArrayBuffer(1024) };
    const dummyImageB = { name: 'page2.png', type: 'image/png', size: 2048, arrayBuffer: async () => new ArrayBuffer(2048) };
    const validBatch = [dummyImageA, dummyImageB];
    const validationResult = validateMultiImages(validBatch);
    assert.equal(validationResult.valid, true, '2 valid images should pass validation');

    // 7 images rejected (client and server contract)
    const sevenImages = Array.from({ length: 7 }, (_, i) => ({
      name: `p${i + 1}.jpg`, type: 'image/jpeg', size: 100, arrayBuffer: async () => new ArrayBuffer(100)
    }));
    const rejectedSeven = validateMultiImages(sevenImages);
    assert.equal(rejectedSeven.valid, false, '7 images must be rejected');
    assert.equal(rejectedSeven.code, 'MaxSixImagesAllowed');

    // Reject oversized individual file
    const oversizedFile = [{ name: 'big.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(100) }];
    assert.equal(validateMultiImages(oversizedFile).code, 'FileTooLarge');

    // Concatenate text with page boundary markers
    const pages = ['Nội dung trang một với câu hỏi', 'Nội dung trang hai với bài tập'];
    const mergedText = concatenateMultiPageText(pages);
    assert.ok(mergedText.includes('--- Trang 1/2 ---'), 'Must include page 1 boundary');
    assert.ok(mergedText.includes('--- Trang 2/2 ---'), 'Must include page 2 boundary');
    assert.ok(mergedText.includes('Nội dung trang một'), 'Must retain content of page 1');
  });

  await t.test('Part D: Expanded Question Types & Auto-Grading Contract', async () => {
    // 1. All required question types in QUIZ_TYPES
    const requiredTypes = [
      'multiple_choice', 'fill_blank', 'matching', 'picture_guess',
      'rewrite', 'paragraph', 'true_false', 'word_guess', 'ordering', 'memory_match'
    ];
    for (const t of requiredTypes) {
      assert.ok(QUIZ_TYPES.has(t), `QUIZ_TYPES must include ${t}`);
    }

    // 2. Validate Question for new types
    // true_false
    const tfValid = validateQuestion({
      type: 'true_false',
      prompt: 'The sun rises in the east.',
      options_json: ['Đúng', 'Sai'],
      correct_answer: 'Đúng',
      points: 1
    });
    assert.ok(!tfValid.error, 'true_false valid payload should pass validation');
    assert.equal(tfValid.value.type, 'true_false');

    // word_guess
    const wgValid = validateQuestion({
      type: 'word_guess',
      prompt: 'G_v_rn_ent (cơ quan điều hành quốc gia)',
      correct_answer: 'Government',
      points: 1
    });
    assert.ok(!wgValid.error, 'word_guess valid payload should pass validation');

    // ordering
    const orderValid = validateQuestion({
      type: 'ordering',
      prompt: 'Sắp xếp các từ thành câu hoàn chỉnh:',
      options_json: { items: ['always', 'She', 'books', 'reads'] },
      correct_answer: ['She', 'always', 'reads', 'books'],
      points: 1
    });
    assert.ok(!orderValid.error, 'ordering valid payload should pass validation');

    // memory_match
    const mmValid = validateQuestion({
      type: 'memory_match',
      prompt: 'Ghép các cặp từ đồng nghĩa:',
      options_json: {
        pairs: [
          { a: 'big', b: 'large' },
          { a: 'fast', b: 'quick' }
        ]
      },
      correct_answer: { big: 'large', fast: 'quick' },
      points: 1
    });
    assert.ok(!mmValid.error, 'memory_match valid payload should pass validation');

    // 3. Auto-Grading for all objective types
    const questionRows = [
      { id: 'q_tf', type: 'true_false', correct_answer: 'Đúng', points: 2 },
      { id: 'q_wg', type: 'word_guess', correct_answer: 'Government', points: 2 },
      { id: 'q_ord', type: 'ordering', correct_answer: JSON.stringify(['She', 'always', 'reads', 'books']), points: 3 },
      { id: 'q_mm', type: 'memory_match', correct_answer: JSON.stringify({ big: 'large', fast: 'quick' }), points: 3 },
      { id: 'q_sub', type: 'rewrite', points: 5, correct_answer: 'She is too young to drive.' }
    ];

    const studentAnswers = {
      q_tf: 'đúng',
      q_wg: ' government ',
      q_ord: ['She', 'always', 'reads', 'books'],
      q_mm: { big: 'large', fast: 'quick' },
      q_sub: 'She cannot drive because she is young.'
    };

    const graded = gradeAnswers(questionRows, studentAnswers);
    assert.equal(graded.autoScore, 10, 'Objective questions (2+2+3+3=10) should be auto-graded 10 points');
    assert.equal(graded.maxScore, 15, 'Total max score should be 15');
    assert.equal(graded.needsReview, true, 'Subjective rewrite question must trigger needsReview = true');

    const tfGrading = graded.grading.find((g) => g.question_id === 'q_tf');
    assert.equal(tfGrading.correct, true, 'true_false case-insensitive match should be marked correct');

    const wgGrading = graded.grading.find((g) => g.question_id === 'q_wg');
    assert.equal(wgGrading.correct, true, 'word_guess trimmed match should be marked correct');

    const subGrading = graded.grading.find((g) => g.question_id === 'q_sub');
    assert.equal(subGrading.correct, null, 'Subjective question correct flag must be null');
    assert.equal(subGrading.awarded_points, null, 'Subjective question points must be null pending review');
  });

  await t.test('Part E: Dynamic Mix Allocation & Degradation Contract', async () => {
    // 1. Allocation matches total count
    const totalCount = 20;
    const requestedMix = {
      multiple_choice: 10,
      true_false: 4,
      fill_blank: 4,
      ordering: 2
    };
    const allocation = allocateTypeMix(totalCount, requestedMix);
    const sum = Object.values(allocation).reduce((a, b) => a + b, 0);
    assert.equal(sum, totalCount, 'Allocated questions sum must strictly equal requested totalCount');

    // 2. Deterministic generator grounded in source
    const sampleText = `
Unit 5: The Environment
1. Deforestation is a major threat to wildlife.
2. We must protect rare animals from extinction.
Vocabulary:
- pollute: to make air or water dirty
- recycle: to treat things so that they can be used again
Questions:
1. What is deforestation?
A. Planting trees
B. Cutting down trees
C. Watering plants
D. Cleaning rivers
Answer: B
    `;

    const generated = generateDeterministicQuiz(sampleText, {
      questionCount: 5,
      typeMix: { multiple_choice: 2, true_false: 1, fill_blank: 1, word_guess: 1 },
      hasImages: false
    });

    assert.equal(generated.questions.length, 5, 'Must generate exactly 5 questions');
    for (const q of generated.questions) {
      assert.ok(QUIZ_TYPES.has(q.type), `Generated question type ${q.type} must be in QUIZ_TYPES`);
      assert.ok(q.prompt && q.prompt.length >= 5, 'Prompt must be non-empty and meaningful');
      if (OBJECTIVE_TYPES.has(q.type)) {
        assert.ok(q.correct_answer !== null && q.correct_answer !== undefined, 'Objective question must have correct_answer');
      }
    }

    // 3. Graceful degradation when source lacks images
    const degradedGen = generateDeterministicQuiz(sampleText, {
      questionCount: 4,
      typeMix: { picture_guess: 2, multiple_choice: 2 },
      hasImages: false
    });
    // picture_guess cannot be satisfied without images; generator reallocates without hallucinating fake image URLs
    const picQuestions = degradedGen.questions.filter((q) => q.type === 'picture_guess');
    assert.equal(picQuestions.length, 0, 'picture_guess must degrade to 0 when hasImages is false');
    assert.equal(degradedGen.questions.length, 2, 'Total generated count reflects only fulfillable types (no silent backfill)');
    assert.equal(degradedGen.generated_counts.picture_guess, 0);
    assert.equal(degradedGen.generated_counts.multiple_choice, 2);
    assert.ok(degradedGen.degraded_types?.includes('picture_guess'), 'Must document degraded types in metadata');
    assert.ok(degradedGen.degraded_reason, 'Must provide degraded_reason');
  });

  await t.test('Part F: Answer Secrecy & Security Contract', async () => {
    const rawQuestion = {
      id: 'qq_secret_1',
      quiz_id: 'q_pub_1',
      type: 'true_false',
      prompt: 'Water boils at 100 degrees Celsius.',
      options_json: JSON.stringify(['Đúng', 'Sai']),
      correct_answer: 'Đúng',
      explanation: 'Under normal atmospheric pressure at sea level.',
      points: 1,
      q_order: 0,
      source_type: 'question_bank',
      source_id: 'qb_1234'
    };

    // Public / Guest / Student view (includeAnswers = false)
    const publicView = publicQuestion(rawQuestion, false);
    assert.equal(publicView.correct_answer, undefined, 'Public question must NEVER include correct_answer');
    assert.equal(publicView.explanation, undefined, 'Public question must NEVER include explanation');
    assert.equal(publicView.source_type, undefined, 'Public question must NEVER include source_type');
    assert.equal(publicView.source_id, undefined, 'Public question must NEVER include source_id');

    // Staff view (includeAnswers = true)
    const staffView = publicQuestion(rawQuestion, true);
    assert.equal(staffView.correct_answer, 'Đúng', 'Staff view includes correct_answer');
    assert.equal(staffView.explanation, 'Under normal atmospheric pressure at sea level.');
    assert.equal(staffView.source_type, 'question_bank');
    assert.equal(staffView.source_id, 'qb_1234');
  });

  await t.test('Part G: UI, Draft Preservation, Theme & A11y Contract', async () => {
    const quizMenuPage = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');
    const cameraCapture = fs.readFileSync('src/lib/components/QuizCameraCapture.svelte', 'utf8');

    // 1. Auto is default mode
    assert.ok(
      quizMenuPage.includes("builderMode = $state('auto')") || quizMenuPage.includes('builderMode = "auto"') || quizMenuPage.includes("builderMode = 'auto'"),
      'Auto mode must be the default builderMode in quiz-menu page'
    );

    // 2. Draft preservation & mode switch warning
    assert.ok(
      quizMenuPage.includes('switchBuilderMode') || quizMenuPage.includes('confirmModeSwitch') || quizMenuPage.includes('showModeWarning'),
      'Must have explicit mode switching guard function to protect unsaved draft questions'
    );

    // 3. Multi-image max 6 badge & limits
    assert.ok(
      cameraCapture.includes('/6') || cameraCapture.includes('MAX_IMAGES = 6') || cameraCapture.includes('maxImages = 6'),
      'QuizCameraCapture must explicitly enforce and display max 6 images'
    );

    // 4. Dynamic question types section in page
    assert.ok(
      quizMenuPage.includes('typeMix') || quizMenuPage.includes('activeTypes') || quizMenuPage.includes('questionTypeMix'),
      'Quiz menu page must include dynamic question type mix state under Auto config'
    );

    // 5. Zero navy/dark blue in Quiz components
    const FORBIDDEN_TOKENS = ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b'];
    for (const token of FORBIDDEN_TOKENS) {
      assert.ok(!cameraCapture.toLowerCase().includes(token.toLowerCase()), `QuizCameraCapture must not contain ${token}`);
    }
  });
});

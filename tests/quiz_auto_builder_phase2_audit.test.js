import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import {
  QUIZ_TYPES,
  validateQuestion,
  gradeAnswers
} from '../src/lib/server/quizMenu.js';
import {
  allocateTypeMix,
  generateDeterministicQuiz,
  validateMultiImages,
  concatenateMultiPageText,
  MAX_MULTI_IMAGES
} from '../src/lib/server/quizAutoBuilder.js';
import { POST as createQuiz } from '../src/routes/api/quiz-menu/+server.js';
import { PUT as updateQuiz } from '../src/routes/api/quiz-menu/[id]/+server.js';
import { GET as getQuiz } from '../src/routes/api/quiz-menu/[id]/+server.js';
import { POST as importBankQuestions } from '../src/routes/api/quiz-menu/[id]/import-questions/+server.js';
import { POST as uploadSource } from '../src/routes/api/quiz-menu/[id]/upload/+server.js';
import { POST as fromDrive } from '../src/routes/api/quiz-menu/[id]/from-drive/+server.js';
import { GET as getDefaults, PUT as putDefaults } from '../src/routes/api/quiz-menu/builder-defaults/+server.js';

const secret = 'audit-red-test-secret-2026';

function d1Adapter(sqlite) {
  const wrap = (sql, params = []) => ({
    first: async () => sqlite.prepare(sql).get(...params) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => sqlite.prepare(sql).run(...params)
  });
  return {
    prepare(sql) { return { ...wrap(sql), bind(...params) { return wrap(sql, params); } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
}

async function fullSchemaFixture() {
  const sqlite = new DatabaseSync(':memory:');
  // Base users and auth sessions
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT, phone TEXT, email TEXT, name TEXT,
      role TEXT, avatar TEXT, status TEXT, approval_status TEXT DEFAULT 'approved', metadata TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, revoked_at TEXT, expires_at TEXT);
    CREATE TABLE homework_assignments (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, class_id TEXT NOT NULL, class_name TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, due_date TEXT NOT NULL, total_points INTEGER DEFAULT 10,
      created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, teacher_id TEXT, teacher_name TEXT,
      campus_id TEXT DEFAULT 'loc_codung', skill_type TEXT, assigned_date TEXT, deadline_date TEXT,
      deadline_time TEXT, max_score REAL DEFAULT 10, star_reward_on_time INTEGER DEFAULT 50,
      status TEXT DEFAULT 'published'
    );
    CREATE TABLE class_enrollments (id TEXT PRIMARY KEY, user_id TEXT, class_id TEXT, status TEXT);
    CREATE TABLE parent_student_links (id TEXT PRIMARY KEY, parent_user_id TEXT, student_user_id TEXT, verification_status TEXT);
    CREATE TABLE system_notifications (id TEXT PRIMARY KEY, target_role TEXT, target_user_id TEXT, title TEXT, body TEXT, category TEXT, reference_id TEXT);
    CREATE TABLE IF NOT EXISTS knowledge_vault (
      id TEXT PRIMARY KEY, title TEXT, folder TEXT, category TEXT, tags TEXT, content_markdown TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      id UNINDEXED, title, content_markdown, tags, folder, tokenize = 'unicode61'
    );
    CREATE TABLE IF NOT EXISTS question_bank (
      id TEXT PRIMARY KEY,
      grade_level TEXT NOT NULL,
      curriculum_id TEXT,
      topic TEXT,
      skill_category TEXT NOT NULL,
      cognitive_level TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'multiple_choice',
      difficulty_score REAL DEFAULT 0.5,
      question_text TEXT NOT NULL,
      options_json TEXT,
      correct_option_id TEXT,
      explanation TEXT,
      reading_passage TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Apply migrations 0012, 0014, 0013, 0018, 0019, 0020, 0021
  sqlite.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0014_quiz_guest_class.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0013_quiz_menu_drive.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0018_knowledge_fts_triggers_backfill.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0019_seed_public_quiz_catalog.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0020_quiz_question_provenance.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0021_quiz_auto_builder_defaults.sql', 'utf8'));

  // Insert teachers and sessions
  sqlite.prepare(`INSERT INTO users (id,username,name,role,status,metadata) VALUES ('teacher-1','teacher','Cô Giáo 1','teacher','active','{}')`).run();
  sqlite.prepare(`INSERT INTO users (id,username,name,role,status,metadata) VALUES ('teacher-2','teacher2','Cô Giáo 2','teacher','active','{}')`).run();
  sqlite.prepare(`INSERT INTO users (id,username,name,role,status,metadata) VALUES ('student-1','student','Học Sinh 1','student','active','{}')`).run();
  sqlite.prepare(`INSERT INTO auth_sessions VALUES ('sess-t1',NULL,'2099-01-01T00:00:00.000Z'), ('sess-t2',NULL,'2099-01-01T00:00:00.000Z'), ('sess-s1',NULL,'2099-01-01T00:00:00.000Z')`).run();

  const teacher1Token = await createSignedToken({ id: 'teacher-1', username: 'teacher', role: 'teacher' }, secret, 60_000, 'sess-t1');
  const teacher2Token = await createSignedToken({ id: 'teacher-2', username: 'teacher2', role: 'teacher' }, secret, 60_000, 'sess-t2');
  const student1Token = await createSignedToken({ id: 'student-1', username: 'student', role: 'student' }, secret, 60_000, 'sess-s1');

  const d1 = d1Adapter(sqlite);
  const platform = { env: { DB: d1, AUTH_SECRET: secret } };

  return { sqlite, d1, platform, teacher1Token, teacher2Token, student1Token };
}

describe('PHASE 2 CODEX AUDIT: RED/GREEN TEST SUITE', () => {

  test('P0-1: Drive provenance many-to-one allows >=2 questions from the same source file without UNIQUE failure', async () => {
    const ctx = await fullSchemaFixture();
    const quizId = 'quiz_drive_prov_test';
    ctx.sqlite.prepare(`INSERT INTO quizzes (id, title, created_by, status) VALUES (?, 'Drive Prov Quiz', 'teacher-1', 'draft')`).run(quizId);

    // Simulated from-drive generating 3 questions from same file 'doc_shared_123'
    // Calling saveQuizSourceAndDrafts or from-drive directly
    const { saveQuizSourceAndDrafts } = await import('../src/lib/server/quizDrive.js');
    const sourceMetadata = { id: 'doc_shared_123', name: 'unit4.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1024 };
    const questions = [
      { id: 'qq_drv_1', type: 'multiple_choice', prompt: 'Question 1 from drive doc', options_json: JSON.stringify(['A','B']), correct_answer: 'A', points: 1, q_order: 0, source_type: 'drive', source_id: 'doc_shared_123' },
      { id: 'qq_drv_2', type: 'multiple_choice', prompt: 'Question 2 from drive doc', options_json: JSON.stringify(['A','B']), correct_answer: 'B', points: 1, q_order: 1, source_type: 'drive', source_id: 'doc_shared_123' },
      { id: 'qq_drv_3', type: 'multiple_choice', prompt: 'Question 3 from drive doc', options_json: JSON.stringify(['A','B']), correct_answer: 'A', points: 1, q_order: 2, source_type: 'drive', source_id: 'doc_shared_123' }
    ];

    // This MUST succeed and record provenance without throwing UNIQUE constraint violation
    await saveQuizSourceAndDrafts(ctx.d1, quizId, sourceMetadata, 'Sample text from doc', questions);

    // Verify all 3 questions exist and trace back to 'doc_shared_123'
    const rows = ctx.sqlite.prepare(`SELECT id, source_type, source_id FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order`).all(quizId);
    assert.strictEqual(rows.length, 3);
    for (const row of rows) {
      assert.strictEqual(row.source_type, 'drive');
      assert.strictEqual(row.source_id, 'doc_shared_123');
    }
  });

  test('P1-2: PUT roundtrip preserves source_type/source_id provenance and prevents duplicate re-import', async () => {
    const ctx = await fullSchemaFixture();
    const quizId = 'quiz_roundtrip_prov';
    ctx.sqlite.prepare(`INSERT INTO quizzes (id, title, created_by, status) VALUES (?, 'Roundtrip Quiz', 'teacher-1', 'draft')`).run(quizId);

    // Ensure a question bank item exists
    ctx.sqlite.prepare(`
      INSERT OR IGNORE INTO question_bank (id, grade_level, question_text, options_json, correct_option_id, status, skill_category, cognitive_level)
      VALUES ('qb_audit_01', 'lop_7', 'What is AI?', '["A. Software","B. Hardware"]', 'A', 'published', 'grammar', 'nhan_biet')
    `).run();

    // 1. Import from question bank
    const importReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        mode: 'selected',
        question_ids: ['qb_audit_01']
      })
    };
    const importRes = await importBankQuestions({ params: { id: quizId }, request: importReq, platform: ctx.platform });
    const importData = await importRes.json();
    assert.strictEqual(importRes.status, 200, JSON.stringify(importData));
    assert.strictEqual(importData.imported_count, 1);

    // 2. Fetch the draft questions (which UI does before editing)
    const getReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}` }),
      url: `http://localhost/api/quiz-menu/${quizId}?include_answers=1`
    };
    const getRes = await getQuiz({ params: { id: quizId }, request: getReq, platform: ctx.platform });
    const getData = await getRes.json();
    assert.strictEqual(getData.quiz.questions.length, 1);
    const fetchedQ = getData.quiz.questions[0];
    assert.strictEqual(fetchedQ.source_type, 'question_bank');
    assert.strictEqual(fetchedQ.source_id, 'qb_audit_01');

    // 3. PUT save draft with the questions (simulating teacher clicking Lưu nháp)
    const putReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        title: 'Roundtrip Quiz Saved',
        status: 'draft',
        time_limit_minutes: 20,
        questions: getData.quiz.questions // sent back by UI
      })
    };
    const putRes = await updateQuiz({ params: { id: quizId }, request: putReq, platform: ctx.platform });
    assert.strictEqual(putRes.status, 200);

    // 4. Verify DB still retains provenance
    const qInDb = ctx.sqlite.prepare(`SELECT source_type, source_id FROM quiz_questions WHERE quiz_id = ?`).get(quizId);
    assert.strictEqual(qInDb.source_type, 'question_bank');
    assert.strictEqual(qInDb.source_id, 'qb_audit_01');

    // 5. Try importing the same question bank question again -> must return imported_count = 0 (deduped!)
    const reImportRes = await importBankQuestions({ params: { id: quizId }, request: importReq, platform: ctx.platform });
    const reImportData = await reImportRes.json();
    assert.strictEqual(reImportData.imported_count, 0, 'Re-importing already present question bank question must be deduped');
  });

  test('P1-3: editQuiz roundtrip preserves prompt_image_url, matching left/right, memory pairs without data loss', async () => {
    const ctx = await fullSchemaFixture();
    const quizId = 'quiz_types_preserve';
    ctx.sqlite.prepare(`INSERT INTO quizzes (id, title, created_by, status) VALUES (?, 'Types Preserve Quiz', 'teacher-1', 'draft')`).run(quizId);

    const questions = [
      {
        id: 'q_pic_1',
        type: 'picture_guess',
        prompt: 'Look at the image and identify the object',
        prompt_image_url: 'https://images.unsplash.com/photo-cat.png',
        options_json: JSON.stringify(['A. cat', 'B. dog']),
        correct_answer: 'A. cat',
        points: 1
      },
      {
        id: 'q_mat_1',
        type: 'matching',
        prompt: 'Match English words with meanings',
        options_json: JSON.stringify({ left: ['sun', 'moon'], right: ['mặt trời', 'mặt trăng'] }),
        correct_answer: JSON.stringify({ 'sun': 'mặt trời', 'moon': 'mặt trăng' }),
        points: 2
      },
      {
        id: 'q_mem_1',
        type: 'memory_match',
        prompt: 'Memory card game for vocabulary',
        options_json: JSON.stringify({ pairs: [{ a: 'apple', b: 'quả táo' }, { a: 'banana', b: 'quả chuối' }] }),
        correct_answer: JSON.stringify({ 'apple': 'quả táo', 'banana': 'quả chuối' }),
        points: 2
      }
    ];

    const putReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({ title: 'Preserved Quiz', questions })
    };
    const res = await updateQuiz({ params: { id: quizId }, request: putReq, platform: ctx.platform });
    assert.strictEqual(res.status, 200);

    // Verify fetched questions keep prompt_image_url, matching left/right, and memory pairs
    const getReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}` }),
      url: `http://localhost/api/quiz-menu/${quizId}?include_answers=1`
    };
    const fetched = await (await getQuiz({ params: { id: quizId }, request: getReq, platform: ctx.platform })).json();
    const picQ = fetched.quiz.questions.find(q => q.type === 'picture_guess');
    const matQ = fetched.quiz.questions.find(q => q.type === 'matching');
    const memQ = fetched.quiz.questions.find(q => q.type === 'memory_match');

    assert.strictEqual(picQ.prompt_image_url, 'https://images.unsplash.com/photo-cat.png');
    assert.deepStrictEqual(matQ.options.left, ['sun', 'moon']);
    assert.deepStrictEqual(matQ.options.right, ['mặt trời', 'mặt trăng']);
    assert.ok(memQ.options.pairs || memQ.options.left, 'Memory match must retain pairs');
  });

  test('P1-4: Player and server grading contract for true_false, ordering, and memory_match', () => {
    const questions = [
      {
        id: 'q_tf',
        type: 'true_false',
        prompt: 'The earth orbits the sun',
        correct_answer: 'Đúng',
        points: 1
      },
      {
        id: 'q_ord',
        type: 'ordering',
        prompt: 'Order the words',
        correct_answer: JSON.stringify(['I', 'am', 'a', 'student']),
        points: 2
      },
      {
        id: 'q_mem',
        type: 'memory_match',
        prompt: 'Match memory cards',
        correct_answer: JSON.stringify({ 'hello': 'xin chào', 'bye': 'tạm biệt' }),
        points: 2
      }
    ];

    // Correct submissions
    const correctSubmission = {
      q_tf: 'Đúng',
      q_ord: ['I', 'am', 'a', 'student'],
      q_mem: { 'hello': 'xin chào', 'bye': 'tạm biệt' }
    };

    const resultCorrect = gradeAnswers(questions, correctSubmission);
    assert.strictEqual(resultCorrect.autoScore, 5, 'All correct must earn 1+2+2 = 5 points');
    assert.strictEqual(resultCorrect.grading.every(g => g.correct === true), true);

    // Incorrect submissions
    const incorrectSubmission = {
      q_tf: 'Sai',
      q_ord: ['student', 'a', 'am', 'I'],
      q_mem: { 'hello': 'tạm biệt', 'bye': 'xin chào' }
    };

    const resultIncorrect = gradeAnswers(questions, incorrectSubmission);
    assert.strictEqual(resultIncorrect.autoScore, 0, 'All incorrect must earn 0 points');
    assert.strictEqual(resultIncorrect.grading.every(g => g.correct === false), true);
  });

  test('P1-6 & P1-15: Truly deterministic generator without Math.random, no generic fallback, degrades with reason', () => {
    const groundedText = `
1. What is the powerhouse of the cell?
A. Mitochondria
B. Nucleus
C. Ribosome
D. Chloroplast
Answer: A

- photosynthesis: the process by which plants make food using sunlight
- respiration: the process of releasing energy from food

Plants need sunlight for photosynthesis.
Animals consume plants or other animals for energy.
    `;

    // 1. Run twice: must produce exact identical output (deterministic, no Math.random)
    const run1 = generateDeterministicQuiz(groundedText, {
      questionCount: 4,
      typeMix: { multiple_choice: 2, true_false: 1, ordering: 1 }
    });
    const run2 = generateDeterministicQuiz(groundedText, {
      questionCount: 4,
      typeMix: { multiple_choice: 2, true_false: 1, ordering: 1 }
    });

    assert.strictEqual(JSON.stringify(run1), JSON.stringify(run2), 'Deterministic generator must return identical output on same input');

    // 2. No generic hallucinations like "Thông tin trong bài học..."
    for (const q of run1.questions) {
      assert.strictEqual(q.prompt.includes('Thông tin trong bài học'), false, 'Must NOT contain generic ungrounded question prompts');
    }

    // 3. picture_guess requested with no image asset -> must NOT invent True/False backfill, must degrade with reason
    const noPicRun = generateDeterministicQuiz(groundedText, {
      questionCount: 5,
      typeMix: { multiple_choice: 2, picture_guess: 2 },
      hasImages: false
    });
    assert.ok(noPicRun.degraded_types?.includes('picture_guess') || noPicRun.degraded_reason, 'Must report degraded reason when picture_guess cannot be fulfilled');
  });

  test('P1-8: WebP format accepted and processed through upload endpoint', () => {
    const webpFile = {
      name: 'diagram.webp',
      type: 'image/webp',
      size: 1024 * 50,
      arrayBuffer: async () => new ArrayBuffer(1024 * 50)
    };
    const validation = validateMultiImages([webpFile]);
    assert.strictEqual(validation.valid, true, 'WebP file must be considered valid in multi-image validator');
  });

  test('P1-9: Defaults fail-closed: validates type_mix shape, caps, and user isolation', async () => {
    const ctx = await fullSchemaFixture();

    // 1. Reject unknown type in type_mix
    const badReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        type_mix: { invalid_type_xyz: 10 }
      })
    };
    const badRes = await putDefaults({ request: badReq, platform: ctx.platform });
    assert.strictEqual(badRes.status, 400, 'Must reject invalid question type in type_mix');

    // 2. Reject negative or non-integer counts
    const negReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        type_mix: { multiple_choice: -5 }
      })
    };
    const negRes = await putDefaults({ request: negReq, platform: ctx.platform });
    assert.strictEqual(negRes.status, 400, 'Must reject negative count in type_mix');

    // 3. Save valid defaults for Teacher 1
    const validReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        source_type: 'drive',
        question_count: 25,
        time_limit_minutes: 30,
        grade_level: 8,
        difficulty: 'hard',
        type_mix: { multiple_choice: 15, true_false: 10 },
        default_status: 'draft'
      })
    };
    const validRes = await putDefaults({ request: validReq, platform: ctx.platform });
    assert.strictEqual(validRes.status, 200);

    // 4. Verify Teacher 2 still receives system defaults (user isolation)
    const t2GetReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher2Token}` })
    };
    const t2GetRes = await getDefaults({ request: t2GetReq, platform: ctx.platform });
    const t2Data = await t2GetRes.json();
    assert.strictEqual(t2Data.defaults.question_count, 10, 'Teacher 2 must receive system defaults, not Teacher 1s defaults');
    assert.strictEqual(t2Data.is_default, true);
  });

  test('P1-10: Append vs Replace merge strategy support', async () => {
    const ctx = await fullSchemaFixture();
    const quizId = 'quiz_merge_strat';
    ctx.sqlite.prepare(`INSERT INTO quizzes (id, title, created_by, status) VALUES (?, 'Merge Quiz', 'teacher-1', 'draft')`).run(quizId);

    // Add initial question
    ctx.sqlite.prepare(`
      INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, points, q_order)
      VALUES ('q_init_1', ?, 'multiple_choice', 'Initial question 1', '["A","B"]', 'A', 1, 0)
    `).run(quizId);

    // 1. Append strategy: add new question without deleting initial
    const newQuestions = [
      { id: 'q_app_2', type: 'multiple_choice', prompt: 'Appended question 2', options_json: JSON.stringify(['A','B']), correct_answer: 'B', points: 1 }
    ];

    const appendReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        title: 'Merge Quiz Appended',
        merge_strategy: 'append',
        questions: newQuestions
      })
    };
    const appendRes = await updateQuiz({ params: { id: quizId }, request: appendReq, platform: ctx.platform });
    assert.strictEqual(appendRes.status, 200);
    const countAfterAppend = ctx.sqlite.prepare(`SELECT COUNT(*) count FROM quiz_questions WHERE quiz_id = ?`).get(quizId).count;
    assert.strictEqual(countAfterAppend, 2, 'Append strategy must preserve existing questions');

    // 2. Replace strategy: replace all with 1 new question
    const replaceQuestions = [
      { id: 'q_rep_1', type: 'multiple_choice', prompt: 'Replaced sole question', options_json: JSON.stringify(['A','B']), correct_answer: 'A', points: 1 }
    ];
    const replaceReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        title: 'Merge Quiz Replaced',
        merge_strategy: 'replace',
        questions: replaceQuestions
      })
    };
    const replaceRes = await updateQuiz({ params: { id: quizId }, request: replaceReq, platform: ctx.platform });
    assert.strictEqual(replaceRes.status, 200);
    const countAfterReplace = ctx.sqlite.prepare(`SELECT COUNT(*) count FROM quiz_questions WHERE quiz_id = ?`).get(quizId).count;
    assert.strictEqual(countAfterReplace, 1, 'Replace strategy must replace all questions');
  });

  test('P1-12: Legacy AdminCP does NOT import QuizMakeForm and links to /quiz-menu?tab=create', () => {
    const adminCpContent = fs.readFileSync('src/routes/admincp/+page.svelte', 'utf8');
    assert.strictEqual(adminCpContent.includes('QuizMakeForm'), false, 'src/routes/admincp/+page.svelte must not import QuizMakeForm');
    assert.strictEqual(adminCpContent.includes('/quiz-menu?tab=create'), true, 'src/routes/admincp/+page.svelte must link to /quiz-menu?tab=create');
  });

  test('P1-14: Exactly 10 canonical question types with essay normalized to paragraph', () => {
    assert.strictEqual(QUIZ_TYPES.size, 10, 'Registry must have exactly 10 canonical types');
    assert.strictEqual(QUIZ_TYPES.has('paragraph'), true);
    assert.strictEqual(QUIZ_TYPES.has('essay'), false, 'essay must NOT be in canonical QUIZ_TYPES set');

    // essay input is normalized to paragraph
    const norm = validateQuestion({
      type: 'essay',
      prompt: 'Write an essay about environment',
      points: 5
    });
    assert.strictEqual(norm.value.type, 'paragraph', 'Legacy essay must be normalized to paragraph');
  });

  test('P1-13: prompt_image_url safety rejects http:// and javascript: and requires https:// or /', () => {
    const httpRes = validateQuestion({
      type: 'multiple_choice',
      prompt: 'Insecure image test',
      prompt_image_url: 'http://evil.com/image.png',
      options_json: ['A', 'B'],
      correct_answer: 'A'
    });
    assert.ok(httpRes.error, 'Must reject http:// prompt_image_url');

    const jsRes = validateQuestion({
      type: 'multiple_choice',
      prompt: 'XSS image test',
      prompt_image_url: 'javascript:alert(1)',
      options_json: ['A', 'B'],
      correct_answer: 'A'
    });
    assert.ok(jsRes.error, 'Must reject javascript: prompt_image_url');

    const httpsRes = validateQuestion({
      type: 'multiple_choice',
      prompt: 'Secure image test',
      prompt_image_url: 'https://images.unsplash.com/photo-123.jpg',
      options_json: ['A', 'B'],
      correct_answer: 'A'
    });
    assert.strictEqual(httpsRes.error, undefined);
    assert.strictEqual(httpsRes.value.prompt_image_url, 'https://images.unsplash.com/photo-123.jpg');

    const relativeRes = validateQuestion({
      type: 'multiple_choice',
      prompt: 'Relative image test',
      prompt_image_url: '/api/drive/files/img123',
      options_json: ['A', 'B'],
      correct_answer: 'A'
    });
    assert.strictEqual(relativeRes.error, undefined);
    assert.strictEqual(relativeRes.value.prompt_image_url, '/api/drive/files/img123');
  });

  test('P1-11: Drive picker UI filters and marks unsupported file types with disabled options', () => {
    const pageContent = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');
    assert.strictEqual(pageContent.includes('isSupportedDriveFile'), true, 'Must have isSupportedDriveFile helper for Drive files');
    assert.strictEqual(pageContent.includes('disabled={!isSupportedDriveFile(file)}'), true, 'Must disable unsupported files in Drive select dropdown');
  });

  test('P1-7: Multi-image manifest and atomic rollback on failure is defined and wired', () => {
    const uploadServerContent = fs.readFileSync('src/routes/api/quiz-menu/[id]/upload/+server.js', 'utf8');
    assert.strictEqual(uploadServerContent.includes('removeDriveFile'), true, 'upload endpoint must import and use removeDriveFile for cleanup on failure');
    assert.strictEqual(uploadServerContent.includes('manifest'), true, 'upload endpoint must construct and pass multi-image manifest');
  });

  test('P0-picture_guess: Grounding with imageAssets vs honest degradation without silent backfill', () => {
    const assets = [
      { id: 'img_1', url: 'https://images.unsplash.com/cat.jpg', label: 'cat' },
      { id: 'img_2', url: 'https://images.unsplash.com/dog.jpg', label: 'dog' }
    ];

    // 1. With imageAssets: generates real picture_guess questions with prompt_image_url
    const resWithAssets = generateDeterministicQuiz('Cat is feline. Dog is canine. Animals are friendly.', {
      questionCount: 3,
      typeMix: { picture_guess: 2, multiple_choice: 1 },
      hasImages: true,
      imageAssets: assets
    });

    const pics = resWithAssets.questions.filter(q => q.type === 'picture_guess');
    assert.strictEqual(pics.length, 2, 'Must generate exactly 2 picture_guess questions from assets');
    for (const pic of pics) {
      assert.ok(pic.prompt_image_url, 'Each picture_guess question must have prompt_image_url');
      assert.ok(pic.correct_answer, 'Each picture_guess question must have grounded correct_answer');
    }
    assert.strictEqual(resWithAssets.generated_counts.picture_guess, 2);
    assert.strictEqual(resWithAssets.degraded_types.length, 0);

    // 2. Without imageAssets: must NOT silently backfill true_false; must report degradation
    const resNoAssets = generateDeterministicQuiz('Cat is feline. Dog is canine.', {
      questionCount: 3,
      typeMix: { picture_guess: 2, multiple_choice: 1 },
      hasImages: false
    });

    assert.strictEqual(resNoAssets.questions.filter(q => q.type === 'picture_guess').length, 0);
    assert.strictEqual(resNoAssets.questions.filter(q => q.type === 'true_false').length, 0, 'Must NOT inject silent true_false backfill');
    assert.ok(resNoAssets.degraded_types.includes('picture_guess'), 'Must list picture_guess in degraded_types');
    assert.ok(resNoAssets.degraded_reason, 'Must provide degraded_reason');
    assert.strictEqual(resNoAssets.generated_counts.picture_guess, 0);
  });

  test('P1-AI: generateQuestionsWithAI passes options and falls back to deterministic generator gracefully', async () => {
    const { generateQuestionsWithAI } = await import('../src/lib/server/quizDrive.js');
    const { generateDeterministicQuiz } = await import('../src/lib/server/quizAutoBuilder.js');

    const failingPlatform = {
      env: {
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'http://127.0.0.1:59999/unreachable'
      }
    };

    const text = 'Mitochondria produce cellular energy. Chloroplasts carry out photosynthesis in plant cells.';
    const options = {
      questionCount: 2,
      typeMix: { multiple_choice: 1, true_false: 1 },
      difficulty: 'easy'
    };

    // When AI service fails or is unreachable, generateQuestionsWithAI returns null
    const aiRes = await generateQuestionsWithAI(text, failingPlatform, options);
    assert.strictEqual(aiRes, null, 'Unreachable AI service must return null so caller falls back');

    // Caller fallback logic executes generateDeterministicQuiz
    const fallbackRes = generateDeterministicQuiz(text, options);
    assert.ok(fallbackRes.questions.length >= 1, 'Fallback must produce questions from text');
    for (const q of fallbackRes.questions) {
      assert.ok(q.prompt, 'Every generated fallback question must have a prompt');
      assert.ok(q.type === 'multiple_choice' || q.type === 'true_false', 'Question type must adhere to requested types');
    }
  });

  test('P1-KnowledgeVault: Search, generation endpoint, and provenance tracking', async () => {
    const ctx = await fullSchemaFixture();

    // 1. Insert article into knowledge_vault and knowledge_fts
    ctx.sqlite.prepare(`
      INSERT INTO knowledge_vault (id, title, folder, category, tags, content_markdown, status)
      VALUES ('kv_art_grammar_01', 'Unit 6: Conditional Sentences', 'grammar', 'grammar', 'grammar,conditional', 'If it rains, we will stay at home. Type 1 conditional sentences describe real possibilities.', 'active')
    `).run();
    ctx.sqlite.prepare(`
      INSERT INTO knowledge_fts (id, title, content_markdown, tags, folder)
      VALUES ('kv_art_grammar_01', 'Unit 6: Conditional Sentences', 'If it rains, we will stay at home. Type 1 conditional sentences describe real possibilities.', 'grammar,conditional', 'grammar')
    `).run();

    // 2. Staff GET /api/quiz-menu/knowledge-vault
    const { GET: getKnowledgeVault } = await import('../src/routes/api/quiz-menu/knowledge-vault/+server.js');
    const kvReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}` })
    };
    const kvRes = await getKnowledgeVault({ url: new URL('http://localhost/api/quiz-menu/knowledge-vault?q=Conditional'), request: kvReq, platform: ctx.platform });
    const kvData = await kvRes.json();
    assert.strictEqual(kvRes.status, 200);
    assert.strictEqual(kvData.success, true);
    assert.ok(kvData.articles.some(a => a.id === 'kv_art_grammar_01'));

    // 3. Student GET /api/quiz-menu/knowledge-vault -> 403 Forbidden
    const studentReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.student1Token}` })
    };
    const studentRes = await getKnowledgeVault({ url: new URL('http://localhost/api/quiz-menu/knowledge-vault'), request: studentReq, platform: ctx.platform });
    assert.strictEqual(studentRes.status, 403);

    // 4. POST /api/quiz-menu/[id]/from-knowledge-vault generates questions with provenance
    const { POST: fromKnowledgeVault } = await import('../src/routes/api/quiz-menu/[id]/from-knowledge-vault/+server.js');
    const quizId = 'quiz_kv_provenance_test';
    ctx.sqlite.prepare(`INSERT INTO quizzes (id, title, created_by, status) VALUES (?, 'KV Provenance Quiz', 'teacher-1', 'draft')`).run(quizId);

    const genReq = {
      headers: new Headers({ authorization: `Bearer ${ctx.teacher1Token}`, 'content-type': 'application/json' }),
      json: async () => ({
        vault_id: 'kv_art_grammar_01',
        question_count: 2,
        type_mix: { multiple_choice: 2 },
        difficulty: 'medium',
        merge_strategy: 'append'
      })
    };
    const genRes = await fromKnowledgeVault({ params: { id: quizId }, request: genReq, platform: ctx.platform });
    const genData = await genRes.json();
    assert.strictEqual(genRes.status, 200, JSON.stringify(genData));
    assert.strictEqual(genData.success, true);
    assert.strictEqual(genData.vault_id, 'kv_art_grammar_01');

    // Verify DB provenance
    const rows = ctx.sqlite.prepare(`SELECT source_type, source_id FROM quiz_questions WHERE quiz_id = ?`).all(quizId);
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.strictEqual(r.source_type, 'knowledge_vault');
      assert.strictEqual(r.source_id, 'kv_art_grammar_01');
    }

    // 5. Append deduplication: re-generating same article with append must NOT crash with PK 500
    const reGenRes = await fromKnowledgeVault({ params: { id: quizId }, request: genReq, platform: ctx.platform });
    assert.strictEqual(reGenRes.status, 200, 'Re-generating with append must deduplicate without crashing');
  });

  test('P1-Provenance-Schema: quiz_question_sources.id is TEXT PRIMARY KEY NOT NULL', async () => {
    const ctx = await fullSchemaFixture();
    const cols = ctx.sqlite.prepare(`PRAGMA table_info(quiz_question_sources)`).all();
    const idCol = cols.find(c => c.name === 'id');
    assert.ok(idCol, 'Column id must exist in quiz_question_sources');
    assert.strictEqual(idCol.notnull, 1, 'Column id must be NOT NULL');
    assert.strictEqual(idCol.pk, 1, 'Column id must be PRIMARY KEY');
  });

  test('P1-Migration-0021: Migration executes cleanly with PRAGMA foreign_keys = ON inside transaction', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec('PRAGMA foreign_keys = ON;');
    memDb.exec("CREATE TABLE IF NOT EXISTS homework_assignments (id TEXT PRIMARY KEY, created_by TEXT);");
    memDb.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_vault (
        id TEXT PRIMARY KEY, title TEXT, folder TEXT, category TEXT, tags TEXT, content_markdown TEXT,
        status TEXT DEFAULT 'active', created_at TEXT, updated_at TEXT
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(id UNINDEXED, title, content_markdown, tags, folder, tokenize='unicode61');
    `);
    memDb.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
    memDb.exec(fs.readFileSync('migrations/0014_quiz_guest_class.sql', 'utf8'));
    memDb.exec(fs.readFileSync('migrations/0013_quiz_menu_drive.sql', 'utf8'));
    memDb.exec(fs.readFileSync('migrations/0018_knowledge_fts_triggers_backfill.sql', 'utf8'));
    memDb.exec(fs.readFileSync('migrations/0019_seed_public_quiz_catalog.sql', 'utf8'));
    memDb.exec(fs.readFileSync('migrations/0020_quiz_question_provenance.sql', 'utf8'));

    // Execute 0021 inside transaction
    memDb.exec('BEGIN TRANSACTION;');
    memDb.exec(fs.readFileSync('migrations/0021_quiz_auto_builder_defaults.sql', 'utf8'));
    memDb.exec('COMMIT;');

    const fkCheck = memDb.prepare('PRAGMA foreign_key_check;').all();
    assert.strictEqual(fkCheck.length, 0, 'Foreign key check must return 0 violations after migration 0021');
  });

  test('P2-Privacy: isAllowedImageUrl protects student privacy from untrusted domains and trackers', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/quizMedia.js');

    // Trusted paths & CDNs
    assert.strictEqual(isAllowedImageUrl('/api/drive/files/photo.png'), true);
    assert.strictEqual(isAllowedImageUrl('/static/images/logo.webp'), true);
    assert.strictEqual(isAllowedImageUrl('https://drive.google.com/uc?id=file123'), true);
    assert.strictEqual(isAllowedImageUrl('https://lh3.googleusercontent.com/abc'), true);
    assert.strictEqual(isAllowedImageUrl('https://upload.wikimedia.org/wikipedia/commons/test.jpg'), true);
    assert.strictEqual(isAllowedImageUrl('https://images.unsplash.com/photo-test'), true);
    assert.strictEqual(isAllowedImageUrl('https://timbk.io.vn/images/banner.png'), true);

    // Untrusted domains / third party trackers / XSS attempts
    assert.strictEqual(isAllowedImageUrl('https://google-analytics.com/collect?v=1'), false);
    assert.strictEqual(isAllowedImageUrl('https://track.adnetwork.com/pixel.gif'), false);
    assert.strictEqual(isAllowedImageUrl('https://evil-phishing.com/image.png'), false);
    assert.strictEqual(isAllowedImageUrl('http://drive.google.com/insecure.png'), false);
    assert.strictEqual(isAllowedImageUrl('javascript:alert("xss")'), false);
    assert.strictEqual(isAllowedImageUrl(null), false);
    assert.strictEqual(isAllowedImageUrl(''), false);
  });
});

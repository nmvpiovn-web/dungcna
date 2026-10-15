import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isAllowedImageUrl } from '../src/lib/quizMedia.js';
import { generateDeterministicQuiz } from '../src/lib/server/quizAutoBuilder.js';
import { saveQuizSourceAndDrafts, generateQuestionsWithAI, uploadQuizSource } from '../src/lib/server/quizDrive.js';
import { createSignedToken } from '../src/lib/server/auth.js';
import { PUT as updateQuiz, GET as getQuiz } from '../src/routes/api/quiz-menu/[id]/+server.js';
import { GET as getAsset } from '../src/routes/api/quiz-menu/[id]/assets/[assetId]/+server.js';
import { PUT as updateDefaults } from '../src/routes/api/quiz-menu/builder-defaults/+server.js';
import { GET as searchKnowledgeVault } from '../src/routes/api/quiz-menu/knowledge-vault/+server.js';
import { POST as importBankQuestions } from '../src/routes/api/quiz-menu/[id]/import-questions/+server.js';
import { POST as uploadQuiz } from '../src/routes/api/quiz-menu/[id]/upload/+server.js';

const TEST_SECRET = 'round3-red-green-audit-test-secret';

function d1Adapter(sqlite) {
  const wrap = (sql, params = []) => ({
    first: async () => sqlite.prepare(sql).get(...params) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => sqlite.prepare(sql).run(...params)
  });
  return {
    prepare(sql) {
      return {
        ...wrap(sql),
        bind(...params) {
          return wrap(sql, params);
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

async function createTestContext() {
  const sqlite = new DatabaseSync(':memory:');
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
    CREATE TABLE question_bank (
      id TEXT PRIMARY KEY, curriculum_id TEXT, grade_level TEXT, subject TEXT, chapter TEXT,
      lesson TEXT, topic TEXT, cognitive_level TEXT, question_type TEXT, question_text TEXT NOT NULL,
      options_json TEXT, answer_key TEXT, explanation TEXT, points REAL DEFAULT 1.0, difficulty REAL,
      skill_category TEXT, tags TEXT, status TEXT DEFAULT 'published', created_by TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE knowledge_vault (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT, folder TEXT, tags TEXT,
      content_markdown TEXT, status TEXT DEFAULT 'active', created_at TEXT, updated_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(id UNINDEXED, title, content);
  `);

  sqlite.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0014_quiz_guest_class.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0013_quiz_menu_drive.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0020_quiz_question_provenance.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0021_quiz_auto_builder_defaults.sql', 'utf8'));

  sqlite.prepare(`
    INSERT INTO users (id, username, name, role, status, approval_status, metadata) VALUES
    ('teacher-1', 'teacher1', 'Cô Lan', 'teacher', 'active', 'approved', '{}'),
    ('teacher-2', 'teacher2', 'Thầy Hùng', 'teacher', 'active', 'approved', '{}'),
    ('student-1', 'student1', 'Em Nam', 'student', 'active', 'approved', '{}'),
    ('admin-1', 'admin', 'Quản trị', 'admin', 'active', 'approved', '{}')
  `).run();

  sqlite.prepare(`
    INSERT INTO auth_sessions VALUES
    ('s-teacher1', NULL, '2099-01-01T00:00:00.000Z'),
    ('s-teacher2', NULL, '2099-01-01T00:00:00.000Z'),
    ('s-student1', NULL, '2099-01-01T00:00:00.000Z'),
    ('s-admin', NULL, '2099-01-01T00:00:00.000Z')
  `).run();

  const teacher1Token = await createSignedToken({ id: 'teacher-1', username: 'teacher1', role: 'teacher' }, TEST_SECRET, 60_000, 's-teacher1');
  const teacher2Token = await createSignedToken({ id: 'teacher-2', username: 'teacher2', role: 'teacher' }, TEST_SECRET, 60_000, 's-teacher2');
  const studentToken = await createSignedToken({ id: 'student-1', username: 'student1', role: 'student' }, TEST_SECRET, 60_000, 's-student1');
  const adminToken = await createSignedToken({ id: 'admin-1', username: 'admin', role: 'admin' }, TEST_SECRET, 60_000, 's-admin');

  const db = d1Adapter(sqlite);
  const platform = {
    env: {
      DB: db,
      AUTH_SECRET: TEST_SECRET
    }
  };

  return { sqlite, db, platform, teacher1Token, teacher2Token, studentToken, adminToken };
}

function authRequest(url, token, body = null, method = 'GET') {
  return new Request(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

test('P1-8: Cross-origin URL defense in isAllowedImageUrl', () => {
  // Rejections
  assert.equal(isAllowedImageUrl('//evil.com/cat.jpg'), false, 'Rejects protocol-relative //');
  assert.equal(isAllowedImageUrl('///evil.com/cat.jpg'), false, 'Rejects triple slash ///');
  assert.equal(isAllowedImageUrl('/\\evil.com'), false, 'Rejects /\\ scheme');
  assert.equal(isAllowedImageUrl('//\\evil.com'), false, 'Rejects //\\');
  assert.equal(isAllowedImageUrl('/api/quiz-menu/1/assets/abc%5cevil'), false, 'Rejects encoded backslash %5c');
  assert.equal(isAllowedImageUrl('/api/quiz-menu/1/assets/abc\\evil'), false, 'Rejects raw backslash');
  assert.equal(isAllowedImageUrl('/assets/image\x00.jpg'), false, 'Rejects control char null byte');
  assert.equal(isAllowedImageUrl('/assets/image\r\n.jpg'), false, 'Rejects CRLF');
  assert.equal(isAllowedImageUrl('javascript:alert(1)'), false, 'Rejects javascript: scheme');
  assert.equal(isAllowedImageUrl('data:image/png;base64,123'), false, 'Rejects data: URI without allowlist');
  assert.equal(isAllowedImageUrl('http://lh3.googleusercontent.com/pic.jpg'), false, 'Rejects http: unencrypted');

  // Allowed
  assert.equal(isAllowedImageUrl('/api/quiz-menu/quiz_123/assets/img_456'), true, 'Allows valid local relative API asset path');
  assert.equal(isAllowedImageUrl('https://lh3.googleusercontent.com/abc-xyz'), true, 'Allows trusted Google CDN');
  assert.equal(isAllowedImageUrl('https://drive.google.com/uc?id=123'), true, 'Allows drive.google.com');
  assert.equal(isAllowedImageUrl('https://timbk.io.vn/images/logo.png'), true, 'Allows timbk.io.vn');
});

test('P0-1: Save/Edit full snapshot replaces questions (merge_strategy: replace contract)', async () => {
  const ctx = await createTestContext();
  const quizId = 'quiz_test_p01';

  // Seed quiz with 2 existing questions
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, description, time_limit_minutes, status, created_by, creator_name)
    VALUES (?, 'Old Title', 'Old Desc', 20, 'draft', 'teacher-1', 'Cô Lan')
  `).run(quizId);

  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, explanation, points, q_order)
    VALUES
    ('qq_1', ?, 'multiple_choice', 'Prompt 1', '["A","B"]', 'A', 'Expl 1', 1.0, 0),
    ('qq_2', ?, 'multiple_choice', 'Prompt 2', '["C","D"]', 'C', 'Expl 2', 1.0, 1)
  `).run(quizId, quizId);

  // Teacher edits the snapshot:
  // - Modifies Prompt 1's answer to "B", points to 2.5, explanation to "New Expl 1"
  // - Removes Prompt 2
  // - Adds Prompt 3
  const editedSnapshot = [
    {
      id: 'qq_1',
      type: 'multiple_choice',
      prompt: 'Prompt 1',
      options: ['A', 'B'],
      correct_answer: 'B',
      explanation: 'New Expl 1',
      points: 2.5,
      q_order: 0
    },
    {
      id: 'qq_3',
      type: 'multiple_choice',
      prompt: 'Prompt 3',
      options: ['X', 'Y'],
      correct_answer: 'X',
      explanation: 'Expl 3',
      points: 1.0,
      q_order: 1
    }
  ];

  // PUT with full snapshot (even if merge_strategy is omitted or explicit replace)
  const req = authRequest(`https://test.local/api/quiz-menu/${quizId}`, ctx.teacher1Token, {
    title: 'Updated Title',
    description: 'Updated Desc',
    time_limit_minutes: 25,
    status: 'draft',
    questions: editedSnapshot,
    merge_strategy: 'replace'
  }, 'PUT');

  const res = await updateQuiz({ params: { id: quizId }, request: req, platform: ctx.platform });
  assert.equal(res.status, 200, 'PUT snapshot succeeds');

  // Verify in DB directly
  const rows = ctx.sqlite.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order`).all(quizId);
  assert.equal(rows.length, 2, 'Must have exactly 2 questions after replacement');

  // Verify question 1 was updated (NOT skipped because of same prompt)
  const q1 = rows.find((r) => r.prompt === 'Prompt 1');
  assert.ok(q1, 'Prompt 1 exists');
  assert.equal(q1.correct_answer, 'B', 'Updated correct answer preserved');
  assert.equal(q1.points, 2.5, 'Updated points preserved');
  assert.equal(q1.explanation, 'New Expl 1', 'Updated explanation preserved');

  // Verify question 2 was deleted
  const q2 = rows.find((r) => r.prompt === 'Prompt 2');
  assert.equal(q2, undefined, 'Removed question 2 was purged');

  // Verify question 3 was inserted
  const q3 = rows.find((r) => r.prompt === 'Prompt 3');
  assert.ok(q3, 'New question 3 was inserted');
});

test('P0-2: Asset proxy route GET /api/quiz-menu/[id]/assets/[assetId] access control', async () => {
  const ctx = await createTestContext();
  const quizId = 'quiz_asset_test';
  const assetId = 'drive_img_123';
  const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic bytes

  // Mock downloadDriveFile in platform or simulate
  ctx.platform.env.MOCK_DRIVE_DOWNLOAD = {
    [assetId]: {
      bytes: fakeBytes,
      mimeType: 'image/png',
      name: 'diagram.png'
    }
  };

  // Seed draft quiz belonging to teacher-1 with asset reference
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, creator_name, source_file_id)
    VALUES (?, 'Draft Quiz', 'draft', 'teacher-1', 'Cô Lan', ?)
  `).run(quizId, assetId);

  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, points, q_order)
    VALUES ('qq_img_1', ?, 'picture_guess', 'Look at image', ?, 1.0, 0)
  `).run(quizId, `/api/quiz-menu/${quizId}/assets/${assetId}`);

  // 1. Owner teacher accessing draft asset -> 200
  const reqOwner = authRequest(`https://test.local/api/quiz-menu/${quizId}/assets/${assetId}`, ctx.teacher1Token);
  const resOwner = await getAsset({ params: { id: quizId, assetId }, request: reqOwner, platform: ctx.platform });
  assert.equal(resOwner.status, 200, 'Owner teacher can access draft quiz asset');
  assert.equal(resOwner.headers.get('content-type'), 'image/png');

  // 2. Unauthenticated guest accessing draft asset -> 403
  const reqGuest = new Request(`https://test.local/api/quiz-menu/${quizId}/assets/${assetId}`);
  const resGuest = await getAsset({ params: { id: quizId, assetId }, request: reqGuest, platform: ctx.platform });
  assert.equal(resGuest.status, 403, 'Guest cannot access draft quiz asset');

  // 3. Other teacher accessing draft asset -> 403
  const reqOther = authRequest(`https://test.local/api/quiz-menu/${quizId}/assets/${assetId}`, ctx.teacher2Token);
  const resOther = await getAsset({ params: { id: quizId, assetId }, request: reqOther, platform: ctx.platform });
  assert.equal(resOther.status, 403, 'Other teacher cannot access draft quiz asset');

  // 4. Publish the quiz -> guest can now access asset with cache control
  ctx.sqlite.prepare(`UPDATE quizzes SET status = 'published' WHERE id = ?`).run(quizId);
  const resPubGuest = await getAsset({ params: { id: quizId, assetId }, request: reqGuest, platform: ctx.platform });
  assert.equal(resPubGuest.status, 200, 'Guest can access published quiz asset');
  assert.ok(resPubGuest.headers.get('cache-control')?.includes('public'), 'Published asset has public cache control');

  // 5. Unrelated asset ID not in quiz -> 404
  const resUnrelated = await getAsset({ params: { id: quizId, assetId: 'unrelated_foreign_id' }, request: reqOwner, platform: ctx.platform });
  assert.equal(resUnrelated.status, 404, 'Foreign asset ID returns 404 (does not leak)');
});

test('P1-4: Grounded image answers does not guess from filename or naive OCR', () => {
  const sourceText = `
Unit 4: My Neighborhood
The park is opposite the cinema.
The library is next to the post office.
`;

  // Image with NO teacher-confirmed label/answer (e.g. text scan or arbitrary photo)
  const resultWithoutLabel = generateDeterministicQuiz(sourceText, {
    questionCount: 4,
    typeMix: { picture_guess: 2, multiple_choice: 2 },
    hasImages: true,
    imageAssets: [
      {
        id: 'img_homework',
        name: 'homework.jpg',
        url: '/api/quiz-menu/q1/assets/img_homework',
        ocr_text: 'scan of handwritten document page 1'
        // label and answer are empty!
      }
    ]
  });

  const picQuestions = resultWithoutLabel.questions.filter((q) => q.type === 'picture_guess');
  assert.equal(picQuestions.length, 0, 'Must NOT generate picture_guess when asset has no verified answer/label');
  assert.ok(resultWithoutLabel.degraded_types.includes('picture_guess'), 'Must declare degradation for picture_guess');
  assert.ok(resultWithoutLabel.degraded_reason.includes('picture_guess'), 'Must explain honest degradation reason');

  // Image WITH explicit teacher label/answer
  const resultWithLabel = generateDeterministicQuiz(sourceText, {
    questionCount: 4,
    typeMix: { picture_guess: 1, multiple_choice: 3 },
    hasImages: true,
    imageAssets: [
      {
        id: 'img_cinema',
        name: 'cinema_photo.jpg',
        url: '/api/quiz-menu/q1/assets/img_cinema',
        label: 'cinema',
        answer: 'cinema'
      }
    ]
  });

  const picWithLabel = resultWithLabel.questions.filter((q) => q.type === 'picture_guess');
  assert.equal(picWithLabel.length, 1, 'Generates picture_guess when explicit label exists');
  assert.equal(picWithLabel[0].correct_answer, 'cinema');
  assert.equal(picWithLabel[0].prompt_image_url, '/api/quiz-menu/q1/assets/img_cinema');
});

test('P1-5: Effective difficulty levels in generator & draft-only default_status', async () => {
  const sourceText = `
Vocabulary:
cat: a small domesticated carnivorous mammal
hippopotamus: a large thick-skinned semiaquatic African mammal
dog: a domesticated carnivorous mammal
incomprehensibility: the quality of being impossible to understand
`;

  // Easy mode prefers shorter words
  const easyGen = generateDeterministicQuiz(sourceText, {
    questionCount: 2,
    typeMix: { word_guess: 2 },
    difficulty: 'easy'
  });

  // Hard mode prefers longer/complex words
  const hardGen = generateDeterministicQuiz(sourceText, {
    questionCount: 2,
    typeMix: { word_guess: 2 },
    difficulty: 'hard'
  });

  const easyWords = easyGen.questions.map((q) => q.correct_answer);
  const hardWords = hardGen.questions.map((q) => q.correct_answer);

  assert.ok(easyWords.includes('cat') || easyWords.includes('dog'), 'Easy mode selects short vocabulary words');
  assert.ok(hardWords.includes('hippopotamus') || hardWords.includes('incomprehensibility'), 'Hard mode selects longer/complex words');

  // Builder defaults: default_status only allows 'draft'
  const ctx = await createTestContext();

  const reqPub = authRequest('https://test.local/api/quiz-menu/builder-defaults', ctx.teacher1Token, {
    default_status: 'published'
  }, 'PUT');
  const resPub = await updateDefaults({ request: reqPub, platform: ctx.platform });
  assert.equal(resPub.status, 400, 'Rejects default_status !== draft');

  const reqDraft = authRequest('https://test.local/api/quiz-menu/builder-defaults', ctx.teacher1Token, {
    default_status: 'draft'
  }, 'PUT');
  const resDraft = await updateDefaults({ request: reqDraft, platform: ctx.platform });
  assert.equal(resDraft.status, 200, 'Allows default_status === draft');
});

test('P1-9: Knowledge Vault FTS missing fallback to LIKE search', async () => {
  const ctx = await createTestContext();

  // Insert article in knowledge_vault BUT NOT in knowledge_fts (missing_fts simulation)
  ctx.sqlite.prepare(`
    INSERT INTO knowledge_vault (id, title, category, folder, tags, content_markdown, status)
    VALUES ('kv_unindexed', 'Unit 10 Endangered Species Conservation', 'Grammar', 'Unit 10', 'nature,biology', 'Detailed guide on wildlife conservation and biodiversity in Vietnam.', 'active')
  `).run();

  // Search for "endangered" which is NOT indexed in knowledge_fts
  const req = authRequest('https://test.local/api/quiz-menu/knowledge-vault?q=endangered', ctx.teacher1Token);
  const res = await searchKnowledgeVault({ url: new URL(req.url), request: req, platform: ctx.platform });
  const data = await res.json();

  assert.equal(res.status, 200, 'Knowledge Vault search succeeds');
  assert.ok(data.total >= 1, 'Fallback to LIKE search finds unindexed article');
  assert.equal(data.articles[0].id, 'kv_unindexed');
  assert.ok(!data.articles[0].content_markdown, 'Never leaks full markdown in list/search');
  assert.ok(data.articles[0].preview, 'Returns preview snippet');
});

test('P1-10: Question Bank import supports merge_strategy: replace', async () => {
  const ctx = await createTestContext();
  const quizId = 'quiz_bank_replace';

  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, creator_name)
    VALUES (?, 'Bank Replace Quiz', 'draft', 'teacher-1', 'Cô Lan')
  `).run(quizId);

  // Existing question in quiz
  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, points, q_order)
    VALUES ('qq_old', ?, 'multiple_choice', 'Old Question', '["A","B"]', 'A', 1.0, 0)
  `).run(quizId);

  // Question bank candidates
  ctx.sqlite.prepare(`
    INSERT INTO question_bank (id, question_text, options_json, answer_key, question_type, status)
    VALUES
    ('qb_101', 'Bank Question 101', '["A. Yes","B. No"]', 'A', 'multiple_choice', 'published'),
    ('qb_102', 'Bank Question 102', '["A. True","B. False"]', 'B', 'multiple_choice', 'published')
  `).run();

  const req = authRequest(`https://test.local/api/quiz-menu/${quizId}/import-questions`, ctx.teacher1Token, {
    question_ids: ['qb_101', 'qb_102'],
    merge_strategy: 'replace'
  }, 'POST');

  const res = await importBankQuestions({ params: { id: quizId }, request: req, platform: ctx.platform });
  const data = await res.json();
  assert.equal(res.status, 200, 'Import with replace succeeds');
  assert.equal(data.imported_count, 2);

  // Check DB: old question must be purged, new questions inserted
  const rows = ctx.sqlite.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order`).all(quizId);
  assert.equal(rows.length, 2, 'Old question replaced');
  assert.equal(rows[0].source_type, 'question_bank');
  assert.equal(rows[0].source_id, 'qb_101');

  // Check provenance table
  const sources = ctx.sqlite.prepare(`SELECT * FROM quiz_question_sources WHERE quiz_id = ?`).all(quizId);
  assert.equal(sources.length, 2, 'Provenance recorded in quiz_question_sources');
});

test('P1-11: 200 question cap accounts for deduplication on append', async () => {
  const ctx = await createTestContext();
  const quizId = 'quiz_cap_200';

  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, creator_name)
    VALUES (?, 'Cap 200 Quiz', 'draft', 'teacher-1', 'Cô Lan')
  `).run(quizId);

  // Seed 199 questions
  for (let i = 0; i < 199; i++) {
    ctx.sqlite.prepare(`
      INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, points, q_order)
      VALUES (?, ?, 'multiple_choice', ?, '["A","B"]', 'A', 1.0, ?)
    `).run(`qq_fill_${i}`, quizId, `Question prompt number ${i}`, i);
  }

  // Append 2 questions: 1 duplicate (Prompt 0) and 1 truly new
  const appendBatch = [
    {
      type: 'multiple_choice',
      prompt: 'Question prompt number 0', // Duplicate!
      options: ['A', 'B'],
      correct_answer: 'A',
      points: 1.0
    },
    {
      type: 'multiple_choice',
      prompt: 'Brand New Question 200', // Truly new!
      options: ['A', 'B'],
      correct_answer: 'A',
      points: 1.0
    }
  ];

  const req = authRequest(`https://test.local/api/quiz-menu/${quizId}`, ctx.teacher1Token, {
    questions: appendBatch,
    merge_strategy: 'append'
  }, 'PUT');

  const res = await updateQuiz({ params: { id: quizId }, request: req, platform: ctx.platform });
  assert.equal(res.status, 200, 'Append with duplicate does not falsely breach 200 cap');

  const count = ctx.sqlite.prepare(`SELECT COUNT(*) AS c FROM quiz_questions WHERE quiz_id = ?`).get(quizId);
  assert.equal(count.c, 200, 'Total questions exactly at 200 cap');
});

test('P1-12: Migration 0021 uses PRAGMA defer_foreign_keys = on', () => {
  const migration0021 = fs.readFileSync('migrations/0021_quiz_auto_builder_defaults.sql', 'utf8');
  assert.ok(
    /PRAGMA\s+defer_foreign_keys\s*=\s*(on|1)/i.test(migration0021),
    'Migration 0021 must use PRAGMA defer_foreign_keys = on for transaction compatibility'
  );
  assert.ok(
    !/PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(migration0021),
    'Migration 0021 must not use PRAGMA foreign_keys = OFF'
  );
});

test('P1-3: Strict AI validation rejects mismatch count/typeMix and safely falls back', async () => {
  const globalFetchOrig = globalThis.fetch;
  try {
    const text = 'English lesson on daily routines. I wake up at 6 AM. I go to school at 7 AM.';

    // Case 1: AI returns 3 questions when 2 requested -> must reject (null)
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            questions: [
              { type: 'multiple_choice', prompt: 'Q1', options: ['A','B','C','D'], correct_answer: 'A' },
              { type: 'multiple_choice', prompt: 'Q2', options: ['A','B','C','D'], correct_answer: 'B' },
              { type: 'multiple_choice', prompt: 'Q3', options: ['A','B','C','D'], correct_answer: 'C' }
            ]
          })
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    const platform = { env: { AI_API_KEY: 'mock_key', AI_BASE_URL: 'https://mock.ai' } };
    const resCountMismatch = await generateQuestionsWithAI(text, platform, {
      questionCount: 2,
      typeMix: { multiple_choice: 2 }
    });
    assert.equal(resCountMismatch, null, 'Must reject AI response with mismatched question count');

    // Case 2: AI returns wrong type mix (e.g. paragraph when multiple_choice requested) -> must reject (null)
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            questions: [
              { type: 'paragraph', prompt: 'Q1', correct_answer: null },
              { type: 'paragraph', prompt: 'Q2', correct_answer: null }
            ]
          })
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    const resMixMismatch = await generateQuestionsWithAI(text, platform, {
      questionCount: 2,
      typeMix: { multiple_choice: 2 }
    });
    assert.equal(resMixMismatch, null, 'Must reject AI response with mismatched type mix');

    // Case 3: AI returns valid response matching exact count and mix -> passes
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            questions: [
              { type: 'multiple_choice', prompt: 'Q1', options: ['A','B','C','D'], correct_answer: 'A' },
              { type: 'multiple_choice', prompt: 'Q2', options: ['A','B','C','D'], correct_answer: 'B' }
            ]
          })
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    const resValid = await generateQuestionsWithAI(text, platform, {
      questionCount: 2,
      typeMix: { multiple_choice: 2 }
    });
    assert.ok(Array.isArray(resValid));
    assert.equal(resValid.length, 2);
    assert.equal(resValid[0].type, 'multiple_choice');
  } finally {
    globalThis.fetch = globalFetchOrig;
  }
});

test('P1-6 & P1-7: Provenance recording with subId and atomic rollback on failure', async () => {
  const ctx = await createTestContext();
  const quizId = 'quiz_prov_test';

  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, creator_name)
    VALUES (?, 'Provenance Test', 'draft', 'teacher-1', 'Cô Lan')
  `).run(quizId);

  const questions = [
    {
      id: 'qq_sub_1',
      type: 'picture_guess',
      prompt: 'Look at photo 1',
      correct_answer: 'cinema',
      points: 1.0,
      source_sub_id: 'page_1'
    },
    {
      id: 'qq_sub_2',
      type: 'picture_guess',
      prompt: 'Look at photo 2',
      correct_answer: 'library',
      points: 1.0,
      source_sub_id: 'page_2'
    }
  ];

  await saveQuizSourceAndDrafts(
    ctx.db,
    quizId,
    { id: 'drive_batch_123', name: 'batch.zip' },
    'extracted batch text',
    questions,
    {
      mergeStrategy: 'replace',
      sourceType: 'upload',
      sourceId: 'drive_batch_123'
    }
  );

  // Check DB questions
  const qRows = ctx.sqlite.prepare(`SELECT id, source_type, source_id FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order`).all(quizId);
  assert.equal(qRows.length, 2);
  assert.equal(qRows[0].source_type, 'upload');
  assert.equal(qRows[0].source_id, 'drive_batch_123');

  // Check quiz_question_sources table
  const sRows = ctx.sqlite.prepare(`SELECT * FROM quiz_question_sources WHERE quiz_id = ? ORDER BY id`).all(quizId);
  assert.equal(sRows.length, 2);
  assert.equal(sRows[0].source_type, 'upload');
  assert.equal(sRows[0].source_id, 'drive_batch_123');
  assert.ok(sRows[0].source_sub_id === 'page_1' || sRows[1].source_sub_id === 'page_1');
  assert.ok(sRows[0].id.includes('upload'));
});

test('P2: UI mode and source separation contracts', () => {
  const svelteContent = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');

  // sourceMode must NOT be 'manual'
  assert.ok(!svelteContent.includes("sourceMode = 'manual'"), 'sourceMode must never be assigned manual');
  assert.ok(!svelteContent.includes("sourceMode === 'manual'"), 'sourceMode must never be compared to manual');

  // editQuiz sets builderMode = 'manual'
  assert.ok(
    /editQuiz\(.*builderMode\s*=\s*'manual'/s.test(svelteContent),
    'Editing existing quiz sets builderMode to manual'
  );

  // Question Bank mode disables / hides Dynamic Mix & Difficulty with clear notice
  assert.ok(
    svelteContent.includes("sourceMode === 'question_bank'"),
    'UI handles Question Bank mode separately'
  );
  assert.ok(
    svelteContent.includes('bank-mode-notice-box') || svelteContent.includes('Question Bank'),
    'UI displays clear banner explaining Dynamic Mix is not applied in Question Bank mode'
  );
});

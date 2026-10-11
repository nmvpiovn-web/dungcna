import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isAllowedImageUrl } from '../src/lib/quizMedia.js';
import { validateQuestion } from '../src/lib/server/quizMenu.js';
import { generateQuestionsWithAI, saveQuizSourceAndDrafts } from '../src/lib/server/quizDrive.js';
import { createSignedToken } from '../src/lib/server/auth.js';
import { PUT as updateQuiz, GET as getQuiz } from '../src/routes/api/quiz-menu/[id]/+server.js';
import { GET as getAsset } from '../src/routes/api/quiz-menu/[id]/assets/[assetId]/+server.js';
import { GET as searchKnowledgeVault } from '../src/routes/api/quiz-menu/knowledge-vault/+server.js';
import { POST as uploadQuiz } from '../src/routes/api/quiz-menu/[id]/upload/+server.js';

const TEST_SECRET = 'round4-red-green-audit-test-secret';

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
    ('s-admin1', NULL, '2099-01-01T00:00:00.000Z')
  `).run();

  const tokenTeacher1 = await createSignedToken({ id: 'teacher-1', username: 'teacher1', role: 'teacher' }, TEST_SECRET, 60_000, 's-teacher1');
  const tokenTeacher2 = await createSignedToken({ id: 'teacher-2', username: 'teacher2', role: 'teacher' }, TEST_SECRET, 60_000, 's-teacher2');
  const tokenStudent1 = await createSignedToken({ id: 'student-1', username: 'student1', role: 'student' }, TEST_SECRET, 60_000, 's-student1');
  const tokenAdmin1 = await createSignedToken({ id: 'admin-1', username: 'admin', role: 'admin' }, TEST_SECRET, 60_000, 's-admin1');

  const env = {
    DB: d1Adapter(sqlite),
    AUTH_SECRET: TEST_SECRET,
    GOOGLE_DRIVE_FOLDER_ID: 'folder-root-123'
  };

  return { sqlite, env, tokens: { teacher1: tokenTeacher1, teacher2: tokenTeacher2, student1: tokenStudent1, admin1: tokenAdmin1 } };
}

function makeFile(name, type, content = 'Vocabulary: apple: quả táo. banana: quả chuối.') {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer
  };
}

// -------------------------------------------------------------
// P1-2: validateQuestion preserves source_sub_id
// -------------------------------------------------------------
test('P1-2: validateQuestion preserves source_sub_id', () => {
  const input = {
    type: 'picture_guess',
    prompt: 'Nhìn hình đoán từ:',
    prompt_image_url: '/api/quiz-menu/qz_test/assets/asset_apple_123',
    correct_answer: 'apple',
    points: 1,
    source_type: 'upload',
    source_id: 'batch_123',
    source_sub_id: 'asset_apple_123'
  };
  const validated = validateQuestion(input, 0);
  assert.equal(validated.error, undefined);
  assert.equal(validated.value.source_sub_id, 'asset_apple_123');
});

// -------------------------------------------------------------
// P1-1 & P1-2: Multi-image upload behavior, exact provenance, NULL for OCR
// -------------------------------------------------------------
test('P1-1 & P1-2: Multi-image upload with image_labels generates picture_guess with exact asset mapping and NULL for OCR questions', async () => {
  const ctx = await createTestContext();
  const quizId = 'qz_multi_img_r4';
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, created_at, updated_at)
    VALUES (?, 'Quiz Test Multi Image', 'draft', 'teacher-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(quizId);

  const file1 = makeFile('apple.png', 'image/png', 'Vocabulary: apple: quả táo đỏ thơm ngon.');
  const file2 = makeFile('banana.png', 'image/png', 'Vocabulary: banana: quả chuối chín vàng.');

  // Mock Drive API for uploadQuizSource
  let deletedFileIds = [];
  const mockPlatform = {
    env: {
      ...ctx.env,
      GOOGLE_DRIVE_ACCESS_TOKEN: 'mock-token',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@serviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0mock\n-----END RSA PRIVATE KEY-----',
      QUIZ_DRIVE_PARENT_FOLDER_ID: 'root_folder',
      MOCK_DRIVE_DOWNLOAD: {
        'drive_apple_1': { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', name: 'apple.png' },
        'drive_banana_2': { bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/png', name: 'banana.png' }
      }
    }
  };

  // Mock global fetch for Google Drive & OCR in uploadQuizSource
  const origFetch = globalThis.fetch;
  let fileUploadCounter = 0;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/oauth2/v4/token') || urlStr.includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // Handle folder search/creation
    if (urlStr.includes('Quiz%20Uploads') || urlStr.includes('Quiz Uploads')) {
      return new Response(JSON.stringify({ files: [{ id: 'quiz_uploads_folder_id', name: 'Quiz Uploads', mimeType: 'application/vnd.google-apps.folder' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // Handle file upload
    if (urlStr.includes('/drive/v3/files?') && urlStr.includes('uploadType=multipart')) {
      fileUploadCounter++;
      // If convertToDoc temp upload
      if (fileUploadCounter % 2 === 0) {
        return new Response(JSON.stringify({ id: `temp_doc_${fileUploadCounter}`, name: 'temp_doc', mimeType: 'application/vnd.google-apps.document' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const isFile1 = fileUploadCounter === 1;
      const fileId = isFile1 ? 'drive_apple_1' : 'drive_banana_2';
      return new Response(JSON.stringify({ id: fileId, name: isFile1 ? 'apple.png' : 'banana.png', mimeType: 'image/png', parents: ['root_folder'] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/drive/v3/files/') && opts?.method === 'DELETE') {
      const match = urlStr.match(/\/files\/([^?]+)/);
      if (match) deletedFileIds.push(match[1]);
      return new Response('', { status: 204 });
    }
    if (urlStr.includes('/drive/v3/files/drive_apple_1')) {
      return new Response(JSON.stringify({ id: 'drive_apple_1', name: 'apple.png', mimeType: 'image/png' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/drive/v3/files/drive_banana_2')) {
      return new Response(JSON.stringify({ id: 'drive_banana_2', name: 'banana.png', mimeType: 'image/png' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/export?mimeType=text%2Fplain') || urlStr.includes('alt=media')) {
      const text = fileUploadCounter <= 2
        ? 'apple: quả táo đỏ thơm ngon.\nApple is very healthy for daily breakfast.'
        : 'banana: quả chuối chín vàng.\nBanana contains a lot of potassium for energy.';
      return new Response(text, { status: 200 });
    }
    return origFetch ? origFetch(url, opts) : new Response('Not found', { status: 404 });
  };

  try {
    const formData = new Map();
    formData.set('file', file1);
    formData.set('files', [file1, file2]);
    formData.set('question_count', '2');
    formData.set('type_mix', JSON.stringify({ picture_guess: 1, multiple_choice: 1 }));
    formData.set('image_labels', JSON.stringify([
      { name: 'apple.png', label: 'apple', answer: 'apple' },
      { name: 'banana.png', label: 'banana', answer: 'banana' }
    ]));

    const req = {
      headers: new Headers({
        authorization: `Bearer ${ctx.tokens.teacher1}`
      }),
      formData: async () => ({
        get: (k) => formData.get(k) || null,
        getAll: (k) => (k === 'files' ? [file1, file2] : k === 'file' ? [] : [])
      })
    };

    const res = await uploadQuiz({
      params: { id: quizId },
      request: req,
      platform: mockPlatform
    });

    const resText = await res.text();
    const body = JSON.parse(resText);
    if (body.questions?.length !== 2) {
      console.log('DEBUG P1-1 questions:', body.questions, 'report:', body.degraded_types, body.degraded_reason);
    }
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.questions.length, 2);

    const picQ = body.questions.find((q) => q.type === 'picture_guess');
    const mcqQ = body.questions.find((q) => q.type === 'multiple_choice');

    assert.ok(picQ, 'Should generate picture_guess question');
    assert.ok(mcqQ, 'Should generate multiple_choice question');

    // Picture question must map exact asset ID and answer
    assert.equal(picQ.correct_answer, 'apple');
    assert.equal(picQ.prompt_image_url, `/api/quiz-menu/${quizId}/assets/drive_apple_1`);
    assert.equal(picQ.source_sub_id, 'drive_apple_1', 'Picture question must have exact asset ID in source_sub_id');

    // MCQ question must NOT fake source_sub_id with modulo page
    assert.equal(mcqQ.source_sub_id, null, 'OCR non-picture question must have NULL source_sub_id');

    // Verify stored in DB
    const storedPic = ctx.sqlite.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? AND type = 'picture_guess'`).get(quizId);
    assert.equal(storedPic.prompt_image_url, `/api/quiz-menu/${quizId}/assets/drive_apple_1`);

    const storedSource = ctx.sqlite.prepare(`SELECT * FROM quiz_question_sources WHERE quiz_id = ? AND question_id = ?`).get(quizId, picQ.id);
    assert.equal(storedSource?.source_sub_id, 'drive_apple_1', 'quiz_question_sources must preserve exact asset ID');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// -------------------------------------------------------------
// P1-6: Single file upload rollback on downstream failure
// -------------------------------------------------------------
test('P1-6: Single-file upload deletes Drive file when downstream DB/save fails', async () => {
  const ctx = await createTestContext();
  const quizId = 'qz_rollback_test';
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, created_at, updated_at)
    VALUES (?, 'Rollback Quiz', 'draft', 'teacher-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(quizId);

  const file = makeFile('lesson.txt', 'text/plain', 'Vocabulary: apple: quả táo đỏ thơm ngon.\nSentence: Apple is very healthy for breakfast. We should eat an apple every day to keep the doctor away.');

  let deletedDriveId = null;
  const mockPlatform = {
    env: {
      ...ctx.env,
      GOOGLE_DRIVE_ACCESS_TOKEN: 'mock-token',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@serviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0mock\n-----END RSA PRIVATE KEY-----',
      QUIZ_DRIVE_PARENT_FOLDER_ID: 'root_folder'
    }
  };

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/oauth2/v4/token') || urlStr.includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/drive/v3/files?')) {
      return new Response(JSON.stringify({ id: 'file_single_to_delete', name: 'lesson.txt', mimeType: 'text/plain', parents: ['root_folder'] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/drive/v3/files/file_single_to_delete') && opts?.method === 'DELETE') {
      deletedDriveId = 'file_single_to_delete';
      return new Response('', { status: 204 });
    }
    return origFetch ? origFetch(url, opts) : new Response('Not found', { status: 404 });
  };

  try {
    // Inject DB failure by breaking quizzes table or constraints during batch
    const brokenDb = {
      prepare: (sql) => ctx.env.DB.prepare(sql),
      batch: async () => {
        throw new Error('Injected Database Batch Failure');
      }
    };
    mockPlatform.env.DB = brokenDb;

    const req = {
      headers: new Headers({
        authorization: `Bearer ${ctx.tokens.teacher1}`
      }),
      formData: async () => ({
        get: (k) => (k === 'file' ? file : null),
        getAll: (k) => (k === 'file' ? [file] : [])
      })
    };

    const res = await uploadQuiz({
      params: { id: quizId },
      request: req,
      platform: mockPlatform
    });

    assert.equal(res.status, 500);
    assert.equal(deletedDriveId, 'file_single_to_delete', 'Must call removeDriveFile for newly uploaded single file on downstream failure');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// -------------------------------------------------------------
// P1-7: UI Question Bank Replace sends merge_strategy: replace
// -------------------------------------------------------------
test('P1-7: UI page.svelte passes merge_strategy: mergeStrategy on question_bank import and confirms replace', () => {
  const pageCode = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');

  // Verify that autoGenerateQuiz for question_bank passes merge_strategy
  const qbImportBlockMatch = pageCode.match(/sourceMode\s*===\s*['"]question_bank['"][\s\S]*?\/api\/quiz-menu\/\$\{quizId\}\/import-questions[\s\S]*?body:\s*JSON\.stringify\(\{([\s\S]*?)\}\)/);
  assert.ok(qbImportBlockMatch, 'Must find import-questions call in sourceMode === question_bank');
  assert.ok(qbImportBlockMatch[1].includes('merge_strategy'), 'import-questions call must include merge_strategy');
});

// -------------------------------------------------------------
// P1-3 & P1-4: Asset proxy security, MIME restriction, and no wildcard LIKE
// -------------------------------------------------------------
test('P1-3 & P1-4: Asset proxy rejects non-image source files and rejects wildcard/substring assetId', async () => {
  const ctx = await createTestContext();
  const quizId = 'qz_asset_sec_1';
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, source_file_id, created_at, updated_at)
    VALUES (?, 'Published Quiz with DOCX', 'published', 'teacher-1', 'doc_source_secret', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(quizId);

  // Add question referencing an image asset
  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, correct_answer, points, q_order)
    VALUES ('qq_img_1', ?, 'picture_guess', 'Guess:', '/api/quiz-menu/' || ? || '/assets/image_allowed_123', 'apple', 1, 0)
  `).run(quizId, quizId);

  // Mock download Drive
  ctx.env.MOCK_DRIVE_DOWNLOAD = {
    'doc_source_secret': {
      bytes: new Uint8Array([80, 75, 3, 4]),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      name: 'secret_lesson.docx'
    },
    'image_allowed_123': {
      bytes: new Uint8Array([137, 80, 78, 71]),
      mimeType: 'image/png',
      name: 'apple.png'
    }
  };

  // 1. Trying to download source_file_id (docx) must fail (403 or 404), even for published quiz guest
  const resDoc = await getAsset({
    params: { id: quizId, assetId: 'doc_source_secret' },
    request: new Request('http://localhost'),
    platform: { env: ctx.env }
  });
  assert.ok(resDoc.status === 403 || resDoc.status === 404, `Expected 403 or 404 for docx source file download, got ${resDoc.status}`);

  // 2. Substring or wildcard asset ID must return 404 without matching
  const resSubstring = await getAsset({
    params: { id: quizId, assetId: 'image_allowed' },
    request: new Request('http://localhost'),
    platform: { env: ctx.env }
  });
  assert.equal(resSubstring.status, 404, 'Substring assetId must return 404');

  // 3. Exact image download succeeds with nosniff header
  const resImg = await getAsset({
    params: { id: quizId, assetId: 'image_allowed_123' },
    request: new Request('http://localhost'),
    platform: { env: ctx.env }
  });
  assert.equal(resImg.status, 200);
  assert.equal(resImg.headers.get('Content-Type'), 'image/png');
  assert.equal(resImg.headers.get('X-Content-Type-Options'), 'nosniff');
});

// -------------------------------------------------------------
// P1-5: Asset authorization matches Quiz GET authorization
// -------------------------------------------------------------
test('P1-5: Asset authorization matches Quiz GET policy for draft and student enrollment', async () => {
  const ctx = await createTestContext();
  const draftQuizId = 'qz_draft_auth';
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, created_at, updated_at)
    VALUES (?, 'Draft Quiz', 'draft', 'teacher-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(draftQuizId);

  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, correct_answer, points, q_order)
    VALUES ('qq_img_d', ?, 'picture_guess', 'Guess:', '/api/quiz-menu/' || ? || '/assets/asset_draft_img', 'car', 1, 0)
  `).run(draftQuizId, draftQuizId);

  ctx.env.MOCK_DRIVE_DOWNLOAD = {
    'asset_draft_img': { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg', name: 'car.jpg' }
  };

  // A. Draft Quiz Matrix:
  // Guest -> Quiz GET: 404; Asset GET: 404/403
  const guestQuizGet = await getQuiz({ params: { id: draftQuizId }, url: new URL('http://localhost'), request: new Request('http://localhost'), platform: { env: ctx.env } });
  const guestAssetGet = await getAsset({ params: { id: draftQuizId, assetId: 'asset_draft_img' }, request: new Request('http://localhost'), platform: { env: ctx.env } });
  assert.equal(guestQuizGet.status, 404);
  assert.ok(guestAssetGet.status === 404 || guestAssetGet.status === 403);

  // Student -> Quiz GET: 404; Asset GET: 404/403
  const studentReq = new Request('http://localhost', { headers: { authorization: `Bearer ${ctx.tokens.student1}` } });
  const studentQuizGet = await getQuiz({ params: { id: draftQuizId }, url: new URL('http://localhost'), request: studentReq, platform: { env: ctx.env } });
  const studentAssetGet = await getAsset({ params: { id: draftQuizId, assetId: 'asset_draft_img' }, request: studentReq, platform: { env: ctx.env } });
  assert.equal(studentQuizGet.status, 404);
  assert.ok(studentAssetGet.status === 404 || studentAssetGet.status === 403);

  // Non-owner Teacher (teacher-2) -> Quiz GET: 404; Asset GET: 404/403
  const t2Req = new Request('http://localhost', { headers: { authorization: `Bearer ${ctx.tokens.teacher2}` } });
  const t2QuizGet = await getQuiz({ params: { id: draftQuizId }, url: new URL('http://localhost'), request: t2Req, platform: { env: ctx.env } });
  const t2AssetGet = await getAsset({ params: { id: draftQuizId, assetId: 'asset_draft_img' }, request: t2Req, platform: { env: ctx.env } });
  assert.equal(t2QuizGet.status, 404);
  assert.ok(t2AssetGet.status === 404 || t2AssetGet.status === 403);

  // Owner Teacher (teacher-1) -> Quiz GET: 200; Asset GET: 200
  const t1Req = new Request('http://localhost', { headers: { authorization: `Bearer ${ctx.tokens.teacher1}` } });
  const t1QuizGet = await getQuiz({ params: { id: draftQuizId }, url: new URL('http://localhost'), request: t1Req, platform: { env: ctx.env } });
  const t1AssetGet = await getAsset({ params: { id: draftQuizId, assetId: 'asset_draft_img' }, request: t1Req, platform: { env: ctx.env } });
  assert.equal(t1QuizGet.status, 200);
  assert.equal(t1AssetGet.status, 200);

  // B. Published Quiz Student Assignment Isolation:
  const pubQuizId = 'qz_pub_auth';
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, created_at, updated_at)
    VALUES (?, 'Published Assigned Quiz', 'published', 'teacher-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(pubQuizId);

  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, correct_answer, points, q_order)
    VALUES ('qq_img_p', ?, 'picture_guess', 'Guess:', '/api/quiz-menu/' || ? || '/assets/asset_pub_img', 'bus', 1, 0)
  `).run(pubQuizId, pubQuizId);

  ctx.env.MOCK_DRIVE_DOWNLOAD['asset_pub_img'] = { bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/jpeg', name: 'bus.jpg' };

  // Add assignment for a class that student-1 is NOT enrolled in
  ctx.sqlite.prepare(`
    INSERT INTO homework_assignments (id, session_id, class_id, class_name, title, due_date, created_by, source_quiz_id, status)
    VALUES ('hw_1', 'sess_1', 'class_other', 'Lớp 7B', 'BTVN', '2099-01-01', 'teacher-1', ?, 'published')
  `).run(pubQuizId);

  // Student is NOT enrolled in class_other -> Quiz GET: 404; Asset GET: 404/403
  const sPubQuizGet = await getQuiz({ params: { id: pubQuizId }, url: new URL('http://localhost'), request: studentReq, platform: { env: ctx.env } });
  const sPubAssetGet = await getAsset({ params: { id: pubQuizId, assetId: 'asset_pub_img' }, request: studentReq, platform: { env: ctx.env } });
  assert.equal(sPubQuizGet.status, 404);
  assert.ok(sPubAssetGet.status === 404 || sPubAssetGet.status === 403);

  // Now enroll student-1 in class_other actively
  ctx.sqlite.prepare(`
    INSERT INTO class_enrollments (id, user_id, class_id, status)
    VALUES ('enr_1', 'student-1', 'class_other', 'active')
  `).run();

  const sPubQuizGetEnrolled = await getQuiz({ params: { id: pubQuizId }, url: new URL('http://localhost'), request: studentReq, platform: { env: ctx.env } });
  const sPubAssetGetEnrolled = await getAsset({ params: { id: pubQuizId, assetId: 'asset_pub_img' }, request: studentReq, platform: { env: ctx.env } });
  assert.equal(sPubQuizGetEnrolled.status, 200);
  assert.equal(sPubAssetGetEnrolled.status, 200);
});

// -------------------------------------------------------------
// P1-8: Knowledge Vault FTS partial drift
// -------------------------------------------------------------
test('P1-8: Knowledge Vault returns all matching articles even when FTS index drifted (only 1 of 2 indexed)', async () => {
  const ctx = await createTestContext();

  // Insert two articles matching 'wildlife'
  ctx.sqlite.prepare(`
    INSERT INTO knowledge_vault (id, title, category, folder, tags, content_markdown, status, created_at, updated_at)
    VALUES
    ('kv_1', 'Protect Wildlife Unit 10', 'reading', 'Grade 7', 'animals', 'We must protect wildlife in the forest.', 'active', '2026-10-10', '2026-10-10'),
    ('kv_2', 'Endangered Species Unit 11', 'reading', 'Grade 7', 'animals', 'Many rare animals and wildlife are endangered.', 'active', '2026-10-10', '2026-10-10')
  `).run();

  // Index ONLY kv_1 into knowledge_fts (simulating index drift / partial sync)
  ctx.sqlite.prepare(`
    INSERT INTO knowledge_fts (id, title, content)
    VALUES ('kv_1', 'Protect Wildlife Unit 10', 'We must protect wildlife in the forest.')
  `).run();

  const req = new Request('http://localhost/api/quiz-menu/knowledge-vault?q=wildlife', {
    headers: { authorization: `Bearer ${ctx.tokens.teacher1}` }
  });

  const res = await searchKnowledgeVault({
    url: new URL('http://localhost/api/quiz-menu/knowledge-vault?q=wildlife'),
    request: req,
    platform: { env: ctx.env }
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.total, 2, 'Total matching articles should be 2 despite partial FTS drift');
  assert.equal(data.articles.length, 2, 'Should return both matching articles');
  const ids = data.articles.map((a) => a.id).sort();
  assert.deepEqual(ids, ['kv_1', 'kv_2'], 'Must return both kv_1 and kv_2 exactly once without duplicates');
});

// -------------------------------------------------------------
// P2-9: Dedupe and 200 cap in incoming batch
// -------------------------------------------------------------
test('P2-9: 199 existing questions + 2 incoming questions with identical prompt adds exactly 1 and reaches 200', async () => {
  const ctx = await createTestContext();
  const quizId = 'qz_cap_dedupe_r4';
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, created_at, updated_at)
    VALUES (?, 'Cap 200 Dedupe Quiz', 'draft', 'teacher-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(quizId);

  // Insert 199 questions
  for (let i = 0; i < 199; i++) {
    ctx.sqlite.prepare(`
      INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, points, q_order)
      VALUES (?, ?, 'multiple_choice', ?, '["A","B"]', 'A', 1, ?)
    `).run(`qq_exist_${i}`, quizId, `Existing Question Number ${i}`, i);
  }

  // Incoming batch: 2 questions with identical prompt "Brand New Question Alpha"
  const incomingBatch = [
    { type: 'multiple_choice', prompt: 'Brand New Question Alpha', options: ['A', 'B'], correct_answer: 'A', points: 1 },
    { type: 'multiple_choice', prompt: 'Brand New Question Alpha', options: ['A', 'B'], correct_answer: 'A', points: 1 }
  ];

  const req = new Request(`http://localhost/api/quiz-menu/${quizId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.tokens.teacher1}`
    },
    body: JSON.stringify({
      questions: incomingBatch,
      merge_strategy: 'append'
    })
  });

  const res = await updateQuiz({
    params: { id: quizId },
    request: req,
    platform: { env: ctx.env }
  });

  assert.equal(res.status, 200, `Expected 200 OK after deduplicating identical batch items, got ${res.status}`);

  const totalInDb = ctx.sqlite.prepare(`SELECT COUNT(*) as count FROM quiz_questions WHERE quiz_id = ?`).get(quizId).count;
  assert.equal(totalInDb, 200, 'Total questions in DB must be exactly 200');

  // Verify that if two DIFFERENT questions were provided at 199, it rejects with 400
  const exceedingBatch = [
    { type: 'multiple_choice', prompt: 'Another Distinct Question Beta', options: ['A', 'B'], correct_answer: 'A', points: 1 }
  ];
  const reqExceed = new Request(`http://localhost/api/quiz-menu/${quizId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.tokens.teacher1}`
    },
    body: JSON.stringify({
      questions: exceedingBatch,
      merge_strategy: 'append'
    })
  });
  const resExceed = await updateQuiz({
    params: { id: quizId },
    request: reqExceed,
    platform: { env: ctx.env }
  });
  assert.equal(resExceed.status, 400);
});

// -------------------------------------------------------------
// P2-10: Image URL restriction & AI skip >50
// -------------------------------------------------------------
test('P2-10: isAllowedImageUrl rejects arbitrary local endpoints and generateQuestionsWithAI skips AI when count > 50', async () => {
  // 1. isAllowedImageUrl checks
  assert.equal(isAllowedImageUrl('/api/admin/dump'), false, '/api/admin/dump must be rejected');
  assert.equal(isAllowedImageUrl('/api/users/export'), false, '/api/users/export must be rejected');
  assert.equal(isAllowedImageUrl('/api/quiz-menu/qz_123/assets/ast_abc456'), true, 'canonical quiz asset proxy must be allowed');
  assert.equal(isAllowedImageUrl('/images/logo.png'), true, 'static /images/logo.png must be allowed');
  assert.equal(isAllowedImageUrl('/pwa-192x192.png'), true, 'static /pwa-192x192.png must be allowed');
  assert.equal(isAllowedImageUrl('/favicon.ico'), true, 'static /favicon.ico must be allowed');

  // 2. generateQuestionsWithAI checks
  const mockPlatform = {
    env: {
      AI_API_KEY: 'test-fake-key'
    }
  };
  const resultOver50 = await generateQuestionsWithAI('Sample text for questions', mockPlatform, { questionCount: 60 });
  assert.equal(resultOver50, null, 'Must skip AI and return null when questionCount > 50');
});

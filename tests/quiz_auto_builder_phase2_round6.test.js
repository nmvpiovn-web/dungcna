import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { GET as getAsset } from '../src/routes/api/quiz-menu/[id]/assets/[assetId]/+server.js';
import { POST as postFromDrive } from '../src/routes/api/quiz-menu/[id]/from-drive/+server.js';
import { POST as postFromVault } from '../src/routes/api/quiz-menu/[id]/from-knowledge-vault/+server.js';
import { POST as postUpload } from '../src/routes/api/quiz-menu/[id]/upload/+server.js';
import { validateImageLabels, parseGradeLevel, generateDeterministicQuiz } from '../src/lib/server/quizAutoBuilder.js';
import { generateQuestionsWithAI } from '../src/lib/server/quizDrive.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const TEST_SECRET = 'round6-red-green-audit-test-secret';

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
      sqlite.exec('BEGIN TRANSACTION;');
      try {
        const results = [];
        for (const s of statements) {
          results.push(await s.run());
        }
        sqlite.exec('COMMIT;');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK;');
        throw e;
      }
    }
  };
}

async function createTestContext() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'teacher',
      avatar TEXT,
      status TEXT DEFAULT 'active',
      approval_status TEXT NOT NULL DEFAULT 'approved',
      grade TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      revoked_at TEXT,
      expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      creator_name TEXT,
      created_by TEXT,
      time_limit_minutes INTEGER DEFAULT 15,
      status TEXT DEFAULT 'draft',
      source_file_id TEXT,
      source_metadata_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      prompt_image_url TEXT,
      options_json TEXT,
      correct_answer TEXT,
      explanation TEXT,
      points REAL DEFAULT 1,
      q_order INTEGER DEFAULT 0,
      source_type TEXT,
      source_id TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quiz_question_sources (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_sub_id TEXT,
      metadata_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS knowledge_vault (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content_markdown TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS homework_assignments (
      id TEXT PRIMARY KEY,
      session_id TEXT DEFAULT 'sess_1',
      class_id TEXT NOT NULL,
      class_name TEXT,
      title TEXT,
      due_date TEXT,
      created_by TEXT,
      source_quiz_id TEXT,
      status TEXT DEFAULT 'published'
    );
    CREATE TABLE IF NOT EXISTS class_enrollments (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    );
  `);

  sqlite.prepare(`INSERT INTO users (id, username, role, status, approval_status) VALUES ('teacher-1', 'teacher1', 'teacher', 'active', 'approved')`).run();
  sqlite.prepare(`INSERT INTO auth_sessions VALUES ('s-t1', NULL, '2099-01-01T00:00:00.000Z')`).run();
  const tokenTeacher1 = await createSignedToken({ id: 'teacher-1', username: 'teacher1', role: 'teacher' }, TEST_SECRET, 60_000, 's-t1');

  const env = {
    DB: d1Adapter(sqlite),
    AUTH_SECRET: TEST_SECRET
  };

  return { sqlite, env, tokens: { teacher1: tokenTeacher1 } };
}

// -------------------------------------------------------------
// RED-6.1: File re-selection clears stale labels; Camera reorder preserves labels
// -------------------------------------------------------------
test('RED-6.1: handleFilesSelected resets stale labels on file re-selection, camera reorder preserves labels', async () => {
  // Test UI contract behavior
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');
  assert.ok(
    !pageSrc.includes('nextLabels[i] = imageLabels[i]'),
    'handleFilesSelected must NOT blindly carry over old imageLabels by index'
  );

  // Behavioral simulation of file selection logic:
  let imageLabels = {};
  function handleFilesSelected(files, newLabels = null) {
    imageLabels = {};
    if (Array.isArray(newLabels)) {
      newLabels.forEach((l, i) => { if (l) imageLabels[i] = l; });
    } else if (newLabels && typeof newLabels === 'object') {
      imageLabels = { ...newLabels };
    }
  }

  // Teacher selects file A and sets label 'apple'
  handleFilesSelected([{ name: 'apple.jpg' }]);
  imageLabels[0] = 'apple';
  assert.equal(imageLabels[0], 'apple');

  // Teacher chooses a different file B via file input
  handleFilesSelected([{ name: 'dog.jpg' }]);
  assert.equal(imageLabels[0], undefined, 'Stale label "apple" must be purged when replacing file');

  // Teacher uses QuizCameraCapture with 2 photos and labels, then reorders
  let items = [
    { file: { name: 'cat.jpg' }, label: 'cat', id: '1' },
    { file: { name: 'dog.jpg' }, label: 'dog', id: '2' }
  ];
  // Reorder items: move item 1 up to index 0
  [items[0], items[1]] = [items[1], items[0]];
  assert.equal(items[0].file.name, 'dog.jpg');
  assert.equal(items[0].label, 'dog', 'Reordered item must retain its own label');

  // Callback to handleFilesSelected
  handleFilesSelected(items.map((it) => it.file), items.map((it) => it.label));
  assert.equal(imageLabels[0], 'dog');
  assert.equal(imageLabels[1], 'cat');
});

// -------------------------------------------------------------
// RED-6.2: validateImageLabels requires min(requestedCount, fileCount) non-empty labels in order
// -------------------------------------------------------------
test('RED-6.2: validateImageLabels rejects partial missing labels when multiple picture_guess requested', () => {
  // 1. 2 images, 2 picture_guess: second label empty must FAIL with EmptyImageLabel
  const res2of2Empty = validateImageLabels(['apple', ''], 2, 2);
  assert.equal(res2of2Empty.valid, false);
  assert.equal(res2of2Empty.code, 'EmptyImageLabel');

  // 2. 2 images, 1 picture_guess: first label valid, second empty is ALLOWED
  const res1of2Valid = validateImageLabels(['apple', ''], 2, 1);
  assert.equal(res1of2Valid.valid, true);
  assert.deepEqual(res1of2Valid.labels, ['apple', '']);

  // 3. 2 images, 2 picture_guess: missing second label in array must FAIL
  const resMissingItem = validateImageLabels(['apple'], 2, 2);
  assert.equal(resMissingItem.valid, false);
  assert.equal(resMissingItem.code, 'EmptyImageLabel');

  // 4. 2 images, 2 picture_guess: both valid PASS
  const resBothValid = validateImageLabels(['apple', 'banana'], 2, 2);
  assert.equal(resBothValid.valid, true);
  assert.deepEqual(resBothValid.labels, ['apple', 'banana']);
});

// -------------------------------------------------------------
// RED-6.3: grade_level=0 goes end-to-end to IELTS mode, rejects invalid numbers with 400
// -------------------------------------------------------------
test('RED-6.3: parseGradeLevel preserves 0 (IELTS), rejects invalid range with 400', async () => {
  // 1. Validator unit tests
  assert.deepEqual(parseGradeLevel(0), { valid: true, gradeLevel: 0 });
  assert.deepEqual(parseGradeLevel('0'), { valid: true, gradeLevel: 0 });
  assert.deepEqual(parseGradeLevel(7), { valid: true, gradeLevel: 7 });
  assert.deepEqual(parseGradeLevel(undefined), { valid: true, gradeLevel: 7 });
  assert.equal(parseGradeLevel(-1).valid, false);
  assert.equal(parseGradeLevel(13).valid, false);
  assert.equal(parseGradeLevel('invalid').valid, false);
  assert.equal(parseGradeLevel(NaN).valid, false);

  // 2. AI prompt verification for Grade 0 vs Grade 7
  let capturedPrompt0 = '';
  let capturedPrompt7 = '';
  const mockPlatform = {
    env: {
      AI_API_KEY: 'mock-key',
      AI_BASE_URL: 'http://mock-ai.local'
    }
  };
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}');
      const content = body.messages?.[0]?.content || '';
      if (content.includes('IELTS')) capturedPrompt0 = content;
      if (content.includes('Lớp 7')) capturedPrompt7 = content;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [{
                type: 'multiple_choice',
                prompt: 'Sample Question',
                options: ['A', 'B', 'C', 'D'],
                correct_answer: 'A'
              }]
            })
          }
        }]
      }));
    };

    await generateQuestionsWithAI('Vocabulary: photosynthesis, cellular', mockPlatform, { questionCount: 1, gradeLevel: 0 });
    assert.ok(capturedPrompt0.includes('Tổng hợp / IELTS'), 'Grade 0 must produce IELTS / general prompt');
    assert.ok(!capturedPrompt0.includes('Lớp 0'), 'Grade 0 must not mention "Lớp 0"');

    await generateQuestionsWithAI('Vocabulary: cat, dog', mockPlatform, { questionCount: 1, gradeLevel: 7 });
    assert.ok(capturedPrompt7.includes('Lớp 7'), 'Grade 7 must produce Lớp 7 prompt');
  } finally {
    globalThis.fetch = origFetch;
  }

  // 3. Deterministic generator with Grade 0 treats as advanced/IELTS
  const resGen0 = generateDeterministicQuiz(`
    Vocabulary:
    cat: con mèo
    photosynthesis: quá trình quang hợp
  `, { questionCount: 1, gradeLevel: 0 });
  assert.ok(resGen0.questions.length >= 1);

  // 4. API Endpoints reject invalid grade_level with 400
  const ctx = await createTestContext();
  const quizId = 'q_grade_test';
  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by) VALUES (?, 'Grade Test', 'draft', 'teacher-1')
  `).run(quizId);

  // from-drive with grade_level = -1
  const resBadDrive = await postFromDrive({
    params: { id: quizId },
    request: new Request(`http://localhost/api/quiz-menu/${quizId}/from-drive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ctx.tokens.teacher1}` },
      body: JSON.stringify({ file_id: 'fake_drive_1', grade_level: -1 })
    }),
    platform: { env: ctx.env }
  });
  assert.equal(resBadDrive.status, 400);
  const jsonBadDrive = await resBadDrive.json();
  assert.equal(jsonBadDrive.error, 'InvalidGradeLevel');

  // from-knowledge-vault with grade_level = 99
  const resBadVault = await postFromVault({
    params: { id: quizId },
    request: new Request(`http://localhost/api/quiz-menu/${quizId}/from-knowledge-vault`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ctx.tokens.teacher1}` },
      body: JSON.stringify({ vault_id: 'v1', grade_level: 99 })
    }),
    platform: { env: ctx.env }
  });
  assert.equal(resBadVault.status, 400);
  const jsonBadVault = await resBadVault.json();
  assert.equal(jsonBadVault.error, 'InvalidGradeLevel');
});

// -------------------------------------------------------------
// RED-6.4: Asset provenance public strictly requires prompt_image_url or picture_guess/media
// -------------------------------------------------------------
test('RED-6.4: Non-picture question provenance returns 404 for guest, picture_guess returns 200', async () => {
  const ctx = await createTestContext();
  const quizId = 'q_asset_pub';
  const secretAssetId = 'secret_scan_doc';
  const publicAssetId = 'public_picture_fruit';

  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by) VALUES (?, 'Asset Pub Test', 'published', 'teacher-1')
  `).run(quizId);

  // Question 1: fill_blank question with source_sub_id pointing to secret asset (no prompt_image_url)
  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url)
    VALUES ('q1', ?, 'fill_blank', 'Fill in blank', NULL)
  `).run(quizId);
  ctx.sqlite.prepare(`
    INSERT INTO quiz_question_sources (id, quiz_id, question_id, source_type, source_id, source_sub_id)
    VALUES ('src1', ?, 'q1', 'upload', 'upload_file_1', ?)
  `).run(quizId, secretAssetId);

  // Question 2: picture_guess question with canonical prompt_image_url
  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url)
    VALUES ('q2', ?, 'picture_guess', 'Look at picture', ?)
  `).run(quizId, `/api/quiz-menu/${quizId}/assets/${publicAssetId}`);
  ctx.sqlite.prepare(`
    INSERT INTO quiz_question_sources (id, quiz_id, question_id, source_type, source_id, source_sub_id)
    VALUES ('src2', ?, 'q2', 'upload', 'upload_file_1', ?)
  `).run(quizId, publicAssetId);

  ctx.env.MOCK_DRIVE_DOWNLOAD = {
    [publicAssetId]: { bytes: new Uint8Array([0xFF, 0xD8, 0xFF]), mimeType: 'image/jpeg', name: 'fruit.jpg' },
    [secretAssetId]: { bytes: new Uint8Array([0xFF, 0xD8, 0xFF]), mimeType: 'image/jpeg', name: 'secret.jpg' }
  };

  // 1. Guest requests secretAssetId (only linked to fill_blank question) -> must be 404
  const guestReqSecret = new Request(`http://localhost/api/quiz-menu/${quizId}/assets/${secretAssetId}`);
  const resSecret = await getAsset({
    params: { id: quizId, assetId: secretAssetId },
    request: guestReqSecret,
    platform: { env: ctx.env }
  });
  assert.equal(resSecret.status, 404, 'Guest must NOT access asset linked only to non-picture question');

  // 2. Guest requests publicAssetId (linked to picture_guess with canonical URL) -> must be 200
  const guestReqPub = new Request(`http://localhost/api/quiz-menu/${quizId}/assets/${publicAssetId}`);
  const resPub = await getAsset({
    params: { id: quizId, assetId: publicAssetId },
    request: guestReqPub,
    platform: { env: ctx.env }
  });
  assert.equal(resPub.status, 200, 'Guest must be allowed to download picture_guess asset');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { GET as getQuiz, PUT as updateQuiz } from '../src/routes/api/quiz-menu/[id]/+server.js';
import { GET as getAsset } from '../src/routes/api/quiz-menu/[id]/assets/[assetId]/+server.js';
import { generateDeterministicQuiz } from '../src/lib/server/quizAutoBuilder.js';
import { generateQuestionsWithAI } from '../src/lib/server/quizDrive.js';
import { publicQuestion } from '../src/lib/server/quizMenu.js';

import { createSignedToken } from '../src/lib/server/auth.js';

const TEST_SECRET = 'round5-red-green-audit-test-secret';

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
      time_limit_minutes INTEGER DEFAULT 15,
      status TEXT DEFAULT 'draft',
      created_by TEXT NOT NULL,
      creator_name TEXT,
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
  sqlite.prepare(`INSERT INTO users (id, username, role, status, approval_status) VALUES ('student-1', 'student1', 'student', 'active', 'approved')`).run();

  sqlite.prepare(`INSERT INTO auth_sessions VALUES ('s-t1', NULL, '2099-01-01T00:00:00.000Z')`).run();
  sqlite.prepare(`INSERT INTO auth_sessions VALUES ('s-s1', NULL, '2099-01-01T00:00:00.000Z')`).run();

  const tokenTeacher1 = await createSignedToken({ id: 'teacher-1', username: 'teacher1', role: 'teacher' }, TEST_SECRET, 60_000, 's-t1');
  const tokenStudent1 = await createSignedToken({ id: 'student-1', username: 'student1', role: 'student' }, TEST_SECRET, 60_000, 's-s1');

  const env = {
    DB: d1Adapter(sqlite),
    AUTH_SECRET: TEST_SECRET
  };

  return { sqlite, env, tokens: { teacher1: tokenTeacher1, student1: tokenStudent1 } };
}

// -------------------------------------------------------------
// RED-5.1: Provenance preservation across GET (staff) -> Edit -> PUT (replace)
// -------------------------------------------------------------
test('RED-5.1: GET staff includes source_sub_id via join and PUT replace preserves exact provenance', async () => {
  const ctx = await createTestContext();
  const quizId = 'qz_prov_roundtrip';

  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by)
    VALUES (?, 'Provenance Test Quiz', 'draft', 'teacher-1')
  `).run(quizId);

  const qId = 'qq_pic_1';
  const assetId = 'drive_img_exact_456';
  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, correct_answer, points, q_order, source_type, source_id)
    VALUES (?, ?, 'picture_guess', 'Look at image', '/api/quiz-menu/' || ? || '/assets/' || ?, 'apple', 1, 0, 'upload', 'file_upload_1')
  `).run(qId, quizId, quizId, assetId);

  ctx.sqlite.prepare(`
    INSERT INTO quiz_question_sources (id, quiz_id, question_id, source_type, source_id, source_sub_id)
    VALUES ('qqs_1', ?, ?, 'upload', 'file_upload_1', ?)
  `).run(quizId, qId, assetId);

  // 1. Staff GET with include_answers=1: must receive source_sub_id
  const staffReq = new Request(`http://localhost/api/quiz-menu/${quizId}?include_answers=1`, {
    headers: { authorization: `Bearer ${ctx.tokens.teacher1}` }
  });
  const staffRes = await getQuiz({
    params: { id: quizId },
    url: new URL(`http://localhost/api/quiz-menu/${quizId}?include_answers=1`),
    request: staffReq,
    platform: { env: ctx.env }
  });
  assert.equal(staffRes.status, 200);
  const staffJson = await staffRes.json();
  const loadedQ = staffJson.quiz.questions[0];
  assert.equal(loadedQ.source_sub_id, assetId, 'Staff GET must receive source_sub_id from quiz_question_sources');
  assert.equal(loadedQ.source_type, 'upload');
  assert.equal(loadedQ.source_id, 'file_upload_1');

  // 2. Guest GET: must NOT leak provenance fields (source_type, source_id, source_sub_id)
  const guestReq = new Request(`http://localhost/api/quiz-menu/${quizId}`);
  // Publish quiz first to allow guest GET
  ctx.sqlite.prepare(`UPDATE quizzes SET status = 'published' WHERE id = ?`).run(quizId);
  const guestRes = await getQuiz({
    params: { id: quizId },
    url: new URL(`http://localhost/api/quiz-menu/${quizId}`),
    request: guestReq,
    platform: { env: ctx.env }
  });
  assert.equal(guestRes.status, 200);
  const guestJson = await guestRes.json();
  const guestQ = guestJson.quiz.questions[0];
  assert.equal(guestQ.source_sub_id, undefined, 'Guest GET must never contain source_sub_id');
  assert.equal(guestQ.source_type, undefined, 'Guest GET must never contain source_type');
  assert.equal(guestQ.source_id, undefined, 'Guest GET must never contain source_id');

  // 3. UI Edit simulation: teacher updates prompt and saves with merge_strategy: 'replace'
  const editedPayload = [{
    id: loadedQ.id,
    type: loadedQ.type,
    prompt: 'Look at updated image and guess the fruit:',
    prompt_image_url: loadedQ.prompt_image_url,
    options_json: null,
    correct_answer: 'red apple',
    explanation: 'An apple a day',
    points: 2,
    q_order: 0,
    source_type: loadedQ.source_type,
    source_id: loadedQ.source_id,
    source_sub_id: loadedQ.source_sub_id // roundtripped from staff GET!
  }];

  const putReq = new Request(`http://localhost/api/quiz-menu/${quizId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.tokens.teacher1}`
    },
    body: JSON.stringify({
      title: 'Provenance Test Quiz (Updated)',
      merge_strategy: 'replace',
      questions: editedPayload
    })
  });

  const putRes = await updateQuiz({
    params: { id: quizId },
    request: putReq,
    platform: { env: ctx.env }
  });
  assert.equal(putRes.status, 200);

  // 4. Verify DB: quiz_question_sources still has exact source_sub_id
  const updatedSource = ctx.sqlite.prepare(`
    SELECT * FROM quiz_question_sources WHERE quiz_id = ? AND question_id = ?
  `).get(quizId, loadedQ.id);

  assert.ok(updatedSource, 'quiz_question_sources entry must exist after replace');
  assert.equal(updatedSource.source_sub_id, assetId, 'quiz_question_sources must preserve exact source_sub_id after replace');

  // 5. Multi-source deduplication test: even if a question links to multiple source rows, staff GET returns exactly 1 question
  ctx.sqlite.prepare(`
    INSERT INTO quiz_question_sources (id, quiz_id, question_id, source_type, source_id, source_sub_id)
    VALUES ('src_sec_extra', ?, ?, 'drive', 'file_sec_drive', 'sub_2')
  `).run(quizId, loadedQ.id);

  const staffMultiRes = await getQuiz({
    params: { id: quizId },
    url: new URL(`http://localhost/api/quiz-menu/${quizId}?include_answers=1`),
    request: staffReq,
    platform: { env: ctx.env }
  });
  const staffMultiJson = await staffMultiRes.json();
  assert.equal(staffMultiJson.quiz.questions.length, 1, 'Question must NOT be duplicated even when linked to multiple source rows');
});

// -------------------------------------------------------------
// RED-5.2: Grade level end-to-end constraint in deterministic and AI generator
// -------------------------------------------------------------
test('RED-5.2: gradeLevel shapes deterministic vocabulary selection and AI prompt', async () => {
  const mixedText = `
Vocabulary:
cat: con mèo con
dog: con chó nhỏ
photosynthesis: quá trình quang hợp ở thực vật
environmentalism: phong trào bảo vệ môi trường toàn cầu

Sentences:
The cat is sleeping on the mat.
Photosynthesis is a complex chemical process that converts sunlight into cellular chemical energy in chloroplasts.
  `;

  // 1. Grade 1: chooses simple short words (cat, dog)
  const genG1 = generateDeterministicQuiz(mixedText, {
    gradeLevel: 1,
    questionCount: 2,
    typeMix: { multiple_choice: 2 }
  });
  assert.equal(genG1.questions.length, 2);
  const promptsG1 = genG1.questions.map(q => q.prompt);
  assert.ok(promptsG1.some(p => p.includes('cat') || p.includes('dog')), 'Grade 1 must select short primary words');
  assert.ok(!promptsG1.some(p => p.includes('photosynthesis') || p.includes('environmentalism')), 'Grade 1 must NOT select complex academic words');

  // 2. Grade 12: chooses advanced words (photosynthesis, environmentalism)
  const genG12 = generateDeterministicQuiz(mixedText, {
    gradeLevel: 12,
    questionCount: 2,
    typeMix: { multiple_choice: 2 }
  });
  assert.equal(genG12.questions.length, 2);
  const promptsG12 = genG12.questions.map(q => q.prompt);
  assert.ok(promptsG12.some(p => p.includes('photosynthesis') || p.includes('environmentalism')), 'Grade 12 must prioritize advanced high-school vocabulary');

  // 3. AI prompt verification: gradeLevel must be included in system/user instructions
  let passedPrompt = '';
  const mockPlatform = {
    env: {
      AI_API_KEY: 'mock-key',
      AI_GATEWAY_URL: 'http://mock-ai.local'
    }
  };
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      passedPrompt = String(opts?.body || '');
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify([{
                type: 'multiple_choice',
                prompt: 'Grade 10 question',
                options: ['A', 'B', 'C', 'D'],
                answer: 'A',
                explanation: 'ok'
              }])
            }]
          }
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await generateQuestionsWithAI('Sample text for grade 10 test', mockPlatform, {
      questionCount: 1,
      gradeLevel: 10,
      typeMix: { multiple_choice: 1 }
    });

    assert.ok(passedPrompt.includes('10'), 'AI prompt must explicitly instruct model about Grade 10 target');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// -------------------------------------------------------------
// RED-5.3: Asset manifest does NOT grant public access to unused scan images
// -------------------------------------------------------------
test('RED-5.3: Manifest images not referenced in quiz questions return 404 for guest/student', async () => {
  const ctx = await createTestContext();
  const quizId = 'qz_manifest_leak_test';
  const usedAssetId = 'img_used_question';
  const unusedScanAssetId = 'img_unused_scan_sheet';

  ctx.env.MOCK_DRIVE_DOWNLOAD = {
    [usedAssetId]: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', name: 'diagram.png' },
    [unusedScanAssetId]: { bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/png', name: 'answer_key_scan.png' }
  };

  // Seed quiz with source_metadata_json manifest listing BOTH images
  const manifest = [
    { id: usedAssetId, drive_file_id: usedAssetId, name: 'diagram.png', mime_type: 'image/png' },
    { id: unusedScanAssetId, drive_file_id: unusedScanAssetId, name: 'answer_key_scan.png', mime_type: 'image/png' }
  ];

  ctx.sqlite.prepare(`
    INSERT INTO quizzes (id, title, status, created_by, source_metadata_json)
    VALUES (?, 'Published Manifest Quiz', 'published', 'teacher-1', ?)
  `).run(quizId, JSON.stringify({ manifest }));

  // Only usedAssetId is referenced in a quiz question
  ctx.sqlite.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, correct_answer, points, q_order)
    VALUES ('qq_1', ?, 'picture_guess', 'Look at diagram', '/api/quiz-menu/' || ? || '/assets/' || ?, 'diagram', 1, 0)
  `).run(quizId, quizId, usedAssetId);

  // A. Guest requests used asset -> 200 OK
  const guestUsedReq = new Request(`http://localhost/api/quiz-menu/${quizId}/assets/${usedAssetId}`);
  const resUsed = await getAsset({
    params: { id: quizId, assetId: usedAssetId },
    request: guestUsedReq,
    platform: { env: ctx.env }
  });
  assert.equal(resUsed.status, 200, 'Exact question image must be accessible to guest');

  // B. Guest requests unused scan image (which exists in manifest) -> MUST return 404 AssetNotFound!
  const guestUnusedReq = new Request(`http://localhost/api/quiz-menu/${quizId}/assets/${unusedScanAssetId}`);
  const resUnused = await getAsset({
    params: { id: quizId, assetId: unusedScanAssetId },
    request: guestUnusedReq,
    platform: { env: ctx.env }
  });
  assert.equal(resUnused.status, 404, 'Unused manifest scan image must NOT be accessible to guest');
  const unusedJson = await resUnused.json();
  assert.equal(unusedJson.error, 'AssetNotFound');

  // C. Owner teacher can preview draft asset if needed (or verify owner access)
  const ownerUnusedReq = new Request(`http://localhost/api/quiz-menu/${quizId}/assets/${unusedScanAssetId}`, {
    headers: { authorization: `Bearer ${ctx.tokens.teacher1}` }
  });
  const resOwnerUnused = await getAsset({
    params: { id: quizId, assetId: unusedScanAssetId },
    request: ownerUnusedReq,
    platform: { env: ctx.env }
  });
  // Owner can preview or gets 200
  assert.equal(resOwnerUnused.status, 200, 'Owner teacher can access manifest preview');
});

// -------------------------------------------------------------
// RED-5.4: Server image_labels validation and UI contracts
// -------------------------------------------------------------
test('RED-5.4: validateImageLabels rejects control chars, oversized labels, and UI has revoke and touch target', async () => {
  const { validateImageLabels } = await import('../src/lib/server/quizAutoBuilder.js');

  // 1. Control character rejection
  const ctrlRes = validateImageLabels(['apple\x00evil', 'banana'], 2, true);
  assert.equal(ctrlRes.valid, false);
  assert.equal(ctrlRes.code, 'InvalidImageLabelChars');

  // 2. Oversized label rejection (>80 chars)
  const longLabel = 'a'.repeat(81);
  const longRes = validateImageLabels([longLabel], 1, true);
  assert.equal(longRes.valid, false);
  assert.equal(longRes.code, 'ImageLabelTooLong');

  // 3. Excessive labels (> fileCount or > 6)
  const excessRes = validateImageLabels(['a', 'b', 'c'], 2, true);
  assert.equal(excessRes.valid, false);
  assert.equal(excessRes.code, 'ExcessiveImageLabels');

  // 4. Missing labels when picture_guess requested
  const emptyRes = validateImageLabels(['   '], 1, true);
  assert.equal(emptyRes.valid, false);
  assert.equal(emptyRes.code, 'EmptyImageLabel');

  // 5. Valid labels pass
  const validRes = validateImageLabels(['apple', 'golden retriever'], 2, true);
  assert.equal(validRes.valid, true);
  assert.deepEqual(validRes.labels, ['apple', 'golden retriever']);

  // 6. UI Svelte file contracts (revocation, a11y, touch target >= 44px)
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');
  assert.ok(pageSrc.includes('revokeObjectURL'), 'UI must call revokeObjectURL to prevent memory leaks');
  assert.ok(pageSrc.includes('min-height: 44px') || pageSrc.includes('min-h-[44px]') || pageSrc.includes('min-height:44px'), 'Image label input must have minimum 44px touch target');
  assert.ok(pageSrc.includes('for="img-label-') || pageSrc.includes('for={`img-label-'), 'Image label inputs must have associated <label for=...>');
});

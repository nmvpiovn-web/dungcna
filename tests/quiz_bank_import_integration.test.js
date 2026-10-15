import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET as getQuestionBank } from '../src/routes/api/quiz-menu/question-bank/+server.js';
import { POST as importQuestions } from '../src/routes/api/quiz-menu/[id]/import-questions/+server.js';

const secret = 'test-secret-key-at-least-32-chars-long!';

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
        for (const s of statements) results.push(await s.run());
        sqlite.exec('COMMIT;');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK;');
        throw err;
      }
    }
  };
}

async function setupFixture() {
  const sqlite = new DatabaseSync(':memory:');

  // 1. Users & sessions
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT, phone TEXT, email TEXT, name TEXT,
      role TEXT, avatar TEXT, status TEXT, approval_status TEXT DEFAULT 'approved',
      metadata TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, revoked_at TEXT, expires_at TEXT);
  `);

  // 2. Base Quiz Menu migrations
  sqlite.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0014_quiz_guest_class.sql', 'utf8'));
  sqlite.exec(fs.readFileSync('migrations/0020_quiz_question_provenance.sql', 'utf8'));

  // 3. Question Bank table
  sqlite.exec(`
    CREATE TABLE question_bank (
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

  // Insert 30 mock questions in grade 7
  const insertBank = sqlite.prepare(`
    INSERT INTO question_bank (
      id, grade_level, curriculum_id, topic, skill_category, cognitive_level,
      question_type, question_text, options_json, correct_option_id, explanation, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published');
  `);

  for (let i = 1; i <= 30; i++) {
    insertBank.run(
      `qb_g7_${String(i).padStart(3, '0')}`,
      '7',
      'global_success',
      i <= 15 ? 'unit_1_hobbies' : 'unit_2_health',
      i % 2 === 0 ? 'grammar' : 'vocabulary',
      i <= 10 ? 'nhan_biet' : i <= 20 ? 'thong_hieu' : 'van_dung',
      'multiple_choice',
      `Grade 7 Question ${i}: What is the correct answer for prompt ${i}?`,
      JSON.stringify([
        { id: 'A', text: `Option A for Q${i}` },
        { id: 'B', text: `Option B for Q${i}` },
        { id: 'C', text: `Option C for Q${i}` },
        { id: 'D', text: `Option D for Q${i}` }
      ]),
      'B',
      `Detailed explanation for Q${i}`
    );
  }

  // Insert users
  sqlite.exec(`
    INSERT INTO users (id, username, name, role, status, approval_status) VALUES
      ('t1', 'teacher1', 'Cô Giáo 1', 'teacher', 'active', 'approved'),
      ('t2', 'teacher2', 'Cô Giáo 2', 'teacher', 'active', 'approved'),
      ('s1', 'student1', 'Học Sinh 1', 'student', 'active', 'approved');
    INSERT INTO auth_sessions VALUES
      ('sess_t1', NULL, '2099-01-01T00:00:00Z'),
      ('sess_t2', NULL, '2099-01-01T00:00:00Z'),
      ('sess_s1', NULL, '2099-01-01T00:00:00Z');
  `);

  const teacher1Token = await createSignedToken({ id: 't1', username: 'teacher1', role: 'teacher' }, secret, 60_000, 'sess_t1');
  const teacher2Token = await createSignedToken({ id: 't2', username: 'teacher2', role: 'teacher' }, secret, 60_000, 'sess_t2');
  const studentToken = await createSignedToken({ id: 's1', username: 'student1', role: 'student' }, secret, 60_000, 'sess_s1');

  // Insert draft quiz owned by teacher1
  sqlite.exec(`
    INSERT INTO quizzes (id, title, created_by, creator_name, time_limit_minutes, status)
    VALUES ('quiz_draft_1', 'Quiz Nháp của T1', 't1', 'Cô Giáo 1', 20, 'draft');
    INSERT INTO quizzes (id, title, created_by, creator_name, time_limit_minutes, status)
    VALUES ('quiz_pub_1', 'Quiz Đã Xuất Bản', 't1', 'Cô Giáo 1', 20, 'published');
  `);

  const platform = {
    env: {
      DB: d1Adapter(sqlite),
      AUTH_SECRET: secret
    }
  };

  return { sqlite, platform, teacher1Token, teacher2Token, studentToken };
}

function makeRequest(path, token, method = 'GET', body = null) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new Request(`https://timbk.io.vn${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

describe('INTEGRATION: Question Bank API & Continuous Import', () => {
  test('IMPORT-01: Auth check - unauthenticated request returns 401', async () => {
    const ctx = await setupFixture();
    const req = makeRequest('/api/quiz-menu/quiz_draft_1/import-questions', null, 'POST', { count: 10 });
    const res = await importQuestions({ params: { id: 'quiz_draft_1' }, request: req, platform: ctx.platform });
    assert.strictEqual(res.status, 401);
  });

  test('IMPORT-02: RBAC check - student (403) and teacher who does not own quiz (403)', async () => {
    const ctx = await setupFixture();

    // Student -> 403
    const reqStudent = makeRequest('/api/quiz-menu/quiz_draft_1/import-questions', ctx.studentToken, 'POST', { count: 10 });
    const resStudent = await importQuestions({ params: { id: 'quiz_draft_1' }, request: reqStudent, platform: ctx.platform });
    assert.strictEqual(resStudent.status, 403);

    // Teacher2 attempting to edit Teacher1's quiz -> 403
    const reqT2 = makeRequest('/api/quiz-menu/quiz_draft_1/import-questions', ctx.teacher2Token, 'POST', { count: 10 });
    const resT2 = await importQuestions({ params: { id: 'quiz_draft_1' }, request: reqT2, platform: ctx.platform });
    assert.strictEqual(resT2.status, 403);
  });

  test('IMPORT-03: Draft-only check - published quiz rejects question import (400)', async () => {
    const ctx = await setupFixture();
    const req = makeRequest('/api/quiz-menu/quiz_pub_1/import-questions', ctx.teacher1Token, 'POST', { count: 10 });
    const res = await importQuestions({ params: { id: 'quiz_pub_1' }, request: req, platform: ctx.platform });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /draft/i);
  });

  test('IMPORT-04: Listing protection - GET /api/quiz-menu/question-bank does NOT leak answers', async () => {
    const ctx = await setupFixture();
    const req = makeRequest('/api/quiz-menu/question-bank?grade_level=7&limit=5', ctx.teacher1Token);
    const res = await getQuestionBank({ url: new URL(req.url), request: req, platform: ctx.platform });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.total, 30);
    assert.strictEqual(body.questions.length, 5);

    // Verify answers and explanations are stripped
    for (const q of body.questions) {
      assert.strictEqual('correct_answer' in q, false, 'Listing must NOT leak correct_answer');
      assert.strictEqual('correct_option_id' in q, false, 'Listing must NOT leak correct_option_id');
      assert.strictEqual('explanation' in q, false, 'Listing must NOT leak explanation');
      assert.ok(q.prompt, 'Prompt must exist');
      assert.ok(Array.isArray(q.options) && q.options.length === 4, 'Options must exist');
    }
  });

  test('IMPORT-05: Filter parameterization in GET question-bank', async () => {
    const ctx = await setupFixture();

    // Filter by topic
    const reqTopic = makeRequest('/api/quiz-menu/question-bank?topic=unit_1_hobbies', ctx.teacher1Token);
    const resTopic = await getQuestionBank({ url: new URL(reqTopic.url), request: reqTopic, platform: ctx.platform });
    const bodyTopic = await resTopic.json();
    assert.strictEqual(bodyTopic.total, 15);

    // Filter by cognitive_level
    const reqCog = makeRequest('/api/quiz-menu/question-bank?cognitive_level=nhan_biet', ctx.teacher1Token);
    const resCog = await getQuestionBank({ url: new URL(reqCog.url), request: reqCog, platform: ctx.platform });
    const bodyCog = await resCog.json();
    assert.strictEqual(bodyCog.total, 10);
  });

  test('IMPORT-06: Continuous quick import (+10 then +10) increases count without duplicates', async () => {
    const ctx = await setupFixture();

    // 1. First quick import: +10 questions for Grade 7
    const req1 = makeRequest('/api/quiz-menu/quiz_draft_1/import-questions', ctx.teacher1Token, 'POST', {
      filters: { grade_level: '7' },
      count: 10
    });
    const res1 = await importQuestions({ params: { id: 'quiz_draft_1' }, request: req1, platform: ctx.platform });
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json();
    assert.strictEqual(body1.success, true);
    assert.strictEqual(body1.imported_count, 10, 'First batch must import exactly 10 questions');
    assert.strictEqual(body1.total_questions, 10, 'Total questions after first batch must be 10');

    // Verify first batch source IDs in D1
    const rowsBatch1 = ctx.sqlite.prepare("SELECT source_id, source_type, q_order FROM quiz_questions WHERE quiz_id = 'quiz_draft_1' ORDER BY q_order;").all();
    assert.strictEqual(rowsBatch1.length, 10);
    const first10SourceIds = rowsBatch1.map((r) => r.source_id);
    assert.strictEqual(new Set(first10SourceIds).size, 10, 'First 10 source IDs must be unique');

    // 2. Second quick import: another +10 questions for Grade 7
    const req2 = makeRequest('/api/quiz-menu/quiz_draft_1/import-questions', ctx.teacher1Token, 'POST', {
      filters: { grade_level: '7' },
      count: 10
    });
    const res2 = await importQuestions({ params: { id: 'quiz_draft_1' }, request: req2, platform: ctx.platform });
    assert.strictEqual(res2.status, 200);
    const body2 = await res2.json();
    assert.strictEqual(body2.success, true);
    assert.strictEqual(body2.imported_count, 10, 'Second batch must import another 10 questions');
    assert.strictEqual(body2.total_questions, 20, 'Total questions after second batch must be 20');

    // Verify all 20 questions in D1 are completely distinct
    const rowsAll = ctx.sqlite.prepare("SELECT source_id, source_type, q_order FROM quiz_questions WHERE quiz_id = 'quiz_draft_1' ORDER BY q_order;").all();
    assert.strictEqual(rowsAll.length, 20);
    const all20SourceIds = rowsAll.map((r) => r.source_id);
    assert.strictEqual(new Set(all20SourceIds).size, 20, 'All 20 questions must have distinct source IDs (no repeats)');

    // 3. Third quick import: +10 questions (remaining 10 questions in bank)
    const req3 = makeRequest('/api/quiz-menu/quiz_draft_1/import-questions', ctx.teacher1Token, 'POST', {
      filters: { grade_level: '7' },
      count: 10
    });
    const res3 = await importQuestions({ params: { id: 'quiz_draft_1' }, request: req3, platform: ctx.platform });
    assert.strictEqual(res3.status, 200);
    const body3 = await res3.json();
    assert.strictEqual(body3.imported_count, 10);
    assert.strictEqual(body3.total_questions, 30);

    // 4. Fourth quick import: bank has no more questions left for Grade 7
    const req4 = makeRequest('/api/quiz-menu/quiz_draft_1/import-questions', ctx.teacher1Token, 'POST', {
      filters: { grade_level: '7' },
      count: 10
    });
    const res4 = await importQuestions({ params: { id: 'quiz_draft_1' }, request: req4, platform: ctx.platform });
    assert.strictEqual(res4.status, 400);
    const body4 = await res4.json();
    assert.match(body4.error, /phù hợp|đã được nhập/);
  });
});

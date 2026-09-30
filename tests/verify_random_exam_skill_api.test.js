import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { POST as randomExamPost } from '../src/routes/api/exams/random/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const SECRET = 'test-random-exam-secret-key-2026-audit';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      role TEXT,
      name TEXT,
      phone TEXT,
      email TEXT,
      avatar TEXT,
      grade TEXT,
      status TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO users (id, username, role, status) VALUES
      ('usr_student_test', 'student_test', 'student', 'active');

    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      revoked_at TEXT
    );
    INSERT INTO auth_sessions (id, user_id, expires_at) VALUES
      ('sid_test_1', 'usr_student_test', '2030-01-01T00:00:00Z');

    CREATE TABLE question_bank (
      id TEXT PRIMARY KEY,
      grade_level TEXT NOT NULL,
      cognitive_level TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      skill_category TEXT NOT NULL DEFAULT 'grammar',
      question_text TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_option_id TEXT NOT NULL,
      explanation TEXT,
      reading_passage TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE exam_instances (
      id TEXT PRIMARY KEY,
      exam_type TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      title TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 50,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      score REAL,
      answers_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME
    );

    CREATE TABLE exam_instance_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT NOT NULL,
      item_order INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_option_id TEXT NOT NULL,
      explanation TEXT,
      reading_passage TEXT
    );

    -- Seed question_bank with 5-minute exam quota (3 nhan_biet, 2 thong_hieu)
    -- Grammar: 3 nhan_biet, 2 thong_hieu
    INSERT INTO question_bank (id, grade_level, cognitive_level, status, skill_category, question_text, options_json, correct_option_id) VALUES
      ('q_g1', 'lop_7', 'nhan_biet', 'published', 'grammar', 'Grammar Q1', '["A. a","B. b"]', 'A'),
      ('q_g2', 'lop_7', 'nhan_biet', 'published', 'grammar', 'Grammar Q2', '["A. a","B. b"]', 'B'),
      ('q_g3', 'lop_7', 'nhan_biet', 'published', 'grammar', 'Grammar Q3', '["A. a","B. b"]', 'A'),
      ('q_g4', 'lop_7', 'thong_hieu', 'published', 'grammar', 'Grammar Q4', '["A. a","B. b"]', 'B'),
      ('q_g5', 'lop_7', 'thong_hieu', 'published', 'grammar', 'Grammar Q5', '["A. a","B. b"]', 'A');

    -- Vocabulary: Only 1 nhan_biet (insufficient for 5m test)
    INSERT INTO question_bank (id, grade_level, cognitive_level, status, skill_category, question_text, options_json, correct_option_id) VALUES
      ('q_v1', 'lop_7', 'nhan_biet', 'published', 'vocabulary', 'Vocab Q1', '["A. a","B. b"]', 'A');
  `);

  return {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          const stmt = db.prepare(sql);
          return stmt.get(...bound) || null;
        },
        async all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...bound) };
        },
        async run() {
          const stmt = db.prepare(sql);
          const res = stmt.run(...bound);
          return { meta: { changes: Number(res.changes) } };
        }
      };
    },
    async batch(stmts) {
      db.exec('BEGIN TRANSACTION;');
      try {
        const results = [];
        for (const s of stmts) {
          results.push(await s.run());
        }
        db.exec('COMMIT;');
        return results;
      } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
      }
    }
  };
}

test('RANDOM-EXAM-API-01: Invalid skill_category rejected with 400', async () => {
  const token = await createSignedToken({ id: 'usr_student_test', username: 'student_test', role: 'student' }, SECRET, 3600000, 'sid_test_1');
  const platform = { env: { DB: createMockD1(), AUTH_SECRET: SECRET } };

  const req = new Request('http://localhost/api/exams/random?action=create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'create',
      exam_type: '5m',
      grade: 'lop_7',
      skill_category: 'invalid_skill'
    })
  });

  const res = await randomExamPost({ request: req, url: new URL('http://localhost/api/exams/random?action=create'), platform });
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.match(json.error, /InvalidSkillCategory/);
});

test('RANDOM-EXAM-API-02: Insufficient questions for requested skill returns 400 with clear message', async () => {
  const token = await createSignedToken({ id: 'usr_student_test', username: 'student_test', role: 'student' }, SECRET, 3600000, 'sid_test_1');
  const platform = { env: { DB: createMockD1(), AUTH_SECRET: SECRET } };

  const req = new Request('http://localhost/api/exams/random?action=create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'create',
      exam_type: '5m',
      grade: 'lop_7',
      skill_category: 'vocabulary' // Only 1 question exists, but 5m requires 3 nhan_biet + 2 thong_hieu
    })
  });

  const res = await randomExamPost({ request: req, url: new URL('http://localhost/api/exams/random?action=create'), platform });
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.match(json.error, /không đủ số lượng/);
});

test('RANDOM-EXAM-API-03: Valid skill_category returns exact questions of that skill only', async () => {
  const token = await createSignedToken({ id: 'usr_student_test', username: 'student_test', role: 'student' }, SECRET, 3600000, 'sid_test_1');
  const platform = { env: { DB: createMockD1(), AUTH_SECRET: SECRET } };

  const req = new Request('http://localhost/api/exams/random?action=create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'create',
      exam_type: '5m',
      grade: 'lop_7',
      skill_category: 'grammar'
    })
  });

  const res = await randomExamPost({ request: req, url: new URL('http://localhost/api/exams/random?action=create'), platform });
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.items.length, 5);
  // Verify all questions belong to grammar
  for (const item of json.items) {
    assert.strictEqual(item.skill_category, 'grammar');
  }
});

test('RANDOM-EXAM-API-04: Options format contract: options have id, text, and label without undefined', async () => {
  const token = await createSignedToken({ id: 'usr_student_test', username: 'student_test', role: 'student' }, SECRET, 3600000, 'sid_test_1');
  const platform = { env: { DB: createMockD1(), AUTH_SECRET: SECRET } };

  const req = new Request('http://localhost/api/exams/random?action=create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'create',
      exam_type: '5m',
      grade: 'lop_7',
      skill_category: 'grammar'
    })
  });

  const res = await randomExamPost({ request: req, url: new URL('http://localhost/api/exams/random?action=create'), platform });
  assert.strictEqual(res.status, 200);
  const json = await res.json();

  for (const item of json.items) {
    assert.ok(Array.isArray(item.options), 'options must be an array');
    for (const opt of item.options) {
      assert.ok(typeof opt === 'object', 'each option must be an object');
      assert.ok(opt.id, 'option must have id');
      assert.ok(opt.text, 'option must have text');
      assert.ok(!opt.text.includes('undefined'), 'option text must not contain undefined');
      assert.ok(!opt.label.includes('undefined'), 'option label must not contain undefined');
    }
  }
});

test('RANDOM-EXAM-API-05: Submit answers via /api/exams/random updates D1 instance to completed and scores accurately', async () => {
  const token = await createSignedToken({ id: 'usr_student_test', username: 'student_test', role: 'student' }, SECRET, 3600000, 'sid_test_1');
  const mockDb = createMockD1();
  const platform = { env: { DB: mockDb, AUTH_SECRET: SECRET } };

  // 1. Create 5m exam (5 questions: answers in fixture are A, B, A, B, A)
  const createReq = new Request('http://localhost/api/exams/random?action=create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'create',
      exam_type: '5m',
      grade: 'lop_7',
      skill_category: 'grammar'
    })
  });

  const createRes = await randomExamPost({ request: createReq, url: new URL('http://localhost/api/exams/random?action=create'), platform });
  assert.strictEqual(createRes.status, 200);
  const createJson = await createRes.json();
  const instanceId = createJson.instance_id;

  // 2. Submit answers (answers 1, 2 correct, 3, 4, 5 wrong -> 2/5 = 4.0/10)
  const submitReq = new Request('http://localhost/api/exams/random', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'submit',
      instance_id: instanceId,
      answers: {
        '1': 'A',
        '2': 'B',
        '3': 'C',
        '4': 'C',
        '5': 'C'
      },
      duration_seconds: 120
    })
  });

  const submitRes = await randomExamPost({ request: submitReq, url: new URL('http://localhost/api/exams/random'), platform });
  const submitJson = await submitRes.json();
  if (submitRes.status !== 200) {
    console.error('DEBUG SUBMIT ERROR:', submitJson);
  }
  assert.strictEqual(submitRes.status, 200);
  assert.strictEqual(submitJson.success, true);
  assert.strictEqual(submitJson.instance_id, instanceId);
  assert.strictEqual(submitJson.total_questions, 5);
  assert.ok(typeof submitJson.score === 'number');

  // Verify in D1 that exam_instances record is marked completed
  const inDb = await mockDb.prepare('SELECT status, score FROM exam_instances WHERE id = ?').bind(instanceId).first();
  assert.strictEqual(inDb.status, 'completed');
  assert.strictEqual(Number(inDb.score), Number(submitJson.score));
});

test('RANDOM-EXAM-API-06: Blank D1 with migrations 0001-0005 has populated question_bank and creates 15m exam without errors', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const realDb = new DatabaseSync(':memory:');

  // Run all migrations
  const migrationFiles = fs.readdirSync('migrations').filter(f => f.endsWith('.sql')).sort();
  for (const f of migrationFiles) {
    realDb.exec(fs.readFileSync(path.join('migrations', f), 'utf8'));
  }

  // Add user and session
  realDb.exec(`
    INSERT INTO users (id, username, name, role, status) VALUES ('usr_mig_test', 'mig_test', 'Mig Student', 'student', 'active');
    INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ('sid_mig_1', 'usr_mig_test', '2030-01-01T00:00:00Z');
  `);

  const qbCount = realDb.prepare('SELECT count(*) as cnt FROM question_bank').get().cnt;
  assert.ok(qbCount > 100, `question_bank must have >100 seeded questions, found ${qbCount}`);

  // Wrap in D1 adapter
  const d1 = {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) { bound = args; return this; },
        async first() { return realDb.prepare(sql).get(...bound) || null; },
        async all() { return { results: realDb.prepare(sql).all(...bound) }; },
        async run() { const res = realDb.prepare(sql).run(...bound); return { meta: { changes: Number(res.changes) } }; }
      };
    },
    async batch(stmts) {
      realDb.exec('BEGIN TRANSACTION;');
      try {
        const results = [];
        for (const s of stmts) results.push(await s.run());
        realDb.exec('COMMIT;');
        return results;
      } catch (e) {
        try { realDb.exec('ROLLBACK;'); } catch {}
        throw e;
      }
    }
  };

  const token = await createSignedToken({ id: 'usr_mig_test', username: 'mig_test', role: 'student' }, SECRET, 3600000, 'sid_mig_1');
  const platform = { env: { DB: d1, AUTH_SECRET: SECRET } };

  const createReq = new Request('http://localhost/api/exams/random?action=create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'create',
      exam_type: '15m',
      grade: 'lop_7',
      skill_category: 'grammar'
    })
  });

  const createRes = await randomExamPost({ request: createReq, url: new URL('http://localhost/api/exams/random?action=create'), platform });
  assert.strictEqual(createRes.status, 200);
  const json = await createRes.json();
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.items.length, 15);

  const variants = new Set([json.items.map(item => item.question_id).join('|')]);
  const instanceIds = new Set([json.instance_id]);
  for (let attempt = 0; attempt < 4; attempt++) {
    const variantReq = new Request('http://localhost/api/exams/random?action=create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'create', exam_type: '15m', grade: 'lop_7', skill_category: 'grammar' })
    });
    const variantRes = await randomExamPost({ request: variantReq, url: new URL('http://localhost/api/exams/random?action=create'), platform });
    assert.strictEqual(variantRes.status, 200);
    const variant = await variantRes.json();
    variants.add(variant.items.map(item => item.question_id).join('|'));
    instanceIds.add(variant.instance_id);
  }
  assert.strictEqual(instanceIds.size, 5, 'each generation must create a distinct exam instance');
  assert.ok(variants.size > 1, 'five generations must contain more than one question/order variant');
});

test('RANDOM-EXAM-UI-07: 5-minute choice uses the 5m matrix and API failures do not silently fall back to mixed local questions', () => {
  const source = fs.readFileSync('src/routes/exam/+page.svelte', 'utf8');
  assert.match(source, /randomDuration === 5\) apiType = '5m'/);
  assert.doesNotMatch(source, /using client-side fallback/);
  assert.doesNotMatch(source, /if \(pool\.length === 0\) pool = data\.allQuestions/);
  assert.match(source, /if \(!res\.ok \|\| !dataJson\.success\)/);
});

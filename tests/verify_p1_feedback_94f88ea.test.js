import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { POST as examPost, GET as examGet, _ensureExamSchema as ensureExamSchema } from '../src/routes/api/exams/+server.js';
import { POST as payrollPost } from '../src/routes/api/teachers/payroll/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';
import questionsData from '../src/lib/data/questions.json' with { type: 'json' };

const secret = 'p1-feedback-94f88ea-audit-secret-2026';

function createMockPlatform() {
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
      status TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO users (id, username, role, status) VALUES
      ('usr_student_alpha', 'student_alpha', 'student', 'active'),
      ('usr_student_beta', 'student_beta', 'student', 'active'),
      ('usr_teacher_t1', 'teacher_t1', 'teacher', 'active'),
      ('usr_leader_auditor', 'leader_auditor', 'leader', 'active');

    CREATE TABLE class_sessions (
      id TEXT PRIMARY KEY,
      teacher_id TEXT,
      session_date TEXT,
      duration_minutes INTEGER,
      status TEXT,
      role TEXT
    );

    CREATE TABLE teacher_salary_advances (
      id TEXT PRIMARY KEY,
      teacher_id TEXT,
      amount REAL,
      status TEXT,
      billing_cycle TEXT
    );
  `);

  const adapter = {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          const row = db.prepare(sql).get(...bound);
          return row || null;
        },
        async all() {
          const rows = db.prepare(sql).all(...bound);
          return { results: rows };
        },
        async run() {
          const res = db.prepare(sql).run(...bound);
          return { meta: { changes: res.changes } };
        }
      };
    },
    async batch(stmts) {
      db.exec('BEGIN TRANSACTION;');
      try {
        const results = [];
        for (const stmt of stmts) {
          const res = await stmt.run();
          results.push(res);
        }
        db.exec('COMMIT;');
        return results;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  };

  return {
    platform: { env: { DB: adapter, AUTH_SECRET: secret } },
    rawDb: db
  };
}

// =========================================================================
// P1-01: PAYROLL ATOMIC TRANSACTION & NON-BATCH FAIL-CLOSED
// =========================================================================
test('P1-01: Disburse returns HTTP 500 when db.batch is unavailable, preventing sequential non-atomic executions', async () => {
  const { rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_auditor', username: 'leader_auditor', role: 'leader' }, secret);

  // Platform without db.batch
  const nonBatchAdapter = {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) { bound = args; return this; },
        async first() { return rawDb.prepare(sql).get(...bound) || null; },
        async all() { return { results: rawDb.prepare(sql).all(...bound) }; },
        async run() { return { meta: { changes: rawDb.prepare(sql).run(...bound).changes } }; }
      };
    }
  };
  const nonBatchPlatform = { env: { DB: nonBatchAdapter, AUTH_SECRET: secret } };

  // Approve first
  await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'approve', teacher_id: 'usr_teacher_t1', billing_cycle: '2026-09' })
    }),
    platform: nonBatchPlatform
  });

  // Attempt disburse without db.batch -> must fail-closed with HTTP 500
  const disburseRes = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'disburse', teacher_id: 'usr_teacher_t1', billing_cycle: '2026-09' })
    }),
    platform: nonBatchPlatform
  });

  assert.equal(disburseRes.status, 500);
  const body = await disburseRes.json();
  assert.match(body.error, /DisbursementTransactionError/);

  // Invariant: status remains approved, finance_ledger has 0 rows
  const payrollRow = rawDb.prepare("SELECT status FROM teacher_payrolls WHERE teacher_id = 'usr_teacher_t1'").get();
  assert.equal(payrollRow.status, 'approved');
  const ledgerCount = rawDb.prepare('SELECT COUNT(*) n FROM finance_ledger').get();
  assert.equal(ledgerCount.n, 0);
});

// =========================================================================
// P1-02: EXAM MIGRATION FAIL-CLOSED (NO EMPTY CATCH)
// =========================================================================
test('P1-02: ensureExamSchema rethrows real DB/IO errors and blocks session creation with HTTP 500', async () => {
  const faultyDb = {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) { bound = args; return this; },
        async first() {
          if (sql.includes('FROM users')) {
            return { id: 'usr_student_alpha', username: 'student_alpha', role: 'student', status: 'active' };
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes('ALTER TABLE exam_sessions')) {
            throw new Error('D1_IO_DISK_FULL_SIMULATED: simulated disk I/O failure on ALTER TABLE');
          }
          return { meta: { changes: 1 } };
        }
      };
    }
  };

  // Calling ensureExamSchema directly must throw ExamSchemaInitializationError
  await assert.rejects(
    async () => ensureExamSchema(faultyDb),
    /ExamSchemaInitializationError.*D1_IO_DISK_FULL_SIMULATED/
  );

  // POST endpoint must fail-closed with HTTP 500
  const studentToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);
  const platform = { env: { DB: faultyDb, AUTH_SECRET: secret } };

  const startRes = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ action: 'start_session', exam_id: 'ex_g7_hsg_yenlap' })
    }),
    platform
  });

  assert.equal(startRes.status, 500);
  const body = await startRes.json();
  assert.match(body.error, /ExamSchemaInitializationError/);
});

test('P1-02: ensureExamSchema succeeds and safely ignores duplicate column errors on ALTER TABLE', async () => {
  const { rawDb, platform } = createMockPlatform();
  // Call ensureExamSchema twice to ensure duplicate column exception is safely handled
  await ensureExamSchema(platform.env.DB);
  await ensureExamSchema(platform.env.DB);

  const tables = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  assert.ok(tables.includes('exam_sessions'));
  assert.ok(tables.includes('exam_attempts'));
});

// =========================================================================
// P1-03: EXAM SUBMIT CONCURRENCY & ZERO CLOBBERING ROLLBACK
// =========================================================================
test('P1-03: Concurrent submits do not clobber winning worker and winning session remains submitted', async () => {
  const { platform, rawDb } = createMockPlatform();
  const studentToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);

  // 1. Start a session
  const startRes = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ action: 'start_session', exam_id: 'ex_g7_hsg_yenlap' })
    }),
    platform
  });
  assert.equal(startRes.status, 200);
  const startData = await startRes.json();
  const instanceId = startData.session_instance.instance_id;

  // 2. Submit concurrently
  const submitCall = () => examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        exam_id: 'ex_g7_hsg_yenlap',
        instance_id: instanceId,
        answers: { '1': 'C' }
      })
    }),
    platform
  });

  const [res1, res2] = await Promise.all([submitCall(), submitCall()]);
  const statuses = [res1.status, res2.status];

  // One worker must win (200), and the other worker must fail with 400 or 409
  assert.ok(statuses.includes(200), 'At least one submission must succeed');
  assert.ok(statuses.includes(400) || statuses.includes(409), 'Concurrent submission must be rejected');

  // Invariant: Exactly 1 row in exam_attempts
  const attempts = rawDb.prepare('SELECT COUNT(*) n FROM exam_attempts WHERE session_id = ?').get(instanceId);
  assert.equal(attempts.n, 1, 'Exactly one attempt record must exist');

  // Invariant: Session status MUST remain 'submitted' and must NOT be rolled back to 'in_progress'
  const session = rawDb.prepare('SELECT status, score FROM exam_sessions WHERE id = ?').get(instanceId);
  assert.equal(session.status, 'submitted', 'Winning session must strictly remain submitted');
  assert.notEqual(session.score, null, 'Winning score must be recorded');
});

// =========================================================================
// P1-04: SCORING FROM AUTHORITATIVE ANSWER KEY SNAPSHOT (FAIL-CLOSED)
// =========================================================================
test('P1-04: Scoring is evaluated strictly against frozen answer_key_snapshot_json, ignoring question bank mutations', async () => {
  const { platform, rawDb } = createMockPlatform();
  const studentToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);

  // 1. Start a session
  const startRes = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ action: 'start_session', exam_id: 'ex_g7_hsg_yenlap' })
    }),
    platform
  });
  assert.equal(startRes.status, 200);
  const startData = await startRes.json();
  const instanceId = startData.session_instance.instance_id;

  // Verify answer_key_snapshot_json was stored in DB
  const sessRow = rawDb.prepare('SELECT answer_key_snapshot_json FROM exam_sessions WHERE id = ?').get(instanceId);
  assert.ok(sessRow.answer_key_snapshot_json);
  const originalSnapshot = JSON.parse(sessRow.answer_key_snapshot_json);
  assert.equal(originalSnapshot['1'], 'C');

  // 2. Mutate in-memory question bank to simulate retroactive answer key tampering
  const targetQ = questionsData.find(q => q.exam_id === 'ex_g7_hsg_yenlap' && (q.id === 1 || q.question_index === 1));
  const oldAns = targetQ.correct_answer;
  targetQ.correct_answer = 'Z'; // Tampered answer

  try {
    // 3. Submit answer 'C' (matching the frozen session snapshot, NOT the mutated question bank)
    const submitRes = await examPost({
      request: new Request('http://localhost/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          exam_id: 'ex_g7_hsg_yenlap',
          instance_id: instanceId,
          answers: { '1': 'C' }
        })
      }),
      platform
    });

    assert.equal(submitRes.status, 200);
    const submitData = await submitRes.json();

    // Because question 1 answered 'C' which matches snapshot ('C'), it must get positive score!
    assert.ok(submitData.server_calculated_score > 0, 'Score must be awarded based on snapshot, not mutated question bank');
  } finally {
    // Restore question bank
    targetQ.correct_answer = oldAns;
  }
});

test('P1-04: Session submit fails closed with HTTP 500 when answer_key_snapshot_json is missing or corrupt', async () => {
  const { platform, rawDb } = createMockPlatform();
  const studentToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);

  // Create session with missing answer_key_snapshot_json
  await ensureExamSchema(platform.env.DB);
  const corruptSessionId = 'sess_corrupt_test_001';
  rawDb.prepare(`
    INSERT INTO exam_sessions (
      id, user_id, exam_id, questions_snapshot_json, answer_key_snapshot_json,
      time_limit_minutes, started_at, deadline_at, status
    ) VALUES (?, ?, ?, ?, NULL, 45, datetime('now'), datetime('now', '+45 minutes'), 'in_progress');
  `).run(corruptSessionId, 'usr_student_alpha', 'ex_g7_hsg_yenlap', JSON.stringify([{ id: '1', question: 'Q1' }]));

  // Attempt submit
  const submitRes = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        exam_id: 'ex_g7_hsg_yenlap',
        instance_id: corruptSessionId,
        answers: { '1': 'C' }
      })
    }),
    platform
  });

  assert.equal(submitRes.status, 500);
  const body = await submitRes.json();
  assert.match(body.error, /MissingAnswerSnapshotError/);

  // Invariant: No attempt was created
  const attempts = rawDb.prepare('SELECT COUNT(*) n FROM exam_attempts WHERE session_id = ?').get(corruptSessionId);
  assert.equal(attempts.n, 0);
});

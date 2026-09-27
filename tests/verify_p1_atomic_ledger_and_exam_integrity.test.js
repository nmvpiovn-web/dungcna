import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { POST as payrollPost, GET as payrollGet } from '../src/routes/api/teachers/payroll/+server.js';
import { POST as examPost, GET as examGet } from '../src/routes/api/exams/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const secret = 'audit-test-secret-codex-atomic-2026';

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
    }
  };

  return {
    platform: { env: { DB: adapter, AUTH_SECRET: secret } },
    rawDb: db
  };
}

test('P1-ATOMIC-01: Fault Injection - Trigger failure on finance_ledger causes fail-closed 500 without modifying payroll to paid', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_auditor', username: 'leader_auditor', role: 'leader' }, secret);

  // 1. Approve payroll first
  const approveReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'approve', teacher_id: 'usr_teacher_t1', billing_cycle: '2026-09' })
  });
  const approveRes = await payrollPost({ request: approveReq, platform });
  assert.equal(approveRes.status, 200);

  // 2. Inject trigger on finance_ledger to simulate hardware / constraint / trigger fault
  rawDb.exec("CREATE TRIGGER fail_ledger_inject BEFORE INSERT ON finance_ledger BEGIN SELECT RAISE(ABORT, 'injected ledger failure'); END;");

  // 3. Attempt disburse
  const disburseReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'disburse', teacher_id: 'usr_teacher_t1', billing_cycle: '2026-09' })
  });
  const disburseRes = await payrollPost({ request: disburseReq, platform });
  assert.equal(disburseRes.status, 500, 'Must fail-closed with 500 when ledger insert fails');
  const disburseBody = await disburseRes.json();
  assert.match(disburseBody.error, /LedgerPersistenceError/);

  // 4. Verify DB state: payroll status MUST NOT be paid, MUST remain approved
  const payrollRow = rawDb.prepare("SELECT status FROM teacher_payrolls WHERE teacher_id = 'usr_teacher_t1' AND billing_cycle = '2026-09'").get();
  assert.equal(payrollRow.status, 'approved', 'Payroll status must remain approved upon ledger failure');

  const ledgerCount = rawDb.prepare('SELECT COUNT(*) as n FROM finance_ledger').get();
  assert.equal(ledgerCount.n, 0, 'Zero rows must exist in finance_ledger');
});

test('P1-ATOMIC-02: Idempotent replay returns existing voucher on re-disburse with identical key', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_auditor', username: 'leader_auditor', role: 'leader' }, secret);

  await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'approve', teacher_id: 'usr_teacher_t1', billing_cycle: '2026-09' })
    }),
    platform
  });

  const idemKey = 'idempotent_test_key_12345';
  const firstDisburse = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'disburse', teacher_id: 'usr_teacher_t1', billing_cycle: '2026-09', idempotency_key: idemKey })
    }),
    platform
  });
  assert.equal(firstDisburse.status, 200);
  const firstBody = await firstDisburse.json();
  assert.equal(firstBody.status, 'paid');

  // Second disburse with same key
  const replayDisburse = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'disburse', teacher_id: 'usr_teacher_t1', billing_cycle: '2026-09', idempotency_key: idemKey })
    }),
    platform
  });
  assert.equal(replayDisburse.status, 200);
  const replayBody = await replayDisburse.json();
  assert.match(replayBody.message, /Idempotent Replay/);
  assert.equal(replayBody.voucher.idempotency_key, idemKey);

  const ledgerCount = rawDb.prepare('SELECT COUNT(*) as n FROM finance_ledger WHERE idempotency_key = ?').get(idemKey);
  assert.equal(ledgerCount.n, 1, 'Exactly 1 ledger entry exists despite replayed request');
});

test('P1-EXAM-01: Server-owned exam duration ignores client duration_minutes override and enforces blueprint', async () => {
  const { platform } = createMockPlatform();
  const studentToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);

  const startReq = new Request('http://localhost/api/exams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ action: 'start_session', exam_id: 'ex_g7_hsg_yenlap', duration_minutes: 9999 })
  });
  const startRes = await examPost({ request: startReq, platform });
  assert.equal(startRes.status, 200);
  const startData = await startRes.json();

  // ex_g7_hsg_yenlap is defined as 90 minutes in exams.json
  assert.equal(startData.session_instance.time_limit_minutes, 90, 'Client duration override 9999 must be ignored in favor of official 90 minutes');
  assert.equal(startData.session_instance.remaining_seconds, 90 * 60);
});

test('P1-EXAM-02: Student cannot hijack or submit under foreign user instance_id (403 Forbidden)', async () => {
  const { platform, rawDb } = createMockPlatform();
  const studentAlphaToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);
  const studentBetaToken = await createSignedToken({ id: 'usr_student_beta', username: 'student_beta', role: 'student' }, secret);

  // Student Beta starts a session
  const betaStart = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentBetaToken}` },
      body: JSON.stringify({ action: 'start_session', exam_id: 'ex_g7_hsg_yenlap' })
    }),
    platform
  });
  const betaData = await betaStart.json();
  const betaInstanceId = betaData.session_instance.instance_id;

  // Student Alpha attempts to submit using Student Beta's instance_id
  const rogueSubmit = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentAlphaToken}` },
      body: JSON.stringify({
        exam_id: 'ex_g7_hsg_yenlap',
        instance_id: betaInstanceId,
        answers: { '1': 'C' }
      })
    }),
    platform
  });
  assert.equal(rogueSubmit.status, 403, 'Foreign session submission must be rejected with 403 Forbidden');
  const rogueBody = await rogueSubmit.json();
  assert.match(rogueBody.error, /ForbiddenSessionAccess/);

  // Verify Beta's session is STILL in_progress and untouched
  const betaSession = rawDb.prepare('SELECT user_id, status FROM exam_sessions WHERE id = ?').get(betaInstanceId);
  assert.equal(betaSession.user_id, 'usr_student_beta');
  assert.equal(betaSession.status, 'in_progress', 'Beta session must remain in_progress');
});

test('P1-EXAM-03: Session submitted with wrong exam_id is rejected with 400 Bad Request', async () => {
  const { platform } = createMockPlatform();
  const studentAlphaToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);

  const alphaStart = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentAlphaToken}` },
      body: JSON.stringify({ action: 'start_session', exam_id: 'ex_g7_hsg_yenlap' })
    }),
    platform
  });
  const alphaData = await alphaStart.json();
  const instanceId = alphaData.session_instance.instance_id;

  // Submit with different exam_id
  const mismatchedSubmit = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentAlphaToken}` },
      body: JSON.stringify({
        exam_id: 'ex_g7_mid1_45m',
        instance_id: instanceId,
        answers: { '1': 'A' }
      })
    }),
    platform
  });
  assert.equal(mismatchedSubmit.status, 400, 'Session exam mismatch must be rejected with 400 Bad Request');
  const errBody = await mismatchedSubmit.json();
  assert.match(errBody.error, /ExamMismatchError/);
});

test('P1-EXAM-04: Student cannot bypass anti-retake lock by sending allow_retake: true', async () => {
  const { platform } = createMockPlatform();
  const studentAlphaToken = await createSignedToken({ id: 'usr_student_alpha', username: 'student_alpha', role: 'student' }, secret);

  // Submit first attempt
  const first = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentAlphaToken}` },
      body: JSON.stringify({
        exam_id: 'ex_g7_hsg_yenlap',
        answers: { '1': 'C' }
      })
    }),
    platform
  });
  assert.equal(first.status, 200);

  // Student tries to start a new session with allow_retake: true
  const rogueRetake = await examPost({
    request: new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentAlphaToken}` },
      body: JSON.stringify({
        action: 'start_session',
        exam_id: 'ex_g7_hsg_yenlap',
        allow_retake: true
      })
    }),
    platform
  });
  assert.equal(rogueRetake.status, 409, 'Student must not be able to bypass retake lock with allow_retake: true');
  const retakeBody = await rogueRetake.json();
  assert.match(retakeBody.error, /DuplicateSubmissionError/);
});

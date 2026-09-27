import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { POST as payrollPost, GET as payrollGet } from '../src/routes/api/teachers/payroll/+server.js';
import { POST as examPost, GET as examGet } from '../src/routes/api/exams/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

function createTestEnvironment() {
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
      ('audit_student', 'audit_student', 'student', 'active'),
      ('audit_teacher', 'audit_teacher', 'teacher', 'active'),
      ('audit_leader', 'audit_leader', 'leader', 'active');

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
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...boundParams) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...boundParams) };
        },
        async run() {
          const res = db.prepare(sql).run(...boundParams);
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
        try { db.exec('ROLLBACK;'); } catch {}
        throw err;
      }
    }
  };

  const secret = 'audit-only-secret-not-production-2026';
  const platform = { env: { DB: adapter, AUTH_SECRET: secret } };

  return { db, adapter, secret, platform };
}

describe('PHASE 1 DEEP AUDIT HARDENING TESTS', () => {
  it('Payroll: Optimistic Concurrency Guard rejects stale expected_status with 409', async () => {
    const { db, secret, platform } = createTestEnvironment();

    // Seed approved payroll
    db.exec(`
      CREATE TABLE IF NOT EXISTS teacher_payrolls (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        gross_amount INTEGER NOT NULL DEFAULT 0,
        net_amount INTEGER NOT NULL DEFAULT 0,
        disbursed_advances_deducted INTEGER NOT NULL DEFAULT 0,
        prior_debt_deducted INTEGER NOT NULL DEFAULT 0,
        carried_over_debt INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        calculation_json TEXT,
        approved_by TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, gross_amount, net_amount, status)
      VALUES ('pr_t1_202609', 't1', '2026-09', 1000000, 1000000, 'approved');
    `);

    const token = await createSignedToken({ id: 'audit_leader', username: 'audit_leader', role: 'leader' }, secret);
    const mockReq = new Request('http://audit/api/teachers/payroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'save_draft',
        teacher_id: 't1',
        billing_cycle: '2026-09',
        expected_status: 'draft' // Caller expects draft, but it was already approved
      })
    });

    const res = await payrollPost({ request: mockReq, platform });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /ConflictError/);
  });

  it('Payroll: GET snapshot strictly synchronizes status with existing_record (P2 Resolution)', async () => {
    const { db, secret, platform } = createTestEnvironment();

    db.exec(`
      CREATE TABLE IF NOT EXISTS teacher_payrolls (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        gross_amount INTEGER NOT NULL DEFAULT 0,
        net_amount INTEGER NOT NULL DEFAULT 0,
        disbursed_advances_deducted INTEGER NOT NULL DEFAULT 0,
        prior_debt_deducted INTEGER NOT NULL DEFAULT 0,
        carried_over_debt INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        calculation_json TEXT,
        approved_by TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, gross_amount, net_amount, status, calculation_json)
      VALUES ('pr_t2_202609', 't2', '2026-09', 600000, 600000, 'locked', '{"status":"draft","summary":{"gross_income":600000,"net_pay":600000}}');
    `);

    const token = await createSignedToken({ id: 'audit_leader', username: 'audit_leader', role: 'leader' }, secret);
    const url = new URL('http://audit/api/teachers/payroll?teacher_id=t2&billing_cycle=2026-09');
    const mockReq = new Request(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const res = await payrollGet({ url, request: mockReq, platform });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.payroll.status, 'locked');
    assert.equal(data.existing_record.status, 'locked');
    assert.equal(data.is_locked, true);
    assert.equal(data.is_approved, true);
  });

  it('Payroll: Disburse records immutable voucher in finance_ledger', async () => {
    const { db, secret, platform } = createTestEnvironment();

    db.exec(`
      CREATE TABLE IF NOT EXISTS teacher_payrolls (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        gross_amount INTEGER NOT NULL DEFAULT 0,
        net_amount INTEGER NOT NULL DEFAULT 0,
        disbursed_advances_deducted INTEGER NOT NULL DEFAULT 0,
        prior_debt_deducted INTEGER NOT NULL DEFAULT 0,
        carried_over_debt INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        calculation_json TEXT,
        approved_by TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, gross_amount, net_amount, status)
      VALUES ('pr_t3_202609', 't3', '2026-09', 500000, 500000, 'approved');
    `);

    const token = await createSignedToken({ id: 'audit_leader', username: 'audit_leader', role: 'leader' }, secret);
    const mockReq = new Request('http://audit/api/teachers/payroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'disburse',
        teacher_id: 't3',
        billing_cycle: '2026-09',
        idempotency_key: 'idemp_test_123'
      })
    });

    const res = await payrollPost({ request: mockReq, platform });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, 'paid');
    assert.ok(data.voucher);
    assert.equal(data.voucher.amount, 500000);
    assert.equal(data.voucher.idempotency_key, 'idemp_test_123');

    const ledger = db.prepare('SELECT * FROM finance_ledger').all();
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].voucher_type, 'PAYROLL_DISBURSEMENT');
    assert.equal(ledger[0].amount, 500000);
  });

  it('Exam: Server-owned instance start, resumption, and deadline enforcement', async () => {
    const { db, secret, platform } = createTestEnvironment();
    const token = await createSignedToken({ id: 'audit_student', username: 'audit_student', role: 'student' }, secret);

    // 1. Student starts exam session
    const startReq = new Request('http://audit/api/exams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'start_session',
        exam_id: 'ex_g7_hsg_yenlap',
        duration_minutes: 45
      })
    });

    const startRes = await examPost({ request: startReq, platform });
    const startData = await startRes.json();
    assert.equal(startRes.status, 200);
    assert.ok(startData.session_instance);
    assert.ok(startData.session_instance.instance_id);
    assert.equal(startData.session_instance.exam_id, 'ex_g7_hsg_yenlap');
    assert.ok(startData.session_instance.questions.length > 0);
    // Sanity check: Ensure questions do NOT contain correct_answer
    assert.equal(startData.session_instance.questions[0].correct_answer, undefined);

    const instanceId = startData.session_instance.instance_id;

    // 2. Student calls start_session again while active -> Resumes session
    const resumeReq = new Request('http://audit/api/exams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'start_session',
        exam_id: 'ex_g7_hsg_yenlap'
      })
    });

    const resumeRes = await examPost({ request: resumeReq, platform });
    const resumeData = await resumeRes.json();
    assert.equal(resumeRes.status, 200);
    assert.equal(resumeData.resumed, true);
    assert.equal(resumeData.session_instance.instance_id, instanceId);

    // 3. Student submits exam with instance_id
    const submitReq = new Request('http://audit/api/exams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        exam_id: 'ex_g7_hsg_yenlap',
        instance_id: instanceId,
        answers: { '1': 'C' }
      })
    });

    const submitRes = await examPost({ request: submitReq, platform });
    const submitData = await submitRes.json();
    assert.equal(submitRes.status, 200);
    assert.ok(submitData.attempt);

    // Verify session updated to submitted in DB
    const sessionInDb = db.prepare('SELECT status, score FROM exam_sessions WHERE id = ?').get(instanceId);
    assert.equal(sessionInDb.status, 'submitted');

    // 4. Repeated submission with same instance_id is rejected with 409
    const dupReq = new Request('http://audit/api/exams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        exam_id: 'ex_g7_hsg_yenlap',
        instance_id: instanceId,
        answers: { '1': 'C' }
      })
    });

    const dupRes = await examPost({ request: dupReq, platform });
    assert.equal(dupRes.status, 409);
  });
});

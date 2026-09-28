import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { POST as authPost } from '../src/routes/api/auth/token/+server.js';
import { POST as payrollPost } from '../src/routes/api/teachers/payroll/+server.js';
import { createSignedToken, hashPassword } from '../src/lib/server/auth.js';

const secret = 'p0-p1-remediation-test-secret-2026';

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
      password TEXT,
      avatar TEXT,
      status TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO users (id, username, role, password, status) VALUES
      ('usr_teacher_1', 'teacher_1', 'teacher', 'pbkdf2:dummy', 'active'),
      ('usr_leader_1', 'leader_1', 'leader', 'pbkdf2:dummy', 'active'),
      ('usr_admin_1', 'admin_1', 'admin', 'pbkdf2:dummy', 'active');

    CREATE TABLE teacher_payrolls (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      month_label TEXT DEFAULT '',
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

    CREATE TABLE finance_ledger (
      id TEXT PRIMARY KEY,
      voucher_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      teacher_id TEXT,
      actor_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'bank_transfer',
      billing_cycle TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      voucher_number TEXT,
      status TEXT DEFAULT 'completed',
      description TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
// SUITE 1: P0 AUTH AUTO-SEEDING CONTAINMENT & FAIL-CLOSED
// =========================================================================

test('P0-01: Public login with non-existent user returns HTTP 401 and creates ZERO rows in D1 users', async () => {
  const { platform, rawDb } = createMockPlatform();

  const countBefore = rawDb.prepare('SELECT COUNT(*) as n FROM users').get().n;

  const res = await authPost({
    request: new Request('http://localhost/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'usr_admin_stage', password: '123' })
    }),
    platform
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);

  const countAfter = rawDb.prepare('SELECT COUNT(*) as n FROM users').get().n;
  assert.equal(countAfter, countBefore, 'Zero rows must be inserted for non-existent users');
  const stageUser = rawDb.prepare("SELECT * FROM users WHERE username = 'usr_admin_stage'").get();
  assert.equal(stageUser, undefined, 'usr_admin_stage must not be created');
});

test('P0-02: Public login with incorrect password returns HTTP 401 and creates ZERO rows', async () => {
  const { platform, rawDb } = createMockPlatform();
  const validHash = await hashPassword('correct_pass');
  rawDb.prepare("UPDATE users SET password = ? WHERE username = 'teacher_1'").run(validHash);

  const countBefore = rawDb.prepare('SELECT COUNT(*) as n FROM users').get().n;

  const res = await authPost({
    request: new Request('http://localhost/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'teacher_1', password: 'wrong_pass' })
    }),
    platform
  });

  assert.equal(res.status, 401);
  const countAfter = rawDb.prepare('SELECT COUNT(*) as n FROM users').get().n;
  assert.equal(countAfter, countBefore);
});

test('P0-03: D1 database query error causes login to fail-closed with HTTP 500 without mock fallback', async () => {
  const failingPlatform = {
    env: {
      AUTH_SECRET: secret,
      DB: {
        prepare() {
          throw new Error('D1_STORAGE_IO_FAILURE: disk read failed');
        }
      }
    }
  };

  const res = await authPost({
    request: new Request('http://localhost/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin_1', password: '123' })
    }),
    platform: failingPlatform
  });

  assert.equal(res.status, 500);
  const data = await res.json();
  assert.match(data.error, /D1_STORAGE_IO_FAILURE/);
});

// =========================================================================
// SUITE 2: P1 PAYROLL ACTION 'adjust' (ATOMIC REOPEN AUDIT)
// =========================================================================

test('P1-01: adjust rejects missing or short (< 5 chars) adjustment_reason with HTTP 400', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'approved');
  `).run();

  // Missing reason
  const res1 = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'adjust', teacher_id: 'usr_teacher_1', billing_cycle: '2026-09' })
    }),
    platform
  });
  assert.equal(res1.status, 400);

  // Short reason (< 5 chars)
  const res2 = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'adjust', teacher_id: 'usr_teacher_1', billing_cycle: '2026-09', adjustment_reason: 'abc' })
    }),
    platform
  });
  assert.equal(res2.status, 400);
});

test('P1-02: adjust rejects unauthorized non-manager (teacher) with HTTP 403', async () => {
  const { platform, rawDb } = createMockPlatform();
  const teacherToken = await createSignedToken({ id: 'usr_teacher_1', username: 'teacher_1', role: 'teacher' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'approved');
  `).run();

  const res = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'adjust', teacher_id: 'usr_teacher_1', billing_cycle: '2026-09', adjustment_reason: 'Thêm buổi học bù' })
    }),
    platform
  });
  assert.equal(res.status, 403);
});

test('P1-03: adjust returns HTTP 500 (PayrollTransactionError) when db.batch is unavailable', async () => {
  const { rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'approved');
  `).run();

  const nonBatchPlatform = {
    env: {
      AUTH_SECRET: secret,
      DB: {
        prepare(sql) {
          let bound = [];
          return {
            bind(...args) { bound = args; return this; },
            async first() { return rawDb.prepare(sql).get(...bound) || null; },
            async run() { return { meta: { changes: rawDb.prepare(sql).run(...bound).changes } }; }
          };
        }
      }
    }
  };

  const res = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'adjust', teacher_id: 'usr_teacher_1', billing_cycle: '2026-09', adjustment_reason: 'Cần cập nhật số tiết' })
    }),
    platform: nonBatchPlatform
  });

  assert.equal(res.status, 500);
  const data = await res.json();
  assert.match(data.error, /PayrollTransactionError/);

  // Invariant: status remains approved, finance_ledger has 0 rows
  const row = rawDb.prepare("SELECT status FROM teacher_payrolls WHERE id = 'pr_t1_202609'").get();
  assert.equal(row.status, 'approved');
  const ledgerCount = rawDb.prepare("SELECT COUNT(*) as n FROM finance_ledger").get().n;
  assert.equal(ledgerCount, 0);
});

test('P1-04: adjust atomically reopens approved payroll to draft and writes full snapshot audit', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, gross_amount, net_amount, status, calculation_json, approved_by, approved_at)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 6000000, 5000000, 'approved', '{"summary":{"net_pay":5000000}}', 'usr_leader_1', CURRENT_TIMESTAMP);
  `).run();

  const res = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'adjust',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_reason: 'Điều chỉnh số tiết dạy thực tế'
      })
    }),
    platform
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.status, 'draft');

  // Verify DB state
  const payrollRow = rawDb.prepare("SELECT * FROM teacher_payrolls WHERE id = 'pr_t1_202609'").get();
  assert.equal(payrollRow.status, 'draft');
  assert.equal(payrollRow.approved_by, null);
  assert.equal(payrollRow.approved_at, null);

  const ledgerRow = rawDb.prepare("SELECT * FROM finance_ledger WHERE reference_id = 'pr_t1_202609'").get();
  assert.ok(ledgerRow);
  assert.equal(ledgerRow.voucher_type, 'PAYROLL_REOPEN_AUDIT');
  assert.equal(ledgerRow.amount, 5000000);
  assert.match(ledgerRow.description, /Điều chỉnh số tiết dạy thực tế/);

  const metadata = JSON.parse(ledgerRow.metadata_json);
  assert.equal(metadata.previous_status, 'approved');
  assert.equal(metadata.net_amount, 5000000);
  assert.equal(metadata.gross_amount, 6000000);
  assert.equal(metadata.approved_by, 'usr_leader_1');
  assert.equal(metadata.calculation_snapshot.summary.net_pay, 5000000);
});

test('P1-05: adjust rolls back cleanly when UPDATE triggers failure, leaving ZERO audit records', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'approved');
  `).run();

  // Create an SQLite trigger that aborts UPDATE on teacher_payrolls
  rawDb.exec(`
    CREATE TRIGGER abort_reopen_trigger
    BEFORE UPDATE ON teacher_payrolls
    BEGIN
      SELECT RAISE(ABORT, 'SIMULATED_REOPEN_UPDATE_ABORT');
    END;
  `);

  const res = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'adjust', teacher_id: 'usr_teacher_1', billing_cycle: '2026-09', adjustment_reason: 'Thử nghiệm rollback' })
    }),
    platform
  });

  assert.equal(res.status, 500);

  // Invariant: Status remains approved and ZERO audit records exist
  const payrollRow = rawDb.prepare("SELECT status FROM teacher_payrolls WHERE id = 'pr_t1_202609'").get();
  assert.equal(payrollRow.status, 'approved');
  const ledgerCount = rawDb.prepare("SELECT COUNT(*) as n FROM finance_ledger").get().n;
  assert.equal(ledgerCount, 0, 'Zero audit records must exist after rollback');
});

test('P1-06: adjust retry with same idempotency_key returns cached replay even if payroll is already draft', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'approved');
  `).run();

  const idemKey = 'idem_adjust_test_01';

  // First request
  const res1 = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'adjust',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_reason: 'Cập nhật thưởng chuyên cần',
        idempotency_key: idemKey
      })
    }),
    platform
  });
  assert.equal(res1.status, 200);

  // Retry with same idempotency_key
  const res2 = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'adjust',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_reason: 'Cập nhật thưởng chuyên cần',
        idempotency_key: idemKey
      })
    }),
    platform
  });

  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.idempotent_replay, true);
  assert.equal(data2.status, 'draft');

  // Ledger still has exactly 1 row
  const ledgerCount = rawDb.prepare("SELECT COUNT(*) as n FROM finance_ledger").get().n;
  assert.equal(ledgerCount, 1);
});

// =========================================================================
// SUITE 3: P1 PAYROLL ACTION 'create_adjustment' (DIFFERENTIAL VOUCHER)
// =========================================================================

test('P1-07: create_adjustment rejects draft or approved payroll with HTTP 409 (only paid/closed allowed)', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'approved');
  `).run();

  const res = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'create_adjustment',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_amount: 500000,
        adjustment_reason: 'Thưởng hiệu quả giảng dạy'
      })
    }),
    platform
  });
  assert.equal(res.status, 409);
});

test('P1-08: create_adjustment strictly validates adjustment_amount (rejects boolean, array, object, NaN, Infinity, decimal, zero)', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'paid');
  `).run();

  const invalidAmounts = [
    true,
    false,
    [500000],
    { amount: 500000 },
    null,
    'not_a_number',
    0,
    1000.5,
    Number.NaN,
    Number.POSITIVE_INFINITY
  ];

  for (const invalid of invalidAmounts) {
    const res = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'create_adjustment',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_amount: invalid,
          adjustment_reason: 'Test số tiền không hợp lệ'
        })
      }),
      platform
    });
    assert.equal(res.status, 400, `Should reject invalid amount: ${JSON.stringify(invalid)}`);
  }
});

test('P1-09: create_adjustment creates pending_approval voucher without modifying original payroll', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, gross_amount, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 6000000, 5000000, 'paid');
  `).run();

  const res = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'create_adjustment',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_amount: 300000,
        adjustment_reason: 'Bổ sung phụ cấp chuyên cần tháng 9',
        effective_date: '2026-09-30'
      })
    }),
    platform
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.adjustment.version, 1);
  assert.equal(data.adjustment.adjustment_amount, 300000);
  assert.equal(data.adjustment.status, 'pending_approval');
  assert.equal(data.adjustment.disbursed, false);

  // Invariant: original payroll is 100% untouched
  const payrollRow = rawDb.prepare("SELECT * FROM teacher_payrolls WHERE id = 'pr_t1_202609'").get();
  assert.equal(payrollRow.status, 'paid');
  assert.equal(payrollRow.net_amount, 5000000);
  assert.equal(payrollRow.gross_amount, 6000000);

  // Ledger has pending_approval voucher
  const ledgerRow = rawDb.prepare("SELECT * FROM finance_ledger WHERE reference_id = 'pr_t1_202609'").get();
  assert.ok(ledgerRow);
  assert.equal(ledgerRow.voucher_type, 'PAYROLL_ADJUSTMENT');
  assert.equal(ledgerRow.status, 'pending_approval');
  assert.equal(ledgerRow.amount, 300000);
});

test('P1-10: create_adjustment sequential versioning & idempotency replay/conflict behavior', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

  rawDb.prepare(`
    INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
    VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'paid');
  `).run();

  const clientKey = 'client_op_adj_999';

  // 1. Create adjustment v1 with clientKey
  const res1 = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'create_adjustment',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_amount: 250000,
        adjustment_reason: 'Khen thưởng giáo viên tiêu biểu',
        idempotency_key: clientKey
      })
    }),
    platform
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.adjustment.version, 1);

  // 2. Retry with same clientKey and same payload -> Returns 200 idempotent replay
  const resReplay = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'create_adjustment',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_amount: 250000,
        adjustment_reason: 'Khen thưởng giáo viên tiêu biểu',
        idempotency_key: clientKey
      })
    }),
    platform
  });
  assert.equal(resReplay.status, 200);
  const dataReplay = await resReplay.json();
  assert.equal(dataReplay.idempotent_replay, true);
  assert.equal(dataReplay.adjustment.voucher_id, data1.adjustment.voucher_id);

  // 3. Retry with same clientKey but conflicting payload (different amount) -> Returns 409 Conflict
  const resConflict = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'create_adjustment',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_amount: 999999, // Different amount
        adjustment_reason: 'Khen thưởng giáo viên tiêu biểu',
        idempotency_key: clientKey
      })
    }),
    platform
  });
  assert.equal(resConflict.status, 409);

  // 4. Create second distinct adjustment -> Version increments to 2
  const res2 = await payrollPost({
    request: new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({
        action: 'create_adjustment',
        teacher_id: 'usr_teacher_1',
        billing_cycle: '2026-09',
        adjustment_amount: -50000,
        adjustment_reason: 'Trừ phí đồng phục gửi muộn'
      })
    }),
    platform
  });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.adjustment.version, 2);
  assert.equal(data2.adjustment.adjustment_amount, -50000);
});

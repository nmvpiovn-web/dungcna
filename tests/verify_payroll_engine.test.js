import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSessionPay,
  calculateTeacherMonthlyPayroll,
  DEFAULT_RATE_MODEL
} from '../src/lib/server/payrollEngine.js';

describe('TEACHER PAYROLL ENGINE & TIMESHEET RECONCILIATION AUDIT SUITE', () => {
  test('PAY-01: Session pay calculation respects role multipliers and session duration', () => {
    // 90 mins main teacher: 1.5h * 200,000 * 1.0 = 300,000
    const mainPay = calculateSessionPay({ duration_minutes: 90, role: 'main_teacher', status: 'completed' });
    assert.strictEqual(mainPay, 300000);

    // 90 mins substitute teacher: 1.5h * 200,000 * 1.1 = 330,000
    const subPay = calculateSessionPay({ duration_minutes: 90, role: 'substitute', status: 'completed' });
    assert.strictEqual(subPay, 330000);

    // 90 mins co-teacher: 1.5h * 200,000 * 0.6 = 180,000
    const coTeachPay = calculateSessionPay({ duration_minutes: 90, role: 'co_teacher', status: 'completed' });
    assert.strictEqual(coTeachPay, 180000);

    // 60 mins tutoring: 1.0h * 200,000 * 1.25 = 250,000
    const tutoringPay = calculateSessionPay({ duration_minutes: 60, role: 'tutoring', status: 'completed' });
    assert.strictEqual(tutoringPay, 250000);

    // Non-completed session must return 0
    const pendingPay = calculateSessionPay({ duration_minutes: 90, role: 'main_teacher', status: 'scheduled' });
    assert.strictEqual(pendingPay, 0);
  });

  test('PAY-02: Full monthly payroll aggregates gross pay, filters unexcused absences, and deducts disbursed advances', () => {
    const sessions = [
      // 3 main sessions: 3 * 300,000 = 900,000
      { id: 's1', session_date: '2026-09-02', role: 'main_teacher', duration_minutes: 90, status: 'completed' },
      { id: 's2', session_date: '2026-09-05', role: 'main_teacher', duration_minutes: 90, status: 'completed' },
      { id: 's3', session_date: '2026-09-09', role: 'main_teacher', duration_minutes: 90, status: 'completed' },
      // 1 substitute session: 330,000
      { id: 's4', session_date: '2026-09-12', role: 'substitute', duration_minutes: 90, status: 'completed' },
      // 1 co-teacher session: 180,000
      { id: 's5', session_date: '2026-09-16', role: 'co_teacher', duration_minutes: 90, status: 'completed' },
      // 1 unexcused absence: 0 pay
      { id: 's6', session_date: '2026-09-19', role: 'main_teacher', duration_minutes: 90, status: 'unexcused_absent' }
    ];

    const advances = [
      // 1 disbursed advance: 500,000 (must be deducted)
      { id: 'adv_1', amount: 500000, status: 'disbursed', disbursed_date: '2026-09-10' },
      // 1 approved but NOT yet disbursed advance (must NOT be deducted)
      { id: 'adv_2', amount: 200000, status: 'approved' },
      // 1 rejected advance (must NOT be deducted)
      { id: 'adv_3', amount: 1000000, status: 'rejected' }
    ];

    const result = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions,
      advances,
      bonusAmount: 100000
    });

    // Teaching Pay: 900,000 + 330,000 + 180,000 = 1,410,000
    // Gross Income: 1,410,000 + 100,000 (bonus) = 1,510,000
    assert.strictEqual(result.summary.teaching_pay, 1410000);
    assert.strictEqual(result.summary.bonus_amount, 100000);
    assert.strictEqual(result.summary.gross_income, 1510000);
    assert.strictEqual(result.summary.total_sessions, 6);
    assert.strictEqual(result.summary.payable_sessions, 5);

    // Only disbursed advance deducted: 500,000
    assert.strictEqual(result.summary.disbursed_advances_deducted, 500000);
    assert.strictEqual(result.summary.carried_over_debt, 0);

    // Net pay: 1,510,000 - 500,000 = 1,010,000
    assert.strictEqual(result.summary.net_pay, 1010000);
    assert.strictEqual(result.summary.currency, 'VND');
  });

  test('PAY-03: Locked period guard strictly blocks recalculation', () => {
    assert.throws(() => {
      calculateTeacherMonthlyPayroll({
        teacherId: 'usr_teacher_lan',
        billingCycle: '2026-08',
        sessions: [{ id: 's1', role: 'main_teacher', duration_minutes: 90, status: 'completed' }],
        existingPeriod: { status: 'locked' }
      });
    }, /LockedPayrollPeriodError/);
  });

  test('PAY-04: Deterministic VND integer rounding (Zero fractional decimals)', () => {
    // Session with 47 minutes (odd fraction of hour)
    const oddPay = calculateSessionPay({ duration_minutes: 47, role: 'main_teacher', status: 'completed' });
    assert.ok(Number.isInteger(oddPay), 'Calculated pay must be an integer');

    const result = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions: [
        { id: 's1', duration_minutes: 47, role: 'main_teacher', status: 'completed' },
        { id: 's2', duration_minutes: 83, role: 'substitute', status: 'completed' }
      ],
      advances: [{ id: 'adv_odd', amount: 333333.33, status: 'disbursed' }]
    });

    assert.ok(Number.isInteger(result.summary.gross_income), 'Gross income must be strictly integer');
    assert.ok(Number.isInteger(result.summary.disbursed_advances_deducted), 'Advances must be strictly integer');
    assert.ok(Number.isInteger(result.summary.net_pay), 'Net pay must be strictly integer');
  });

  test('PAY-05: Carried-over Debt Policy: When advance exceeds gross, net pay is 0 and debt carries over', () => {
    // Teacher only worked 1 session (300,000 VND), but had a disbursed advance of 1,000,000 VND
    const month1 = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions: [
        { id: 's1', duration_minutes: 90, role: 'main_teacher', status: 'completed' }
      ],
      advances: [
        { id: 'adv_big', amount: 1000000, status: 'disbursed' }
      ]
    });

    assert.strictEqual(month1.summary.gross_income, 300000);
    assert.strictEqual(month1.summary.disbursed_advances_deducted, 1000000);
    assert.strictEqual(month1.summary.total_deductions_applied, 300000, 'Only 300k could be recovered this month');
    assert.strictEqual(month1.summary.net_pay, 0, 'Net cash cannot be negative');
    assert.strictEqual(month1.summary.carried_over_debt, 700000, 'Unrecovered 700,000 VND must be carried over to next cycle');

    // Month 2: Teacher works 4 sessions (1,200,000 VND) with previousDebtBalance = 700,000 VND
    const month2 = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-10',
      sessions: [
        { id: 's2_1', duration_minutes: 90, role: 'main_teacher', status: 'completed' },
        { id: 's2_2', duration_minutes: 90, role: 'main_teacher', status: 'completed' },
        { id: 's2_3', duration_minutes: 90, role: 'main_teacher', status: 'completed' },
        { id: 's2_4', duration_minutes: 90, role: 'main_teacher', status: 'completed' }
      ],
      advances: [],
      previousDebtBalance: month1.summary.carried_over_debt // 700,000
    });

    assert.strictEqual(month2.summary.gross_income, 1200000);
    assert.strictEqual(month2.summary.prior_debt_deducted, 700000);
    assert.strictEqual(month2.summary.total_deductions_applied, 700000);
    assert.strictEqual(month2.summary.carried_over_debt, 0, 'Prior debt fully cleared');
    assert.strictEqual(month2.summary.net_pay, 500000, 'Net pay: 1,200,000 - 700,000 = 500,000');
  });

  // =========================================================================
  // D1 ENDPOINT INTEGRATION: /api/teachers/payroll
  // =========================================================================
  test('PAY-06: Endpoint GET /api/teachers/payroll calculates payroll and enforces teacher privacy isolation', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { GET: getPayroll } = await import('../src/routes/api/teachers/payroll/+server.js');
    const { createSignedToken } = await import('../src/lib/server/auth.js');

    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, role TEXT, name TEXT, phone TEXT, email TEXT, avatar TEXT, status TEXT, metadata TEXT, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE class_sessions (id TEXT PRIMARY KEY, session_date TEXT, teacher_id TEXT, duration_minutes INTEGER, status TEXT, role TEXT);
      CREATE TABLE teacher_salary_advances (id TEXT PRIMARY KEY, teacher_id TEXT, amount REAL, status TEXT, billing_cycle TEXT, disbursed_date TEXT);
      CREATE TABLE teacher_payrolls (id TEXT PRIMARY KEY, teacher_id TEXT, billing_cycle TEXT, gross_amount INTEGER, net_amount INTEGER, disbursed_advances_deducted INTEGER, prior_debt_deducted INTEGER, carried_over_debt INTEGER, status TEXT, calculation_json TEXT, approved_by TEXT, approved_at DATETIME, created_at DATETIME, updated_at DATETIME);

      INSERT INTO users (id, username, role, name, status) VALUES
        ('t_lan', 'teacherlan', 'teacher', 'Cô Lan', 'active'),
        ('t_quynh', 'teacherquynh', 'teacher', 'Cô Quỳnh', 'active'),
        ('leader_dung', 'msdung', 'leader', 'Cô Dung Leader', 'active');

      INSERT INTO class_sessions VALUES
        ('s1', '2026-09-02', 't_lan', 90, 'completed', 'main_teacher'),
        ('s2', '2026-09-05', 't_lan', 90, 'completed', 'main_teacher'),
        ('s3', '2026-09-09', 't_quynh', 90, 'completed', 'main_teacher');
    `);

    function createAdapter(sqlite) {
      return {
        prepare(sql) {
          let args = [];
          return {
            bind(...b) { args = b; return this; },
            async first() { return sqlite.prepare(sql).get(...args) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...args) }; },
            async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; }
          };
        }
      };
    }

    const secret = 'payroll_audit_hmac_secret_2026_test';
    const mockPlatform = { env: { DB: createAdapter(db), AUTH_SECRET: secret } };

    const lanToken = await createSignedToken({ id: 't_lan', username: 'teacherlan', role: 'teacher' }, secret);
    const quynhToken = await createSignedToken({ id: 't_quynh', username: 'teacherquynh', role: 'teacher' }, secret);

    // Lan queries her own payroll
    const urlLan = new URL('http://localhost/api/teachers/payroll?billing_cycle=2026-09');
    const reqLan = new Request(urlLan, { headers: { 'Authorization': `Bearer ${lanToken}` } });
    const resLan = await getPayroll({ url: urlLan, request: reqLan, platform: mockPlatform });
    assert.strictEqual(resLan.status, 200);
    const jsonLan = await resLan.json();
    assert.strictEqual(jsonLan.payroll.teacher_id, 't_lan');
    assert.strictEqual(jsonLan.payroll.summary.payable_sessions, 2);
    assert.strictEqual(jsonLan.payroll.summary.gross_income, 600000);

    // Lan attempts to snoop Quynh's payroll -> strictly scoped back to Lan (privacy isolation)
    const urlSnoop = new URL('http://localhost/api/teachers/payroll?teacher_id=t_quynh&billing_cycle=2026-09');
    const reqSnoop = new Request(urlSnoop, { headers: { 'Authorization': `Bearer ${lanToken}` } });
    const resSnoop = await getPayroll({ url: urlSnoop, request: reqSnoop, platform: mockPlatform });
    assert.strictEqual(resSnoop.status, 200);
    const jsonSnoop = await resSnoop.json();
    assert.strictEqual(jsonSnoop.payroll.teacher_id, 't_lan', 'Non-manager querying other teacher must be scoped to self');
  });

  test('PAY-07: Endpoint POST /api/teachers/payroll locks period and rejects subsequent modifications with HTTP 409 Conflict', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { POST: postPayroll } = await import('../src/routes/api/teachers/payroll/+server.js');
    const { createSignedToken } = await import('../src/lib/server/auth.js');

    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, role TEXT, name TEXT, phone TEXT, email TEXT, avatar TEXT, status TEXT, metadata TEXT, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE class_sessions (id TEXT PRIMARY KEY, session_date TEXT, teacher_id TEXT, duration_minutes INTEGER, status TEXT, role TEXT);
      CREATE TABLE teacher_salary_advances (id TEXT PRIMARY KEY, teacher_id TEXT, amount REAL, status TEXT, billing_cycle TEXT, disbursed_date TEXT);
      CREATE TABLE teacher_payrolls (id TEXT PRIMARY KEY, teacher_id TEXT, billing_cycle TEXT, gross_amount INTEGER, net_amount INTEGER, disbursed_advances_deducted INTEGER, prior_debt_deducted INTEGER, carried_over_debt INTEGER, status TEXT, calculation_json TEXT, approved_by TEXT, approved_at DATETIME, created_at DATETIME, updated_at DATETIME);

      INSERT INTO users (id, username, role, name, status) VALUES
        ('t_lan', 'teacherlan', 'teacher', 'Cô Lan', 'active'),
        ('leader_dung', 'msdung', 'leader', 'Cô Dung Leader', 'active');

      INSERT INTO class_sessions VALUES
        ('s1', '2026-09-02', 't_lan', 90, 'completed', 'main_teacher');
    `);

    function createAdapter(sqlite) {
      return {
        prepare(sql) {
          let args = [];
          return {
            bind(...b) { args = b; return this; },
            async first() { return sqlite.prepare(sql).get(...args) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...args) }; },
            async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; }
          };
        }
      };
    }

    const secret = 'payroll_audit_hmac_secret_2026_test';
    const mockPlatform = { env: { DB: createAdapter(db), AUTH_SECRET: secret } };

    const leaderToken = await createSignedToken({ id: 'leader_dung', username: 'msdung', role: 'leader' }, secret);
    const lanToken = await createSignedToken({ id: 't_lan', username: 'teacherlan', role: 'teacher' }, secret);

    // 1. Regular teacher cannot lock period (Forbidden 403)
    const reqLanLock = new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lanToken}` },
      body: JSON.stringify({ action: 'lock', teacher_id: 't_lan', billing_cycle: '2026-09' })
    });
    const resLanLock = await postPayroll({ request: reqLanLock, platform: mockPlatform });
    assert.strictEqual(resLanLock.status, 403, 'Regular teacher cannot lock payroll');

    // 2. Leader locks period successfully
    const reqLeaderLock = new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'lock', teacher_id: 't_lan', billing_cycle: '2026-09' })
    });
    const resLeaderLock = await postPayroll({ request: reqLeaderLock, platform: mockPlatform });
    assert.strictEqual(resLeaderLock.status, 200);
    const jsonLock = await resLeaderLock.json();
    assert.strictEqual(jsonLock.status, 'locked');

    // 3. Subsequent modification attempt on locked period returns HTTP 409 Conflict
    const reqEditLocked = new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'approve', teacher_id: 't_lan', billing_cycle: '2026-09' })
    });
    const resEditLocked = await postPayroll({ request: reqEditLocked, platform: mockPlatform });
    assert.strictEqual(resEditLocked.status, 409, 'Locked period must strictly reject modifications with 409 Conflict');
  });

  test('PAY-08: Multi-cycle carried-over debt persistence and recovery across 2 consecutive cycles in D1', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { GET: getPayroll, POST: postPayroll } = await import('../src/routes/api/teachers/payroll/+server.js');
    const { createSignedToken } = await import('../src/lib/server/auth.js');

    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, role TEXT, name TEXT, phone TEXT, email TEXT, avatar TEXT, status TEXT, metadata TEXT, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE class_sessions (id TEXT PRIMARY KEY, session_date TEXT, teacher_id TEXT, duration_minutes INTEGER, status TEXT, role TEXT);
      CREATE TABLE teacher_salary_advances (id TEXT PRIMARY KEY, teacher_id TEXT, amount REAL, status TEXT, billing_cycle TEXT, disbursed_date TEXT);
      CREATE TABLE teacher_payrolls (id TEXT PRIMARY KEY, teacher_id TEXT, billing_cycle TEXT, gross_amount INTEGER, net_amount INTEGER, disbursed_advances_deducted INTEGER, prior_debt_deducted INTEGER, carried_over_debt INTEGER, status TEXT, calculation_json TEXT, approved_by TEXT, approved_at DATETIME, created_at DATETIME, updated_at DATETIME);

      INSERT INTO users (id, username, role, name, status) VALUES
        ('t_quynh', 'teacherquynh', 'teacher', 'Cô Quỳnh', 'active'),
        ('leader_dung', 'msdung', 'leader', 'Cô Dung Leader', 'active');

      -- Cycle 1 (2026-09): Only 1 session = 300,000 VND
      INSERT INTO class_sessions VALUES
        ('sess_sep_1', '2026-09-05', 't_quynh', 90, 'completed', 'main_teacher'),
        -- Cycle 2 (2026-10): 4 sessions = 1,200,000 VND
        ('sess_oct_1', '2026-10-02', 't_quynh', 90, 'completed', 'main_teacher'),
        ('sess_oct_2', '2026-10-05', 't_quynh', 90, 'completed', 'main_teacher'),
        ('sess_oct_3', '2026-10-09', 't_quynh', 90, 'completed', 'main_teacher'),
        ('sess_oct_4', '2026-10-12', 't_quynh', 90, 'completed', 'main_teacher');

      -- Large advance of 800,000 VND in cycle 2026-09
      INSERT INTO teacher_salary_advances VALUES
        ('adv_sep', 't_quynh', 800000, 'disbursed', '2026-09', '2026-09-01');
    `);

    function createAdapter(sqlite) {
      return {
        prepare(sql) {
          let args = [];
          return {
            bind(...b) { args = b; return this; },
            async first() { return sqlite.prepare(sql).get(...args) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...args) }; },
            async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; }
          };
        }
      };
    }

    const secret = 'payroll_audit_hmac_secret_2026_test';
    const mockPlatform = { env: { DB: createAdapter(db), AUTH_SECRET: secret } };
    const leaderToken = await createSignedToken({ id: 'leader_dung', username: 'msdung', role: 'leader' }, secret);

    // 1. Calculate & Lock Cycle 1 (2026-09): Gross = 300k, Advance = 800k -> Net = 0, Carried debt = 500k
    const reqLockSep = new Request('http://localhost/api/teachers/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'lock', teacher_id: 't_quynh', billing_cycle: '2026-09' })
    });
    const resLockSep = await postPayroll({ request: reqLockSep, platform: mockPlatform });
    assert.strictEqual(resLockSep.status, 200);
    const jsonSep = await resLockSep.json();
    assert.strictEqual(jsonSep.payroll.summary.gross_income, 300000);
    assert.strictEqual(jsonSep.payroll.summary.net_pay, 0);
    assert.strictEqual(jsonSep.payroll.summary.carried_over_debt, 500000);

    // Verify D1 record for 2026-09
    const d1Sep = db.prepare("SELECT * FROM teacher_payrolls WHERE teacher_id = 't_quynh' AND billing_cycle = '2026-09'").get();
    assert.ok(d1Sep);
    assert.strictEqual(Number(d1Sep.carried_over_debt), 500000);
    assert.strictEqual(d1Sep.status, 'locked');

    // 2. Query Cycle 2 (2026-10): Should automatically load previousDebtBalance = 500,000 from D1!
    const urlOct = new URL('http://localhost/api/teachers/payroll?teacher_id=t_quynh&billing_cycle=2026-10');
    const reqOct = new Request(urlOct, { headers: { 'Authorization': `Bearer ${leaderToken}` } });
    const resOct = await getPayroll({ url: urlOct, request: reqOct, platform: mockPlatform });
    assert.strictEqual(resOct.status, 200);
    const jsonOct = await resOct.json();

    // In 2026-10: Gross = 1,200,000 (4 sessions); Prior debt deducted = 500,000; Net pay = 700,000; Carried debt = 0!
    assert.strictEqual(jsonOct.payroll.summary.gross_income, 1200000);
    assert.strictEqual(jsonOct.payroll.summary.prior_debt_deducted, 500000, 'Prior debt must be loaded from D1 and deducted');
    assert.strictEqual(jsonOct.payroll.summary.carried_over_debt, 0, 'Carried debt cleared in cycle 2');
    assert.strictEqual(jsonOct.payroll.summary.net_pay, 700000, 'Net payout = 1,200,000 - 500,000 = 700,000 VND');
  });
});

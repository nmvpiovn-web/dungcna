/**
 * verify_codex_7216f8c_audit.test.js
 * Comprehensive Behavioral Test Suite for Codex Audit Handoff 7216f8c:
 * - P1-01: D1 Guest Fail-Closed (No Fake Memory Fallback on DB Errors)
 * - P1-02: Guest UPDATE CAS & Deadline Enforcement (Race Resolution with Winning Result)
 * - P1-03: Real Server Star Ledger for Tuition (Balance Check, Atomic Debit, Rollback, Refund)
 * - P1-04: True Atomic SQL for Substitute Workflow (Symmetric Overlap Guard, No Compensation Needed)
 */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { POST as postGuestExam } from '../src/routes/api/exams/guest/+server.js';
import { POST as postTuition, GET as getTuition, DELETE as deleteTuition } from '../src/routes/api/tuition/+server.js';
import { POST as postWorkflow } from '../src/routes/api/teachers/workflows/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const TEST_SECRET = 'ephemeral_test_secret_hmac_2026_isolated_for_audit';

// Helper to create Cloudflare D1-compatible adapter wrapping isolated SQLite DatabaseSync
function createD1Adapter(sqliteDb) {
  return {
    prepare(sql) {
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async first() {
          const stmt = sqliteDb.prepare(sql);
          return stmt.get(...boundArgs) || null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          const rows = stmt.all(...boundArgs);
          return { results: rows };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const result = stmt.run(...boundArgs);
          return { meta: { changes: Number(result.changes) } };
        }
      };
    },
    async batch(statements) {
      sqliteDb.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          const res = await s.run();
          results.push(res);
        }
        sqliteDb.exec('COMMIT');
        return results;
      } catch (err) {
        try { sqliteDb.exec('ROLLBACK'); } catch {}
        throw err;
      }
    }
  };
}

describe('CODEX AUDIT HANDOFF 7216f8c - REAL BEHAVIORAL SUITE', async () => {
  let leaderToken;
  let teacherToken;

  before(async () => {
    leaderToken = await createSignedToken(
      { id: 'usr_msdung', username: 'msdung', role: 'leader', name: 'Cô Dung', status: 'active' },
      TEST_SECRET
    );
    teacherToken = await createSignedToken(
      { id: 'usr_teacher_lan', username: 'lan', role: 'teacher', name: 'Cô Lan', status: 'active' },
      TEST_SECRET
    );
  });

  // =========================================================================
  // 1. P1-01 & P1-02: GUEST EXAM D1 FAIL-CLOSED & CAS CONCURRENCY
  // =========================================================================
  describe('P1-01 & P1-02: Guest Exam D1 Storage & CAS Update', () => {
    test('P1-01.1: Fault Injection: When D1 DB throws during start, handler MUST fail-closed with 500, NOT fake 200', async () => {
      const throwingDb = {
        prepare() {
          return {
            bind() { return this; },
            async run() { throw new Error('D1_IO_DISK_CORRUPTION: cannot write'); },
            async first() { throw new Error('D1_IO_DISK_CORRUPTION: cannot read'); },
            async all() { throw new Error('D1_IO_DISK_CORRUPTION: cannot read'); }
          };
        }
      };

      const startReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_minutes: 5, candidate_name: 'Test FailClosed' })
      });

      const res = await postGuestExam({ request: startReq, platform: { env: { DB: throwingDb, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 500, 'Must return HTTP 500 when D1 DB fails on session creation');
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.match(body.error, /Fail-Closed/i);
    });

    test('P1-01.2: Fault Injection: When D1 DB throws during submit, handler MUST fail-closed with 500, NOT fake 200', async () => {
      // First, create a valid session in an isolated SQLite DB
      const sqlite = new DatabaseSync(':memory:');
      const db = createD1Adapter(sqlite);

      const startReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_minutes: 5, candidate_name: 'Test DB Error' })
      });
      const startRes = await postGuestExam({ request: startReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(startRes.status, 200);
      const startData = await startRes.json();
      const sessionId = startData.guest_session_id;
      const token = startData.guest_token;
      const questionId = startData.questions[0].id;

      // Now create a DB wrapper that throws specifically on UPDATE
      const failingUpdateDb = {
        ...db,
        prepare(sql) {
          if (sql.includes('UPDATE guest_exam_sessions')) {
            return {
              bind() { return this; },
              async run() { throw new Error('D1_FATAL_TRANSACTION_ABORT'); }
            };
          }
          return db.prepare(sql);
        }
      };

      const submitReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: sessionId,
          guest_token: token,
          answers: { [questionId]: 'A' }
        })
      });

      const submitRes = await postGuestExam({ request: submitReq, platform: { env: { DB: failingUpdateDb, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(submitRes.status, 500, 'Must return HTTP 500 when D1 DB fails on update');
      const submitData = await submitRes.json();
      assert.strictEqual(submitData.success, false);
      assert.match(submitData.error, /Fail-Closed/i);
    });

    test('P1-02.1: Multi-Worker Concurrency / CAS Race: Worker with changes===0 returns committed winning result', async () => {
      const sqlite = new DatabaseSync(':memory:');
      const db = createD1Adapter(sqlite);

      // Start session
      const startReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_minutes: 5, candidate_name: 'Worker Race Test' })
      });
      const startRes = await postGuestExam({ request: startReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      const startData = await startRes.json();
      const sessionId = startData.guest_session_id;
      const token = startData.guest_token;
      const q1 = startData.questions[0].id;

      // Both workers submit concurrently with DIFFERENT answers
      const w1 = postGuestExam({
        request: new Request('http://localhost/api/exams/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit', guest_session_id: sessionId, guest_token: token, answers: { [q1]: 'A' } })
        }),
        platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } }
      });
      const w2 = postGuestExam({
        request: new Request('http://localhost/api/exams/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit', guest_session_id: sessionId, guest_token: token, answers: { [q1]: 'B' } })
        }),
        platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } }
      });

      const [res1, res2] = await Promise.all([w1, w2]);
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);
      const data1 = await res1.json();
      const data2 = await res2.json();

      assert.strictEqual(data1.success, true);
      assert.strictEqual(data2.success, true);

      // Exactly one worker won the CAS race, the other worker received changes=0 and fetched the winning result
      const concurrentWorker = data1.concurrent_resolution ? data1 : data2;
      const winningWorker = data1.concurrent_resolution ? data2 : data1;
      assert.strictEqual(concurrentWorker.concurrent_resolution, true, 'Worker receiving changes=0 must resolve concurrently');
      assert.strictEqual(concurrentWorker.result.score_10, winningWorker.result.score_10, 'Both workers must return identical winning score');
    });

    test('P1-02.2: Deadline check in write condition: expired session update changes=0 returns 403', async () => {
      const sqlite = new DatabaseSync(':memory:');
      const db = createD1Adapter(sqlite);

      // Start session
      const startReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_minutes: 5, candidate_name: 'Expiry Test' })
      });
      const startRes = await postGuestExam({ request: startReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      const startData = await startRes.json();
      const sessionId = startData.guest_session_id;
      const token = startData.guest_token;
      const q1 = startData.questions[0].id;

      // Manually set session expiry into the past in DB
      sqlite.prepare('UPDATE guest_exam_sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 10000, sessionId);

      const submitReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: sessionId,
          guest_token: token,
          answers: { [q1]: 'A' }
        })
      });
      const submitRes = await postGuestExam({ request: submitReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(submitRes.status, 403, 'Expired session must return HTTP 403 Forbidden');
      const submitData = await submitRes.json();
      assert.strictEqual(submitData.success, false);
      assert.match(submitData.error, /Hết giờ/i);
    });
  });

  // =========================================================================
  // 2. P1-03: REAL SERVER STAR LEDGER FOR TUITION
  // =========================================================================
  describe('P1-03: Real Server Star Ledger for Tuition', () => {
    let sqlite;
    let db;

    beforeEach(() => {
      sqlite = new DatabaseSync(':memory:');
      db = createD1Adapter(sqlite);

      // Create initial schema
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS tuition_bills (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          age INTEGER DEFAULT 13,
          grade_level TEXT NOT NULL,
          program_name TEXT NOT NULL,
          billing_period TEXT NOT NULL,
          base_tuition_vnd INTEGER NOT NULL,
          attendance_total_sessions INTEGER DEFAULT 12,
          attendance_attended_sessions INTEGER DEFAULT 12,
          attendance_rate INTEGER DEFAULT 100,
          stars_available INTEGER DEFAULT 0,
          stars_deducted INTEGER DEFAULT 0,
          discount_vnd INTEGER DEFAULT 0,
          final_amount_vnd INTEGER NOT NULL,
          template_id INTEGER DEFAULT 1,
          bank_name TEXT DEFAULT 'MBBank',
          bank_account TEXT DEFAULT '0901234567',
          account_holder TEXT DEFAULT 'NGUYEN MINH VU',
          vietqr_url TEXT,
          growth_status TEXT DEFAULT 'normal',
          growth_percentage INTEGER DEFAULT 0,
          growth_notes TEXT,
          eval_listening REAL DEFAULT 8.0,
          eval_reading REAL DEFAULT 8.0,
          eval_writing REAL DEFAULT 8.0,
          eval_speaking REAL DEFAULT 8.0,
          eval_grammar REAL DEFAULT 8.0,
          test_score_15m REAL DEFAULT 8.0,
          test_score_45m REAL DEFAULT 8.5,
          superadmin_notes TEXT,
          status TEXT DEFAULT 'draft',
          approved_by TEXT,
          parent_name TEXT,
          parent_phone TEXT,
          parent_zalo_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS student_stars (
          student_id TEXT PRIMARY KEY,
          stars_balance INTEGER DEFAULT 0,
          total_earned_stars INTEGER DEFAULT 0,
          stars_redeemed INTEGER DEFAULT 0,
          last_updated TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS student_star_ledger (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          bill_id TEXT,
          delta_stars INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          action_type TEXT NOT NULL,
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          name TEXT,
          role TEXT NOT NULL,
          avatar TEXT,
          status TEXT DEFAULT 'active',
          metadata TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO users (id, username, role, name, status) VALUES
          ('usr_msdung', 'msdung', 'leader', 'Cô Dung', 'active'),
          ('usr_teacher_lan', 'lan', 'teacher', 'Cô Lan', 'active');
      `);
    });

    test('P1-03.1: Insufficient star balance rejection: student with 200 stars requesting 500 deduction fails with 400', async () => {
      // Seed student with 200 stars
      sqlite.prepare('INSERT INTO student_stars (student_id, stars_balance) VALUES (?, ?)').run('std_khiem', 200);

      const billReq = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          student_id: 'std_khiem',
          student_name: 'Bảo Khiêm',
          base_tuition_vnd: 2000000,
          stars_deducted: 500 // Requests 500 stars, but only has 200!
        })
      });

      const res = await postTuition({ request: billReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 400, 'Must reject with HTTP 400 when student lacks sufficient stars');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Số dư sao không đủ/i);

      // Verify balance was untouched
      const studentRow = sqlite.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').get('std_khiem');
      assert.strictEqual(studentRow.stars_balance, 200, 'Stars balance must remain untouched');
    });

    test('P1-03.2: Atomic star deduction, accurate discount calculation, and ledger record', async () => {
      // Seed student with 350 stars
      sqlite.prepare('INSERT INTO student_stars (student_id, stars_balance) VALUES (?, ?)').run('std_khiem', 350);

      const billReq = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          student_id: 'std_khiem',
          student_name: 'Bảo Khiêm',
          base_tuition_vnd: 2000000,
          stars_deducted: 300 // Deducts 300 stars (300 / 100 * 1000 = 3,000 VND discount)
        })
      });

      const res = await postTuition({ request: billReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.bill.stars_deducted, 300);
      assert.strictEqual(data.bill.discount_vnd, 3000);
      assert.strictEqual(data.bill.final_amount_vnd, 1997000);
      assert.strictEqual(data.bill.stars_available, 50, 'True server balance remaining must be 50');

      // Verify DB balance in student_stars
      const studentRow = sqlite.prepare('SELECT stars_balance, stars_redeemed FROM student_stars WHERE student_id = ?').get('std_khiem');
      assert.strictEqual(studentRow.stars_balance, 50, 'Student balance must be atomically decremented from 350 to 50');
      assert.strictEqual(studentRow.stars_redeemed, 300);

      // Verify audit trail in student_star_ledger
      const ledgerRows = sqlite.prepare('SELECT * FROM student_star_ledger WHERE student_id = ?').all('std_khiem');
      assert.strictEqual(ledgerRows.length, 1);
      assert.strictEqual(ledgerRows[0].delta_stars, -300);
      assert.strictEqual(ledgerRows[0].balance_after, 50);
      assert.strictEqual(ledgerRows[0].action_type, 'deduct');
    });

    test('P1-03.3: Double Spending Prevention: Second bill attempting to spend same balance is rejected', async () => {
      // Seed student with exactly 100 stars
      sqlite.prepare('INSERT INTO student_stars (student_id, stars_balance) VALUES (?, ?)').run('std_khiem', 100);

      // Bill 1 spends 100 stars
      const bill1Req = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ student_id: 'std_khiem', student_name: 'Bảo Khiêm', base_tuition_vnd: 1500000, stars_deducted: 100 })
      });
      const res1 = await postTuition({ request: bill1Req, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res1.status, 200);

      // Bill 2 also attempts to spend 100 stars for the same student
      const bill2Req = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ student_id: 'std_khiem', student_name: 'Bảo Khiêm', base_tuition_vnd: 1500000, stars_deducted: 100 })
      });
      const res2 = await postTuition({ request: bill2Req, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res2.status, 400, 'Second bill must be rejected: student has 0 stars left');
      const data2 = await res2.json();
      assert.strictEqual(data2.success, false);
      assert.match(data2.error, /Số dư sao không đủ/i);
    });

    test('P1-03.4: Schema Defense: negative stars, non-integer, and cap violation rejected with 400', async () => {
      // 1. Negative stars
      const reqNeg = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ student_id: 'std_1', student_name: 'HS', base_tuition_vnd: 1000000, stars_deducted: -50 })
      });
      const resNeg = await postTuition({ request: reqNeg, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(resNeg.status, 400);

      // 2. Non-integer stars
      const reqFloat = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ student_id: 'std_1', student_name: 'HS', base_tuition_vnd: 1000000, stars_deducted: 99.5 })
      });
      const resFloat = await postTuition({ request: reqFloat, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(resFloat.status, 400);

      // 3. String stars
      const reqStr = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ student_id: 'std_1', student_name: 'HS', base_tuition_vnd: 1000000, stars_deducted: "200" })
      });
      const resStr = await postTuition({ request: reqStr, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(resStr.status, 400);

      // 4. Over cap (> 50000)
      const reqOver = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ student_id: 'std_1', student_name: 'HS', base_tuition_vnd: 1000000, stars_deducted: 60000 })
      });
      const resOver = await postTuition({ request: reqOver, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(resOver.status, 400);
      assert.match((await resOver.json()).error, /Giới hạn quy đổi/i);
    });

    test('P1-03.5: Bill Revision: reducing stars deducted refunds difference to student balance and ledger', async () => {
      sqlite.prepare('INSERT INTO student_stars (student_id, stars_balance) VALUES (?, ?)').run('std_rev', 300);

      // Create draft bill deducting 200 stars
      const createReq = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ id: 'bill_rev_01', student_id: 'std_rev', student_name: 'HS Rev', base_tuition_vnd: 2000000, stars_deducted: 200 })
      });
      const createRes = await postTuition({ request: createReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(createRes.status, 200);

      // Balance was 300 - 200 = 100
      let bal = sqlite.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').get('std_rev');
      assert.strictEqual(bal.stars_balance, 100);

      // Revise bill to deduct only 50 stars (net refund of 150 stars)
      const reviseReq = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ id: 'bill_rev_01', student_id: 'std_rev', student_name: 'HS Rev', base_tuition_vnd: 2000000, stars_deducted: 50 })
      });
      const reviseRes = await postTuition({ request: reviseReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(reviseRes.status, 200);

      // Balance should be restored: 100 + 150 = 250
      bal = sqlite.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').get('std_rev');
      assert.strictEqual(bal.stars_balance, 250, 'Student balance must be restored to 250');

      // Check ledger refund entry
      const ledger = sqlite.prepare("SELECT * FROM student_star_ledger WHERE student_id = ? AND action_type = 'refund'").all('std_rev');
      assert.strictEqual(ledger.length, 1);
      assert.strictEqual(ledger[0].delta_stars, 150);
      assert.strictEqual(ledger[0].balance_after, 250);
    });

    test('P1-03.6: Bill Deletion Refund: Deleting bill refunds stars_deducted to student', async () => {
      sqlite.prepare('INSERT INTO student_stars (student_id, stars_balance) VALUES (?, ?)').run('std_del', 100);

      // Create bill deducting 100 stars
      const createReq = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ id: 'bill_del_01', student_id: 'std_del', student_name: 'HS Del', base_tuition_vnd: 1000000, stars_deducted: 100 })
      });
      await postTuition({ request: createReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });

      let bal = sqlite.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').get('std_del');
      assert.strictEqual(bal.stars_balance, 0);

      // Leader deletes the bill
      const delReq = new Request('http://localhost/api/tuition?id=bill_del_01', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${leaderToken}` }
      });
      const delRes = await deleteTuition({ url: new URL(delReq.url), request: delReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(delRes.status, 200);

      // Balance must be fully refunded to 100
      bal = sqlite.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').get('std_del');
      assert.strictEqual(bal.stars_balance, 100, 'Stars deducted must be fully refunded upon bill deletion');
    });

    test('P1-03.7: Fault Injection Rollback: When D1 tuition bill save throws, star debit is rolled back', async () => {
      sqlite.prepare('INSERT INTO student_stars (student_id, stars_balance) VALUES (?, ?)').run('std_err', 500);

      // Create a DB wrapper that throws specifically when inserting into tuition_bills
      const failingBillDb = {
        ...db,
        prepare(sql) {
          if (sql.includes('INSERT INTO tuition_bills')) {
            return {
              bind() { return this; },
              async run() { throw new Error('D1_STORAGE_WRITE_ABORT: tuition_bills constraint violated'); }
            };
          }
          return db.prepare(sql);
        }
      };

      const billReq = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ student_id: 'std_err', student_name: 'HS Err', base_tuition_vnd: 2000000, stars_deducted: 200 })
      });

      const res = await postTuition({ request: billReq, platform: { env: { DB: failingBillDb, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 500, 'Must return 500 on D1 insert failure');

      // The 200 debited stars MUST have been safely rolled back!
      const bal = sqlite.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').get('std_err');
      assert.strictEqual(bal.stars_balance, 500, 'Student balance must be safely restored after insert error');
    });
  });

  // =========================================================================
  // 3. P1-04: TEACHER LEAVE & SUBSTITUTE TRUE ATOMICITY
  // =========================================================================
  describe('P1-04: Teacher Leave & Substitute True Atomicity', () => {
    let sqlite;
    let db;

    beforeEach(() => {
      sqlite = new DatabaseSync(':memory:');
      db = createD1Adapter(sqlite);

      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS teacher_leave_requests (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          session_id TEXT NOT NULL,
          session_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          substitute_teacher_id TEXT,
          substitute_teacher_name TEXT,
          substitute_status TEXT DEFAULT 'pending',
          admin_status TEXT DEFAULT 'pending',
          admin_notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS class_sessions (
          id TEXT PRIMARY KEY,
          class_id TEXT NOT NULL,
          class_name TEXT NOT NULL,
          teacher_id TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          substitute_teacher_id TEXT,
          substitute_teacher_name TEXT,
          substitute_notes TEXT,
          session_date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          room TEXT DEFAULT 'Phòng 101',
          status TEXT DEFAULT 'scheduled',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS system_notifications (
          id TEXT PRIMARY KEY,
          target_role TEXT NOT NULL,
          target_user_id TEXT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          category TEXT DEFAULT 'system',
          reference_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          name TEXT,
          role TEXT NOT NULL,
          avatar TEXT,
          status TEXT DEFAULT 'active',
          metadata TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO users (id, username, role, name, status) VALUES
          ('usr_msdung', 'msdung', 'leader', 'Cô Dung', 'active'),
          ('usr_teacher_lan', 'lan', 'teacher', 'Cô Lan', 'active');
      `);
    });

    test('P1-04.1: Symmetric write-time overlap conflict: BOTH statements affect 0 rows, neither table is modified', async () => {
      // Ca 1: Teacher A has class 18:00 - 19:30 on 2026-10-01
      sqlite.prepare(`
        INSERT INTO class_sessions (id, class_id, class_name, teacher_id, teacher_name, session_date, start_time, end_time, status)
        VALUES ('sess_01', 'cls_7a', 'Lớp 7A', 'teacher_A', 'Thầy Hưng', '2026-10-01', '18:00', '19:30', 'scheduled');
      `).run();

      // Teacher A requested leave with Teacher B as substitute, Teacher B accepted
      sqlite.prepare(`
        INSERT INTO teacher_leave_requests (id, teacher_id, teacher_name, session_id, session_date, reason, substitute_teacher_id, substitute_teacher_name, substitute_status, admin_status)
        VALUES ('leave_01', 'teacher_A', 'Thầy Hưng', 'sess_01', '2026-10-01', 'Bận việc gia đình', 'teacher_B', 'Cô Lan', 'accepted', 'pending');
      `).run();

      // Ca 2: Concurrently, Teacher B is assigned another class at the EXACT SAME TIME (18:30 - 20:00) on 2026-10-01!
      sqlite.prepare(`
        INSERT INTO class_sessions (id, class_id, class_name, teacher_id, teacher_name, session_date, start_time, end_time, status)
        VALUES ('sess_02_conflict', 'cls_8b', 'Lớp 8B', 'teacher_B', 'Cô Lan', '2026-10-01', '18:30', '20:00', 'scheduled');
      `).run();

      // Now Leader calls approve_leave
      const approveReq = new Request('http://localhost/api/teachers/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
        body: JSON.stringify({ action: 'approve_leave', leave_id: 'leave_01', decision: 'approved', admin_notes: 'Duyệt ca' })
      });

      const res = await postWorkflow({ request: approveReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 409, 'Must return HTTP 409 Conflict due to schedule overlap');

      // VERIFY ATOMIC INTEGRITY:
      // 1. teacher_leave_requests MUST REMAIN 'pending' (NEVER 'approved'!)
      const leaveRow = sqlite.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('leave_01');
      assert.strictEqual(leaveRow.admin_status, 'pending', 'Leave request must remain pending when overlap occurs');

      // 2. class_sessions MUST REMAIN 'scheduled' with no substitute
      const sessionRow = sqlite.prepare('SELECT status, substitute_teacher_id FROM class_sessions WHERE id = ?').get('sess_01');
      assert.strictEqual(sessionRow.status, 'scheduled', 'Class session must remain scheduled');
      assert.strictEqual(sessionRow.substitute_teacher_id, null, 'Substitute must NOT have been assigned');
    });

    test('P1-04.2: Clean Atomic Success: without overlap, both leave and session update atomically', async () => {
      // Ca 1: Teacher A has class 18:00 - 19:30 on 2026-10-02
      sqlite.prepare(`
        INSERT INTO class_sessions (id, class_id, class_name, teacher_id, teacher_name, session_date, start_time, end_time, status)
        VALUES ('sess_clean', 'cls_7a', 'Lớp 7A', 'teacher_A', 'Thầy Hưng', '2026-10-02', '18:00', '19:30', 'scheduled');
      `).run();

      // Teacher A requested leave with Teacher B as substitute, Teacher B accepted
      sqlite.prepare(`
        INSERT INTO teacher_leave_requests (id, teacher_id, teacher_name, session_id, session_date, reason, substitute_teacher_id, substitute_teacher_name, substitute_status, admin_status)
        VALUES ('leave_clean', 'teacher_A', 'Thầy Hưng', 'sess_clean', '2026-10-02', 'Lý do hợp lệ', 'teacher_B', 'Cô Lan', 'accepted', 'pending');
      `).run();

      // Leader approves
      const approveReq = new Request('http://localhost/api/teachers/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
        body: JSON.stringify({ action: 'approve_leave', leave_id: 'leave_clean', decision: 'approved' })
      });

      const res = await postWorkflow({ request: approveReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 200);

      // Verify both tables updated
      const leaveRow = sqlite.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('leave_clean');
      assert.strictEqual(leaveRow.admin_status, 'approved');

      const sessionRow = sqlite.prepare('SELECT status, substitute_teacher_id FROM class_sessions WHERE id = ?').get('sess_clean');
      assert.strictEqual(sessionRow.status, 'substitute_assigned');
      assert.strictEqual(sessionRow.substitute_teacher_id, 'teacher_B');
    });

    test('P1-04.3: Strict Idempotency: Re-approving an already approved leave returns already_processed: true', async () => {
      // Seed already approved leave
      sqlite.prepare(`
        INSERT INTO teacher_leave_requests (id, teacher_id, teacher_name, session_id, session_date, reason, admin_status)
        VALUES ('leave_idempotent', 'teacher_A', 'Thầy Hưng', 'sess_01', '2026-10-03', 'Lý do', 'approved');
      `).run();

      const retryReq = new Request('http://localhost/api/teachers/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
        body: JSON.stringify({ action: 'approve_leave', leave_id: 'leave_idempotent', decision: 'approved' })
      });

      const res = await postWorkflow({ request: retryReq, platform: { env: { DB: db, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.already_processed, true, 'Replay of approved leave must return already_processed: true');
    });
  });

});

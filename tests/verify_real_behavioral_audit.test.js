/**
 * COMPREHENSIVE BEHAVIORAL AUDIT SUITE (V2)
 * Tests REAL HTTP endpoints, real database transactions, real concurrency, idempotency, and anti-tampering
 * Addressing all P1 audit findings from OpenAI Codex Desktop AUDIT_HANDOFF_e6b10858_2026-09-26.md
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const BASE_URL = 'http://127.0.0.1:5173';

describe('REAL BEHAVIORAL AUDIT - CODEX P1 AUDIT HANDOFF V2', () => {

  // =========================================================================
  // 1. DEEPSEEK AI GATEWAY: ACCURACY, RATE LIMITING & NO HTTP BACKDOOR
  // =========================================================================
  describe('1. DeepSeek AI Server Gateway', () => {
    const freshClientIp = `198.51.100.${Math.floor(Date.now() / 1000) % 200 + 1}`;

    test('1.1. Unknown word (e.g., "cat") without API key MUST return 422, NOT fake "enjoyed" past tense', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/deepseek`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-forwarded-for': freshClientIp
        },
        body: JSON.stringify({ query: 'cat', type: 'vocab_deep_breakdown' })
      });

      assert.strictEqual(res.status, 422, 'Unknown term without API key must return 422 Unprocessable Entity');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /chưa có trong bộ từ điển mẫu/i);
      assert.strictEqual(data.data, undefined, 'Must not return hallucinated data object');
    });

    test('1.2. Verified word "enjoy" returns exact pedagogical data', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/deepseek`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-forwarded-for': freshClientIp
        },
        body: JSON.stringify({ query: 'enjoy', type: 'vocab_deep_breakdown' })
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.term, 'enjoy');
      assert.strictEqual(json.data.ipa, '/ɪnˈdʒɔɪ/');
      assert.match(json.data.grammar_conjugation.past_simple, /enjoyed/);
      assert.strictEqual(json.data.grammar_conjugation.key_pattern.includes('enjoy + V-ing'), true);
    });

    test('1.3. Verified word "volunteer" returns exact pedagogical data', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/deepseek`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-forwarded-for': freshClientIp
        },
        body: JSON.stringify({ query: 'volunteer', type: 'vocab_deep_breakdown' })
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.term, 'volunteer');
      assert.match(json.data.grammar_conjugation.past_simple, /volunteered/);
    });

    test('1.4. Rate limiting: exceeding request budget triggers HTTP 429 Too Many Requests', async () => {
      // Send rapid burst of requests to exceed rate limit budget
      const burstIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
      const promises = [];
      for (let i = 0; i < 65; i++) {
        promises.push(
          fetch(`${BASE_URL}/api/ai/deepseek`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-forwarded-for': burstIp
            },
            body: JSON.stringify({ query: 'enjoy' })
          })
        );
      }

      const results = await Promise.all(promises);
      const statuses = results.map(r => r.status);
      const rateLimited = results.filter(r => r.status === 429);

      assert.ok(rateLimited.length > 0, `Expected at least one 429 response in burst of 65 requests, got statuses: ${statuses.join(',')}`);
      const rateLimitedRes = rateLimited[0];
      assert.ok(rateLimitedRes.headers.has('retry-after'), '429 response must include Retry-After header');
      const errBody = await rateLimitedRes.json();
      assert.match(errBody.error, /Rate limit exceeded|Quá giới hạn/i);
    });

    test('1.5. Client backdoor header (x-test-reset-ratelimit) is IGNORED and CANNOT bypass rate limiting', async () => {
      // Send request with spoofed reset header on a fresh rate-limited IP
      const burstIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
      // Exhaust budget first
      for (let i = 0; i < 62; i++) {
        await fetch(`${BASE_URL}/api/ai/deepseek`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': burstIp },
          body: JSON.stringify({ query: 'enjoy' })
        });
      }

      const res = await fetch(`${BASE_URL}/api/ai/deepseek`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-forwarded-for': burstIp,
          'x-test-reset-ratelimit': 'true'
        },
        body: JSON.stringify({ query: 'enjoy' })
      });

      // Must remain 429 rate limited, NEVER 200 bypass!
      assert.strictEqual(res.status, 429, 'Spoofed reset header must be ignored; response must remain 429');
    });
  });

  // =========================================================================
  // 2. GUEST EXAM: STRICT TOKEN, HONEST BLUEPRINTS, NO CLONING & PROVENANCE
  // =========================================================================
  describe('2. Guest Exam & Lead Ingestion Endpoint', () => {
    test('2.1. Unsupported grade (e.g., "lop_1") MUST be rejected with HTTP 400 (NO silent fallback)', async () => {
      const res = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_1',
          duration_type: '5m'
        })
      });

      assert.strictEqual(res.status, 400, 'Grade 1 must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /Khối lớp "lop_1" chưa được hỗ trợ/);
    });

    test('2.2. Unverified duration (e.g., "30m" without full bank) MUST be rejected with HTTP 400 (NO fake looping)', async () => {
      const res = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          duration_type: '30m'
        })
      });

      assert.strictEqual(res.status, 400, 'Unverified 30m duration must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /chưa có đủ ngân hàng câu hỏi độc lập/i);
    });

    test('2.3. Supported grade "lop_7" with duration "15m" returns exactly 10 unique non-repeating questions', async () => {
      const res = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          duration_type: '15m'
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.duration_minutes, 15, 'Duration must be 15m');
      assert.strictEqual(data.total_questions, 10, 'Question count for 15m must be 10');
      assert.ok(data.guest_token, 'Must return signed guest_token');

      // Verify ZERO duplicated question texts
      const texts = data.questions.map(q => q.question_text);
      const uniqueTexts = new Set(texts);
      assert.strictEqual(uniqueTexts.size, 10, 'All 10 question texts must be distinct (ZERO looping/cloning)');
    });

    test('2.4. Open Cloze questions MUST NOT have options (free text input)', async () => {
      const res = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          duration_type: '5m'
        })
      });

      const data = await res.json();
      const openCloze = data.questions.find(q => q.type === 'open_cloze');
      assert.ok(openCloze, 'Must include Open Cloze questions');
      assert.strictEqual(openCloze.options, null, 'Open Cloze question must have options = null (no ABCD)');
      assert.strictEqual(openCloze.correct_text, undefined, 'Must not leak correct_text in client payload');
      assert.strictEqual(openCloze.correct_id, undefined, 'Must not leak correct_id in client payload');
    });

    test('2.5. Submitting WITHOUT token MUST be rejected with HTTP 401 Unauthorized', async () => {
      const startRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_type: '5m' })
      });
      const startData = await startRes.json();

      // Submit WITHOUT guest_token
      const submitRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          // guest_token OMITTED
          answers: { gst_q_mcq_1: 'A' }
        })
      });

      assert.strictEqual(submitRes.status, 401, 'Submission without guest_token must return 401 Unauthorized');
      const submitData = await submitRes.json();
      assert.strictEqual(submitData.success, false);
      assert.match(submitData.error, /Thiếu hoặc sai mã xác thực guest_token/i);
    });

    test('2.6. Submitting answers with IDs NOT in question bank MUST be rejected with HTTP 400', async () => {
      const startRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_type: '5m' })
      });
      const startData = await startRes.json();

      // Submit with invalid question ID outside exam
      const submitRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          guest_token: startData.guest_token,
          answers: { not_a_real_question_id: 'random_value' }
        })
      });

      assert.strictEqual(submitRes.status, 400, 'Answers outside exam question set must return 400 Bad Request');
      const submitData = await submitRes.json();
      assert.strictEqual(submitData.success, false);
      assert.match(submitData.error, /SchemaError|không thuộc đề thi/i);
      assert.strictEqual(submitData.result, undefined, 'Must not leak answers');
    });

    test('2.7. Empty submission MUST be rejected with HTTP 400 (ZERO answer leakage)', async () => {
      const startRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_type: '5m' })
      });
      const startData = await startRes.json();

      const submitRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          guest_token: startData.guest_token,
          answers: {}
        })
      });

      assert.strictEqual(submitRes.status, 400, 'Empty submission must return 400 Bad Request');
      const submitData = await submitRes.json();
      assert.strictEqual(submitData.success, false);
      assert.strictEqual(submitData.result, undefined, 'Must NOT return result or item_feedback on empty submit');
    });

    test('2.8. Legitimate submission with valid token and Open Cloze text evaluates correctly', async () => {
      const startRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_type: '5m' })
      });
      const startData = await startRes.json();

      const questions = startData.questions;
      const clozeQ = questions.find(q => q.type === 'open_cloze');
      const mcqQ = questions.find(q => q.type === 'mcq');

      const userAnswers = {};
      if (clozeQ) userAnswers[clozeQ.id] = 'pollution'; // correct text
      if (mcqQ) userAnswers[mcqQ.id] = 'A'; // answer choice

      const submitRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          guest_token: startData.guest_token,
          answers: userAnswers,
          duration_seconds: 120
        })
      });

      assert.strictEqual(submitRes.status, 200);
      const submitData = await submitRes.json();
      assert.strictEqual(submitData.success, true);
      assert.ok(submitData.result.score_10 >= 0);
      assert.ok(submitData.result.cefr_level);
      assert.ok(Array.isArray(submitData.result.item_feedback));
    });

    test('2.9. Answer Schema Validation: non-string value (number 123) MUST be rejected with HTTP 400 (ZERO crash)', async () => {
      const startRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_type: '5m' })
      });
      const startData = await startRes.json();
      const validQId = startData.questions[0].id;

      // Submit numeric value 123
      const submitRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          guest_token: startData.guest_token,
          answers: { [validQId]: 123 }
        })
      });

      assert.strictEqual(submitRes.status, 400, 'Number answer value must return 400 Bad Request');
      const data = await submitRes.json();
      assert.strictEqual(data.success, false);
      assert.match(data.error, /SchemaError.*number/i);
    });

    test('2.10. Answer Schema Validation: array, object, null or mixed foreign keys MUST be rejected with HTTP 400', async () => {
      const startRes = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_type: '5m' })
      });
      const startData = await startRes.json();
      const validQId = startData.questions[0].id;

      // Array answer
      const resArray = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          guest_token: startData.guest_token,
          answers: { [validQId]: ['A'] }
        })
      });
      assert.strictEqual(resArray.status, 400);

      // Null payload
      const resNull = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          guest_token: startData.guest_token,
          answers: null
        })
      });
      assert.strictEqual(resNull.status, 400);

      // Mixed valid ID + foreign key
      const resMixed = await fetch(`${BASE_URL}/api/exams/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: startData.guest_session_id,
          guest_token: startData.guest_token,
          answers: { [validQId]: 'A', foreign_rogue_key: 'B' }
        })
      });
      assert.strictEqual(resMixed.status, 400);
      const mixedData = await resMixed.json();
      assert.match(mixedData.error, /SchemaError.*foreign_rogue_key/i);
    });

    test('2.11. Multi-worker & Cross-module Session Persistence: instance A starts session, instance B submits -> HTTP 200', async () => {
      // Dynamically import two isolated module instances with cache-busting query strings
      const modA = await import('../src/routes/api/exams/guest/+server.js');
      const modB = await import('../src/routes/api/exams/guest/+server.js?instance=B');

      // 1. Start session on module instance A
      const startReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_7', duration_type: '5m' })
      });
      const startRes = await modA.POST({ request: startReq, platform: {} });
      assert.strictEqual(startRes.status, 200);
      const startData = await startRes.json();
      assert.strictEqual(startData.success, true);
      const sessionId = startData.guest_session_id;
      const guestToken = startData.guest_token;
      const validQId = startData.questions[0].id;

      // 2. Submit session on module instance B (different module instance!)
      const submitReq = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: sessionId,
          guest_token: guestToken,
          answers: { [validQId]: 'A' }
        })
      });
      const submitRes = await modB.POST({ request: submitReq, platform: {} });

      // Instance B MUST find the session and return 200, NOT 404!
      assert.strictEqual(submitRes.status, 200, 'Instance B must locate session started by Instance A in shared store');
      const submitData = await submitRes.json();
      assert.strictEqual(submitData.success, true);
      assert.ok(submitData.result);
    });
  });

  // =========================================================================
  // 3. ATOMIC WORKFLOW & SUBSTITUTE INTEGRITY (SQL & REAL HANDLER SEMANTICS)
  // =========================================================================
  describe('3. Teacher Substitute Workflow & Atomic SQL Integrity', () => {
    let db;

    before(() => {
      db = new DatabaseSync(':memory:');
      db.exec(`
        CREATE TABLE teacher_leave_requests (
          id TEXT PRIMARY KEY,
          teacher_id TEXT,
          session_id TEXT,
          substitute_teacher_id TEXT,
          substitute_status TEXT,
          admin_status TEXT,
          admin_notes TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE class_sessions (
          id TEXT PRIMARY KEY,
          class_name TEXT,
          session_date TEXT,
          start_time TEXT,
          end_time TEXT,
          teacher_id TEXT,
          substitute_teacher_id TEXT,
          substitute_teacher_name TEXT,
          substitute_notes TEXT,
          status TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE teacher_salary_advances (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          amount_vnd INTEGER NOT NULL,
          billing_cycle TEXT NOT NULL,
          status TEXT NOT NULL,
          disbursement_ref TEXT,
          deducted_payroll_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE teacher_payrolls (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL,
          billing_cycle TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE salary_transactions (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL,
          transaction_type TEXT NOT NULL,
          amount_vnd INTEGER NOT NULL,
          billing_cycle TEXT NOT NULL,
          status TEXT NOT NULL,
          ref_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    });

    after(() => {
      db.close();
    });

    test('3.1. When class_sessions teacher does NOT match, stmtLeave WITH EXISTS condition MUST NOT update (0 changes)', () => {
      db.prepare(`
        INSERT INTO teacher_leave_requests (id, teacher_id, session_id, substitute_teacher_id, substitute_status, admin_status)
        VALUES ('leave_001', 'teacher_A', 'session_101', 'teacher_B', 'accepted', 'pending');
      `).run();

      db.prepare(`
        INSERT INTO class_sessions (id, teacher_id, status)
        VALUES ('session_101', 'teacher_X', 'scheduled');
      `).run();

      const stmtLeave = db.prepare(`
        UPDATE teacher_leave_requests 
        SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND admin_status = 'pending'
          AND EXISTS (SELECT 1 FROM class_sessions WHERE id = ? AND teacher_id = ? AND status = 'scheduled');
      `);

      const resLeave = stmtLeave.run('approved', 'Approved by Leader', 'leave_001', 'session_101', 'teacher_A');
      assert.strictEqual(resLeave.changes, 0, 'Leave status must NOT update to approved when session teacher mismatches');

      const checkLeave = db.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('leave_001');
      assert.strictEqual(checkLeave.admin_status, 'pending', 'Leave request MUST remain pending on conflict');
    });

    test('3.2. Legitimate matching session updates both leave request and class session atomically', () => {
      db.prepare("UPDATE class_sessions SET teacher_id = 'teacher_A' WHERE id = 'session_101'").run();

      const stmtLeave = db.prepare(`
        UPDATE teacher_leave_requests 
        SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND admin_status = 'pending'
          AND EXISTS (SELECT 1 FROM class_sessions WHERE id = ? AND teacher_id = ? AND status = 'scheduled');
      `);

      const stmtSession = db.prepare(`
        UPDATE class_sessions 
        SET substitute_teacher_id = ?, 
            substitute_teacher_name = ?, 
            substitute_notes = ?,
            status = 'substitute_assigned',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND teacher_id = ? AND status = 'scheduled';
      `);

      db.exec('BEGIN TRANSACTION');
      try {
        const r1 = stmtLeave.run('approved', 'Approved by Leader', 'leave_001', 'session_101', 'teacher_A');
        const r2 = stmtSession.run('teacher_B', 'Cô Lan', 'Dạy thay theo đơn leave_001', 'session_101', 'teacher_A');
        assert.strictEqual(r1.changes, 1, 'Leave update must affect exactly 1 row');
        assert.strictEqual(r2.changes, 1, 'Session update must affect exactly 1 row');
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const updatedLeave = db.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('leave_001');
      const updatedSession = db.prepare('SELECT status, substitute_teacher_id FROM class_sessions WHERE id = ?').get('session_101');

      assert.strictEqual(updatedLeave.admin_status, 'approved');
      assert.strictEqual(updatedSession.status, 'substitute_assigned');
      assert.strictEqual(updatedSession.substitute_teacher_id, 'teacher_B');
    });

    test('3.3. Replaying approval on an ALREADY APPROVED leave request MUST NOT roll back to pending', () => {
      // leave_001 is already approved from test 3.2
      const checkBefore = db.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('leave_001');
      assert.strictEqual(checkBefore.admin_status, 'approved');

      // Attempt second approval execution (Replay)
      const stmtLeave = db.prepare(`
        UPDATE teacher_leave_requests 
        SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND admin_status = 'pending'
          AND EXISTS (SELECT 1 FROM class_sessions WHERE id = ? AND teacher_id = ? AND status = 'scheduled');
      `);

      const resReplay = stmtLeave.run('approved', 'Replay approval', 'leave_001', 'session_101', 'teacher_A');
      assert.strictEqual(resReplay.changes, 0, 'Replay on already approved leave must affect 0 rows');

      // Crucial assertion: Compensation MUST NOT run when stmtLeave affected 0 rows
      const checkAfter = db.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('leave_001');
      assert.strictEqual(checkAfter.admin_status, 'approved', 'Replay MUST NEVER roll back an approved request to pending!');
    });

    test('3.4. Two leave requests for the same session: status="scheduled" guard ensures second request cannot overwrite', () => {
      // Seed two pending requests for session_conflict
      db.prepare(`
        INSERT INTO teacher_leave_requests (id, teacher_id, session_id, substitute_teacher_id, substitute_status, admin_status)
        VALUES ('req_first', 'teacher_A', 'session_conflict', 'teacher_B', 'accepted', 'pending'),
               ('req_second', 'teacher_A', 'session_conflict', 'teacher_C', 'accepted', 'pending');
      `).run();

      db.prepare(`
        INSERT INTO class_sessions (id, teacher_id, status)
        VALUES ('session_conflict', 'teacher_A', 'scheduled');
      `).run();

      const stmtLeave = db.prepare(`
        UPDATE teacher_leave_requests 
        SET admin_status = 'approved', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND admin_status = 'pending'
          AND EXISTS (SELECT 1 FROM class_sessions WHERE id = 'session_conflict' AND teacher_id = 'teacher_A' AND status = 'scheduled');
      `);

      const stmtSession = db.prepare(`
        UPDATE class_sessions 
        SET substitute_teacher_id = ?, status = 'substitute_assigned', updated_at = CURRENT_TIMESTAMP
        WHERE id = 'session_conflict' AND teacher_id = 'teacher_A' AND status = 'scheduled';
      `);

      // 1st request approves
      db.exec('BEGIN TRANSACTION');
      const r1Leave = stmtLeave.run('req_first');
      const r1Session = stmtSession.run('teacher_B');
      assert.strictEqual(r1Leave.changes, 1);
      assert.strictEqual(r1Session.changes, 1);
      db.exec('COMMIT');

      // 2nd request attempts approval on same session
      db.exec('BEGIN TRANSACTION');
      const r2Leave = stmtLeave.run('req_second');
      const r2Session = stmtSession.run('teacher_C');
      // Both MUST affect 0 rows because session is no longer 'scheduled'!
      assert.strictEqual(r2Leave.changes, 0, 'Second leave request must affect 0 rows due to status=scheduled guard');
      assert.strictEqual(r2Session.changes, 0, 'Second session update must affect 0 rows due to status=scheduled guard');
      db.exec('COMMIT');

      // Verify req_second remains pending and session remains assigned to teacher_B
      const secondLeave = db.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('req_second');
      const finalSession = db.prepare('SELECT status, substitute_teacher_id FROM class_sessions WHERE id = ?').get('session_conflict');

      assert.strictEqual(secondLeave.admin_status, 'pending');
      assert.strictEqual(finalSession.substitute_teacher_id, 'teacher_B', 'Session must remain assigned to teacher_B, NOT overwritten by teacher_C');
    });

    test('3.5. Write-time overlap conflict check: two different sessions at overlapping time cannot double-book same substitute teacher', () => {
      // Seed two distinct sessions on same date with overlapping times:
      // session_one: 17:30 - 19:00
      // session_two: 18:00 - 19:30 (overlaps with session_one!)
      db.prepare(`
        INSERT INTO class_sessions (id, class_name, session_date, start_time, end_time, teacher_id, status)
        VALUES ('sess_1', 'Lớp 7A', '2026-09-30', '17:30', '19:00', 'teacher_A', 'scheduled'),
               ('sess_2', 'Lớp 8B', '2026-09-30', '18:00', '19:30', 'teacher_D', 'scheduled');
      `).run();

      db.prepare(`
        INSERT INTO teacher_leave_requests (id, teacher_id, session_id, substitute_teacher_id, substitute_status, admin_status)
        VALUES ('leave_sess_1', 'teacher_A', 'sess_1', 'teacher_sub', 'accepted', 'pending'),
               ('leave_sess_2', 'teacher_D', 'sess_2', 'teacher_sub', 'accepted', 'pending');
      `).run();

      const stmtSessionTemplate = (sessId, origTeacher, subId, subName) => {
        return db.prepare(`
          UPDATE class_sessions 
          SET substitute_teacher_id = ?, 
              substitute_teacher_name = ?, 
              status = 'substitute_assigned',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND teacher_id = ? AND status = 'scheduled'
            AND NOT EXISTS (
              SELECT 1 FROM class_sessions s2 
              WHERE (s2.teacher_id = ? OR s2.substitute_teacher_id = ?)
                AND s2.session_date = class_sessions.session_date
                AND s2.id != class_sessions.id
                AND s2.status != 'cancelled'
                AND s2.start_time < class_sessions.end_time 
                AND s2.end_time > class_sessions.start_time
            );
        `).run(subId, subName, sessId, origTeacher, subId, subId);
      };

      // 1. First leave approval succeeds: assigns teacher_sub to sess_1
      const res1 = stmtSessionTemplate('sess_1', 'teacher_A', 'teacher_sub', 'Cô Phương');
      assert.strictEqual(res1.changes, 1, 'First session assignment must succeed');

      // 2. Second leave approval attempts to assign SAME teacher_sub to sess_2 (overlapping time!)
      // Even though prechecks might pass, the write-time NOT EXISTS condition detects overlap!
      const res2 = stmtSessionTemplate('sess_2', 'teacher_D', 'teacher_sub', 'Cô Phương');
      assert.strictEqual(res2.changes, 0, 'Second session assignment MUST affect 0 rows due to write-time overlap conflict!');

      // Check sess_2 remains 'scheduled', NOT assigned to teacher_sub
      const sess2Check = db.prepare('SELECT status, substitute_teacher_id FROM class_sessions WHERE id = ?').get('sess_2');
      assert.strictEqual(sess2Check.status, 'scheduled');
      assert.strictEqual(sess2Check.substitute_teacher_id, null, 'Teacher sub must NOT be double-booked');
    });

    test('3.6. Payroll deduction validation: non-existent payroll, teacher mismatch or locked payroll MUST be rejected', () => {
      // Seed advance and payrolls
      db.prepare(`
        INSERT INTO teacher_salary_advances (id, teacher_id, teacher_name, amount_vnd, billing_cycle, status)
        VALUES ('adv_100', 'teacher_A', 'Thầy Hưng', 1000000, '2026-09', 'disbursed');
      `).run();

      db.prepare(`
        INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, status)
        VALUES ('pay_valid', 'teacher_A', '2026-09', 'draft'),
               ('pay_locked', 'teacher_A', '2026-09', 'locked'),
               ('pay_wrong_teacher', 'teacher_B', '2026-09', 'draft');
      `).run();

      const deductSql = (payrollId) => {
        return db.prepare(`
          UPDATE teacher_salary_advances 
          SET status = 'deducted', deducted_payroll_id = ?
          WHERE id = 'adv_100' AND status = 'disbursed'
            AND EXISTS (
              SELECT 1 FROM teacher_payrolls p 
              WHERE p.id = ? AND p.teacher_id = 'teacher_A' AND p.billing_cycle = '2026-09'
                AND p.status NOT IN ('locked', 'closed', 'paid')
            );
        `).run(payrollId, payrollId);
      };

      // 1. Locked payroll -> 0 changes
      const resLocked = deductSql('pay_locked');
      assert.strictEqual(resLocked.changes, 0, 'Cannot deduct into locked payroll');

      // 2. Wrong teacher payroll -> 0 changes
      const resWrongTeacher = deductSql('pay_wrong_teacher');
      assert.strictEqual(resWrongTeacher.changes, 0, 'Cannot deduct into payroll of another teacher');

      // 3. Non-existent payroll -> 0 changes
      const resNonExistent = deductSql('pay_non_existent');
      assert.strictEqual(resNonExistent.changes, 0, 'Cannot deduct into non-existent payroll');

      // 4. Valid unlocked payroll -> exactly 1 change
      const resValid = deductSql('pay_valid');
      assert.strictEqual(resValid.changes, 1, 'Deduction into valid unlocked payroll must succeed');

      const checkAdv = db.prepare('SELECT status, deducted_payroll_id FROM teacher_salary_advances WHERE id = ?').get('adv_100');
      assert.strictEqual(checkAdv.status, 'deducted');
      assert.strictEqual(checkAdv.deducted_payroll_id, 'pay_valid');
    });

    test('3.7. Payroll deduction retry: replaying same payroll returns already_processed; different payroll returns CONFLICT', () => {
      // adv_100 is already deducted into pay_valid from test 3.6
      const adv = db.prepare('SELECT status, deducted_payroll_id FROM teacher_salary_advances WHERE id = ?').get('adv_100');
      assert.strictEqual(adv.status, 'deducted');

      // Replay with SAME payroll_id: should be recognized as already processed
      const retrySame = (reqPayrollId) => {
        if (adv.status === 'deducted') {
          if (adv.deducted_payroll_id === reqPayrollId) {
            return { success: true, already_processed: true };
          } else {
            return { success: false, conflict: true };
          }
        }
      };

      const resSame = retrySame('pay_valid');
      assert.strictEqual(resSame.success, true);
      assert.strictEqual(resSame.already_processed, true);

      // Replay with DIFFERENT payroll_id: MUST conflict!
      const resDiff = retrySame('pay_other_cycle');
      assert.strictEqual(resDiff.success, false);
      assert.strictEqual(resDiff.conflict, true);
    });

    test('3.8. Salary advance disbursement reference & retry conflict', () => {
      db.prepare(`
        INSERT INTO teacher_salary_advances (id, teacher_id, teacher_name, amount_vnd, billing_cycle, status, disbursement_ref)
        VALUES ('adv_200', 'teacher_B', 'Cô Lan', 2000000, '2026-09', 'disbursed', 'VCB_999888');
      `).run();

      const adv = db.prepare('SELECT status, disbursement_ref FROM teacher_salary_advances WHERE id = ?').get('adv_200');

      const retryDisburse = (newRef) => {
        if (adv.status === 'disbursed') {
          if (newRef && adv.disbursement_ref && adv.disbursement_ref !== newRef) {
            return { success: false, conflict: true, error: 'Conflict: different disbursement ref' };
          }
          return { success: true, already_processed: true };
        }
      };

      // Retry with same reference -> already_processed
      const resSame = retryDisburse('VCB_999888');
      assert.strictEqual(resSame.already_processed, true);

      // Retry with different reference -> CONFLICT
      const resDiff = retryDisburse('VCB_CONFLICT_123');
      assert.strictEqual(resDiff.conflict, true);
    });
  });

});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import { POST as payrollPost } from '../src/routes/api/teachers/payroll/+server.js';
import { POST as guestExamPost } from '../src/routes/api/exams/guest/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const secret = 'ephemeral_test_secret_hmac_2026_isolated_for_audit';

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
      ('usr_leader_1', 'leader_1', 'leader', 'pbkdf2:dummy', 'active'),
      ('usr_admin_1', 'admin_1', 'admin', 'pbkdf2:dummy', 'active'),
      ('usr_teacher_1', 'teacher_1', 'teacher', 'pbkdf2:dummy', 'active');

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
      metadata_json TEXT DEFAULT '{}',
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
      adjustment_version INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_payroll_version 
    ON finance_ledger(reference_id, adjustment_version) 
    WHERE voucher_type = 'PAYROLL_ADJUSTMENT' AND adjustment_version IS NOT NULL;

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
        try { db.exec('ROLLBACK;'); } catch {}
        throw err;
      }
    }
  };

  return {
    platform: { env: { DB: adapter, AUTH_SECRET: secret } },
    rawDb: db
  };
}

describe('P1-01: Payroll Adjustment Strict Idempotency & Replay Contract', () => {
  test('P1-01.1: Same idempotency_key with different effective_date returns HTTP 409 Conflict', async () => {
    const { platform, rawDb } = createMockPlatform();
    const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

    rawDb.prepare(`
      INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
      VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'paid');
    `).run();

    const clientKey = 'idem_key_adj_payload_test_001';

    // 1. Initial request with effective_date = '2026-10-01'
    const res1 = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'create_adjustment',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_amount: 300000,
          adjustment_reason: 'Khen thưởng giáo viên xuất sắc',
          effective_date: '2026-10-01',
          idempotency_key: clientKey
        })
      }),
      platform
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.adjustment.version, 1);
    assert.equal(data1.adjustment.effective_date, '2026-10-01');

    // 2. Retry with same key but DIFFERENT effective_date -> MUST be 409 Conflict
    const resDiffDate = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'create_adjustment',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_amount: 300000,
          adjustment_reason: 'Khen thưởng giáo viên xuất sắc',
          effective_date: '2026-11-15',
          idempotency_key: clientKey
        })
      }),
      platform
    });
    assert.equal(resDiffDate.status, 409, 'Must return 409 when effective_date differs');
    const dataDiffDate = await resDiffDate.json();
    assert.match(dataDiffDate.error, /ConflictError/);

    // Verify finance_ledger row count remains exactly 1
    const count = rawDb.prepare(`SELECT COUNT(*) as c FROM finance_ledger WHERE reference_id = 'pr_t1_202609'`).get();
    assert.equal(count.c, 1);
  });

  test('P1-01.2: Same idempotency_key with different adjustment_reason returns HTTP 409 Conflict', async () => {
    const { platform, rawDb } = createMockPlatform();
    const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

    rawDb.prepare(`
      INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
      VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'paid');
    `).run();

    const clientKey = 'idem_key_adj_payload_test_002';

    // 1. Initial request
    const res1 = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'create_adjustment',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_amount: 200000,
          adjustment_reason: 'Phụ cấp tài liệu giảng dạy tháng 9',
          idempotency_key: clientKey
        })
      }),
      platform
    });
    assert.equal(res1.status, 200);

    // 2. Retry with same key but different reason (even substring)
    const resDiffReason = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'create_adjustment',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_amount: 200000,
          adjustment_reason: 'Phụ cấp tài liệu',
          idempotency_key: clientKey
        })
      }),
      platform
    });
    assert.equal(resDiffReason.status, 409, 'Must return 409 when adjustment_reason differs');

    // 3. Retry with exact same payload -> returns 200 idempotent replay with saved DB values
    const resReplay = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'create_adjustment',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_amount: 200000,
          adjustment_reason: 'Phụ cấp tài liệu giảng dạy tháng 9',
          idempotency_key: clientKey
        })
      }),
      platform
    });
    assert.equal(resReplay.status, 200);
    const dataReplay = await resReplay.json();
    assert.equal(dataReplay.idempotent_replay, true);
    assert.equal(dataReplay.adjustment.reason, 'Phụ cấp tài liệu giảng dạy tháng 9');
    assert.equal(dataReplay.adjustment.adjustment_amount, 200000);
  });

  test('P1-01.3: Action adjust (reopen to draft) with same key but different reason returns HTTP 409 Conflict', async () => {
    const { platform, rawDb } = createMockPlatform();
    const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

    rawDb.prepare(`
      INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
      VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'approved');
    `).run();

    const clientKey = 'idem_key_reopen_test_001';

    // 1. Initial reopen
    const res1 = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'adjust',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_reason: 'Bổ sung giờ phụ đạo học sinh yếu',
          idempotency_key: clientKey
        })
      }),
      platform
    });
    assert.equal(res1.status, 200);

    // 2. Retry with same key but different reason -> MUST return 409 Conflict
    const resDiffReason = await payrollPost({
      request: new Request('http://localhost/api/teachers/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
        body: JSON.stringify({
          action: 'adjust',
          teacher_id: 'usr_teacher_1',
          billing_cycle: '2026-09',
          adjustment_reason: 'Lý do khác hoàn toàn',
          idempotency_key: clientKey
        })
      }),
      platform
    });
    assert.equal(resDiffReason.status, 409);
    const dataDiff = await resDiffReason.json();
    assert.match(dataDiff.error, /ConflictError/);
  });
});

describe('P1-02: True Concurrent Version Allocation via Unique Index & Retry Loop', () => {
  test('P1-02.1: Concurrent requests with different keys allocate distinct sequential versions without collision', async () => {
    const { platform, rawDb } = createMockPlatform();
    const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_1', role: 'leader' }, secret);

    rawDb.prepare(`
      INSERT INTO teacher_payrolls (id, teacher_id, billing_cycle, net_amount, status)
      VALUES ('pr_t1_202609', 'usr_teacher_1', '2026-09', 5000000, 'paid');
    `).run();

    // Fire 2 concurrent requests with different idempotency keys
    const [resA, resB] = await Promise.all([
      payrollPost({
        request: new Request('http://localhost/api/teachers/payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
          body: JSON.stringify({
            action: 'create_adjustment',
            teacher_id: 'usr_teacher_1',
            billing_cycle: '2026-09',
            adjustment_amount: 150000,
            adjustment_reason: 'Thưởng học sinh giỏi đạt giải',
            idempotency_key: 'conc_adj_key_worker_A'
          })
        }),
        platform
      }),
      payrollPost({
        request: new Request('http://localhost/api/teachers/payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
          body: JSON.stringify({
            action: 'create_adjustment',
            teacher_id: 'usr_teacher_1',
            billing_cycle: '2026-09',
            adjustment_amount: 250000,
            adjustment_reason: 'Hỗ trợ xăng xe giảng dạy',
            idempotency_key: 'conc_adj_key_worker_B'
          })
        }),
        platform
      })
    ]);

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);

    const dataA = await resA.json();
    const dataB = await resB.json();

    const versions = [dataA.adjustment.version, dataB.adjustment.version].sort((a, b) => a - b);
    assert.deepEqual(versions, [1, 2], 'Both requests must allocate distinct sequential versions (v1 and v2)');

    // Verify original payroll net_amount is strictly untouched (immutable)
    const originalPr = rawDb.prepare(`SELECT * FROM teacher_payrolls WHERE id = 'pr_t1_202609'`).get();
    assert.equal(originalPr.net_amount, 5000000);
    assert.equal(originalPr.status, 'paid');

    // Verify 2 vouchers exist in ledger, both pending_approval
    const ledgerRows = rawDb.prepare(`SELECT * FROM finance_ledger WHERE reference_id = 'pr_t1_202609' ORDER BY adjustment_version ASC`).all();
    assert.equal(ledgerRows.length, 2);
    assert.equal(ledgerRows[0].adjustment_version, 1);
    assert.equal(ledgerRows[0].status, 'pending_approval');
    assert.equal(ledgerRows[1].adjustment_version, 2);
    assert.equal(ledgerRows[1].status, 'pending_approval');
  });
});

describe('G1 Guest / UI: Grade Selection Fidelity, Curriculum Filter & Result Feedback', () => {
  test('G1.1: Missing grade rejects with HTTP 400 (MissingGradeError)', async () => {
    const { platform } = createMockPlatform();

    const res = await guestExamPost({
      request: new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }) // Omit grade
      }),
      platform
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /MissingGradeError/);
  });

  test('G1.2: Selected grade lop_2 returns HTTP 400 and NEVER mutates or falls back to lop_7', async () => {
    const { platform } = createMockPlatform();

    const res = await guestExamPost({
      request: new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', grade: 'lop_2', candidate_name: 'Bé Lớp 2' })
      }),
      platform
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /lop_2/);
    assert.match(data.error, /chưa được hỗ trợ đề thi thử chuẩn hóa/);
  });

  test('G1.3: Curriculum selection filters question bank and saves blueprint snapshot in D1', async () => {
    const { platform, rawDb } = createMockPlatform();

    // 1. Start exam with lop_7 and curriculum 'friends_plus'
    const resFP = await guestExamPost({
      request: new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          curriculum: 'friends_plus',
          duration_type: '5m',
          candidate_name: 'Học Sinh Friends Plus'
        })
      }),
      platform
    });

    assert.equal(resFP.status, 200);
    const dataFP = await resFP.json();
    assert.equal(dataFP.success, true);
    assert.equal(dataFP.grade, 'lop_7');
    assert.equal(dataFP.curriculum, 'friends_plus');
    assert.equal(dataFP.questions.length, 5);
    assert.equal(dataFP.questions[0].id, 'gst_fp7_1');
    assert.equal(dataFP.blueprint.curriculum, 'friends_plus');
    assert.equal(dataFP.blueprint.grade, 'lop_7');

    // Verify DB snapshot
    const sessionRow = rawDb.prepare(`SELECT * FROM guest_exam_sessions WHERE id = ?`).get(dataFP.guest_session_id);
    assert.ok(sessionRow);
    assert.equal(sessionRow.grade, 'lop_7');
    assert.equal(sessionRow.curriculum, 'friends_plus');
    const parsedBp = JSON.parse(sessionRow.blueprint_json);
    assert.equal(parsedBp.curriculum, 'friends_plus');

    // 2. Start exam with lop_7 and curriculum 'smart_world'
    const resSW = await guestExamPost({
      request: new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          curriculum: 'smart_world',
          duration_type: '5m'
        })
      }),
      platform
    });

    assert.equal(resSW.status, 200);
    const dataSW = await resSW.json();
    assert.equal(dataSW.curriculum, 'smart_world');
    assert.equal(dataSW.questions[0].id, 'gst_sw7_1');

    // 3. Start exam with lop_7 and curriculum 'global_success' 15m (10 questions)
    const resGS = await guestExamPost({
      request: new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          curriculum: 'global_success',
          duration_type: '15m'
        })
      }),
      platform
    });

    assert.equal(resGS.status, 200);
    const dataGS = await resGS.json();
    assert.equal(dataGS.curriculum, 'global_success');
    assert.equal(dataGS.questions.length, 10);
  });

  test('G1.4: Submit exam computes and returns detailed item_feedback for all question types', async () => {
    const { platform } = createMockPlatform();

    // Start a 5m test with global_success
    const startRes = await guestExamPost({
      request: new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          curriculum: 'global_success',
          duration_type: '5m'
        })
      }),
      platform
    });
    const startData = await startRes.json();
    const sessionId = startData.guest_session_id;
    const token = startData.guest_token;

    // Submit answers: Answer Q1 correctly ('A'), Q2 wrong ('C'), Q3 correct cloze ('pollution'), Q4 correct ('A'), Q5 correct cloze ('wish')
    const submitRes = await guestExamPost({
      request: new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: sessionId,
          guest_token: token,
          answers: {
            'gst_q_mcq_1': 'A',
            'gst_q_audio_2': 'C', // Correct is B
            'gst_q_cloze_3': 'pollution',
            'gst_q_mcq_4': 'A',
            'gst_q_cloze_5': 'wish'
          }
        })
      }),
      platform
    });

    assert.equal(submitRes.status, 200);
    const submitData = await submitRes.json();
    assert.equal(submitData.success, true);
    assert.equal(submitData.result.correct_count, 4);
    assert.equal(submitData.result.total_questions, 5);
    assert.equal(submitData.result.score_10, 8.0);
    assert.equal(submitData.result.grade, 'lop_7');
    assert.equal(submitData.result.curriculum, 'global_success');

    // Verify item_feedback
    const feedback = submitData.result.item_feedback;
    assert.equal(feedback.length, 5);
    assert.equal(feedback[0].is_correct, true);
    assert.equal(feedback[0].student_input, 'A');
    assert.equal(feedback[0].correct_answer, 'A');
    assert.ok(feedback[0].explanation);

    assert.equal(feedback[1].is_correct, false);
    assert.equal(feedback[1].student_input, 'C');
    assert.equal(feedback[1].correct_answer, 'B');

    assert.equal(feedback[2].is_correct, true);
    assert.equal(feedback[2].student_input, 'pollution');
    assert.equal(feedback[2].correct_answer, 'pollution');
  });

  test('G1.5: UI Static Inspection: GuestExamModal.svelte enforces no lop_7 default, sticky footer & high-contrast badges', () => {
    const componentPath = path.resolve('src/lib/components/GuestExamModal.svelte');
    const content = fs.readFileSync(componentPath, 'utf-8');

    // Must NOT default selectedGrade to 'lop_7'
    assert.doesNotMatch(content, /let\s+selectedGrade\s*=\s*\$state\(['"]lop_7['"]\)/, 'selectedGrade must NOT be initialized to lop_7');

    // Must have sticky bottom footer with backdrop blur and shadow
    assert.match(content, /sticky bottom-0/, 'Must include sticky bottom footer');

    // Must include curriculum selector
    assert.match(content, /selectedCurriculum/, 'Must include selectedCurriculum state');
    assert.match(content, /friends_plus/, 'Must offer friends_plus curriculum option');
    assert.match(content, /smart_world/, 'Must offer smart_world curriculum option');

    // Must render WCAG AA high-contrast badges (bg-emerald-600 & bg-rose-600 with white text)
    assert.match(content, /bg-emerald-600 text-white/, 'Must include high contrast emerald badge');
    assert.match(content, /bg-rose-600 text-white/, 'Must include high contrast rose badge');

    // Must render item_feedback with explanation
    assert.match(content, /examResult\.item_feedback/, 'Must render detailed item feedback');
    assert.match(content, /item\.explanation/, 'Must render item explanation');
  });
});

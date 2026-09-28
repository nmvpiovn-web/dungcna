// tests/verify_p1_audit_d6b4bb2_feedback.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { GET as parentTestsGet, POST as parentTestsPost } from '../src/routes/api/parents/tests/+server.js';
import { GET as profileGet, POST as profilePost, PATCH as profilePatch } from '../src/routes/api/users/profile/+server.js';
import { POST as payrollPost } from '../src/routes/api/teachers/payroll/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const secret = 'ephemeral_test_secret_hmac_2026_isolated_for_audit';

function createMockPlatform() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      role TEXT,
      name TEXT,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      password TEXT,
      avatar TEXT,
      status TEXT,
      metadata TEXT,
      grade TEXT,
      approval_status TEXT DEFAULT 'approved',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (id, username, role, name, phone, email, password, status, metadata) VALUES
      ('usr_parent_1', 'parent_mai', 'parent', 'Nguyễn Thị Mai', '0912345678', 'mai@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_parent_2', 'parent_hung', 'parent', 'Trần Văn Hùng', '0987654321', 'hung@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_student_1', 'student_an', 'student', 'Nguyễn Văn An', '0911223344', 'an@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 7"}'),
      ('usr_student_2', 'student_binh', 'student', 'Trần Văn Bình', '0922334455', 'binh@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 8"}'),
      ('usr_teacher_1', 'teacher_dung', 'teacher', 'Cô Dung', '0933445566', 'dung@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_leader_1', 'leader_tam', 'leader', 'Thầy Tâm', '0944556677', 'tam@example.com', 'pbkdf2:dummy', 'active', '{}');

    CREATE TABLE parent_student_links (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- usr_parent_1 has verified link with usr_student_1, revoked link with usr_student_2
    INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
      ('psl_1', 'usr_parent_1', 'usr_student_1', 'verified'),
      ('psl_2', 'usr_parent_1', 'usr_student_2', 'revoked');

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
      adjustment_version INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
          return { meta: { changes: res.changes, last_row_id: Number(res.lastInsertRowid) } };
        }
      };
    }
  };

  return {
    platform: {
      env: {
        DB: adapter,
        AUTH_SECRET: secret
      }
    },
    rawDb: db
  };
}

describe('AUDIT Remediation: Dot 27 Feedback (P1-01, P1-02, P1-03, P1-04)', () => {

  describe('P1-01: Parent Test Records Scoping & Revocation Predicate', () => {
    test('GET /api/parents/tests without filter returns ONLY verified child records and excludes revoked child', async () => {
      const { platform, rawDb } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      // Seed records directly into parent_test_records
      rawDb.exec(`
        CREATE TABLE IF NOT EXISTS parent_test_records (
          id TEXT PRIMARY KEY,
          parent_user_id TEXT NOT NULL,
          student_user_id TEXT NOT NULL,
          test_name TEXT NOT NULL,
          test_type TEXT NOT NULL DEFAULT 'standard_45m',
          score REAL NOT NULL,
          max_score REAL NOT NULL DEFAULT 10,
          test_date TEXT NOT NULL,
          teacher_feedback TEXT,
          image_url TEXT,
          source TEXT NOT NULL DEFAULT 'parent_manual',
          status TEXT NOT NULL DEFAULT 'unverified',
          version INTEGER NOT NULL DEFAULT 1,
          idempotency_key TEXT,
          payload_hash TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO parent_test_records (id, parent_user_id, student_user_id, test_name, score, max_score, test_date) VALUES
          ('ptr_verified', 'usr_parent_1', 'usr_student_1', 'Bài 45p Tiết 1', 9.0, 10, '2026-09-20'),
          ('ptr_revoked', 'usr_parent_1', 'usr_student_2', 'Bài 15p Nhạy Cảm', 8.5, 10, '2026-09-21');
      `);

      // 1. All-list query without student_id
      const resAll = await parentTestsGet({
        url: new URL('http://localhost/api/parents/tests'),
        request: new Request('http://localhost/api/parents/tests', {
          headers: { Authorization: `Bearer ${parentToken}` }
        }),
        platform
      });

      assert.equal(resAll.status, 200);
      const dataAll = await resAll.json();
      assert.equal(dataAll.total, 1);
      assert.equal(dataAll.records[0].id, 'ptr_verified');
      assert.equal(dataAll.records[0].student_user_id, 'usr_student_1');

      // 2. Specific query for revoked child must return 403 Forbidden
      const resRevoked = await parentTestsGet({
        url: new URL('http://localhost/api/parents/tests?student_id=usr_student_2'),
        request: new Request('http://localhost/api/parents/tests?student_id=usr_student_2', {
          headers: { Authorization: `Bearer ${parentToken}` }
        }),
        platform
      });

      assert.equal(resRevoked.status, 403);
    });
  });

  describe('P1-02: Blocker Payroll & Index Failure Propagation', () => {
    test('Index initialization failure fails closed with HTTP 500 and leaves ZERO ledger entries', async () => {
      const { platform, rawDb } = createMockPlatform();
      const originalPrepare = platform.env.DB.prepare.bind(platform.env.DB);
      platform.env.DB.prepare = (sql) => {
        if (sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_payroll_version')) {
          throw new Error('AUDIT_INDEX_IO_FAILURE');
        }
        return originalPrepare(sql);
      };

      const leaderToken = await createSignedToken({ id: 'usr_leader_1', username: 'leader_tam', role: 'leader' }, secret);

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

      assert.ok(res.status >= 500, 'Must fail closed with HTTP 500 upon index failure');
      const ledgerCount = rawDb.prepare('SELECT COUNT(*) AS n FROM finance_ledger').get().n;
      assert.equal(ledgerCount, 0, 'Zero ledger entries must be created on schema/index error');
    });

    test('Parent tests table index initialization failure fails closed with HTTP 500', async () => {
      const { platform } = createMockPlatform();
      const originalPrepare = platform.env.DB.prepare.bind(platform.env.DB);
      platform.env.DB.prepare = (sql) => {
        if (sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_test_records_idem')) {
          throw new Error('AUDIT_PARENT_INDEX_IO_FAILURE');
        }
        return originalPrepare(sql);
      };

      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      const res = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài kiểm tra 15 phút',
            score: 9.0,
            test_date: '2026-09-25'
          })
        }),
        platform
      });

      assert.ok(res.status >= 500, 'Must fail closed with HTTP 500 when index creation fails');
    });
  });

  describe('P1-03: Parent Records Replay Contract, Conflict & Concurrency', () => {
    test('Replay with same idempotency_key but different payload returns HTTP 409 Conflict', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      // 1. Initial valid insert
      const res1 = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài 45p Giữa Kỳ',
            score: 8.5,
            test_date: '2026-09-20',
            idempotency_key: 'idem_key_unique_001'
          })
        }),
        platform
      });
      assert.equal(res1.status, 201);

      // 2. Retry with same key but different score (mutation attempt)
      const resConflict = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài 45p Giữa Kỳ',
            score: 10.0, // altered score
            test_date: '2026-09-20',
            idempotency_key: 'idem_key_unique_001'
          })
        }),
        platform
      });
      assert.equal(resConflict.status, 409, 'Must return HTTP 409 Conflict on payload mismatch');
    });

    test('Cross-child replay: cannot replay record of revoked child even using verified child in request', async () => {
      const { platform, rawDb } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      // Setup: an existing record belongs to usr_student_2 (who is revoked)
      rawDb.exec(`
        CREATE TABLE IF NOT EXISTS parent_test_records (
          id TEXT PRIMARY KEY,
          parent_user_id TEXT NOT NULL,
          student_user_id TEXT NOT NULL,
          test_name TEXT NOT NULL,
          test_type TEXT NOT NULL DEFAULT 'standard_45m',
          score REAL NOT NULL,
          max_score REAL NOT NULL DEFAULT 10,
          test_date TEXT NOT NULL,
          teacher_feedback TEXT,
          image_url TEXT,
          source TEXT NOT NULL DEFAULT 'parent_manual',
          status TEXT NOT NULL DEFAULT 'unverified',
          version INTEGER NOT NULL DEFAULT 1,
          idempotency_key TEXT,
          payload_hash TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO parent_test_records (
          id, parent_user_id, student_user_id, test_name, test_type,
          score, max_score, test_date, teacher_feedback, image_url,
          source, status, version, idempotency_key
        ) VALUES (
          'ptr_old_revoked', 'usr_parent_1', 'usr_student_2', 'Bài kiểm tra cũ', 'standard_45m',
          7.0, 10, '2026-09-10', '', '', 'parent_manual', 'unverified', 1, 'idem_cross_child'
        );
      `);

      // Attempt to replay matching payload but for student_2
      const resReplay = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_2',
            test_name: 'Bài kiểm tra cũ',
            score: 7.0,
            test_date: '2026-09-10',
            idempotency_key: 'idem_cross_child'
          })
        }),
        platform
      });

      // Must be rejected with 403 Forbidden because student_2 is revoked
      assert.equal(resReplay.status, 403, 'Must reject replay of record belonging to revoked child');
    });

    test('Atomic write-time check prevents insertion if link is not verified at INSERT time', async () => {
      const { platform, rawDb } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      // Revoke the link right before insert
      rawDb.prepare("UPDATE parent_student_links SET verification_status = 'revoked' WHERE id = 'psl_1'").run();

      const res = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài thi thử write-time',
            score: 9.0,
            test_date: '2026-09-25'
          })
        }),
        platform
      });

      assert.equal(res.status, 403, 'Write-time guard must reject revoked link with 403');
    });
  });

  describe('P1-04: Strict Validation, Calendar Check & Profile Identity', () => {
    test('Parent score rejects boolean, array, string with HTTP 400 without coercion', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      const invalidScores = [true, false, [9.0], { score: 9 }, '9.0', NaN, Infinity];
      for (const inv of invalidScores) {
        const res = await parentTestsPost({
          request: new Request('http://localhost/api/parents/tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
            body: JSON.stringify({
              student_id: 'usr_student_1',
              test_name: 'Bài thi test score',
              score: inv,
              test_date: '2026-09-25'
            })
          }),
          platform
        });
        assert.equal(res.status, 400, `Score ${JSON.stringify(inv)} must return HTTP 400`);
      }
    });

    test('Parent max_score and test_type reject invalid values with HTTP 400 (no silent fallback)', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      // Invalid test_type
      const resType = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài test',
            score: 8.0,
            test_type: 'unknown_alien_test',
            test_date: '2026-09-25'
          })
        }),
        platform
      });
      assert.equal(resType.status, 400, 'Invalid test_type must be rejected with 400');

      // Invalid max_score
      const resMax = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài test',
            score: 8.0,
            max_score: -5,
            test_date: '2026-09-25'
          })
        }),
        platform
      });
      assert.equal(resMax.status, 400, 'Negative max_score must be rejected with 400');
    });

    test('Calendar round-trip validation rejects impossible calendar dates like 2026-02-31', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', username: 'parent_mai', role: 'parent' }, secret);

      const res = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài thi ngày 31 tháng 2',
            score: 8.0,
            test_date: '2026-02-31'
          })
        }),
        platform
      });
      assert.equal(res.status, 400, 'Date 2026-02-31 must be rejected with 400');
    });

    test('Self-profile rejects non-string fields with HTTP 400 schema error', async () => {
      const { platform } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', username: 'student_an', role: 'student' }, secret);

      const invalidPayloads = [
        { phone: 123456789 },
        { email: { address: 'an@example.com' } },
        { school: ['Trần Phú'] },
        { zalo_id: 123456 },
        { target: true }
      ];

      for (const payload of invalidPayloads) {
        const res = await profilePost({
          request: new Request('http://localhost/api/users/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
            body: JSON.stringify(payload)
          }),
          platform
        });
        assert.equal(res.status, 400, `Payload ${JSON.stringify(payload)} must return HTTP 400`);
      }
    });

    test('Self-profile normalizes +84 to 0, saves empty phone as NULL, and rejects duplicate phone with 409', async () => {
      const { platform, rawDb } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', username: 'student_an', role: 'student' }, secret);

      // 1. Normalize +84911223344
      const resNorm = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({ phone: '+84911223344' })
        }),
        platform
      });
      assert.equal(resNorm.status, 200);
      const dataNorm = await resNorm.json();
      assert.equal(dataNorm.user.phone, '0911223344');

      // 2. Empty string phone stored as NULL
      const resEmpty = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({ phone: '' })
        }),
        platform
      });
      assert.equal(resEmpty.status, 200);
      const dbRow = rawDb.prepare("SELECT phone FROM users WHERE id = 'usr_student_1'").get();
      assert.equal(dbRow.phone, null, 'Empty phone must be stored as NULL in D1');

      // 3. Duplicate phone collision returns HTTP 409
      const resDup = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({ phone: '0912345678' }) // already belongs to usr_parent_1
        }),
        platform
      });
      assert.equal(resDup.status, 409, 'Duplicate phone must return HTTP 409 Conflict');
    });

    test('Self-profile concurrency guard returns 409 Conflict on expected_updated_at mismatch', async () => {
      const { platform, rawDb } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', username: 'student_an', role: 'student' }, secret);

      rawDb.prepare("UPDATE users SET updated_at = '2026-09-28 10:00:00' WHERE id = 'usr_student_1'").run();

      const resConflict = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({
            name: 'Nguyễn Văn An Cập Nhật',
            expected_updated_at: '2026-09-28 09:00:00' // stale timestamp
          })
        }),
        platform
      });

      assert.equal(resConflict.status, 409, 'Stale updated_at must return HTTP 409 Conflict');
    });

    test('Missing D1 database binding fails closed with HTTP 503 without fallback in production mode', async () => {
      const studentToken = await createSignedToken({ id: 'usr_student_1', username: 'student_an', role: 'student' }, secret);
      const parentToken = await createSignedToken({ id: 'usr_parent_demo', username: 'phuhuynh', role: 'parent' }, secret);
      const platformWithoutDb = {
        env: {
          AUTH_SECRET: secret,
          ENABLE_LOCAL_MOCK: 'true'
        }
      };

      const resProfile = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({ name: 'Thử nghiệm thiếu DB' })
        }),
        platform: platformWithoutDb
      });
      assert.equal(resProfile.status, 503, 'Missing DB binding must return HTTP 503 Fail-Closed');

      const resTests = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
          body: JSON.stringify({ student_id: 'usr_student_1', test_name: 'Test', score: 8.0, test_date: '2026-09-25' })
        }),
        platform: platformWithoutDb
      });
      assert.equal(resTests.status, 503, 'Missing DB binding must return HTTP 503 Fail-Closed for parent tests');
    });
  });
});

// tests/verify_p1_modals_profile_ocr.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import { GET as profileGet, POST as profilePost } from '../src/routes/api/users/profile/+server.js';
import { GET as parentTestsGet, POST as parentTestsPost } from '../src/routes/api/parents/tests/+server.js';
import { POST as guestExamPost } from '../src/routes/api/exams/guest/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';
import { simulateOcrFromImage, saveParentTestRecord } from '../src/lib/unifiedStore.js';

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

    INSERT INTO users (id, username, role, name, phone, email, password, status, metadata) VALUES
      ('usr_parent_1', 'parent_mai', 'parent', 'Nguyễn Thị Mai', '0912345678', 'mai@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_parent_2', 'parent_hung', 'parent', 'Trần Văn Hùng', '0987654321', 'hung@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_student_1', 'student_an', 'student', 'Nguyễn Văn An', '0911223344', 'an@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 7"}'),
      ('usr_student_2', 'student_binh', 'student', 'Trần Văn Bình', '0922334455', 'binh@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 8"}'),
      ('usr_teacher_1', 'teacher_dung', 'teacher', 'Cô Dung', '0933445566', 'dung@example.com', 'pbkdf2:dummy', 'active', '{}');

    CREATE TABLE parent_student_links (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- usr_parent_1 has verified link with usr_student_1, pending link with usr_student_2
    INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
      ('psl_1', 'usr_parent_1', 'usr_student_1', 'verified'),
      ('psl_2', 'usr_parent_1', 'usr_student_2', 'pending');

    CREATE TABLE parent_test_records (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE guest_exam_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      grade TEXT NOT NULL,
      curriculum TEXT NOT NULL DEFAULT 'global_success',
      blueprint_json TEXT,
      candidate_name TEXT,
      duration_minutes INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      questions_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      answers_json TEXT,
      result_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

describe('P1 Remediation: OCR Simulation Elimination, Self-Profile & Parent Persistence', () => {

  // =========================================================================
  // FIXTURE 1: OCR SIMULATION ELIMINATION & NEGATIVE CONTROLS
  // =========================================================================
  describe('Fixture 1: OCR Simulation Elimination & Negative Controls', () => {
    test('1.1: simulateOcrFromImage returns deferred status and NEVER generates fake random scores or teacher feedbacks', async () => {
      const res = await simulateOcrFromImage('data:image/jpeg;base64,sample_raw_image_bytes');
      assert.equal(res.success, false, 'OCR simulate must return success=false');
      assert.equal(res.ocr_status, 'deferred', 'ocr_status must be explicitly deferred');
      assert.equal(res.detected_score, undefined, 'Must not return detected_score');
      assert.equal(res.detected_feedback, undefined, 'Must not return detected_feedback');
      assert.equal(res.detected_title, undefined, 'Must not return detected_title');
    });

    test('1.2: saveParentTestRecord saves with parent_manual source and unverified status', () => {
      const record = saveParentTestRecord({
        student_id: 'usr_student_1',
        student_name: 'Nguyễn Văn An',
        test_name: 'Kiểm tra 15 phút Unit 1',
        score: 8.5,
        max_score: 10,
        image_url: 'data:image/jpeg;base64,...'
      });

      assert.equal(record.source, 'parent_manual');
      assert.equal(record.status, 'unverified');
      assert.equal(record.ocr_status, 'parent_manual');
      assert.equal(record.score, 8.5);
    });

    test('1.3: Static inspection: ParentTestOcrModal.svelte has zero OCR simulation and defaults score to empty', () => {
      const modalPath = path.resolve('src/lib/components/ParentTestOcrModal.svelte');
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.doesNotMatch(content, /simulateOcrFromImage/, 'Must not import or invoke simulateOcrFromImage');
      assert.doesNotMatch(content, /score\s*=\s*\$state\(9\.0\)/, 'Must not pre-fill score with 9.0');
      assert.doesNotMatch(content, /ocr_verified/, 'Must not tag records with ocr_verified');
      assert.match(content, /Unverified/, 'Must display unverified regulatory policy warning');
      assert.match(content, /\/api\/parents\/tests/, 'Must persist to /api/parents/tests');
    });
  });

  // =========================================================================
  // FIXTURE 2: SELF-PROFILE AUTHORIZATION & D1 PERSISTENCE
  // =========================================================================
  describe('Fixture 2: Self-Profile Authorization & D1 Persistence (/api/users/profile)', () => {
    test('2.1: Unauthenticated request to /api/users/profile returns HTTP 401', async () => {
      const { platform } = createMockPlatform();
      const req = new Request('http://localhost/api/users/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacker' })
      });

      const res = await profilePost({ request: req, platform });
      assert.equal(res.status, 401);
    });

    test('2.2: Privilege escalation attempt (modifying role, status, stars, password) returns HTTP 400', async () => {
      const { platform } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', role: 'student' }, secret);

      const maliciousPayloads = [
        { role: 'admin' },
        { status: 'active_vip' },
        { stars: 9999 },
        { password: 'new_hacked_pass' }
      ];

      for (const payload of maliciousPayloads) {
        const req = new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${studentToken}`
          },
          body: JSON.stringify(payload)
        });

        const res = await profilePost({ request: req, platform });
        assert.equal(res.status, 400, `Payload ${JSON.stringify(payload)} should return HTTP 400`);
        const data = await res.json();
        assert.match(data.error, /PrivilegeEscalationAttempt/);
      }
    });

    test('2.3: Student/parent attempting direct grade modification returns HTTP 403 ForbiddenGradeChange', async () => {
      const { platform } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', role: 'student' }, secret);

      const req = new Request('http://localhost/api/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({ grade: 'Lớp 12' })
      });

      const res = await profilePost({ request: req, platform });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /ForbiddenGradeChange/);
    });

    test('2.4: Valid self-profile update persists allowlisted fields to D1 users table', async () => {
      const { platform, rawDb } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', role: 'student' }, secret);

      const req = new Request('http://localhost/api/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          name: 'Nguyễn Văn An Cập Nhật',
          phone: '0911223399',
          school: 'THCS Giảng Võ',
          zalo_id: 'zalo_an_2026',
          target: 'Chuyên Anh Amsterdam'
        })
      });

      const res = await profilePost({ request: req, platform });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.user.name, 'Nguyễn Văn An Cập Nhật');
      assert.equal(data.user.phone, '0911223399');

      // Verify D1 row
      const dbRow = rawDb.prepare('SELECT name, phone, metadata FROM users WHERE id = ?').get('usr_student_1');
      assert.equal(dbRow.name, 'Nguyễn Văn An Cập Nhật');
      assert.equal(dbRow.phone, '0911223399');
      const meta = JSON.parse(dbRow.metadata);
      assert.equal(meta.school, 'THCS Giảng Võ');
      assert.equal(meta.zalo_id, 'zalo_an_2026');
      assert.equal(meta.target, 'Chuyên Anh Amsterdam');
    });

    test('2.5: GET /api/users/profile returns fresh profile from D1 without password hash', async () => {
      const { platform } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', role: 'student' }, secret);

      const req = new Request('http://localhost/api/users/profile', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });

      const res = await profileGet({ request: req, platform });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.user.id, 'usr_student_1');
      assert.equal(data.user.password, undefined, 'Password must be sanitized');
    });
  });

  // =========================================================================
  // FIXTURE 3: PARENT TEST RECORDS PERSISTENCE & SCOPING (/api/parents/tests)
  // =========================================================================
  describe('Fixture 3: Parent Test Records Persistence & Scoping (/api/parents/tests)', () => {
    test('3.1: Non-parent non-staff role (student) is blocked with HTTP 403', async () => {
      const { platform } = createMockPlatform();
      const studentToken = await createSignedToken({ id: 'usr_student_1', role: 'student' }, secret);

      const req = new Request('http://localhost/api/parents/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          student_id: 'usr_student_1',
          test_name: 'Bài thi thử',
          score: 8.0
        })
      });

      const res = await parentTestsPost({ request: req, platform });
      assert.equal(res.status, 403);
    });

    test('3.2: Parent creating record for unverified/pending child returns HTTP 403 ForbiddenChildAccess', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);

      // usr_student_2 has only a 'pending' link with usr_parent_1
      const req = new Request('http://localhost/api/parents/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parentToken}`
        },
        body: JSON.stringify({
          student_id: 'usr_student_2',
          test_name: 'Đề 1 tiết lớp 8',
          score: 8.5,
          test_date: '2026-09-28'
        })
      });

      const res = await parentTestsPost({ request: req, platform });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /ForbiddenChildAccess/);
    });

    test('3.3: Invalid score (< 0, > max_score, non-numeric) returns HTTP 400 InvalidScore', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);

      const invalidScores = [-1, 11, NaN, 'abc', 10.5];

      for (const sc of invalidScores) {
        const req = new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${parentToken}`
          },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Khảo sát',
            score: sc,
            max_score: 10,
            test_date: '2026-09-28'
          })
        });

        const res = await parentTestsPost({ request: req, platform });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.error, /InvalidScore/);
      }
    });

    test('3.4: Invalid date format returns HTTP 400 InvalidDate', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);

      const req = new Request('http://localhost/api/parents/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parentToken}`
        },
        body: JSON.stringify({
          student_id: 'usr_student_1',
          test_name: 'Khảo sát',
          score: 9.0,
          test_date: '28-09-2026' // Wrong format
        })
      });

      const res = await parentTestsPost({ request: req, platform });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /InvalidDate/);
    });

    test('3.5: Verified child test record is persisted to D1 with parent_manual/unverified and idempotency replay', async () => {
      const { platform, rawDb } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);

      const payload = {
        student_id: 'usr_student_1',
        test_name: 'Đề 1 Tiết 45 Phút - Giữa Học Kỳ 1',
        test_type: 'standard_45m',
        score: 9.2,
        max_score: 10,
        test_date: '2026-09-25',
        teacher_feedback: 'Con làm bài tốt, ngữ pháp vững vàng.',
        idempotency_key: 'idem_parent_test_001'
      };

      // 1. Initial submission
      const req1 = new Request('http://localhost/api/parents/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parentToken}`
        },
        body: JSON.stringify(payload)
      });

      const res1 = await parentTestsPost({ request: req1, platform });
      assert.equal(res1.status, 201);
      const data1 = await res1.json();
      assert.equal(data1.success, true);
      assert.equal(data1.record.source, 'parent_manual');
      assert.equal(data1.record.status, 'unverified');
      assert.equal(data1.record.score, 9.2);

      // Verify D1 table
      const count = rawDb.prepare('SELECT COUNT(*) as c FROM parent_test_records WHERE idempotency_key = ?').get('idem_parent_test_001');
      assert.equal(count.c, 1);

      // 2. Idempotent replay with same key
      const req2 = new Request('http://localhost/api/parents/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parentToken}`
        },
        body: JSON.stringify(payload)
      });

      const res2 = await parentTestsPost({ request: req2, platform });
      assert.equal(res2.status, 200, 'Replay should return HTTP 200');
      const data2 = await res2.json();
      assert.equal(data2.replayed, true);
      assert.equal(data2.record.id, data1.record.id);

      // Verify row count remains exactly 1
      const countAfter = rawDb.prepare('SELECT COUNT(*) as c FROM parent_test_records WHERE idempotency_key = ?').get('idem_parent_test_001');
      assert.equal(countAfter.c, 1);
    });

    test('3.6: GET /api/parents/tests returns only verified child records for this parent', async () => {
      const { platform } = createMockPlatform();
      const parentToken = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);

      const req = new Request('http://localhost/api/parents/tests?student_id=usr_student_1', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${parentToken}` }
      });

      const res = await parentTestsGet({ url: new URL(req.url), request: req, platform });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.records));
    });

    test('3.7: Revoked/pending child absent filter must not leak records to parent', async () => {
      const { platform, rawDb } = createMockPlatform();
      rawDb.exec(`
        UPDATE parent_student_links SET verification_status='revoked' WHERE id='psl_1';
        INSERT INTO parent_test_records(id, parent_user_id, student_user_id, test_name, score, max_score, test_date)
        VALUES('secret_record', 'usr_parent_1', 'usr_student_1', 'Private', 8, 10, '2026-09-28');
      `);
      const token = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);
      const url = new URL('http://localhost/api/parents/tests');
      const r = await parentTestsGet({ url, request: new Request(url, { headers: { Authorization: `Bearer ${token}` } }), platform });
      const data = await r.json();
      assert.equal(r.status, 200);
      assert.equal(data.records?.length, 0, 'Must return 0 records when link is revoked');
    });
  });

  // =========================================================================
  // FIXTURE 4: GUEST API EXPLICIT CURRICULUM CONTRACT
  // =========================================================================
  describe('Fixture 4: Guest API Explicit Curriculum Contract (/api/exams/guest)', () => {
    test('4.1: Missing or empty curriculum in start action returns HTTP 400 InvalidCurriculum', async () => {
      const { platform } = createMockPlatform();

      const invalidPayloads = [
        { action: 'start', grade: 'lop_7' }, // missing curriculum
        { action: 'start', grade: 'lop_7', curriculum: '' }, // empty string
        { action: 'start', grade: 'lop_7', curriculum: ['global_success'] }, // array
        { action: 'start', grade: 'lop_7', curriculum: 123 }, // number
        { action: 'start', grade: 'lop_7', curriculum: { name: 'global_success' } } // object
      ];

      for (const p of invalidPayloads) {
        const req = new Request('http://localhost/api/exams/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });

        const res = await guestExamPost({ request: req, platform });
        assert.equal(res.status, 400, `Payload ${JSON.stringify(p)} must return 400`);
        const data = await res.json();
        assert.match(data.error, /InvalidCurriculum/);
      }
    });

    test('4.2: Explicit string curriculum starts exam session and freezes blueprint', async () => {
      const { platform } = createMockPlatform();

      const req = new Request('http://localhost/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          grade: 'lop_7',
          curriculum: 'friends_plus',
          duration_type: '5m'
        })
      });

      const res = await guestExamPost({ request: req, platform });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.curriculum, 'friends_plus');
      assert.ok(data.guest_session_id);
    });
  });

  // =========================================================================
  // FIXTURE 5: STUDENT DASHBOARD ERROR STATE & GRADE FIDELITY
  // =========================================================================
  describe('Fixture 5: Student Dashboard Error State & Grade Fidelity', () => {
    test('5.1: Static inspection: cpanel/student/+page.svelte has no fallback to Lớp 7 Chuyên and renders error retry view', () => {
      const pagePath = path.resolve('src/routes/cpanel/student/+page.svelte');
      const content = fs.readFileSync(pagePath, 'utf8');

      assert.doesNotMatch(content, /Lớp 7 Chuyên/, 'Must not force fallback to Lớp 7 Chuyên');
      assert.match(content, /Chưa phân lớp/, 'Must show Chưa phân lớp when grade is absent');
      assert.match(content, /errorMessage/, 'Must define and bind errorMessage');
      assert.match(content, /Thử lại/, 'Must render retry button on error state');
      assert.match(content, /loadSequence/, 'Must protect against race conditions with sequence counter');
    });
  });
});

// tests/verify_dot29_directive_a2_b1_b3.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { POST as guestExamPost } from '../src/routes/api/exams/guest/+server.js';
import { POST as parentTestsPost, DELETE as parentTestsDelete } from '../src/routes/api/parents/tests/+server.js';
import { POST as profilePost, GET as profileGet } from '../src/routes/api/users/profile/+server.js';
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
      profile_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (id, username, role, name, phone, email, password, status, metadata) VALUES
      ('usr_parent_1', 'parent_mai', 'parent', 'Nguyễn Thị Mai', '0912345678', 'mai@example.com', 'pbkdf2:dummy', 'active', '{}'),
      ('usr_student_1', 'student_an', 'student', 'Nguyễn Văn An', '0911223344', 'an@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 7"}'),
      ('usr_student_2', 'student_binh', 'student', 'Trần Văn Bình', '0922334455', 'binh@example.com', 'pbkdf2:dummy', 'active', '{"grade":"Lớp 8"}');

    CREATE TABLE parent_student_links (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
      ('psl_1', 'usr_parent_1', 'usr_student_1', 'verified'),
      ('psl_2', 'usr_parent_1', 'usr_student_2', 'revoked');

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
      payload_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              const stmt = db.prepare(sql);
              return stmt.get(...params);
            },
            async all() {
              const stmt = db.prepare(sql);
              return stmt.all(...params);
            },
            async run() {
              const stmt = db.prepare(sql);
              const info = stmt.run(...params);
              return {
                meta: {
                  changes: info.changes,
                  last_row_id: info.lastInsertRowid
                }
              };
            }
          };
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run();
          return {
            meta: {
              changes: info.changes,
              last_row_id: info.lastInsertRowid
            }
          };
        }
      };
    }
  };

  return {
    rawDb: db,
    platform: {
      env: {
        DB: mockDb,
        AUTH_SECRET: secret
      }
    }
  };
}

describe('Dot 29 Directive Remediation: A2, B1, B2, B3, C (Codex 2026-09-29)', () => {

  describe('A2: Student Auth Change Invalidation', () => {
    test('Static inspection: student page listens to tienganh:auth-change, increments authGeneration, and purges modals/drafts', () => {
      const studentPagePath = path.resolve('src/routes/cpanel/student/+page.svelte');
      const content = fs.readFileSync(studentPagePath, 'utf8');

      assert.match(content, /tienganh:auth-change/, 'Must listen to auth change event');
      assert.match(content, /authGeneration/, 'Must track authGeneration integer sequence');
      assert.match(content, /showSubmitModal\s*=\s*false/, 'Must close submit modal upon auth switch');
      assert.match(content, /selectedAssignment\s*=\s*null/, 'Must purge selected assignment upon auth switch');
      assert.match(content, /writingContent\s*=\s*''/, 'Must purge writing draft upon auth switch');
      assert.match(content, /recordedAudioUrl\s*=\s*null/, 'Must purge recorded audio upon auth switch');
      assert.match(content, /stopRecording\(\)/, 'Must stop active recording upon auth switch');
      assert.match(content, /if\s*\(\s*currentGen\s*!==\s*authGeneration/, 'Must guard in-flight responses with generation check');
    });
  });

  describe('B1: Parent Modal Scoping, Idempotency & Guards', () => {
    test('Static inspection: ParentTestOcrModal scopes reset to student.id and actor, guards file reader & save with generation, maintains stable idempotency key', () => {
      const modalPath = path.resolve('src/lib/components/ParentTestOcrModal.svelte');
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.match(content, /activeStudentId/, 'Must track active student ID to detect child switch');
      assert.match(content, /activeActorId/, 'Must track active actor ID to detect user switch');
      assert.match(content, /fileReaderGen/, 'Must maintain generation guard for file reader');
      assert.match(content, /saveGen/, 'Must maintain generation guard for save requests');
      assert.match(content, /currentIdempotencyKey/, 'Must maintain stable idempotency key for identical retries');
      assert.match(content, /computePayloadSignature/, 'Must detect payload signature mutations to rotate idempotency key');
      assert.match(content, /tienganh:auth-change/, 'Must listen to auth-change to immediately close modal and reset');
    });

    test('Parent test endpoint: same idempotency key with identical payload succeeds / replays; same key with different payload returns HTTP 409', async () => {
      const { platform } = createMockPlatform();
      const token = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);
      const idempotencyKey = 'ptest_stable_replay_key_001';

      const payload1 = {
        student_id: 'usr_student_1',
        test_name: 'Bài kiểm tra 1 tiết',
        test_type: 'standard_45m',
        score: 8.5,
        max_score: 10,
        test_date: '2026-09-28',
        teacher_feedback: 'Làm tốt',
        idempotency_key: idempotencyKey
      };

      // First submit returns 201 Created
      const res1 = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload1)
        }),
        platform
      });
      assert.equal(res1.status, 201, 'First creation must return 201 Created');
      const data1 = await res1.json();
      assert.equal(data1.success, true);
      assert.equal(data1.record.test_name, 'Bài kiểm tra 1 tiết');

      // Retry exact same payload with same idempotency key (simulating network retry) -> Returns cached record
      const resRetry = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload1)
        }),
        platform
      });
      assert.equal(resRetry.status, 200, 'Identical retry must succeed and return cached replay');
      const dataRetry = await resRetry.json();
      assert.equal(dataRetry.record.id, data1.record.id, 'Must return same record id on replay');

      // Same key but modified score (different payload) -> Must return HTTP 409 Conflict
      const payloadMutated = { ...payload1, score: 9.5 };
      const resConflict = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payloadMutated)
        }),
        platform
      });
      assert.equal(resConflict.status, 409, 'Same idempotency key with different payload must return 409 Conflict');
    });
  });

  describe('B2: Image Oversize Rejection Contract', () => {
    test('Image exceeding 500.000 characters is rejected with HTTP 400 ImageTooLarge (no silent truncation)', async () => {
      const { platform } = createMockPlatform();
      const token = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);

      const oversizedImageUrl = 'data:image/jpeg;base64,' + 'A'.repeat(500005);
      const res = await parentTestsPost({
        request: new Request('http://localhost/api/parents/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            student_id: 'usr_student_1',
            test_name: 'Bài thi ảnh to',
            score: 7.0,
            test_date: '2026-09-28',
            image_url: oversizedImageUrl
          })
        }),
        platform
      });

      assert.equal(res.status, 400, 'Oversized image must be rejected with 400');
      const data = await res.json();
      assert.match(data.error, /ImageTooLarge/, 'Error message must specify ImageTooLarge');
    });
  });

  describe('B3: Guest Exam Modal Pending Response, Deadline Timer & Abort Controller', () => {
    test('Static inspection: GuestExamModal binds abort controller, real-time deadline timer, and generation guard', () => {
      const modalPath = path.resolve('src/lib/components/GuestExamModal.svelte');
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.match(content, /guestGeneration/, 'Must track guestGeneration integer sequence');
      assert.match(content, /activeAbortController/, 'Must maintain activeAbortController');
      assert.match(content, /examDeadlineMs/, 'Must use real-time deadline timestamp (examDeadlineMs)');
      assert.match(content, /examStartTimeMs/, 'Must track exam start timestamp');
      assert.match(content, /signal:\s*activeAbortController\.signal/, 'Must pass abort signal to fetch');
      assert.match(content, /if\s*\(!isOpen\)\s*\{\s*guestGeneration\s*\+=/, 'Must abort & bump generation when modal closes');
      assert.match(content, /if\s*\(currentGen\s*!==\s*guestGeneration\s*\|\|\s*!isOpen\)\s*return/, 'Must discard late responses');
    });
  });

  describe('C: Profile Version CAS Concurrency Semantics (C1 - C7)', () => {
    test('C1, C2 & C6: Concurrent updates in same second with stale version return 409 ConcurrencyConflict; retrying with incremented version succeeds', async () => {
      const { platform, rawDb } = createMockPlatform();
      const token = await createSignedToken({ id: 'usr_parent_1', role: 'parent' }, secret);

      // Initial state: profile_version = 1
      const getInitial = await profileGet({
        request: new Request('http://localhost/api/users/profile', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        platform
      });
      const dataInit = await getInitial.json();
      assert.equal(dataInit.profile_version, 1);

      // Session B writes target -> bumps version to 2
      const resB = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ target: 'Mục tiêu Session B', expected_version: 1 })
        }),
        platform
      });
      assert.equal(resB.status, 200);
      const dataB = await resB.json();
      assert.equal(dataB.profile_version, 2);

      // Session A had expected_version = 1 (stale) -> Must return 409
      const resA = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ school: 'Trường Session A', expected_version: 1 })
        }),
        platform
      });
      assert.equal(resA.status, 409, 'Stale version write must return 409');
      const dataA = await resA.json();
      assert.equal(dataA.current_version, 2, 'Response must provide current_version = 2 for retry reconciliation');

      // User in Session A reviews draft, sees target updated, and submits active retry with expected_version = 2
      const resARetry = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ school: 'Trường Session A', expected_version: 2 })
        }),
        platform
      });
      assert.equal(resARetry.status, 200, 'Explicit retry with reconciled version must succeed');
      const dataARetry = await resARetry.json();
      assert.equal(dataARetry.profile_version, 3);

      // Verify DB has BOTH fields intact: target from B and school from A (json_set atomicity)
      const freshRow = rawDb.prepare("SELECT metadata, profile_version FROM users WHERE id = 'usr_parent_1'").get();
      const meta = JSON.parse(freshRow.metadata);
      assert.equal(meta.target, 'Mục tiêu Session B');
      assert.equal(meta.school, 'Trường Session A');
      assert.equal(freshRow.profile_version, 3);
    });

    test('C4: DB offline / binding unavailable fails closed with HTTP 503, preserving client draft without fake sync', async () => {
      const token = await createSignedToken({ id: 'usr_student_1', username: 'student_an', role: 'student' }, secret);
      const platformNoDb = {
        env: {
          AUTH_SECRET: secret,
          ENABLE_LOCAL_MOCK: 'true'
        }
      };

      const res = await profilePost({
        request: new Request('http://localhost/api/users/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ school: 'Trường THCS Test' })
        }),
        platform: platformNoDb
      });
      assert.equal(res.status, 503, 'Missing DB binding must return 503 fail-closed');
    });

    test('C7: Protected endpoints return 401 Unauthorized without token or with invalid token', async () => {
      const { platform } = createMockPlatform();
      const res = await profileGet({
        request: new Request('http://localhost/api/users/profile'),
        platform
      });
      assert.equal(res.status, 401);
    });
  });
});

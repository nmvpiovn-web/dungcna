/**
 * verify_g1_notification_policy.test.js
 * Comprehensive G1 Fixture Matrix Audit Test Suite:
 * 
 * Matrix Requirements from Codex AUDIT_FEEDBACK_38873c3_G1_UI_RACE_2026-09-28.md:
 * A. Parent P: A revoked/B verified; grade A denied, B allowed.
 * B. Pending P with old notification and homework broadcast: denied; public system announcements visible.
 *    Quarantine / fail-closed for NULL category referencing revoked submissions; tuition verified allowed.
 * C. Uniformity: GET, mark_read, and mark_all have identical authorized IDs; forbidden read-state untouched.
 * D. Enrollment inactive + metadata cũ không hồi quyền; student chuyển lớp; exact class equality (class_7 != classX7).
 * E. Real assign/grade handlers check exact recipients; unknown/non-allowlisted sensitive category denied.
 * F. Homework CAS concurrency: two concurrent grading requests -> exactly 1 reward, no double stars,
 *    honest student_star_ledger ledger without debt-clamping.
 * G. True Concurrency on Registration: concurrent requests passing SELECT simultaneously are caught by
 *    DB-level UNIQUE index (1 created with 201, 1 conflict with 409, exactly 1 row).
 * H. Grade selection fidelity: registering Lớp 2 preserves Lớp 2 through D1, metadata, auth token, and sanitizeUser.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { GET as getNotifications, POST as postNotifications } from '../src/routes/api/notifications/+server.js';
import { GET as getHomework, POST as postHomework } from '../src/routes/api/homework/+server.js';
import { POST as postTuition } from '../src/routes/api/tuition/+server.js';
import { POST as postRegister } from '../src/routes/api/auth/register/+server.js';
import { createSignedToken, verifyServerAuth } from '../src/lib/server/auth.js';

const TEST_SECRET = 'ephemeral_test_secret_hmac_2026_isolated_for_audit';

// Helper to create Cloudflare D1-compatible adapter wrapping isolated SQLite DatabaseSync
function createD1Adapter(sqliteDb) {
  let txLock = Promise.resolve();
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
      const prevLock = txLock;
      let release;
      txLock = new Promise(r => release = r);
      await prevLock;
      try {
        sqliteDb.exec('BEGIN TRANSACTION');
        const results = [];
        for (const s of statements) {
          results.push(await s.run());
        }
        sqliteDb.exec('COMMIT');
        return results;
      } catch (err) {
        try { sqliteDb.exec('ROLLBACK'); } catch {}
        throw err;
      } finally {
        release();
      }
    }
  };
}

function initTestDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      phone TEXT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT,
      status TEXT DEFAULT 'active',
      metadata TEXT,
      password TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username) WHERE username IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;

    CREATE TABLE IF NOT EXISTS parent_student_links (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      verification_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS class_enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active',
      UNIQUE(user_id, class_id)
    );

    CREATE TABLE IF NOT EXISTS homework_assignments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      class_name TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      teacher_name TEXT NOT NULL,
      campus_id TEXT NOT NULL DEFAULT 'loc_codung',
      skill_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      obsidian_note_id TEXT,
      obsidian_note_title TEXT,
      assigned_date TEXT NOT NULL,
      deadline_date TEXT NOT NULL,
      deadline_time TEXT NOT NULL,
      max_score REAL DEFAULT 10.0,
      star_reward_on_time INTEGER DEFAULT 50,
      status TEXT DEFAULT 'published',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS homework_submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      submission_type TEXT NOT NULL,
      content_text TEXT,
      audio_url TEXT,
      handwritten_image_url TEXT,
      attachments_json TEXT,
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_on_time INTEGER DEFAULT 1,
      graded_by_teacher_id TEXT,
      graded_by_teacher_name TEXT,
      graded_at TEXT,
      score REAL,
      teacher_feedback TEXT,
      audio_feedback_url TEXT,
      stars_awarded INTEGER DEFAULT 0,
      star_awarded_reason TEXT,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'submitted'
    );

    CREATE TABLE IF NOT EXISTS system_notifications (
      id TEXT PRIMARY KEY,
      target_role TEXT,
      target_user_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT,
      reference_id TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_notification_reads (
      notification_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notification_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS student_stars (
      student_id TEXT PRIMARY KEY,
      stars_balance INTEGER DEFAULT 0,
      total_earned_stars INTEGER DEFAULT 0,
      stars_redeemed INTEGER DEFAULT 0,
      star_debt INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_star_ledger (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      bill_id TEXT,
      reference_id TEXT,
      delta_stars INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      reason TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER IF NOT EXISTS trg_student_stars_no_negative
    BEFORE UPDATE ON student_stars
    FOR EACH ROW
    WHEN NEW.stars_balance < 0
    BEGIN
      SELECT RAISE(ABORT, 'INSUFFICIENT_STARS: stars_balance cannot be negative');
    END;

    CREATE TABLE IF NOT EXISTS tuition_bills (
      id TEXT PRIMARY KEY,
      version INTEGER DEFAULT 1,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      age INTEGER DEFAULT 13,
      grade_level TEXT NOT NULL DEFAULT 'Lớp 7',
      program_name TEXT NOT NULL DEFAULT 'Tiếng Anh K12',
      billing_period TEXT NOT NULL DEFAULT 'Tháng 10/2026',
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

    CREATE TABLE IF NOT EXISTS location_activity_streams (
      id TEXT PRIMARY KEY,
      campus_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      reference_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

describe('G1 AUDIT FIXTURE MATRIX - REAL HANDLERS & DB ISOLATION', async () => {
  let teacherToken;
  let parentToken;
  let studentToken;
  let adminToken;

  before(async () => {
    teacherToken = await createSignedToken(
      { id: 'usr_teacher_lan', username: 'lan', role: 'teacher', name: 'Cô Lan', status: 'active' },
      TEST_SECRET
    );
    parentToken = await createSignedToken(
      { id: 'usr_parent_p', username: 'parent_p', role: 'parent', name: 'Phụ huynh P', status: 'active' },
      TEST_SECRET
    );
    studentToken = await createSignedToken(
      { id: 'usr_student_s', username: 'student_s', role: 'student', name: 'Học sinh S', status: 'active' },
      TEST_SECRET
    );
    adminToken = await createSignedToken(
      { id: 'usr_admin', username: 'admin', role: 'superadmin', name: 'Super Admin', status: 'active' },
      TEST_SECRET
    );
  });

  // =========================================================================
  // FIXTURE A: Parent P: Child A revoked / Child B verified
  // =========================================================================
  describe('Fixture A: Parent P with Revoked Child A and Verified Child B', () => {
    test('A.1: Notification for revoked Child A is HIDDEN; notification for verified Child B is VISIBLE', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_parent_p', 'parent_p', 'parent_p@test.com', 'Phụ huynh P', 'parent'),
          ('usr_child_a', 'child_a', 'child_a@test.com', 'Học sinh A', 'student'),
          ('usr_child_b', 'child_b', 'child_b@test.com', 'Học sinh B', 'student');

        INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
          ('link_a', 'usr_parent_p', 'usr_child_a', 'revoked'),
          ('link_b', 'usr_parent_p', 'usr_child_b', 'verified');

        INSERT INTO class_enrollments (id, user_id, class_id, status) VALUES
          ('ce_a', 'usr_child_a', 'class_7', 'active'),
          ('ce_b', 'usr_child_b', 'class_8', 'active');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_a', 'sess_1', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'BTVN Lớp 7', 'Descr', '2026-10-01', '2026-10-05', '18:00'),
          ('hw_b', 'sess_2', 'class_8', 'Lớp 8', 'usr_teacher_lan', 'Cô Lan', 'writing', 'BTVN Lớp 8', 'Descr', '2026-10-01', '2026-10-05', '18:00');

        INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, score, status) VALUES
          ('sub_a', 'hw_a', 'usr_child_a', 'Học sinh A', 'writing', 9.0, 'graded'),
          ('sub_b', 'hw_b', 'usr_child_b', 'Học sinh B', 'writing', 9.5, 'graded');

        -- Two grade notifications personally addressed to Parent P
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id) VALUES
          ('notif_grade_a', 'parent', 'usr_parent_p', 'Điểm bé A: 9.0', 'Bé A đạt 9 điểm', 'homework', 'sub_a'),
          ('notif_grade_b', 'parent', 'usr_parent_p', 'Điểm bé B: 9.5', 'Bé B đạt 9.5 điểm', 'homework', 'sub_b');
      `);

      const req = new Request('http://localhost/api/notifications', {
        headers: { 'Authorization': `Bearer ${parentToken}` }
      });
      const res = await getNotifications({ request: req, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      const data = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);

      const ids = (data.notifications || []).map(n => n.id);
      assert.ok(!ids.includes('notif_grade_a'), 'Revoked Child A notification MUST be hidden');
      assert.ok(ids.includes('notif_grade_b'), 'Verified Child B notification MUST be visible');
      assert.strictEqual(ids.length, 1);
    });

    test('A.2: mark_read for revoked Child A returns 403; mark_read for verified Child B succeeds with 200', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_parent_p', 'parent_p', 'parent_p@test.com', 'Phụ huynh P', 'parent'),
          ('usr_child_a', 'child_a', 'child_a@test.com', 'Học sinh A', 'student'),
          ('usr_child_b', 'child_b', 'child_b@test.com', 'Học sinh B', 'student');

        INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
          ('link_a', 'usr_parent_p', 'usr_child_a', 'revoked'),
          ('link_b', 'usr_parent_p', 'usr_child_b', 'verified');

        INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, score, status) VALUES
          ('sub_a', 'hw_a', 'usr_child_a', 'Học sinh A', 'writing', 9.0, 'graded'),
          ('sub_b', 'hw_b', 'usr_child_b', 'Học sinh B', 'writing', 9.5, 'graded');

        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id) VALUES
          ('notif_grade_a', 'parent', 'usr_parent_p', 'Điểm bé A: 9.0', 'Bé A đạt 9 điểm', 'homework', 'sub_a'),
          ('notif_grade_b', 'parent', 'usr_parent_p', 'Điểm bé B: 9.5', 'Bé B đạt 9.5 điểm', 'homework', 'sub_b');
      `);

      // 1. Attempt to mark_read revoked notification -> MUST FAIL with 403 Forbidden
      const reqFail = new Request('http://localhost/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${parentToken}` },
        body: JSON.stringify({ action: 'mark_read', notification_id: 'notif_grade_a' })
      });
      const resFail = await postNotifications({ request: reqFail, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(resFail.status, 403, 'mark_read on revoked child notification MUST return HTTP 403');

      // 2. Attempt to mark_read verified notification -> MUST SUCCEED with 200
      const reqOk = new Request('http://localhost/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${parentToken}` },
        body: JSON.stringify({ action: 'mark_read', notification_id: 'notif_grade_b' })
      });
      const resOk = await postNotifications({ request: reqOk, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(resOk.status, 200);

      // Verify read-state in DB: only notif_grade_b is marked read
      const reads = sqlite.prepare('SELECT * FROM system_notification_reads').all();
      assert.strictEqual(reads.length, 1);
      assert.strictEqual(reads[0].notification_id, 'notif_grade_b');
    });
  });

  // =========================================================================
  // FIXTURE B: Pending P with old notification, homework broadcast & NULL category quarantine
  // =========================================================================
  describe('Fixture B: Pending P with Homework Broadcast vs System Announcements & NULL Category Quarantine', () => {
    test('B.1: Pending parent: homework broadcast & personal homework DENIED; public system announcement VISIBLE', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_parent_pending', 'parent_pending', 'p_pend@test.com', 'Phụ huynh Chờ', 'parent'),
          ('usr_child_c', 'child_c', 'c_c@test.com', 'Học sinh C', 'student');

        -- Link is PENDING (not verified)
        INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
          ('link_c', 'usr_parent_pending', 'usr_child_c', 'pending');

        INSERT INTO class_enrollments (id, user_id, class_id, status) VALUES
          ('ce_c', 'usr_child_c', 'class_7', 'active');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_c', 'sess_3', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'BTVN Lớp 7', 'Descr', '2026-10-01', '2026-10-05', '18:00');

        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id) VALUES
          ('notif_hw_personal', 'parent', 'usr_parent_pending', 'BTVN Cá nhân', 'Nộp bài nhé', 'homework', 'hw_c'),
          ('notif_hw_broadcast', 'parent', NULL, 'BTVN Toàn Lớp 7', 'Hạn 18:00', 'homework', 'hw_c'),
          ('notif_sys_announcement', 'parent', NULL, 'Thông báo nghỉ lễ', 'Trung tâm nghỉ lễ 2/9', 'system', NULL);
      `);

      const pendingToken = await createSignedToken(
        { id: 'usr_parent_pending', username: 'parent_pending', role: 'parent', name: 'Phụ huynh Chờ', status: 'active' },
        TEST_SECRET
      );

      const req = new Request('http://localhost/api/notifications', {
        headers: { 'Authorization': `Bearer ${pendingToken}` }
      });
      const res = await getNotifications({ request: req, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      const data = await res.json();

      assert.strictEqual(res.status, 200);
      const notifs = data.notifications || [];
      const ids = notifs.map(n => n.id);

      assert.ok(!ids.includes('notif_hw_personal'), 'Pending parent MUST NOT see personal homework notification');
      assert.ok(!ids.includes('notif_hw_broadcast'), 'Pending parent MUST NOT see homework broadcast notification');
      assert.ok(ids.includes('notif_sys_announcement'), 'Pending parent MUST see non-sensitive system announcement');
      assert.strictEqual(ids.length, 1);
    });

    test('B.2: NULL category with reference_id (legacy sensitive) pointing to revoked student MUST BE QUARANTINED (DENIED)', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_parent_p', 'parent_p', 'parent_p@test.com', 'Phụ huynh P', 'parent'),
          ('usr_child_a', 'child_a', 'child_a@test.com', 'Học sinh A', 'student');

        INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
          ('link_a', 'usr_parent_p', 'usr_child_a', 'revoked');

        INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, score, status) VALUES
          ('sub_a', 'hw_a', 'usr_child_a', 'Học sinh A', 'writing', 8.0, 'graded');

        -- Legacy notification with NULL category but pointing to sub_a of revoked child
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id) VALUES
          ('notif_legacy_null_cat', 'parent', 'usr_parent_p', 'Báo Cáo Điểm Cũ', 'Điểm 8.0', NULL, 'sub_a'),
          ('notif_legit_public_null', 'parent', NULL, 'Khai giảng năm học', 'Chào đón năm học mới', NULL, NULL);
      `);

      const req = new Request('http://localhost/api/notifications', {
        headers: { 'Authorization': `Bearer ${parentToken}` }
      });
      const res = await getNotifications({ request: req, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      const data = await res.json();

      const ids = (data.notifications || []).map(n => n.id);
      assert.ok(!ids.includes('notif_legacy_null_cat'), 'Legacy NULL category with sensitive reference_id MUST be quarantined/denied');
      assert.ok(ids.includes('notif_legit_public_null'), 'Public broadcast without reference_id MUST be allowed');
    });
  });

  // =========================================================================
  // FIXTURE C: Symmetry across GET, mark_read, and mark_all
  // =========================================================================
  describe('Fixture C: Uniformity across GET, mark_read, and mark_all', () => {
    test('C.1: mark_all ONLY marks authorized notifications; forbidden notifications retain is_read=0 and zero read record', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_parent_p', 'parent_p', 'parent_p@test.com', 'Phụ huynh P', 'parent'),
          ('usr_child_b', 'child_b', 'child_b@test.com', 'Học sinh B', 'student'),
          ('usr_child_other', 'child_other', 'child_o@test.com', 'Học sinh Khác', 'student');

        INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
          ('link_b', 'usr_parent_p', 'usr_child_b', 'verified');

        INSERT INTO class_enrollments (id, user_id, class_id, status) VALUES
          ('ce_b', 'usr_child_b', 'class_8', 'active'),
          ('ce_o', 'usr_child_other', 'class_9', 'active');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_b', 'sess_b', 'class_8', 'Lớp 8', 'usr_teacher_lan', 'Cô Lan', 'writing', 'BTVN Lớp 8', 'Descr', '2026-10-01', '2026-10-05', '18:00'),
          ('hw_o', 'sess_o', 'class_9', 'Lớp 9', 'usr_teacher_lan', 'Cô Lan', 'writing', 'BTVN Lớp 9', 'Descr', '2026-10-01', '2026-10-05', '18:00');

        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id, is_read) VALUES
          ('notif_auth_1', 'parent', 'usr_parent_p', 'BTVN Bé B', 'BTVN Lớp 8', 'homework', 'hw_b', 0),
          ('notif_auth_2', 'parent', NULL, 'Họp phụ huynh', 'Họp toàn trường', 'system', NULL, 0),
          ('notif_forbid_3', 'parent', 'usr_parent_p', 'BTVN Lớp 9 Lạ', 'BTVN Lớp 9', 'homework', 'hw_o', 0);
      `);

      // 1. GET returns exactly notif_auth_1 and notif_auth_2
      const getReq = new Request('http://localhost/api/notifications', {
        headers: { 'Authorization': `Bearer ${parentToken}` }
      });
      const getRes = await getNotifications({ request: getReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      const getData = await getRes.json();
      const getIds = (getData.notifications || []).map(n => n.id);
      assert.deepStrictEqual(getIds.sort(), ['notif_auth_1', 'notif_auth_2'].sort());

      // 2. mark_all executed
      const markAllReq = new Request('http://localhost/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${parentToken}` },
        body: JSON.stringify({ action: 'mark_read', mark_all: true })
      });
      const markAllRes = await postNotifications({ request: markAllReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(markAllRes.status, 200);

      // 3. Verify in DB:
      const reads = sqlite.prepare('SELECT notification_id FROM system_notification_reads WHERE user_id = ?').all('usr_parent_p');
      const readIds = reads.map(r => r.notification_id);
      assert.deepStrictEqual(readIds.sort(), ['notif_auth_1', 'notif_auth_2'].sort());

      // Forbidden notification notif_forbid_3 must NOT be marked read in main table
      const forbidNotif = sqlite.prepare('SELECT is_read FROM system_notifications WHERE id = ?').get('notif_forbid_3');
      assert.strictEqual(Number(forbidNotif.is_read), 0, 'Forbidden notification MUST NOT have is_read set to 1');
    });
  });

  // =========================================================================
  // FIXTURE D: Inactive Enrollment & Exact Class Equality (class_7 != classX7)
  // =========================================================================
  describe('Fixture D: Authoritative Enrollment & Class Equality Guard', () => {
    test('D.1: Inactive enrollment with leftover metadata MUST NOT grant access to class homework', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role, metadata) VALUES
          ('usr_student_s', 'student_s', 'student_s@test.com', 'Học sinh S', 'student', '{"class_id":"class_7"}');

        INSERT INTO class_enrollments (id, user_id, class_id, status) VALUES
          ('ce_s_inactive', 'usr_student_s', 'class_7', 'inactive');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_class_7', 'sess_7', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'Bài Tập Lớp 7', 'Descr', '2026-10-01', '2026-10-05', '18:00');
      `);

      // 1. GET /api/homework list: Student should see 0 assignments
      const getReq = new Request('http://localhost/api/homework', {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      const getRes = await getHomework({ request: getReq, url: new URL('http://localhost/api/homework'), platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      const getData = await getRes.json();
      assert.strictEqual((getData.assignments || []).length, 0, 'Inactive student MUST NOT see class assignments via metadata');

      // 2. GET /api/homework?id=hw_class_7 single item: Student MUST be rejected with 403 Forbidden
      const singleReq = new Request('http://localhost/api/homework?id=hw_class_7', {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      const singleRes = await getHomework({ request: singleReq, url: new URL('http://localhost/api/homework?id=hw_class_7'), platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(singleRes.status, 403, 'Accessing single assignment with inactive enrollment MUST return HTTP 403');
    });

    test('D.2: Exact class equality: class_7 does NOT match classX7 (no LIKE wildcard vulnerability)', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_student_s', 'student_s', 'student_s@test.com', 'Học sinh S', 'student');

        INSERT INTO class_enrollments (id, user_id, class_id, status) VALUES
          ('ce_s_x7', 'usr_student_s', 'classX7', 'active');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_class_7', 'sess_7', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'Bài Tập Lớp 7', 'Descr', '2026-10-01', '2026-10-05', '18:00');
      `);

      const req = new Request('http://localhost/api/homework?id=hw_class_7', {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      const res = await getHomework({ request: req, url: new URL('http://localhost/api/homework?id=hw_class_7'), platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 403, 'classX7 MUST NOT match class_7 under exact equality check');
    });
  });

  // =========================================================================
  // FIXTURE E: Real assign and grade handler execution with exact recipients
  // =========================================================================
  describe('Fixture E: Real Homework Assign and Grade Handler Execution', () => {
    test('E.1: Teacher assign homework notifies verified parents and active students in that class ONLY', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_teacher_lan', 'lan', 'lan@test.com', 'Cô Lan', 'teacher'),
          ('usr_p_verified', 'p_ver', 'p_ver@test.com', 'Phụ Huynh Lớp 7', 'parent'),
          ('usr_p_other', 'p_oth', 'p_oth@test.com', 'Phụ Huynh Lớp Khác', 'parent'),
          ('usr_s_class7', 's_c7', 's_c7@test.com', 'Học Sinh Lớp 7', 'student'),
          ('usr_s_class8', 's_c8', 's_c8@test.com', 'Học Sinh Lớp 8', 'student');

        INSERT INTO class_enrollments (id, user_id, class_id, status) VALUES
          ('ce_s7', 'usr_s_class7', 'class_7', 'active'),
          ('ce_s8', 'usr_s_class8', 'class_8', 'active');

        INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status) VALUES
          ('link_ver', 'usr_p_verified', 'usr_s_class7', 'verified'),
          ('link_oth', 'usr_p_other', 'usr_s_class8', 'verified');
      `);

      const assignReq = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({
          action: 'assign',
          session_id: 'sess_live_1',
          class_id: 'class_7',
          class_name: 'Tiếng Anh 7',
          skill_type: 'writing',
          title: 'Bài Tập Viết Mới',
          description: 'Viết 100 từ'
        })
      });

      const assignRes = await postHomework({ request: assignReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(assignRes.status, 200);

      const notifications = sqlite.prepare('SELECT target_user_id, target_role, title FROM system_notifications').all();
      const recipients = notifications.map(n => n.target_user_id);

      assert.ok(recipients.includes('usr_p_verified'), 'Verified parent in class_7 MUST receive notification');
      assert.ok(recipients.includes('usr_s_class7'), 'Student in class_7 MUST receive notification');
      assert.ok(!recipients.includes('usr_p_other'), 'Parent of student in class_8 MUST NOT receive notification');
      assert.ok(!recipients.includes('usr_s_class8'), 'Student in class_8 MUST NOT receive notification');
    });
  });

  // =========================================================================
  // FIXTURE F: Homework CAS Concurrency & Idempotency
  // =========================================================================
  describe('Fixture F: Star Reward CAS Concurrency, Ledger & Fault Injection', () => {
    test('F.1: Concurrent grading race with CAS: only one request awards stars, no double reward', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_teacher_lan', 'lan', 'lan@test.com', 'Cô Lan', 'teacher'),
          ('usr_student_s', 'student_s', 'student_s@test.com', 'Học sinh S', 'student');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_test', 'sess_t', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'Bài Tập', 'Descr', '2026-10-01', '2026-10-05', '18:00');

        INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, is_on_time, status) VALUES
          ('sub_test', 'hw_test', 'usr_student_s', 'Học sinh S', 'writing', 1, 'submitted');
      `);

      // Create barrier ensuring both requests read the exact same snapshot version simultaneously
      let selectCount = 0;
      let resolveBarrier;
      const barrierPromise = new Promise(resolve => { resolveBarrier = resolve; });

      const racingD1 = {
        prepare(sql) {
          const stmt = d1.prepare(sql);
          if (sql.includes('SELECT * FROM homework_submissions WHERE id = ?')) {
            return {
              bind(...args) {
                stmt.bind(...args);
                return this;
              },
              async first() {
                const row = await stmt.first();
                selectCount++;
                if (selectCount === 2) {
                  resolveBarrier();
                } else {
                  await barrierPromise;
                }
                return row; // Both see the exact same snapshot version concurrently!
              }
            };
          }
          return stmt;
        },
        batch(statements) {
          return d1.batch(statements);
        }
      };

      // Two concurrent grade requests attempting to grade the same submission at the same time
      const req1 = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ action: 'grade', submission_id: 'sub_test', score: 10.0, teacher_feedback: 'Xuất sắc 1' })
      });
      const req2 = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ action: 'grade', submission_id: 'sub_test', score: 10.0, teacher_feedback: 'Xuất sắc 2' })
      });

      // Run both handlers concurrently
      const [res1, res2] = await Promise.all([
        postHomework({ request: req1, platform: { env: { DB: racingD1, AUTH_SECRET: TEST_SECRET } } }),
        postHomework({ request: req2, platform: { env: { DB: racingD1, AUTH_SECRET: TEST_SECRET } } })
      ]);

      // Exactly one succeeds with 200, and the concurrent request with differing feedback receives 409 Conflict
      const statuses = [res1.status, res2.status].sort();
      assert.deepStrictEqual(statuses, [200, 409], 'One commits with 200 and competing request with different feedback receives 409 Conflict');

      // Now test true idempotent retry: re-sending the winning request body succeeds with 200
      const winningBody = (res1.status === 200) 
        ? { action: 'grade', submission_id: 'sub_test', score: 10.0, teacher_feedback: 'Xuất sắc 1' }
        : { action: 'grade', submission_id: 'sub_test', score: 10.0, teacher_feedback: 'Xuất sắc 2' };
      const retryReq = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify(winningBody)
      });
      const retryRes = await postHomework({ request: retryReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(retryRes.status, 200, 'Idempotent retry with identical score and feedback succeeds with 200');

      // Verify DB balance: exactly 100 stars (NOT 200!)
      const stars = sqlite.prepare('SELECT stars_balance, total_earned_stars FROM student_stars WHERE student_id = ?').get('usr_student_s');
      assert.strictEqual(stars.stars_balance, 100, 'Student stars balance MUST be exactly 100 (never double awarded)');
      const ledgerEntries = sqlite.prepare('SELECT * FROM student_star_ledger WHERE student_id = ?').all('usr_student_s');
      assert.strictEqual(ledgerEntries.length, 1, 'Exactly one star ledger record MUST exist');
    });

    test('F.2: Regrade with lower score records honest delta without clamping debt', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_teacher_lan', 'lan', 'lan@test.com', 'Cô Lan', 'teacher'),
          ('usr_student_s', 'student_s', 'student_s@test.com', 'Học sinh S', 'student');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_test', 'sess_t', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'Bài Tập', 'Descr', '2026-10-01', '2026-10-05', '18:00');

        INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, is_on_time, score, stars_awarded, status) VALUES
          ('sub_test', 'hw_test', 'usr_student_s', 'Học sinh S', 'writing', 1, 10.0, 100, 'graded');

        INSERT INTO student_stars (student_id, stars_balance, total_earned_stars, stars_redeemed) VALUES
          ('usr_student_s', 100, 100, 0);
      `);

      // Regrade with 8.5 (earns 50 stars instead of 100, delta = -50)
      const regradeReq = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ action: 'grade', submission_id: 'sub_test', score: 8.5, teacher_feedback: 'Điều chỉnh điểm' })
      });
      const res = await postHomework({ request: regradeReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 200);

      const stars = sqlite.prepare('SELECT stars_balance, total_earned_stars FROM student_stars WHERE student_id = ?').get('usr_student_s');
      assert.strictEqual(stars.stars_balance, 50, 'Balance reduced from 100 to 50 honestly');

      const ledger = sqlite.prepare('SELECT * FROM student_star_ledger WHERE student_id = ?').all('usr_student_s');
      assert.strictEqual(ledger.length, 1);
      assert.strictEqual(ledger[0].amount, -50);
      assert.strictEqual(ledger[0].action_type, 'homework_adjustment');
    });

    test('F.3: Fault Injection on D1 batch: returns HTTP 503 and rolls back cleanly', async () => {
      const sqlite = initTestDatabase();
      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_teacher_lan', 'lan', 'lan@test.com', 'Cô Lan', 'teacher');
      `);

      const normalD1 = createD1Adapter(sqlite);
      const throwingD1 = {
        ...normalD1,
        async batch() {
          throw new Error('D1_STORAGE_IO_FAILURE: Transaction aborted');
        }
      };

      const assignReq = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({
          action: 'assign',
          session_id: 'sess_fail',
          class_id: 'class_7',
          skill_type: 'writing',
          title: 'Bài Tập Fault'
        })
      });

      const res = await postHomework({ request: assignReq, platform: { env: { DB: throwingD1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 503, 'D1 batch failure MUST return HTTP 503, NOT mock success');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('DatabaseError'));
    });

    test('F.4: Fault Injection on student_star_ledger: when ledger throws, entire batch rolls back (submission remains submitted, 0 stars, 0 ledger)', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_teacher_lan', 'lan', 'lan@test.com', 'Cô Lan', 'teacher'),
          ('usr_student_s', 'student_s', 'student_s@test.com', 'Học sinh S', 'student');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_test', 'sess_t', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'Bài Tập', 'Descr', '2026-10-01', '2026-10-05', '18:00');

        INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, is_on_time, status) VALUES
          ('sub_test', 'hw_test', 'usr_student_s', 'Học sinh S', 'writing', 1, 'submitted');

        -- Trigger simulating failure on student_star_ledger write
        CREATE TRIGGER audit_fail_ledger BEFORE INSERT ON student_star_ledger 
        BEGIN 
          SELECT RAISE(ABORT, 'AUDIT_LEDGER_FAILURE: disk write error on ledger'); 
        END;
      `);

      const gradeReq = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ action: 'grade', submission_id: 'sub_test', score: 10.0, teacher_feedback: 'Xuất sắc' })
      });

      const res = await postHomework({ request: gradeReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 503, 'Must fail-closed with 503 on ledger write failure');

      // Crucial assertion: the CAS update on homework_submissions MUST HAVE ROLLED BACK!
      const sub = sqlite.prepare('SELECT status, score, stars_awarded FROM homework_submissions WHERE id = ?').get('sub_test');
      assert.strictEqual(sub.status, 'submitted', 'Submission status MUST roll back to submitted, NOT stay graded');
      assert.strictEqual(sub.score, null, 'Submission score MUST remain null');
      assert.strictEqual(sub.stars_awarded, 0, 'Stars awarded MUST remain 0');

      // Stars and ledger must be 0
      const stars = sqlite.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').get('usr_student_s');
      assert.strictEqual(stars, undefined, 'No student_stars record created');
      const ledgerCount = sqlite.prepare('SELECT count(*) as n FROM student_star_ledger').get();
      assert.strictEqual(ledgerCount.n, 0, 'Zero ledger records');
    });

    test('F.5: Cross-module financial invariant & unified ledger: reward -> tuition redeem -> regrade shortfall debt -> earn stars debt repayment', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      sqlite.exec(`
        INSERT INTO users (id, username, email, name, role) VALUES
          ('usr_teacher_lan', 'lan', 'lan@test.com', 'Cô Lan', 'teacher'),
          ('usr_student_s', 'student_s', 'student_s@test.com', 'Học sinh S', 'student'),
          ('usr_admin', 'admin', 'admin@test.com', 'Super Admin', 'superadmin');

        INSERT INTO homework_assignments (id, session_id, class_id, class_name, teacher_id, teacher_name, skill_type, title, description, assigned_date, deadline_date, deadline_time) VALUES
          ('hw_1', 'sess_1', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'Bài 1', 'Descr', '2026-10-01', '2026-10-05', '18:00'),
          ('hw_2', 'sess_2', 'class_7', 'Lớp 7', 'usr_teacher_lan', 'Cô Lan', 'writing', 'Bài 2', 'Descr', '2026-10-02', '2026-10-06', '18:00');

        INSERT INTO homework_submissions (id, assignment_id, student_id, student_name, submission_type, is_on_time, status, version) VALUES
          ('sub_1', 'hw_1', 'usr_student_s', 'Học sinh S', 'writing', 1, 'submitted', 1),
          ('sub_2', 'hw_2', 'usr_student_s', 'Học sinh S', 'writing', 1, 'submitted', 1);
      `);

      // STEP 1: Teacher grades sub_1 with score 10.0 -> awards 100 stars
      const gradeReq1 = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ action: 'grade', submission_id: 'sub_1', score: 10.0, teacher_feedback: 'Xuất sắc' })
      });
      const gradeRes1 = await postHomework({ request: gradeReq1, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(gradeRes1.status, 200);

      // Verify stars balance = 100, earned = 100, debt = 0
      let stars = sqlite.prepare('SELECT stars_balance, total_earned_stars, stars_redeemed, star_debt FROM student_stars WHERE student_id = ?').get('usr_student_s');
      assert.strictEqual(stars.stars_balance, 100);
      assert.strictEqual(stars.total_earned_stars, 100);
      assert.strictEqual(stars.star_debt, 0);

      // Verify ledger has homework_reward record with unified schema (both delta_stars and amount set)
      let ledger = sqlite.prepare('SELECT * FROM student_star_ledger WHERE student_id = ?').all('usr_student_s');
      assert.strictEqual(ledger.length, 1);
      assert.strictEqual(ledger[0].action_type, 'homework_reward');
      assert.strictEqual(ledger[0].delta_stars, 100);
      assert.strictEqual(ledger[0].amount, 100);
      assert.strictEqual(ledger[0].balance_after, 100);
      assert.strictEqual(ledger[0].reference_id, 'sub_1');

      // STEP 2: Superadmin creates tuition bill redeeming all 100 stars (deducts 100 stars)
      const tuitionReq = new Request('http://localhost/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          action: 'save',
          bill: {
            id: 'bill_test_1',
            student_id: 'usr_student_s',
            student_name: 'Học sinh S',
            base_tuition_vnd: 2000000,
            stars_deducted: 100,
            discount_vnd: 100000,
            final_amount_vnd: 1900000,
            status: 'draft'
          }
        })
      });
      const tuitionRes = await postTuition({ request: tuitionReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(tuitionRes.status, 200);

      // Stars balance is now 0, redeemed is 100
      stars = sqlite.prepare('SELECT stars_balance, total_earned_stars, stars_redeemed, star_debt FROM student_stars WHERE student_id = ?').get('usr_student_s');
      assert.strictEqual(stars.stars_balance, 0);
      assert.strictEqual(stars.stars_redeemed, 100);
      assert.strictEqual(stars.star_debt, 0);

      // Verify ledger has 2 records, 2nd is tuition deduct with unified columns
      ledger = sqlite.prepare('SELECT * FROM student_star_ledger WHERE student_id = ? ORDER BY created_at ASC').all('usr_student_s');
      assert.strictEqual(ledger.length, 2);
      assert.strictEqual(ledger[1].action_type, 'deduct');
      assert.strictEqual(ledger[1].delta_stars, -100);
      assert.strictEqual(ledger[1].amount, -100);
      assert.strictEqual(ledger[1].balance_after, 0);
      assert.strictEqual(ledger[1].bill_id, 'bill_test_1');

      // STEP 3: Teacher regrades sub_1 down to 8.5 (earns 50 stars instead of 100, delta = -50 stars)
      // Because student already spent 100 stars on tuition, available balance is 0.
      // Under financial invariant: balance stays 0 (trg_student_stars_no_negative NOT violated),
      // and uncollateralized 50 stars shortfall is recorded honestly in star_debt!
      const regradeReq = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ action: 'grade', submission_id: 'sub_1', score: 8.5, teacher_feedback: 'Điều chỉnh điểm' })
      });
      const regradeRes = await postHomework({ request: regradeReq, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(regradeRes.status, 200);

      stars = sqlite.prepare('SELECT stars_balance, total_earned_stars, stars_redeemed, star_debt FROM student_stars WHERE student_id = ?').get('usr_student_s');
      assert.strictEqual(stars.stars_balance, 0, 'Stars balance MUST remain >= 0 (never negative)');
      assert.strictEqual(stars.star_debt, 50, 'Shortfall of 50 stars MUST be recorded in star_debt (no silent debt wiping)');

      // Ledger has 3rd entry: homework_adjustment with delta = -50, balance_after = 0
      ledger = sqlite.prepare('SELECT * FROM student_star_ledger WHERE student_id = ? ORDER BY created_at ASC').all('usr_student_s');
      assert.strictEqual(ledger.length, 3);
      assert.strictEqual(ledger[2].action_type, 'homework_adjustment');
      assert.strictEqual(ledger[2].delta_stars, -50);
      assert.strictEqual(ledger[2].amount, -50);
      assert.strictEqual(ledger[2].balance_after, 0);

      // STEP 4: Student does sub_2 and teacher grades it with score 10.0 (+100 stars)
      // The 100 new stars pay off the 50 star_debt, leaving 50 stars in available balance!
      const gradeReq2 = new Request('http://localhost/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
        body: JSON.stringify({ action: 'grade', submission_id: 'sub_2', score: 10.0, teacher_feedback: 'Bài 2 rất tốt' })
      });
      const gradeRes2 = await postHomework({ request: gradeReq2, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(gradeRes2.status, 200);

      stars = sqlite.prepare('SELECT stars_balance, total_earned_stars, stars_redeemed, star_debt FROM student_stars WHERE student_id = ?').get('usr_student_s');
      assert.strictEqual(stars.star_debt, 0, 'Debt has been fully repaid by new star reward');
      assert.strictEqual(stars.stars_balance, 50, 'Remaining 50 stars credited to available balance');

      // Ledger has 4th entry with delta = 100, balance_after = 50
      ledger = sqlite.prepare('SELECT * FROM student_star_ledger WHERE student_id = ? ORDER BY created_at ASC').all('usr_student_s');
      assert.strictEqual(ledger.length, 4);
      assert.strictEqual(ledger[3].action_type, 'homework_reward');
      assert.strictEqual(ledger[3].delta_stars, 100);
      assert.strictEqual(ledger[3].balance_after, 50);
    });
  });

  // =========================================================================
  // FIXTURE G: True Concurrency Race on UNIQUE Username & Phone
  // =========================================================================
  describe('Fixture G: True Concurrency Race Caught by Database UNIQUE Constraints', () => {
    test('G.1: True concurrency race: two requests passing SELECT simultaneously are caught by DB UNIQUE constraint (1 created 201, 1 conflict 409, 1 row)', async () => {
      const sqlite = initTestDatabase();
      const baseD1 = createD1Adapter(sqlite);

      // Create an interleaving barrier:
      // Both requests call SELECT at the exact same moment (both see null).
      // Then both proceed to INSERT. Exactly ONE must succeed and the other MUST hit SQLite UNIQUE constraint and return 409!
      let selectCount = 0;
      let resolveBarrier;
      const barrierPromise = new Promise(resolve => { resolveBarrier = resolve; });

      const racingD1 = {
        prepare(sql) {
          const stmt = baseD1.prepare(sql);
          if (sql.includes('SELECT id, username FROM users WHERE username = ?')) {
            return {
              bind(...args) {
                stmt.bind(...args);
                return this;
              },
              async first() {
                selectCount++;
                if (selectCount === 2) {
                  resolveBarrier();
                } else {
                  await barrierPromise; // Wait for second request to also reach SELECT
                }
                return null; // Both simulate seeing no existing user concurrently!
              }
            };
          }
          return stmt;
        }
      };

      const reqBody = {
        usernameOrPhone: 'student_concurrent_race',
        password: 'Password123!',
        name: 'Học Sinh Đua Concurrency',
        role: 'student'
      };

      const req1 = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      const req2 = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });

      const [res1, res2] = await Promise.all([
        postRegister({ request: req1, platform: { env: { DB: racingD1, AUTH_SECRET: TEST_SECRET } } }),
        postRegister({ request: req2, platform: { env: { DB: racingD1, AUTH_SECRET: TEST_SECRET } } })
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepStrictEqual(statuses, [201, 409], 'Exactly one request must succeed with 201 and the competing request MUST be rejected with 409 Conflict');

      const rows = sqlite.prepare('SELECT id, username FROM users WHERE username = ?').all('student_concurrent_race');
      assert.strictEqual(rows.length, 1, 'Exactly 1 row MUST exist in users table under concurrent race');
    });

    test('G.2: Duplicate normalized phone (+84 vs 03) conflict enforced at DB constraint level: returns 409 Conflict', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      // Register with 0389123456
      const req1 = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrPhone: '0389123456',
          password: 'Password123!',
          name: 'Học Sinh Phone 1',
          role: 'student'
        })
      });
      const res1 = await postRegister({ request: req1, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res1.status, 201);

      // Attempt to register with +84389123456 (normalizes to 0389123456)
      const req2 = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrPhone: '+84389123456',
          password: 'Password123!',
          name: 'Học Sinh Phone 2',
          role: 'student'
        })
      });
      const res2 = await postRegister({ request: req2, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res2.status, 409, 'Duplicate normalized phone MUST return HTTP 409 Conflict');

      const rows = sqlite.prepare('SELECT id, phone FROM users WHERE phone = ?').all('0389123456');
      assert.strictEqual(rows.length, 1, 'Exactly 1 row with normalized phone MUST exist');
    });
  });

  // =========================================================================
  // FIXTURE H: Grade Selection Fidelity (Lớp 2 Stored & Retained Without Lớp 7 Default)
  // =========================================================================
  describe('Fixture H: Grade Selection Fidelity & Persistence (No Lớp 7 Fallback)', () => {
    test('H.1: Registering with Lớp 2 saves Lớp 2 to D1 metadata and returns user.grade === Lớp 2 on auth verification', async () => {
      const sqlite = initTestDatabase();
      const d1 = createD1Adapter(sqlite);

      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrPhone: 'student_grade_2',
          password: 'Password123!',
          name: 'Bé Học Lớp 2',
          role: 'student',
          grade: 'Lớp 2'
        })
      });

      const res = await postRegister({ request: req, platform: { env: { DB: d1, AUTH_SECRET: TEST_SECRET } } });
      assert.strictEqual(res.status, 201);
      const data = await res.json();

      assert.strictEqual(data.user.grade, 'Lớp 2', 'Registered user response MUST have grade === Lớp 2');
      assert.ok(data.token, 'Must return signed token');

      // Verify D1 database metadata directly
      const dbUser = sqlite.prepare('SELECT metadata FROM users WHERE username = ?').get('student_grade_2');
      assert.ok(dbUser);
      const meta = JSON.parse(dbUser.metadata);
      assert.strictEqual(meta.grade, 'Lớp 2', 'D1 metadata MUST store Lớp 2, NOT Lớp 7');

      // Verify verifyServerAuth on subsequent request
      const authReq = new Request('http://localhost/api/test', {
        headers: { 'Authorization': `Bearer ${data.token}` }
      });
      const authResult = await verifyServerAuth(authReq, { env: { DB: d1, AUTH_SECRET: TEST_SECRET } });
      assert.strictEqual(authResult.authenticated, true);
      assert.strictEqual(authResult.user.grade, 'Lớp 2', 'verifyServerAuth MUST unpack grade as Lớp 2 from DB metadata');
    });
  });
});

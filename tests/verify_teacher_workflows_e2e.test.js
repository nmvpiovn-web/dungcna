import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { POST as postWorkflow } from '../src/routes/api/teachers/workflows/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

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
          return { results: stmt.all(...boundArgs) };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const res = stmt.run(...boundArgs);
          return { meta: { changes: Number(res.changes) } };
        }
      };
    },
    async batch(statements) {
      sqliteDb.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          const r = await s.run();
          results.push(r);
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

describe('TEACHER WORKFLOWS & SUBSTITUTE 2-STEP APPROVAL AUDIT SUITE', () => {
  let sqliteDb;
  let mockPlatform;
  let leaderToken;
  let teacherAToken;
  let teacherBToken;
  const TEST_SECRET = 'workflow_test_secret_hmac_2026_isolated';

  before(async () => {
    sqliteDb = new DatabaseSync(':memory:');

    sqliteDb.exec(`
      CREATE TABLE teacher_leave_requests (
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

      CREATE TABLE class_sessions (
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

      CREATE TABLE system_notifications (
        id TEXT PRIMARY KEY,
        target_role TEXT NOT NULL,
        target_user_id TEXT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT DEFAULT 'system',
        reference_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE teacher_recruitment (
        id TEXT PRIMARY KEY,
        candidate_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        role_type TEXT NOT NULL,
        experience_years INTEGER DEFAULT 0,
        certificates TEXT,
        status TEXT NOT NULL DEFAULT 'applied',
        interview_notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        name TEXT,
        role TEXT NOT NULL,
        avatar TEXT,
        status TEXT DEFAULT 'active',
        approval_status TEXT DEFAULT 'approved',
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        revoked_at TEXT
      );

      INSERT INTO users (id, username, role, name, status, approval_status) VALUES
        ('usr_msdung', 'msdung', 'leader', 'Cô Dung', 'active', 'approved'),
        ('usr_teacher_a', 'hung', 'teacher', 'Thầy Hưng', 'active', 'approved'),
        ('usr_teacher_b', 'lan', 'teacher', 'Cô Lan', 'active', 'approved');
    `);

    mockPlatform = {
      env: {
        DB: createD1Adapter(sqliteDb),
        AUTH_SECRET: TEST_SECRET
      }
    };

    sqliteDb.prepare(`
      INSERT INTO auth_sessions (id, user_id, expires_at) VALUES
        ('sess_leader', 'usr_msdung', '2099-01-01'),
        ('sess_teacher_a', 'usr_teacher_a', '2099-01-01'),
        ('sess_teacher_b', 'usr_teacher_b', '2099-01-01');
    `).run();

    leaderToken = await createSignedToken({ id: 'usr_msdung', username: 'msdung', role: 'leader', name: 'Cô Dung', status: 'active' }, TEST_SECRET, 100000, 'sess_leader');
    teacherAToken = await createSignedToken({ id: 'usr_teacher_a', username: 'hung', role: 'teacher', name: 'Thầy Hưng', status: 'active' }, TEST_SECRET, 100000, 'sess_teacher_a');
    teacherBToken = await createSignedToken({ id: 'usr_teacher_b', username: 'lan', role: 'teacher', name: 'Cô Lan', status: 'active' }, TEST_SECRET, 100000, 'sess_teacher_b');
  });

  test('WF-01: Leader cannot approve leave request when substitute teacher has NOT confirmed yet (precondition check)', async () => {
    // 1. Create a class session for Teacher A
    sqliteDb.prepare(`
      INSERT INTO class_sessions (id, class_id, class_name, teacher_id, teacher_name, session_date, start_time, end_time, status)
      VALUES ('sess_step_1', 'cls_7c', 'Lớp 7C', 'usr_teacher_a', 'Thầy Hưng', '2026-10-15', '08:00', '09:30', 'scheduled');
    `).run();

    // 2. Teacher A requests leave nominating Teacher B as substitute
    sqliteDb.prepare(`
      INSERT INTO teacher_leave_requests (id, teacher_id, teacher_name, session_id, session_date, reason, substitute_teacher_id, substitute_teacher_name, substitute_status, admin_status)
      VALUES ('leave_step_1', 'usr_teacher_a', 'Thầy Hưng', 'sess_step_1', '2026-10-15', 'Việc gia đình', 'usr_teacher_b', 'Cô Lan', 'pending', 'pending');
    `).run();

    // 3. Leader attempts premature approval before Teacher B confirmed
    const prematureApproveReq = new Request('http://localhost/api/teachers/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'approve_leave', leave_id: 'leave_step_1', decision: 'approved' })
    });

    const res = await postWorkflow({ request: prematureApproveReq, platform: mockPlatform });
    assert.strictEqual(res.status, 400, 'Must return HTTP 400 when substitute has not accepted');
    const json = await res.json();
    assert.match(json.error, /PreconditionFailed/);

    // Verify database state: leave remains pending
    const leaveRow = sqliteDb.prepare('SELECT admin_status, substitute_status FROM teacher_leave_requests WHERE id = ?').get('leave_step_1');
    assert.strictEqual(leaveRow.admin_status, 'pending');
    assert.strictEqual(leaveRow.substitute_status, 'pending');
  });

  test('WF-02: Substitute teacher confirms agreement -> status transitions to accepted', async () => {
    const confirmReq = new Request('http://localhost/api/teachers/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherBToken}` },
      body: JSON.stringify({ action: 'respond_substitute', leave_id: 'leave_step_1', decision: 'accepted' })
    });

    const res = await postWorkflow({ request: confirmReq, platform: mockPlatform });
    assert.strictEqual(res.status, 200);

    const leaveRow = sqliteDb.prepare('SELECT substitute_status FROM teacher_leave_requests WHERE id = ?').get('leave_step_1');
    assert.strictEqual(leaveRow.substitute_status, 'accepted');
  });

  test('WF-03: Leader now approves -> Atomic batch updates both leave and class session', async () => {
    const approveReq = new Request('http://localhost/api/teachers/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${leaderToken}` },
      body: JSON.stringify({ action: 'approve_leave', leave_id: 'leave_step_1', decision: 'approved', admin_notes: 'Duyệt theo quy trình 2 bước' })
    });

    const res = await postWorkflow({ request: approveReq, platform: mockPlatform });
    assert.strictEqual(res.status, 200);

    // Check leave status
    const leaveRow = sqliteDb.prepare('SELECT admin_status FROM teacher_leave_requests WHERE id = ?').get('leave_step_1');
    assert.strictEqual(leaveRow.admin_status, 'approved');

    // Check session updated with substitute
    const sessionRow = sqliteDb.prepare('SELECT substitute_teacher_id, status FROM class_sessions WHERE id = ?').get('sess_step_1');
    assert.strictEqual(sessionRow.substitute_teacher_id, 'usr_teacher_b');
    assert.strictEqual(sessionRow.status, 'substitute_assigned');
  });

  test('WF-04: Candidate job application registers applicant in teacher_recruitment WITHOUT granting teacher role', async () => {
    const applyReq = new Request('http://localhost/api/teachers/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'candidate_apply',
        candidate_name: 'Nguyễn Văn Ứng Viên',
        phone: '0988776655',
        email: 'candidate@example.com',
        role_type: 'lead',
        experience_years: 3,
        certificates: 'IELTS 8.0, TESOL 120h',
        selected_grades: ['IELTS Academic', 'TESOL']
      })
    });

    const res = await postWorkflow({ request: applyReq, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.recruitment_id);

    // Verify candidate is recorded with status 'applied'
    const recRow = sqliteDb.prepare('SELECT * FROM teacher_recruitment WHERE id = ?').get(json.recruitment_id);
    assert.strictEqual(recRow.candidate_name, 'Nguyễn Văn Ứng Viên');
    assert.strictEqual(recRow.status, 'applied');

    // Verify applicant does NOT exist in users table as a teacher!
    const userRow = sqliteDb.prepare("SELECT * FROM users WHERE phone = '0988776655'").get();
    assert.strictEqual(userRow, undefined, 'Applicant must NOT be granted teacher account before formal hiring');
  });
});

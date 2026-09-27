import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { POST as payrollPost, GET as payrollGet } from '../src/routes/api/teachers/payroll/+server.js';
import { POST as examPost, GET as examGet } from '../src/routes/api/exams/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const secret = 'audit-test-secret-codex-2026';

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
      avatar TEXT,
      status TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO users (id, username, role, status) VALUES
      ('usr_student_test', 'test_student', 'student', 'active'),
      ('usr_teacher_a', 'teacher_a', 'teacher', 'active'),
      ('usr_teacher_b', 'teacher_b', 'teacher', 'active'),
      ('usr_leader_admin', 'leader_admin', 'leader', 'active');

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
          const stmt = db.prepare(sql);
          return stmt.get(...bound) || null;
        },
        async all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...bound) };
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...bound);
          return { meta: { changes: info.changes } };
        }
      };
    },
    rawDb: db
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

test('P1-01: Payroll RBAC & Action Allowlist enforcement', async () => {
  const { platform, rawDb } = createMockPlatform();
  const studentToken = await createSignedToken({ id: 'usr_student_test', username: 'test_student', role: 'student' }, secret);
  const teacherAToken = await createSignedToken({ id: 'usr_teacher_a', username: 'teacher_a', role: 'teacher' }, secret);
  const leaderToken = await createSignedToken({ id: 'usr_leader_admin', username: 'leader_admin', role: 'leader' }, secret);

  // 1. Student attempting to calculate/modify payroll is rejected with 403 Forbidden
  const studentReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ action: 'calculate', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const studentRes = await payrollPost({ request: studentReq, platform });
  assert.equal(studentRes.status, 403, 'Student must be rejected with 403 Forbidden');
  const studentBody = await studentRes.json();
  assert.match(studentBody.error, /nhân sự sư phạm/);

  // Verify zero rows created by student
  const rows = rawDb.prepare("SELECT * FROM sqlite_master WHERE type='table' AND name='teacher_payrolls'").all();
  if (rows.length > 0) {
    const records = rawDb.prepare('SELECT COUNT(*) AS c FROM teacher_payrolls').get();
    assert.equal(records.c, 0, 'No payroll record should be created by student');
  }

  // 2. Teacher A cannot calculate for Teacher B (403 Forbidden)
  const teacherAOnBReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherAToken}` },
    body: JSON.stringify({ action: 'calculate', teacher_id: 'usr_teacher_b', billing_cycle: '2026-09' })
  });
  const teacherAOnBRes = await payrollPost({ request: teacherAOnBReq, platform });
  assert.equal(teacherAOnBRes.status, 403, 'Teacher A cannot access Teacher B payroll');

  // 3. Teacher A cannot lock/approve (403 Forbidden)
  const teacherALockReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherAToken}` },
    body: JSON.stringify({ action: 'lock', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const teacherALockRes = await payrollPost({ request: teacherALockReq, platform });
  assert.equal(teacherALockRes.status, 403, 'Teacher cannot execute administrative lock');

  // 4. Invalid action is rejected with 400 Bad Request
  const invalidActionReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'drop_database', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const invalidActionRes = await payrollPost({ request: invalidActionReq, platform });
  assert.equal(invalidActionRes.status, 400, 'Invalid action rejected with 400');
});

test('P1-02: Locked Payroll GET returns 200 snapshot and POST prevents overwrite with 409', async () => {
  const { platform, rawDb } = createMockPlatform();
  const leaderToken = await createSignedToken({ id: 'usr_leader_admin', username: 'leader_admin', role: 'leader' }, secret);

  // Leader locks payroll for teacher_a
  const lockReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'lock', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const lockRes = await payrollPost({ request: lockReq, platform });
  assert.equal(lockRes.status, 200, 'Lock action should succeed');

  // GET on locked period must return 200 with saved snapshot without throwing LockedPayrollPeriodError
  const getUrl = new URL('http://localhost/api/teachers/payroll?teacher_id=usr_teacher_a&billing_cycle=2026-09');
  const getReq = new Request(getUrl, {
    headers: { Authorization: `Bearer ${leaderToken}` }
  });
  const getRes = await payrollGet({ url: getUrl, request: getReq, platform });
  assert.equal(getRes.status, 200, 'GET locked payroll must return 200');
  const getBody = await getRes.json();
  assert.equal(getBody.success, true);
  assert.equal(getBody.is_locked, true);
  assert.equal(getBody.existing_record.status, 'locked');

  // Attempting to overwrite a locked period with calculate/save_draft must return 409 Conflict
  const overwriteReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'calculate', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const overwriteRes = await payrollPost({ request: overwriteReq, platform });
  assert.equal(overwriteRes.status, 409, 'Overwriting locked period must return 409 Conflict');

  // Attempting to disburse an already closed period must return 409 Conflict (not return 200 with unchanged DB)
  platform.env.DB.prepare("UPDATE teacher_payrolls SET status='closed' WHERE teacher_id='usr_teacher_a'").run();
  const closedDisburseReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'disburse', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const closedDisburseRes = await payrollPost({ request: closedDisburseReq, platform });
  assert.equal(closedDisburseRes.status, 409, 'Disbursing closed period must return 409 Conflict');
  const closedBody = await closedDisburseRes.json();
  assert.match(closedBody.error, /ConflictError|đã ở trạng thái 'closed'/);
  // 5. Approved period cannot be downgraded to draft by teacher
  platform.env.DB.prepare("UPDATE teacher_payrolls SET status='draft' WHERE teacher_id='usr_teacher_a'").run();
  const leaderApproveReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'approve', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const leaderApproveRes = await payrollPost({ request: leaderApproveReq, platform });
  assert.equal(leaderApproveRes.status, 200, 'Leader approve should succeed');

  const teacherToken = await createSignedToken({ id: 'usr_teacher_a', username: 'teacher_a', role: 'teacher' }, secret);
  const teacherDowngradeReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
    body: JSON.stringify({ action: 'save_draft', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const teacherDowngradeRes = await payrollPost({ request: teacherDowngradeReq, platform });
  assert.equal(teacherDowngradeRes.status, 403, 'Teacher cannot downgrade approved payroll to draft');
  const payrollRow = await platform.env.DB.prepare("SELECT status, approved_by FROM teacher_payrolls WHERE teacher_id = 'usr_teacher_a'").first();
  assert.equal(payrollRow.status, 'approved', 'Status must remain approved in DB');
  assert.equal(payrollRow.approved_by, 'usr_leader_admin', 'Approved_by must remain intact');

  // 6. Disbursing an approved payroll preserves approved monetary snapshot without recalculating added sessions
  rawDb.exec("INSERT INTO class_sessions VALUES('sess_post_approval_test','usr_teacher_a','2026-09-20',60,'completed','main_teacher')");
  const disburseApprovedReq = new Request('http://localhost/api/teachers/payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
    body: JSON.stringify({ action: 'disburse', teacher_id: 'usr_teacher_a', billing_cycle: '2026-09' })
  });
  const disburseApprovedRes = await payrollPost({ request: disburseApprovedReq, platform });
  assert.equal(disburseApprovedRes.status, 200, 'Disbursing approved payroll should succeed');
  const disbursedRow = await platform.env.DB.prepare("SELECT gross_amount, net_amount, status FROM teacher_payrolls WHERE teacher_id = 'usr_teacher_a'").first();
  assert.equal(disbursedRow.status, 'paid', 'Status must transition to paid');
  assert.equal(disbursedRow.gross_amount, 0, 'Gross amount must remain what was approved (0 VND)');
  assert.equal(disbursedRow.net_amount, 0, 'Net amount must remain what was approved (0 VND)');
});

test('P1-03: Exam validation rejects rogue question keys (400) and repeated submissions (409)', async () => {
  const { platform, rawDb } = createMockPlatform();
  const studentToken = await createSignedToken({ id: 'usr_student_test', username: 'test_student', role: 'student' }, secret);

  // 1. Rogue question key rejected with 400
  const rogueReq = new Request('http://localhost/api/exams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      exam_id: 'ex_g7_hsg_yenlap',
      answers: { 'rogue_injected_key_xyz': 'A' }
    })
  });
  const rogueRes = await examPost({ request: rogueReq, platform });
  assert.equal(rogueRes.status, 400, 'Rogue question key must be rejected with 400');
  const rogueBody = await rogueRes.json();
  assert.match(rogueBody.error, /ForeignKeyError|không thuộc đề thi/);

  // 2. Concurrent submissions hitting race condition are serialized by unique constraint (200 & 409)
  function createSubmitReq() {
    return new Request('http://localhost/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        exam_id: 'ex_g7_hsg_yenlap',
        answers: { '1': 'C' }
      })
    });
  }

  // Intercept prepare to simulate race condition barrier
  const originalPrepare = platform.env.DB.prepare.bind(platform.env.DB);
  let arrived = 0;
  let releaseBarrier;
  const barrier = new Promise(r => { releaseBarrier = r; });
  platform.env.DB.prepare = (sql) => {
    const stmt = originalPrepare(sql);
    if (/SELECT id FROM exam_attempts/.test(sql)) {
      const originalFirst = stmt.first.bind(stmt);
      stmt.first = async () => {
        const snapshot = await originalFirst();
        arrived++;
        if (arrived === 2) releaseBarrier();
        await barrier;
        return snapshot;
      };
    }
    return stmt;
  };

  const concurrentResults = await Promise.all([
    examPost({ request: createSubmitReq(), platform }),
    examPost({ request: createSubmitReq(), platform })
  ]);
  const statuses = concurrentResults.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 409], 'Concurrent submissions must yield exactly one 200 and one 409');
  const attemptsCount = rawDb.prepare('SELECT COUNT(*) AS c FROM exam_attempts WHERE user_id = ?').get('usr_student_test');
  assert.equal(attemptsCount.c, 1, 'Strictly 1 attempt record must exist in DB under concurrency');

  // Restore prepare
  platform.env.DB.prepare = originalPrepare;

  // 3. Repeat submission after debounce window is strictly blocked with 409 (Single submission policy)
  rawDb.exec("UPDATE exam_attempts SET created_at = datetime('now', '-5 seconds') WHERE user_id = 'usr_student_test'");
  const delayedRepeatRes = await examPost({ request: createSubmitReq(), platform });
  assert.equal(delayedRepeatRes.status, 409, 'Delayed repeat submission must return 409 Conflict');

  // 4. GET /api/exams fails closed (500) when D1 query for exam_attempts errors
  const failingPlatform = {
    env: {
      DB: {
        prepare(sql) {
          if (sql.includes('users')) {
            return {
              bind() { return this; },
              async first() {
                return { id: 'usr_student_test', username: 'test_student', role: 'student', status: 'active' };
              }
            };
          }
          throw new Error('D1 simulated disk corruption on exam_attempts');
        }
      },
      AUTH_SECRET: secret
    }
  };
  const getUrl = new URL('http://localhost/api/exams?grade=Lớp%207');
  const getReq = new Request(getUrl, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  const getRes = await examGet({ url: getUrl, request: getReq, platform: failingPlatform });
  assert.equal(getRes.status, 500, 'Failing D1 in GET /api/exams must fail-closed with 500');
});

test('P1-04: Audio manifest matches 15/15 authentic Google Drive inventory items', async () => {
  const manifestPath = resolve(process.cwd(), 'src/lib/data/audio_manifest.json');
  const inventoryPath = resolve(process.cwd(), 'scripts/all_gdrive_inventory.json');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));

  const inventoryDriveIds = new Set(inventory.audio.map(item => item.id));

  assert.equal(manifest.tracks.length, 15, 'Audio manifest must contain exactly 15 tracks');

  let matchCount = 0;
  for (const track of manifest.tracks) {
    assert.ok(track.drive_file_id, `Track ${track.id} must have drive_file_id`);
    if (inventoryDriveIds.has(track.drive_file_id)) {
      matchCount++;
    }
  }

  assert.equal(matchCount, 15, `All 15 tracks must match genuine Google Drive audio items from inventory (matched: ${matchCount}/15)`);
});

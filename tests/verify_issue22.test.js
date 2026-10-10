import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { POST as postWorkflow } from '../src/routes/api/teachers/workflows/+server.js';
import { POST as changePassword } from '../src/routes/api/auth/change-password/+server.js';
import {
  createSignedToken,
  isStaffUser,
  verifyServerAuth,
  hashPassword,
  verifyPassword,
  sanitizeUser
} from '../src/lib/server/auth.js';
import { shouldForcePasswordChange, parseUserMetadata } from '../src/lib/userMetadata.js';
import crypto from 'node:crypto';

if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

function createD1Adapter(sqliteDb) {
  return {
    prepare(sql) {
      let boundArgs = [];
      return {
        bind(...args) { boundArgs = args; return this; },
        async first() { return sqliteDb.prepare(sql).get(...boundArgs) || null; },
        async all() { return { results: sqliteDb.prepare(sql).all(...boundArgs) }; },
        async run() { return { meta: { changes: Number(sqliteDb.prepare(sql).run(...boundArgs).changes) } }; }
      };
    },
    async batch(statements) {
      sqliteDb.exec('BEGIN TRANSACTION');
      try {
        for (const s of statements) await s.run();
        sqliteDb.exec('COMMIT');
      } catch (e) {
        sqliteDb.exec('ROLLBACK');
        throw e;
      }
      return [];
    }
  };
}

function createMemoryPlatform(sqliteDb) {
  return {
    env: {
      DB: createD1Adapter(sqliteDb),
      AUTH_SECRET: 'testsecret'
    }
  };
}

function createBaseSchema(sqlite) {
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      password TEXT,
      name TEXT,
      phone TEXT,
      email TEXT,
      avatar TEXT,
      role TEXT,
      status TEXT,
      approval_status TEXT DEFAULT 'approved',
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE teacher_profiles (
      id TEXT PRIMARY KEY,
      teacher_id TEXT,
      user_id TEXT,
      bio TEXT,
      degree TEXT,
      certifications TEXT,
      specialty TEXT,
      created_at TEXT
    );
    CREATE TABLE teacher_recruitment (
      id TEXT PRIMARY KEY,
      candidate_name TEXT,
      phone TEXT,
      email TEXT,
      role_type TEXT,
      status TEXT,
      certificates TEXT,
      specialty TEXT,
      updated_at TEXT,
      selected_grades_json TEXT DEFAULT '[]',
      selected_subjects_json TEXT DEFAULT '[]',
      interview_preference TEXT,
      availability TEXT,
      cv_link TEXT
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_role TEXT,
      action TEXT,
      details TEXT,
      created_at TEXT
    );
    CREATE TABLE system_notifications (
      id TEXT PRIMARY KEY,
      target_role TEXT,
      title TEXT,
      body TEXT,
      category TEXT,
      reference_id TEXT
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      created_at TEXT,
      expires_at TEXT,
      revoked_at TEXT
    );
  `);
}

test('R1: parseUserMetadata & shouldForcePasswordChange production helper handles string & object', () => {
  const userWithStringMeta = {
    id: 't_str',
    role: 'teacher',
    metadata: '{"must_change_password":true}'
  };
  assert.equal(shouldForcePasswordChange(userWithStringMeta), true);

  const userWithObjMeta = {
    id: 't_obj',
    role: 'teacher',
    metadata: { must_change_password: true }
  };
  assert.equal(shouldForcePasswordChange(userWithObjMeta), true);

  const normalUser = {
    id: 't_normal',
    role: 'teacher',
    metadata: '{"is_trial":false}'
  };
  assert.equal(shouldForcePasswordChange(normalUser), false);
  assert.equal(shouldForcePasswordChange(null), false);
});

test('R1-REGRESSION: sanitizeUser preserves raw string metadata so existing screens do not TypeError', () => {
  const rawString = JSON.stringify({ is_trial: true, permissions: ['read'] });
  const sanitized = sanitizeUser({ id: 'u1', username: 'u1', metadata: rawString });
  assert.equal(typeof sanitized.metadata, 'string');
  assert.equal(typeof sanitized.metadata.includes, 'function');
  assert.equal(sanitized.metadata.includes('is_trial'), true);
});

test('R2: isStaffUser approved+official PASS, trial+pending+rejected+missing FAIL', () => {
  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'approved' }), true);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'official' }), true);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'APPROVED' }), true);

  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'trial' }), false);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'pending' }), false);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'rejected' }), false);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'unapproved' }), false);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: undefined }), false);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: null }), false);
  assert.equal(isStaffUser({ role: 'teacher', approval_status: 'missing_schema' }), false);
});

test('R3: verifyServerAuth thực sự SELECT approval_status từ D1', async () => {
  const sqlite = new DatabaseSync(':memory:');
  createBaseSchema(sqlite);
  const platform = createMemoryPlatform(sqlite);

  sqlite.prepare(`
    INSERT INTO users (id, username, role, name, status, approval_status, metadata)
    VALUES ('u_official', 'u_official', 'teacher', 'Teacher Official', 'active', 'official', '{}')
  `).run();
  sqlite.prepare(`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES ('sess_official', 'u_official', '2099-01-01')
  `).run();

  const token = await createSignedToken({ id: 'u_official', role: 'teacher', name: 'Teacher Official' }, 'testsecret', 100000, 'sess_official');
  const req = new Request('https://t.test', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const auth = await verifyServerAuth(req, platform);
  assert.equal(auth.authenticated, true);
  assert.equal(auth.user.approval_status, 'official');
  assert.equal(isStaffUser(auth.user), true);
});

test('R3-FAIL-CLOSED: DB missing approval_status does not grant teacher staff privileges', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, phone TEXT, email TEXT, avatar TEXT, role TEXT, name TEXT, status TEXT, metadata TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, revoked_at TEXT);
    INSERT INTO users (id, username, phone, email, avatar, role, name, status, metadata) VALUES ('u_legacy', 'u_legacy', '0900000000', 'legacy@test.com', '', 'teacher', 'Teacher Legacy', 'active', '{}');
    INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ('sess_legacy', 'u_legacy', '2099-01-01');
  `);
  const platform = createMemoryPlatform(sqlite);

  const token = await createSignedToken({ id: 'u_legacy', role: 'teacher' }, 'testsecret', 100000, 'sess_legacy');
  const req = new Request('https://t.test', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const auth = await verifyServerAuth(req, platform);
  assert.equal(auth.authenticated, true);
  assert.equal(auth.user.approval_status, 'missing_schema');
  assert.equal(isStaffUser(auth.user), false); // Fail-closed: missing schema denied teacher role
});

test('R4: teacher có must_change_password bị chặn staff trước đổi và được mở sau đổi', async () => {
  const teacherBefore = {
    role: 'teacher',
    approval_status: 'approved',
    metadata: JSON.stringify({ must_change_password: true })
  };
  assert.equal(isStaffUser(teacherBefore), false);

  const teacherAfter = {
    role: 'teacher',
    approval_status: 'approved',
    metadata: JSON.stringify({})
  };
  assert.equal(isStaffUser(teacherAfter), true);
});

test('R5: change-password bằng Bearer và cookie, sai old password không mutate, đúng thì hash mới + xóa flag', async () => {
  const sqlite = new DatabaseSync(':memory:');
  createBaseSchema(sqlite);
  const platform = createMemoryPlatform(sqlite);

  const hashedOld = await hashPassword('TempPass123!');
  sqlite.prepare(`
    INSERT INTO users (id, username, password, role, name, status, approval_status, metadata)
    VALUES ('t_cp', 't_cp', ?, 'teacher', 'Teacher CP', 'active', 'approved', '{"must_change_password":true}')
  `).run(hashedOld);

  sqlite.prepare(`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES ('sess_cp_bearer', 't_cp', '2099-01-01'), ('sess_cp_cookie', 't_cp', '2099-01-01')
  `).run();

  const tokenBearer = await createSignedToken({ id: 't_cp', role: 'teacher' }, 'testsecret', 100000, 'sess_cp_bearer');
  const tokenCookie = await createSignedToken({ id: 't_cp', role: 'teacher' }, 'testsecret', 100000, 'sess_cp_cookie');

  // Sai old password qua Bearer -> 401, không đổi
  const failRes = await changePassword({
    request: new Request('https://t.test/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenBearer}`
      },
      body: JSON.stringify({ old_password: 'WrongPassword!', new_password: 'NewSecurePassword123' })
    }),
    platform
  });
  assert.equal(failRes.status, 401);
  const userAfterFail = sqlite.prepare('SELECT password, metadata FROM users WHERE id = ?').get('t_cp');
  assert.equal(userAfterFail.password, hashedOld);
  assert.match(userAfterFail.metadata, /must_change_password/);

  // Thành công qua Cookie
  const successRes = await changePassword({
    request: new Request('https://t.test/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${encodeURIComponent(tokenCookie)}`
      },
      body: JSON.stringify({ old_password: 'TempPass123!', new_password: 'NewSecurePassword123' })
    }),
    platform
  });
  assert.equal(successRes.status, 200);
  const successJson = await successRes.json();
  assert.equal(successJson.success, true);

  const userAfterSuccess = sqlite.prepare('SELECT password, metadata FROM users WHERE id = ?').get('t_cp');
  assert.notEqual(userAfterSuccess.password, hashedOld);
  const passOk = await verifyPassword('NewSecurePassword123', userAfterSuccess.password);
  assert.equal(passOk, true);
  const metaParsed = JSON.parse(userAfterSuccess.metadata || '{}');
  assert.equal(metaParsed.must_change_password, undefined);
});

test('R6: Teacher onboarding e2e full flow (Apply -> Provision -> Blocked Staff -> Change Pass -> Active Staff)', async () => {
  const sqlite = new DatabaseSync(':memory:');
  createBaseSchema(sqlite);
  const platform = createMemoryPlatform(sqlite);

  // 1. Candidate Apply
  const applyRes = await postWorkflow({
    request: new Request('https://t.test/api/teachers/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'candidate_apply',
        candidate_name: 'Nguyen Van A',
        phone: '0912345678',
        role_type: 'lead',
        selected_grades: ['Grade 6', 'Grade 7'],
        selected_subjects: ['English', 'IELTS']
      })
    }),
    platform
  });
  const applyJson = await applyRes.json();
  assert.equal(applyJson.success, true);
  const recId = applyJson.recruitment_id;

  sqlite.prepare('UPDATE teacher_recruitment SET status = ? WHERE id = ?').run('accepted', recId);

  // 2. Admin provision
  sqlite.prepare(`
    INSERT INTO users (id, username, role, name, status, approval_status)
    VALUES ('admin_root', 'admin_root', 'superadmin', 'Super Admin', 'active', 'approved')
  `).run();
  sqlite.prepare(`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES ('sess_admin_root', 'admin_root', '2099-01-01')
  `).run();
  const adminToken = await createSignedToken({ id: 'admin_root', role: 'superadmin' }, 'testsecret', 100000, 'sess_admin_root');

  const provRes = await postWorkflow({
    request: new Request('https://t.test/api/teachers/workflows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        action: 'provision_account',
        recruitment_id: recId
      })
    }),
    platform
  });
  const provJson = await provRes.json();
  assert.equal(provJson.success, true);
  assert.equal(provJson.must_change_password, true);

  const teacherUserId = provJson.user_id;
  const tempPassword = provJson.temp_password;

  // 3. User login token created
  const teacherRow = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(teacherUserId);
  assert.equal(teacherRow.role, 'teacher');
  assert.equal(isStaffUser(teacherRow), false); // Bị chặn staff vì must_change_password = true

  sqlite.prepare(`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES ('sess_teacher_new', ?, '2099-01-01')
  `).run(teacherUserId);
  const teacherToken = await createSignedToken(teacherRow, 'testsecret', 100000, 'sess_teacher_new');

  // 4. Change Password
  const cpRes = await changePassword({
    request: new Request('https://t.test/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        old_password: tempPassword,
        new_password: 'StrongTeacherPassword2026!'
      })
    }),
    platform
  });
  const cpJson = await cpRes.json();
  assert.equal(cpJson.success, true);

  // 5. User unblocked and staff enabled
  const teacherRowAfter = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(teacherUserId);
  assert.equal(isStaffUser(teacherRowAfter), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { POST as postWorkflow } from '../src/routes/api/teachers/workflows/+server.js';
import { POST as changePassword } from '../src/routes/api/auth/change-password/+server.js';
import { createSignedToken, verifyPassword } from '../src/lib/server/auth.js';
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

test('Teacher onboarding e2e - Issue 22', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password TEXT, name TEXT, phone TEXT, email TEXT, avatar TEXT, role TEXT, status TEXT, approval_status TEXT DEFAULT 'approved', metadata TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE teacher_profiles (id TEXT PRIMARY KEY, teacher_id TEXT, user_id TEXT, bio TEXT, degree TEXT, certifications TEXT, specialty TEXT, created_at TEXT);
    CREATE TABLE teacher_recruitment (id TEXT PRIMARY KEY, candidate_name TEXT, phone TEXT, email TEXT, role_type TEXT, status TEXT, certificates TEXT, specialty TEXT, updated_at TEXT, selected_grades_json TEXT DEFAULT '[]', selected_subjects_json TEXT DEFAULT '[]', interview_preference TEXT, availability TEXT, cv_link TEXT);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_id TEXT, actor_role TEXT, action TEXT, details TEXT, created_at TEXT);
    CREATE TABLE system_notifications (id TEXT PRIMARY KEY, target_role TEXT, title TEXT, body TEXT, category TEXT, reference_id TEXT); CREATE TABLE auth_sessions(id TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, expires_at TEXT, revoked_at TEXT);
  `);
  
  const platform = { env: { DB: createD1Adapter(sqlite), AUTH_SECRET: 'testsecret' } };

  // 1. Candidate application
  const applyRes = await postWorkflow({
    request: new Request('https://t.test', {
      method: 'POST',
      body: JSON.stringify({
        action: 'candidate_apply',
        candidate_name: 'Test Candidate',
        phone: '0900000000',
        role_type: 'lead',
        selected_grades: ['Grade 7', 'IELTS']
      })
    }),
    platform
  });
  const applyJson = await applyRes.json();
  assert.equal(applyJson.success, true);
  const recId = applyJson.recruitment_id;

  sqlite.prepare('UPDATE teacher_recruitment SET status = ? WHERE id = ?').run('accepted', recId);

  // 2. Provision account by admin
  const adminUser = { id: 'admin1', role: 'superadmin', name: 'Admin' }; sqlite.prepare('INSERT INTO users (id, role, name, status, approval_status) VALUES (?, ?, ?, ?, ?)').run('admin1', 'superadmin', 'Admin', 'active', 'approved'); sqlite.prepare('INSERT INTO auth_sessions(id, user_id, expires_at) VALUES (?, ?, ?)').run('sess_1', 'admin1', '2099-01-01');
  const adminToken = await createSignedToken(adminUser, 'testsecret', 100000, 'sess_1');
  
  const provRes = await postWorkflow({
    request: new Request('https://t.test', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'provision_account', recruitment_id: recId })
    }),
    platform
  });
  const provJson = await provRes.json();
  if (!provJson.success) console.error(provJson); assert.equal(provJson.success, true);
  assert.equal(provJson.must_change_password, true);

  const teacherUserId = provJson.user_id;
  const tempPassword = provJson.temp_password;

  // 3. First login (change password)
  const teacherUser = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(teacherUserId);
  assert.equal(teacherUser.role, 'teacher');
  assert.equal(teacherUser.status, 'active');
  const metadata = JSON.parse(teacherUser.metadata);
  assert.equal(metadata.must_change_password, true);

  const teacherToken = await createSignedToken(teacherUser, 'testsecret', 100000, 'sess_2');
  
  sqlite.prepare('INSERT INTO auth_sessions(id, user_id, expires_at) VALUES (?, ?, ?)').run('sess_2', teacherUserId, '2099-01-01'); const cpRes = await changePassword({
    request: new Request('https://t.test', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: tempPassword, new_password: 'new_secure_password' })
    }),
    platform
  });
  const cpJson = await cpRes.json();
  assert.equal(cpJson.success, true);

  const updatedTeacherUser = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(teacherUserId);
  const updatedMeta = JSON.parse(updatedTeacherUser.metadata || '{}');
  assert.equal(updatedMeta.must_change_password, undefined);
});

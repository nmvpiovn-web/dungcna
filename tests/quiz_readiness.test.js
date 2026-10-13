import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedToken } from '../src/lib/server/auth.js';
import {
  checkQuizReadiness,
  REQUIRED_QUIZ_TABLES,
  REQUIRED_QUIZ_QUESTION_COLUMNS,
  REQUIRED_QUIZ_MIGRATIONS,
  REMEDIATION_CODE_REMOTE
} from '../src/lib/server/quizReadiness.js';
import { GET as getQuizReadiness } from '../src/routes/api/quiz-menu/readiness/+server.js';
import { GET as getQuizCatalog } from '../src/routes/api/quiz-menu/+server.js';

const secret = 'quiz-readiness-test-secret-32-bytes!';

function createMockPlatform({
  hasTables = true,
  hasColumns = true,
  hasMigrations = true,
  publishedCount = 10,
  hasDB = true
} = {}) {
  if (!hasDB) return { env: { AUTH_SECRET: secret } };

  const tables = hasTables ? [...REQUIRED_QUIZ_TABLES] : ['quizzes'];
  const columns = hasColumns
    ? [{ name: 'id' }, { name: 'type' }, { name: 'source_type' }, { name: 'source_id' }]
    : [{ name: 'id' }, { name: 'type' }];
  const migrations = hasMigrations
    ? REQUIRED_QUIZ_MIGRATIONS.map(name => ({ name }))
    : [];

  const DB = {
    prepare(sql) {
      const handler = (params = []) => ({
        async first() {
          if (sql.includes('COUNT(*) AS total FROM quizzes')) {
            return { total: publishedCount };
          }
          if (sql.includes('FROM users')) {
            const id = params[0] || 'usr_staff';
            const isStudent = id.includes('student');
            return {
              id,
              username: id,
              name: 'User ' + id,
              role: isStudent ? 'student' : 'superadmin',
              status: 'active',
              approval_status: 'approved',
              metadata: '{}'
            };
          }
          if (sql.includes('FROM auth_sessions')) {
            return { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' };
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM sqlite_master WHERE type = 'table'")) {
            return { results: tables.map(name => ({ name })) };
          }
          if (sql.includes("PRAGMA table_info(quiz_questions)")) {
            return { results: columns };
          }
          if (sql.includes("FROM d1_migrations")) {
            return { results: migrations };
          }
          if (sql.includes("FROM quizzes WHERE status = 'published'")) {
            return {
              results: publishedCount > 0
                ? [{ id: 'quiz_1', title: 'Quiz 1', status: 'published' }]
                : []
            };
          }
          return { results: [] };
        },
        async run() {
          return { success: true };
        }
      });

      return {
        bind(...params) { return handler(params); },
        first() { return handler().first(); },
        all() { return handler().all(); },
        run() { return handler().run(); }
      };
    }
  };

  return { env: { DB, AUTH_SECRET: secret } };
}

test('READINESS-1: Full readiness check returns ready=true when all schema & catalog seeds exist', async () => {
  const platform = createMockPlatform({
    hasTables: true,
    hasColumns: true,
    hasMigrations: true,
    publishedCount: 15
  });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };

  const res = await checkQuizReadiness(platform, staffUser);
  assert.equal(res.ready, true);
  assert.equal(res.status, 'ready');
  assert.equal(res.is_staff, true);
  assert.equal(res.published_count, 15);
  assert.equal(res.catalog_seeded, true);
  assert.match(res.message, /sẵn sàng hoạt động/);
});

test('READINESS-2: Staff diagnostic reports missing migrations, tables, columns and exact remediation code', async () => {
  const platform = createMockPlatform({
    hasTables: false,
    hasColumns: false,
    hasMigrations: false,
    publishedCount: 0
  });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };

  const res = await checkQuizReadiness(platform, staffUser);
  assert.equal(res.ready, false);
  assert.equal(res.status, 'schema_unmigrated');
  assert.equal(res.is_staff, true);
  assert.ok(res.missing_tables.length > 0);
  assert.ok(res.missing_columns.length > 0);
  assert.ok(res.missing_migrations.length > 0);
  assert.equal(res.published_count, 0);
  assert.equal(res.remediation_code, REMEDIATION_CODE_REMOTE);
  assert.match(res.remediation_instructions, /npx wrangler d1 migrations apply/);
  assert.match(res.message, /Cơ sở dữ liệu Quiz chưa hoàn tất migrations/);
});

test('READINESS-3: Guest/Student safe masking hides internal tables, columns, and remediation commands', async () => {
  const platform = createMockPlatform({
    hasTables: false,
    hasColumns: false,
    hasMigrations: false,
    publishedCount: 0
  });
  const guestUser = null;
  const studentUser = { id: 'usr_student', username: 'hocsinh', role: 'student' };

  for (const user of [guestUser, studentUser]) {
    const res = await checkQuizReadiness(platform, user);
    assert.equal(res.ready, false);
    assert.equal(res.status, 'maintenance');
    assert.equal(res.is_staff, false);
    // Strict privacy / fail-closed assertions:
    assert.equal(res.missing_tables, undefined, 'Must not leak missing_tables to non-staff');
    assert.equal(res.missing_columns, undefined, 'Must not leak missing_columns to non-staff');
    assert.equal(res.missing_migrations, undefined, 'Must not leak missing_migrations to non-staff');
    assert.equal(res.remediation_code, undefined, 'Must not leak remediation_code to non-staff');
    assert.match(res.message, /đồng bộ và cập nhật dữ liệu|tạm dừng để bảo trì/);
  }
});

test('READINESS-4: GET /api/quiz-menu/readiness endpoint returns readiness object for authorized and anonymous callers', async () => {
  const platform = createMockPlatform({ hasTables: true, hasColumns: true, hasMigrations: true, publishedCount: 5 });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(staffUser, secret, 60_000, 'test-session');

  // Authenticated staff call
  const reqStaff = new Request('https://timbk.io.vn/api/quiz-menu/readiness', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const resStaff = await getQuizReadiness({ request: reqStaff, platform });
  const dataStaff = await resStaff.json();
  assert.equal(resStaff.status, 200);
  assert.equal(dataStaff.success, true);
  assert.equal(dataStaff.readiness.ready, true);
  assert.equal(dataStaff.readiness.is_staff, true);

  // Anonymous guest call
  const reqGuest = new Request('https://timbk.io.vn/api/quiz-menu/readiness');
  const resGuest = await getQuizReadiness({ request: reqGuest, platform });
  const dataGuest = await resGuest.json();
  assert.equal(resGuest.status, 200);
  assert.equal(dataGuest.success, true);
  assert.equal(dataGuest.readiness.is_staff, false);
});

test('READINESS-5: GET /api/quiz-menu returns readiness alongside quizzes catalog', async () => {
  const platform = createMockPlatform({ hasTables: false, hasColumns: false, hasMigrations: false, publishedCount: 0 });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(staffUser, secret, 60_000, 'test-session');

  const req = new Request('https://timbk.io.vn/api/quiz-menu', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const res = await getQuizCatalog({ request: req, platform, url: new URL(req.url) });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.deepEqual(data.quizzes, []);
  assert.ok(data.readiness);
  assert.equal(data.readiness.ready, false);
  assert.equal(data.readiness.status, 'schema_unmigrated');
  assert.equal(data.readiness.remediation_code, REMEDIATION_CODE_REMOTE);
});

test('READINESS-6: Cache isolation - DB A ready cannot make unmigrated DB B ready', async () => {
  const platformA = createMockPlatform({ hasTables: true, hasColumns: true, hasMigrations: true, publishedCount: 5 });
  const platformB = createMockPlatform({ hasTables: false, hasColumns: false, hasMigrations: false, publishedCount: 0 });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };

  // Call on platform A (ready)
  const resA = await checkQuizReadiness(platformA, staffUser);
  assert.equal(resA.ready, true);
  assert.equal(resA.status, 'ready');

  // Immediately call on platform B with the same staff user
  const resB = await checkQuizReadiness(platformB, staffUser);
  assert.equal(resB.ready, false, 'DB B must NOT inherit readiness from DB A');
  assert.equal(resB.status, 'schema_unmigrated');
  assert.ok(resB.missing_tables.length > 0);
});

test('READINESS-7: Catalog has quiz but schema is unmigrated - returns schema_ready=false and does not auto-fabricate readiness', async () => {
  const platform = createMockPlatform({ hasTables: true, hasColumns: true, hasMigrations: false, publishedCount: 5 });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };
  const guestUser = null;

  // Staff check: schema_ready=false, catalog_empty=false, staff diagnostic present
  const resStaff = await checkQuizReadiness(platform, staffUser, { bypassCache: true });
  assert.equal(resStaff.ready, false);
  assert.equal(resStaff.schema_ready, false);
  assert.equal(resStaff.catalog_empty, false);
  assert.equal(resStaff.status, 'schema_unmigrated');
  assert.equal(resStaff.is_staff, true);
  assert.ok(resStaff.missing_migrations.length > 0);
  assert.equal(resStaff.remediation_code, REMEDIATION_CODE_REMOTE);

  // Guest check: safe masking hides schema internals
  const resGuest = await checkQuizReadiness(platform, guestUser, { bypassCache: true });
  assert.equal(resGuest.ready, false);
  assert.equal(resGuest.schema_ready, false);
  assert.equal(resGuest.status, 'maintenance');
  assert.equal(resGuest.is_staff, false);
  assert.equal(resGuest.missing_migrations, undefined, 'Guest must not see missing migrations');
  assert.equal(resGuest.remediation_code, undefined, 'Guest must not see remediation code');
});

test('READINESS-8: Ready DB with published quizzes returns schema_ready=true, catalog_empty=false, ready=true', async () => {
  const platform = createMockPlatform({ hasTables: true, hasColumns: true, hasMigrations: true, publishedCount: 7 });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };

  const res = await checkQuizReadiness(platform, staffUser, { bypassCache: true });
  assert.equal(res.ready, true);
  assert.equal(res.schema_ready, true);
  assert.equal(res.catalog_empty, false);
  assert.equal(res.status, 'ready');
  assert.equal(res.published_count, 7);
});

test('READINESS-9: GET /api/quiz-menu on unmigrated DB with quizzes does not fabricate schema_ready=true', async () => {
  const platform = createMockPlatform({ hasTables: true, hasColumns: true, hasMigrations: false, publishedCount: 3 });
  const staffUser = { id: 'usr_staff', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(staffUser, secret, 60_000, 'test-session');

  const req = new Request('https://timbk.io.vn/api/quiz-menu', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const res = await getQuizCatalog({ request: req, platform, url: new URL(req.url) });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.quizzes.length > 0);
  assert.ok(data.readiness, 'Staff GET must include true readiness');
  assert.equal(data.readiness.schema_ready, false, 'Must not fabricate schema_ready=true');
  assert.equal(data.readiness.ready, false);
});

test('READINESS-10: Teacher staff masking - pending, rejected, trial, or forced-password-change teachers are safely masked', async () => {
  const platform = createMockPlatform({ hasTables: true, hasColumns: true, hasMigrations: false, publishedCount: 3 });

  // 1. Pending approval teacher
  const pendingTeacher = { id: 'usr_t_pending', username: 'teach_pend', role: 'teacher', approval_status: 'pending', status: 'active' };
  const resPending = await checkQuizReadiness(platform, pendingTeacher, { bypassCache: true });
  assert.equal(resPending.is_staff, false, 'Pending teacher must not be treated as staff');
  assert.equal(resPending.status, 'maintenance');
  assert.equal(resPending.remediation_code, undefined, 'Pending teacher must not see wrangler remediation code');
  assert.equal(resPending.missing_migrations, undefined, 'Pending teacher must not see migration names');

  // 2. Rejected approval teacher
  const rejectedTeacher = { id: 'usr_t_rej', username: 'teach_rej', role: 'teacher', approval_status: 'rejected', status: 'active' };
  const resRejected = await checkQuizReadiness(platform, rejectedTeacher, { bypassCache: true });
  assert.equal(resRejected.is_staff, false, 'Rejected teacher must not be treated as staff');
  assert.equal(resRejected.remediation_code, undefined);

  // 3. Trial status teacher
  const trialTeacher = { id: 'usr_t_trial', username: 'teach_trial', role: 'teacher', approval_status: 'approved', status: 'trial' };
  const resTrial = await checkQuizReadiness(platform, trialTeacher, { bypassCache: true });
  assert.equal(resTrial.is_staff, false, 'Trial status teacher must not be treated as staff');
  assert.equal(resTrial.remediation_code, undefined);

  // 4. Must change password teacher
  const forcedChangeTeacher = {
    id: 'usr_t_change',
    username: 'teach_change',
    role: 'teacher',
    approval_status: 'approved',
    status: 'active',
    metadata: JSON.stringify({ must_change_password: true })
  };
  const resForcedChange = await checkQuizReadiness(platform, forcedChangeTeacher, { bypassCache: true });
  assert.equal(resForcedChange.is_staff, false, 'Forced-change teacher must not see staff diagnostic');
  assert.equal(resForcedChange.remediation_code, undefined);

  // 5. Approved/official active teacher without forced password change
  const officialTeacher = {
    id: 'usr_t_ok',
    username: 'teach_ok',
    role: 'teacher',
    approval_status: 'approved',
    status: 'active',
    metadata: '{}'
  };
  const resOfficial = await checkQuizReadiness(platform, officialTeacher, { bypassCache: true });
  assert.equal(resOfficial.is_staff, true, 'Official approved teacher is recognized as staff');
  assert.equal(resOfficial.remediation_code, REMEDIATION_CODE_REMOTE);
  assert.ok(resOfficial.missing_migrations.length > 0);
});

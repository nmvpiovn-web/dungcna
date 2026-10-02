import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET } from '../src/routes/api/schedule/+server.js';

const secret = 'schedule-scope-test-secret';

function platformFor(user) {
  const seen = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM users')) return { ...user, status: 'active', metadata: '{}' };
              if (sql.includes('FROM auth_sessions')) return { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' };
              return null;
            },
            async all() {
              seen.push({ sql, params });
              return { results: [] };
            }
          };
        }
      };
    }
  };
  return { platform: { env: { DB, AUTH_SECRET: secret } }, seen };
}

async function scheduleQueryFor(role) {
  const user = { id: `user-${role}`, username: role, name: role, role };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');
  const { platform, seen } = platformFor(user);
  const request = new Request('https://timbk.io.vn/api/schedule', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const response = await GET({ request, platform, url: new URL(request.url) });
  assert.equal(response.status, 200);
  return seen.at(-1);
}

test('schedule scopes a student to active enrolments and explicit roster membership', async () => {
  const query = await scheduleQueryFor('student');
  assert.match(query.sql, /class_enrollments/);
  assert.match(query.sql, /json_each/);
  assert.deepEqual(query.params.slice(0, 2), ['user-student', 'user-student']);
});

test('schedule scopes a parent to verified linked children', async () => {
  const query = await scheduleQueryFor('parent');
  assert.match(query.sql, /parent_student_links/);
  assert.match(query.sql, /verification_status = 'verified'/);
  assert.deepEqual(query.params.slice(0, 2), ['user-parent', 'user-parent']);
});

test('schedule scopes a teacher to assigned teaching roles', async () => {
  const query = await scheduleQueryFor('teacher');
  assert.match(query.sql, /cs\.teacher_id = \?/);
  assert.deepEqual(query.params.slice(0, 3), ['user-teacher', 'user-teacher', 'user-teacher']);
});

test('schedule managers retain the full operational calendar', async () => {
  const query = await scheduleQueryFor('leader');
  assert.doesNotMatch(query.sql, /parent_student_links|class_enrollments|cs\.teacher_id = \?/);
  assert.deepEqual(query.params, []);
});

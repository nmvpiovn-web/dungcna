import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedToken, verifyServerAuth } from '../src/lib/server/auth.js';
import { POST as postZalo } from '../src/routes/api/bot/zalo/+server.js';
import { GET as getWebhook, POST as postWebhook } from '../src/routes/api/webhook/+server.js';
import { POST as postSepay } from '../src/routes/api/webhook/sepay/+server.js';
import { GET as getEvaluations } from '../src/routes/api/evaluations/+server.js';
import { GET as getDiscussions } from '../src/routes/api/discussions/+server.js';
import { POST as postStudents, PATCH as patchStudents, DELETE as deleteStudents } from '../src/routes/api/students/+server.js';

const SECRET = 'test-auth-secret-at-least-32-characters';

function request(url, { method = 'GET', token, body, headers = {} } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function authPlatform(user, extraEnv = {}) {
  return {
    env: {
      AUTH_SECRET: SECRET,
      DB: {
        prepare() {
          return {
            bind() {
              return {
                first: async () => ({ ...user, status: 'active', metadata: '{}' }),
                all: async () => ({ results: [] }),
                run: async () => ({ meta: { changes: 1 } })
              };
            }
          };
        }
      },
      ...extraEnv
    }
  };
}

test('service webhooks fail closed when secret is absent or invalid', async () => {
  const zaloMissing = await postZalo({ request: request('https://test/api/bot/zalo', { method: 'POST', body: { action: 'info' } }), platform: { env: {} } });
  assert.equal(zaloMissing.status, 503);

  const centralWrong = await postWebhook({ request: request('https://test/api/webhook', { method: 'POST', headers: { 'x-webhook-secret': 'wrong' }, body: { event: 'TEST_EVENT' } }), platform: { env: { CENTRAL_WEBHOOK_SECRET: 'right' } } });
  assert.equal(centralWrong.status, 401);

  const sepayMissing = await postSepay({ request: request('https://test/api/webhook/sepay', { method: 'POST', body: {} }), platform: { env: {} } });
  assert.equal(sepayMissing.status, 503);
});

test('public webhook health no longer leaks registered endpoint inventory', async () => {
  const response = await getWebhook();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(data, 'registered_webhooks'), false);
});

test('SePay requires atomic batch and strict positive integer amount', async () => {
  const withoutBatch = await postSepay({
    request: request('https://test/api/webhook/sepay', { method: 'POST', headers: { 'x-sepay-api-key': 'secret' }, body: { id: 'tx-1', transferType: 'in', transferAmount: 1000, content: 'HP_1' } }),
    platform: { env: { SEPAY_WEBHOOK_SECRET: 'secret', DB: {} } }
  });
  assert.equal(withoutBatch.status, 503);

  const invalidAmount = await postSepay({
    request: request('https://test/api/webhook/sepay', { method: 'POST', headers: { 'x-sepay-api-key': 'secret' }, body: { id: 'tx-2', transferType: 'in', transferAmount: 10.5, content: 'HP_1' } }),
    platform: { env: { SEPAY_WEBHOOK_SECRET: 'secret', DB: { batch() {} } } }
  });
  assert.equal(invalidAmount.status, 400);
});

test('evaluations and discussions reject unauthenticated reads', async () => {
  const platform = { env: { AUTH_SECRET: SECRET } };
  const evalResponse = await getEvaluations({ url: new URL('https://test/api/evaluations'), request: request('https://test/api/evaluations'), platform });
  const discussionResponse = await getDiscussions({ url: new URL('https://test/api/discussions?evaluation_id=e1'), request: request('https://test/api/discussions?evaluation_id=e1'), platform });
  assert.equal(evalResponse.status, 401);
  assert.equal(discussionResponse.status, 401);
});

test('students endpoint rejects client-supplied operator and deprecated profile mutation', async () => {
  const user = { id: 'student-1', username: 'student1', role: 'student', name: 'Student One' };
  const token = await createSignedToken(user, SECRET);
  const platform = authPlatform(user);
  const spoofed = await patchStudents({
    request: request('https://test/api/students', { method: 'PATCH', token, body: { action: 'change_grade', student_id: user.id, grade: 'Lớp 12', operator: { role: 'admin' } } }),
    platform
  });
  assert.equal(spoofed.status, 400);
  assert.match((await spoofed.json()).error, /PrivilegeEscalationAttempt/);

  const legacyProfile = await patchStudents({
    request: request('https://test/api/students', { method: 'PATCH', token, body: { action: 'update_profile', student_id: user.id, updates: { school: 'Injected' } } }),
    platform
  });
  assert.equal(legacyProfile.status, 410);
});

test('teacher cannot create or delete students', async () => {
  const teacher = { id: 'teacher-1', username: 'teacher1', role: 'teacher', name: 'Teacher One' };
  const token = await createSignedToken(teacher, SECRET);
  const platform = authPlatform(teacher);
  const createResponse = await postStudents({ request: request('https://test/api/students', { method: 'POST', token, body: { name: 'New Student', username: 'new_student', password: 'secure123', grade: 'Lớp 2' } }), platform });
  const deleteResponse = await deleteStudents({ url: new URL('https://test/api/students?id=student-1'), request: request('https://test/api/students?id=student-1', { method: 'DELETE', token }), platform });
  assert.equal(createResponse.status, 403);
  assert.equal(deleteResponse.status, 403);
});

test('auth session fail-closed: token with sid is rejected on missing, revoked, expired, or db error', async () => {
  const user = { id: 'usr_test_sess', username: 'test_sess', role: 'student' };

  // 1. Missing session in D1
  const tokenMissing = await createSignedToken(user, SECRET, 3600000, 'sid_missing');
  const platformMissing = {
    env: {
      AUTH_SECRET: SECRET,
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => null
          })
        })
      }
    }
  };
  const resMissing = await verifyServerAuth(request('https://test/api/auth/profile', { token: tokenMissing }), platformMissing);
  assert.equal(resMissing.authenticated, false);
  assert.equal(resMissing.status, 401);

  // 2. Revoked session
  const tokenRevoked = await createSignedToken(user, SECRET, 3600000, 'sid_revoked');
  const platformRevoked = {
    env: {
      AUTH_SECRET: SECRET,
      DB: {
        prepare: (sql) => ({
          bind: () => ({
            first: async () => {
              if (sql.includes('auth_sessions')) return { id: 'sid_revoked', revoked_at: new Date().toISOString() };
              return { ...user, status: 'active', metadata: '{}' };
            }
          })
        })
      }
    }
  };
  const resRevoked = await verifyServerAuth(request('https://test/api/auth/profile', { token: tokenRevoked }), platformRevoked);
  assert.equal(resRevoked.authenticated, false);
  assert.equal(resRevoked.status, 401);

  // 3. Expired session
  const tokenExpired = await createSignedToken(user, SECRET, 3600000, 'sid_expired');
  const platformExpired = {
    env: {
      AUTH_SECRET: SECRET,
      DB: {
        prepare: (sql) => ({
          bind: () => ({
            first: async () => {
              if (sql.includes('auth_sessions')) return { id: 'sid_expired', revoked_at: null, expires_at: new Date(Date.now() - 10000).toISOString() };
              return { ...user, status: 'active', metadata: '{}' };
            }
          })
        })
      }
    }
  };
  const resExpired = await verifyServerAuth(request('https://test/api/auth/profile', { token: tokenExpired }), platformExpired);
  assert.equal(resExpired.authenticated, false);
  assert.equal(resExpired.status, 401);

  // 4. DB error on session query
  const tokenDbErr = await createSignedToken(user, SECRET, 3600000, 'sid_dberr');
  const platformDbErr = {
    env: {
      AUTH_SECRET: SECRET,
      DB: {
        prepare: (sql) => ({
          bind: () => ({
            first: async () => {
              if (sql.includes('auth_sessions')) throw new Error('D1 Connection Lost');
              return { ...user, status: 'active', metadata: '{}' };
            }
          })
        })
      }
    }
  };
  const resDbErr = await verifyServerAuth(request('https://test/api/auth/profile', { token: tokenDbErr }), platformDbErr);
  assert.equal(resDbErr.authenticated, false);
  assert.equal(resDbErr.status, 401);

  // 5. Valid session -> authenticated
  const tokenValid = await createSignedToken(user, SECRET, 3600000, 'sid_valid');
  const platformValid = {
    env: {
      AUTH_SECRET: SECRET,
      DB: {
        prepare: (sql) => ({
          bind: () => ({
            first: async () => {
              if (sql.includes('auth_sessions')) return { id: 'sid_valid', revoked_at: null, expires_at: new Date(Date.now() + 100000).toISOString() };
              return { ...user, status: 'active', metadata: '{}' };
            }
          })
        })
      }
    }
  };
  const resValid = await verifyServerAuth(request('https://test/api/auth/profile', { token: tokenValid }), platformValid);
  assert.equal(resValid.authenticated, true);
  assert.equal(resValid.status, 200);
});

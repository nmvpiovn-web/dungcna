// tests/verify_real_handlers_security.test.js
// Tests the REAL SvelteKit server endpoint handlers directly against HMAC token auth & D1 error handling
// Complies with Codex Desktop audit specifications:
// - Fail-closed when AUTH_SECRET is missing (500)
// - Expired tokens (401)
// - Tampered signatures (401)
// - Locked/disabled accounts (403)
// - Student cross-access isolation on profiles and attendance (403)
// - Attendance write permissions (403 for students)
// - D1 batch write errors (500, never false success)
// - Strict NaN / non-finite defense on stars reward
// - Direct login flow (/api/auth/token)

import assert from 'node:assert';
import { GET as getStudents, POST as postStudent } from '../src/routes/api/students/+server.js';
import { GET as getAttendance, POST as postAttendance } from '../src/routes/api/attendance/+server.js';
import { POST as postLogin } from '../src/routes/api/auth/token/+server.js';
import { createSignedToken, verifySignedToken, signData, verifyServerAuth } from '../src/lib/server/auth.js';
import { loginUser } from '../src/lib/unifiedStore.js';

console.log('========================================================================');
console.log('=== REAL HANDLERS SECURITY, HMAC CRYPTO & FAIL-CLOSED TEST SUITE ===');
console.log('========================================================================\n');

const TEST_SECRET = 'ephemeral_test_secret_hmac_2026_isolated_for_audit';
const mockPlatform = {
  env: {
    AUTH_SECRET: TEST_SECRET,
    ENABLE_LOCAL_MOCK: 'true'
  }
};
const productionNoDbPlatform = {
  env: {
    AUTH_SECRET: TEST_SECRET
  }
};

async function runRealHandlerTests() {
  const adminUser = { id: 'usr_super_1', username: 'admin', role: 'superadmin', status: 'active' };
  const teacherUser = { id: 'usr_super_2', username: 'msdung', role: 'teacher', status: 'active' };
  const studentUser = { id: 'usr_student_baokhiem', username: 'baokhiem', role: 'student', status: 'active' };
  const lockedUser = { id: 'usr_locked_1', username: 'locked_student', role: 'student', status: 'locked' };

  const validAdminToken = await createSignedToken(adminUser, TEST_SECRET);
  const validTeacherToken = await createSignedToken(teacherUser, TEST_SECRET);
  const validStudentToken = await createSignedToken(studentUser, TEST_SECRET);
  const validLockedToken = await createSignedToken(lockedUser, TEST_SECRET);
  const expiredToken = await createSignedToken(studentUser, TEST_SECRET, -10000); // 10s in past

  // -------------------------------------------------------------------------
  // TEST 1: FAIL-CLOSED: Request without platform AUTH_SECRET configured -> MUST return 500
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Fail-Closed defense when AUTH_SECRET is not configured ---');
  const reqNoSecret = new Request('http://localhost:5173/api/students', {
    headers: { 'authorization': `Bearer ${validAdminToken}` }
  });
  const resNoSecret = await getStudents({ url: new URL(reqNoSecret.url), request: reqNoSecret, platform: null });
  const jsonNoSecret = await resNoSecret.json();
  assert.strictEqual(resNoSecret.status, 500, 'Must return 500 when AUTH_SECRET is missing');
  assert.strictEqual(jsonNoSecret.success, false);
  assert(jsonNoSecret.error.includes('Fail-Closed'));
  console.log('✅ Fail-closed verified: missing secret rejected with 500:', jsonNoSecret.error);

  // -------------------------------------------------------------------------
  // TEST 2: Unauthenticated request (no token) -> MUST return 401
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Unauthenticated access rejection ---');
  const reqNoAuth = new Request('http://localhost:5173/api/students', { headers: {} });
  const resNoAuth = await getStudents({ url: new URL(reqNoAuth.url), request: reqNoAuth, platform: mockPlatform });
  const jsonNoAuth = await resNoAuth.json();
  assert.strictEqual(resNoAuth.status, 401);
  assert.strictEqual(jsonNoAuth.success, false);
  console.log('✅ Unauthenticated access returned 401:', jsonNoAuth.error);

  // -------------------------------------------------------------------------
  // TEST 3: Header spoofing attempt (x-user-id: admin) without valid token -> MUST return 401
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Header spoofing prevention (x-user-id without HMAC token) ---');
  const reqSpoofed = new Request('http://localhost:5173/api/students', {
    headers: { 'x-user-id': 'usr_super_1' }
  });
  const resSpoofed = await getStudents({ url: new URL(reqSpoofed.url), request: reqSpoofed, platform: mockPlatform });
  const jsonSpoofed = await resSpoofed.json();
  assert.strictEqual(resSpoofed.status, 401);
  assert.strictEqual(jsonSpoofed.success, false);
  console.log('✅ Header spoofing blocked with 401');

  // -------------------------------------------------------------------------
  // TEST 4: Tampered signature -> MUST return 401
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Tampered cryptographic signature rejection ---');
  const tamperedToken = validAdminToken.slice(0, -6) + 'abcdef';
  const reqTampered = new Request('http://localhost:5173/api/students', {
    headers: { 'authorization': `Bearer ${tamperedToken}` }
  });
  const resTampered = await getStudents({ url: new URL(reqTampered.url), request: reqTampered, platform: mockPlatform });
  const jsonTampered = await resTampered.json();
  assert.strictEqual(resTampered.status, 401);
  assert.strictEqual(jsonTampered.success, false);
  console.log('✅ Tampered signature blocked with 401:', jsonTampered.error);

  // -------------------------------------------------------------------------
  // TEST 5: Expired token -> MUST return 401
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Expired token rejection ---');
  const reqExpired = new Request('http://localhost:5173/api/students', {
    headers: { 'authorization': `Bearer ${expiredToken}` }
  });
  const resExpired = await getStudents({ url: new URL(reqExpired.url), request: reqExpired, platform: mockPlatform });
  const jsonExpired = await resExpired.json();
  assert.strictEqual(resExpired.status, 401);
  assert.strictEqual(jsonExpired.success, false);
  console.log('✅ Expired token blocked with 401:', jsonExpired.error);

  // -------------------------------------------------------------------------
  // TEST 6: Locked account token -> MUST return 403 Forbidden
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Locked/Disabled account token rejection ---');
  const d1WithLocked = {
    prepare(q) {
      return {
        bind(...args) {
          return {
            first: async () => ({ id: args[0], username: 'locked_student', role: 'student', status: 'locked' })
          };
        }
      };
    }
  };
  const reqLocked = new Request('http://localhost:5173/api/students', {
    headers: { 'authorization': `Bearer ${validLockedToken}` }
  });
  const resLocked = await getStudents({
    url: new URL(reqLocked.url),
    request: reqLocked,
    platform: { env: { AUTH_SECRET: TEST_SECRET, DB: d1WithLocked } }
  });
  const jsonLocked = await resLocked.json();
  assert.strictEqual(resLocked.status, 403, 'Locked account must be returned 403 Forbidden');
  assert.strictEqual(jsonLocked.success, false);
  console.log('✅ Locked account blocked with 403:', jsonLocked.error);

  // -------------------------------------------------------------------------
  // TEST 7: Student cross-access: Student A attempting to read all students -> MUST return 403
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Student role isolation (listing student directory) ---');
  const reqStudentAll = new Request('http://localhost:5173/api/students', {
    headers: { 'authorization': `Bearer ${validStudentToken}` }
  });
  const resStudentAll = await getStudents({ url: new URL(reqStudentAll.url), request: reqStudentAll, platform: mockPlatform });
  const jsonStudentAll = await resStudentAll.json();
  assert.strictEqual(resStudentAll.status, 403);
  assert.strictEqual(jsonStudentAll.success, false);
  console.log('✅ Student blocked from reading all students with 403:', jsonStudentAll.error);

  // -------------------------------------------------------------------------
  // TEST 8: Student cross-access: Student A trying to read Student B's profile -> MUST return 403
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: Cross-student privacy isolation ---');
  const reqStudentOther = new Request('http://localhost:5173/api/students?id=usr_student_daian', {
    headers: { 'authorization': `Bearer ${validStudentToken}` }
  });
  const resStudentOther = await getStudents({ url: new URL(reqStudentOther.url), request: reqStudentOther, platform: mockPlatform });
  const jsonStudentOther = await resStudentOther.json();
  assert.strictEqual(resStudentOther.status, 403);
  assert.strictEqual(jsonStudentOther.success, false);
  console.log('✅ Cross-student profile access blocked with 403:', jsonStudentOther.error);

  // -------------------------------------------------------------------------
  // TEST 9: Student reading own profile -> 200 & NO password field
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 9: Student reading own profile & password sanitization ---');
  const reqStudentSelf = new Request('http://localhost:5173/api/students?id=usr_student_baokhiem', {
    headers: { 'authorization': `Bearer ${validStudentToken}` }
  });
  const resStudentSelf = await getStudents({ url: new URL(reqStudentSelf.url), request: reqStudentSelf, platform: mockPlatform });
  const jsonStudentSelf = await resStudentSelf.json();
  assert.strictEqual(resStudentSelf.status, 200);
  assert.strictEqual(jsonStudentSelf.success, true);
  assert.strictEqual(jsonStudentSelf.student.id, 'usr_student_baokhiem');
  assert.strictEqual(jsonStudentSelf.student.password, undefined, 'Password MUST be stripped!');
  console.log('✅ Student own profile returned 200 with sanitized password = undefined');

  // -------------------------------------------------------------------------
  // TEST 10: Attendance cross-access: Student A attempting to read Student B attendance -> 403
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 10: Attendance cross-student privacy isolation ---');
  const reqAttCross = new Request('http://localhost:5173/api/attendance?student_id=usr_student_daian', {
    headers: { 'authorization': `Bearer ${validStudentToken}` }
  });
  const resAttCross = await getAttendance({ url: new URL(reqAttCross.url), request: reqAttCross, platform: mockPlatform });
  const jsonAttCross = await resAttCross.json();
  assert.strictEqual(resAttCross.status, 403);
  console.log('✅ Cross-student attendance view blocked with 403:', jsonAttCross.error);

  // -------------------------------------------------------------------------
  // TEST 11: Attendance POST role check (student blocked) -> 403
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 11: Attendance POST role check (student blocked) ---');
  const reqAttStudent = new Request('http://localhost:5173/api/attendance', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${validStudentToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: 's1', students: [{ student_id: 'st1' }] })
  });
  const resAttStudent = await postAttendance({ request: reqAttStudent, platform: mockPlatform });
  const jsonAttStudent = await resAttStudent.json();
  assert.strictEqual(resAttStudent.status, 403);
  console.log('✅ Student blocked from posting attendance with 403:', jsonAttStudent.error);

  // -------------------------------------------------------------------------
  // TEST 12: Attendance POST D1 failure -> MUST return 500 error
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 12: Attendance POST D1 failure error handling ---');
  const failingD1 = {
    prepare(q) {
      return {
        bind: (...args) => ({
          first: async () => ({ id: args[0], role: 'teacher', username: 'msdung', status: 'active' }),
          args
        })
      };
    },
    async batch() {
      throw new Error('D1 database connection error simulated');
    }
  };
  const reqAttFail = new Request('http://localhost:5173/api/attendance', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${validTeacherToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: 'sess_g7_mon',
      students: [{ student_id: 'usr_student_baokhiem', status: 'present' }]
    })
  });
  const resAttFail = await postAttendance({
    request: reqAttFail,
    platform: { env: { AUTH_SECRET: TEST_SECRET, DB: failingD1 } }
  });
  const jsonAttFail = await resAttFail.json();
  assert.strictEqual(resAttFail.status, 500, 'D1 batch failure MUST return status 500');
  assert.strictEqual(jsonAttFail.success, false);
  assert(jsonAttFail.error.includes('D1 database connection error simulated'));
  console.log('✅ D1 failure properly caught and returned HTTP 500:', jsonAttFail.error);

  // -------------------------------------------------------------------------
  // TEST 13: Attendance POST NaN and non-finite defense
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 13: Attendance POST NaN & Non-finite defense ---');
  let capturedStatements = [];
  const successfulD1 = {
    prepare(q) {
      return {
        bind(...args) {
          if (q.includes('INSERT INTO attendance_records')) {
            capturedStatements.push(args);
          }
          return {
            first: async () => ({ id: args[0], role: 'teacher', username: 'msdung', status: 'active' }),
            args
          };
        }
      };
    },
    async batch(stmts) {
      return stmts.map(() => ({ success: true }));
    }
  };

  const reqAttSuccess = new Request('http://localhost:5173/api/attendance', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${validTeacherToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: 'sess_g7_mon',
      session_date: '2026-09-25',
      students: [
        { student_id: 'usr_student_baokhiem', status: 'present' }, // instant_stars omitted -> 5
        { student_id: 'usr_student_daian', status: 'absent_excused', instant_stars_rewarded: 'invalid_str' }, // NaN -> 0
        { student_id: 'usr_student_hung', status: 'present', instant_stars_rewarded: -50 }, // negative -> 5
        { student_id: 'usr_student_mai', status: 'present', instant_stars_rewarded: 10 } // valid -> 10
      ]
    })
  });

  const resAttSuccess = await postAttendance({
    request: reqAttSuccess,
    platform: { env: { AUTH_SECRET: TEST_SECRET, DB: successfulD1 } }
  });
  const jsonAttSuccess = await resAttSuccess.json();
  assert.strictEqual(resAttSuccess.status, 200);
  assert.strictEqual(jsonAttSuccess.success, true);
  assert.strictEqual(capturedStatements.length, 4);
  assert.strictEqual(capturedStatements[0][9], 5);
  assert.strictEqual(capturedStatements[1][9], 0);
  assert.strictEqual(capturedStatements[2][9], 5);
  assert.strictEqual(capturedStatements[3][9], 10);
  for (const s of capturedStatements) {
    assert(Number.isFinite(s[9]), 'Stars must always be a finite number');
    assert(!isNaN(s[9]), 'Stars must never be NaN');
  }
  console.log('✅ NaN defense confirmed for all 4 test records: [5, 0, 5, 10]');

  // -------------------------------------------------------------------------
  // TEST 14: Direct login flow (/api/auth/token)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 14: Direct Login Endpoint (/api/auth/token) ---');
  // 14a. Missing secret -> 500 (Fail-Closed)
  const reqLoginNoSecret = new Request('http://localhost:5173/api/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123' })
  });
  const resLoginNoSecret = await postLogin({ request: reqLoginNoSecret, platform: null });
  assert.strictEqual(resLoginNoSecret.status, 500);
  console.log('✅ Login without server secret returned 500 (Fail-Closed)');

  // 14b. Valid login -> 200, JWT token, stripped password
  const reqLoginValid = new Request('http://localhost:5173/api/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  const resLoginValid = await postLogin({ request: reqLoginValid, platform: mockPlatform });
  const jsonLoginValid = await resLoginValid.json();
  assert.strictEqual(resLoginValid.status, 200);
  assert.strictEqual(jsonLoginValid.success, true);
  assert(jsonLoginValid.token.includes('.'));
  assert.strictEqual(jsonLoginValid.user.password, undefined);
  console.log('✅ Valid login issued signed token and stripped password');

  // 14c. Invalid password -> 401
  const reqLoginBad = new Request('http://localhost:5173/api/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
  });
  const resLoginBad = await postLogin({ request: reqLoginBad, platform: mockPlatform });
  assert.strictEqual(resLoginBad.status, 401);
  console.log('✅ Invalid login rejected with 401');

  // -------------------------------------------------------------------------
  // TEST 15: D1 Fail-Closed isolation (No local mock fallback when D1 fails/absent)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 15: D1 Database Fail-Closed Defense (No local store leak) ---');
  for (const mode of ['d1-error', 'd1-user-absent']) {
    const DB = {
      prepare() {
        return {
          bind() {
            return {
              first: async () => {
                if (mode === 'd1-error') throw new Error('simulated D1 connection error');
                return null; // user absent
              }
            };
          }
        };
      }
    };
    const platform = { env: { AUTH_SECRET: TEST_SECRET, DB } };
    const reqLogin = new Request('http://localhost:5173/api/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    });
    const resLogin = await postLogin({ request: reqLogin, platform });
    const expectedStatus = mode === 'd1-error' ? 500 : 401;
    assert.strictEqual(resLogin.status, expectedStatus, `Login under ${mode} must return ${expectedStatus}`);

    const resAuth = await verifyServerAuth(
      new Request('http://localhost:5173', { headers: { authorization: 'Bearer ' + validAdminToken } }),
      platform
    );
    assert.strictEqual(resAuth.authenticated, false, `Auth under ${mode} must be rejected`);
    assert.strictEqual(resAuth.status, expectedStatus, `Auth status under ${mode} must return ${expectedStatus}`);
    console.log(`✅ ${mode}: login=${resLogin.status}, auth=${resAuth.status} (rejection confirmed, zero mock fallback)`);
  }

  // -------------------------------------------------------------------------
  // TEST 16: Frontend loginUser offline/failure fail-closed defense
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 16: Frontend loginUser network failure fail-closed defense ---');
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('audit simulated offline'); };
    const r = await loginUser('admin', 'admin');
    assert.strictEqual(r.success, false, 'loginUser must return success: false when network/server fails');
    assert.strictEqual(r.token, undefined, 'loginUser must not return any token on network failure');
    console.log('✅ loginUser network failure defense confirmed (zero local mock login)');
  } finally {
    globalThis.fetch = prevFetch;
  }

  // -------------------------------------------------------------------------
  // TEST 17: Production without DB binding must return 500 (Fail-Closed, no silent mock leak)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 17: Production without DB binding must return 500 (No silent mock leak) ---');
  const reqLoginProd = new Request('http://localhost:5173/api/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  const resLoginProd = await postLogin({ request: reqLoginProd, platform: productionNoDbPlatform });
  assert.strictEqual(resLoginProd.status, 500, 'Must return 500 in production when DB binding is missing');
  const jsonLoginProd = await resLoginProd.json();
  assert(jsonLoginProd.error.includes('Fail-Closed'));

  const resAuthProd = await verifyServerAuth(
    new Request('http://localhost:5173', { headers: { authorization: 'Bearer ' + validAdminToken } }),
    productionNoDbPlatform
  );
  assert.strictEqual(resAuthProd.authenticated, false);
  assert.strictEqual(resAuthProd.status, 500);
  console.log('✅ Production without DB binding strictly rejected with 500 (Fail-Closed)');

  console.log('\n========================================================================');
  console.log('🎉 ALL 17 REAL HANDLER SECURITY & AUDIT SUITE TESTS PASSED 100%! 🎉');
  console.log('========================================================================');
}

runRealHandlerTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

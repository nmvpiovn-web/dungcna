// tests/security-kimi-audit-20261006.test.js
// Regression tests for the 2026-10-06 Kimi security audit fixes (worker: Kimi via Mirai).
// Covers: constant-time secret comparison, sid fail-closed, login brute-force
// rate limiting, anti-enumeration timing equalization, generic 500 messages,
// and constant-time CRON_SECRET comparison.

import { test } from 'node:test';
import assert from 'node:assert';
import {
  constantTimeEqual,
  signData,
  base64UrlEncode,
  verifySignedToken,
  verifyPassword,
  hashPassword,
  verifyServerAuth
} from '../src/lib/server/auth.js';
import { POST as postLogin } from '../src/routes/api/auth/token/+server.js';
import { GET as drivePollGet } from '../src/routes/api/drive/poll/+server.js';

const SECRET = 'kimi-audit-regression-secret-20261006';
const mockPlatform = { env: { AUTH_SECRET: SECRET, ENABLE_LOCAL_MOCK: 'true' } };

function loginRequest(username, password, ip) {
  const headers = { 'content-type': 'application/json' };
  if (ip) headers['cf-connecting-ip'] = ip;
  return new Request('http://localhost/api/auth/token', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password })
  });
}

// ---------------------------------------------------------------------------
test('constantTimeEqual: equal strings match, differing strings do not', () => {
  assert.strictEqual(constantTimeEqual('abcdef', 'abcdef'), true);
  assert.strictEqual(constantTimeEqual('abcdef', 'abcdeg'), false);
  assert.strictEqual(constantTimeEqual('abc', 'abcd'), false); // different length
  assert.strictEqual(constantTimeEqual('', ''), true);
  assert.strictEqual(constantTimeEqual('', 'x'), false);
});

// ---------------------------------------------------------------------------
test('verifySignedToken: tampered signature is rejected', async () => {
  const payloadStr = base64UrlEncode(JSON.stringify({ id: 'u1', sid: 's1', exp: Date.now() + 60000 }));
  const sig = await signData(payloadStr, SECRET);
  const good = await verifySignedToken(`${payloadStr}.${sig}`, SECRET);
  assert.ok(good && good.id === 'u1', 'valid token must verify');

  const tamperedSig = sig.slice(0, -2) + (sig.endsWith('aa') ? 'bb' : 'aa');
  const bad = await verifySignedToken(`${payloadStr}.${tamperedSig}`, SECRET);
  assert.strictEqual(bad, null, 'tampered signature must be rejected');
});

// ---------------------------------------------------------------------------
test('verifyPassword: correct verifies, wrong does not (constant-time path)', async () => {
  const hash = await hashPassword('correct-horse');
  assert.strictEqual(await verifyPassword('correct-horse', hash), true);
  assert.strictEqual(await verifyPassword('wrong-horse', hash), false);
  assert.strictEqual(await verifyPassword('x', 'pbkdf2:100000:' + '0'.repeat(32) + ':' + '0'.repeat(64)), false);
});

// ---------------------------------------------------------------------------
test('verifyServerAuth: token without sid is rejected (fail-closed, revocable sessions only)', async () => {
  // Craft a correctly-signed token that lacks a session id
  const payloadStr = base64UrlEncode(JSON.stringify({
    id: 'teacher.john', username: 'teacher.john', role: 'teacher',
    exp: Date.now() + 3600000
  }));
  const sig = await signData(payloadStr, SECRET);
  const token = `${payloadStr}.${sig}`;

  const res = await verifyServerAuth(
    new Request('http://localhost/', { headers: { authorization: `Bearer ${token}` } }),
    mockPlatform
  );
  assert.strictEqual(res.authenticated, false);
  assert.strictEqual(res.status, 401);
  assert.match(res.error, /sid/);
});

// ---------------------------------------------------------------------------
test('login: missing user and wrong password return the identical 401 message (no enumeration)', async () => {
  const r1 = await postLogin({ request: loginRequest('no_such_user_xyz', 'whatever', '10.0.0.1'), platform: mockPlatform });
  const j1 = await r1.json();
  const r2 = await postLogin({ request: loginRequest('teacher.john', 'definitely-wrong', '10.0.0.2'), platform: mockPlatform });
  const j2 = await r2.json();
  assert.strictEqual(r1.status, 401);
  assert.strictEqual(r2.status, 401);
  assert.strictEqual(j1.error, j2.error, 'error text must not reveal whether the user exists');
  assert.strictEqual(j1.error, 'Tên đăng nhập hoặc mật khẩu không chính xác');
});

// ---------------------------------------------------------------------------
test('login: brute-force rate limit returns 429 after too many attempts', async () => {
  const username = 'ratelimit_probe_user';
  const ip = '10.9.9.9';
  let seen401 = 0;
  let seen429 = 0;
  for (let i = 0; i < 56; i++) {
    const res = await postLogin({ request: loginRequest(username, 'wrongpw', ip), platform: mockPlatform });
    if (res.status === 401) seen401++;
    else if (res.status === 429) seen429++;
    else assert.fail(`unexpected status ${res.status} on attempt ${i}`);
    await res.text(); // drain
  }
  assert.ok(seen401 > 0, 'early attempts must be 401');
  assert.ok(seen429 > 0, `expected 429s after the limit, got 401=${seen401} 429=${seen429}`);
});

// ---------------------------------------------------------------------------
test('login: IP-wide bucket stops credential-stuffing across rotated usernames', async () => {
  const ip = '10.8.8.8';
  let seen429 = 0;
  for (let i = 0; i < 310; i++) {
    const res = await postLogin({
      request: loginRequest(`rotating_user_${i}`, 'wrongpw', ip),
      platform: mockPlatform
    });
    if (res.status === 429) seen429++;
    await res.text();
  }
  assert.ok(seen429 > 0, `expected 429s from the IP-wide bucket, got ${seen429}`);
});

// ---------------------------------------------------------------------------
test('login: D1 failure returns generic 500 without leaking raw error text', async () => {
  const DB = {
    prepare() {
      return { bind() { return { first: async () => { throw new Error('simulated D1 connection error'); } }; } };
    }
  };
  const platform = { env: { AUTH_SECRET: SECRET, DB } };
  const res = await postLogin({ request: loginRequest('admin', 'x', '10.0.0.3'), platform });
  const body = await res.text();
  assert.strictEqual(res.status, 500);
  assert.ok(!body.includes('simulated D1 connection error'), 'raw DB error must not leak to client');
  assert.ok(!body.includes('Error:'), 'no raw exception text in response');
});

// ---------------------------------------------------------------------------
test('drive poll: correct CRON_SECRET passes auth (constant-time compare), wrong secret is 401', async () => {
  const platform = { env: { CRON_SECRET: 's3cr3t' } };
  const okReq = new Request('http://localhost/api/drive/poll', { headers: { 'x-cron-secret': 's3cr3t' } });
  const okRes = await drivePollGet({ request: okReq, platform });
  assert.notStrictEqual(okRes.status, 401, 'correct secret must pass the cron auth gate');

  const badReq = new Request('http://localhost/api/drive/poll', { headers: { 'x-cron-secret': 'wrong' } });
  const badRes = await drivePollGet({ request: badReq, platform });
  assert.strictEqual(badRes.status, 401, 'wrong secret must be rejected');
});

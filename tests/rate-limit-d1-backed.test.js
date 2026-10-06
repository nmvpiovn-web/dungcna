// tests/rate-limit-d1-backed.test.js
// Regression tests for round-3 live-audit findings (2026-10-06, Kimi via Mirai):
//  - F1: login rate limit was per-isolate Map -> 60 bad logins produced 0x429 on prod.
//        Fix: D1-backed sliding window (migration 0015), shared across isolates.
//  - F2: POST /api/auth/register had no rate limit (15 accounts < 1 min).
//        Fix: 10/hour/IP, D1-backed.
// Uses node:sqlite (real SQL) wrapped in a minimal D1-compatible mock.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { checkRateLimit, getClientIp } from '../src/lib/server/rateLimit.js';
import { POST as postLogin } from '../src/routes/api/auth/token/+server.js';
import { POST as postRegister } from '../src/routes/api/auth/register/+server.js';

const SECRET = 'rate-limit-regression-secret-20261006';

// Minimal D1-compatible wrapper over node:sqlite.
function makeMockD1() {
  const db = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../migrations/0015_rate_limits.sql', import.meta.url), 'utf8');
  db.exec(migration);
  // login route also touches `users` (empty -> 401 path)
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, email TEXT, phone TEXT, password TEXT)`);
  return {
    __db: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...params) {
          return {
            run() { stmt.run(...params); return { success: true }; },
            first() { return stmt.get(...params) ?? null; },
            all() { return { results: stmt.all(...params) }; }
          };
        }
      };
    }
  };
}

function reqWithIp(path, body, ip) {
  const headers = { 'content-type': 'application/json' };
  if (ip) headers['cf-connecting-ip'] = ip;
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
test('checkRateLimit: allows up to limit, denies beyond, windows are independent per key', async () => {
  const d1 = makeMockD1();
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(await checkRateLimit(d1, { key: 'k1', limit: 3, windowMs: 60000 }), true, `attempt ${i + 1} allowed`);
  }
  assert.strictEqual(await checkRateLimit(d1, { key: 'k1', limit: 3, windowMs: 60000 }), false, '4th attempt denied');
  // independent key unaffected
  assert.strictEqual(await checkRateLimit(d1, { key: 'k2', limit: 3, windowMs: 60000 }), true);
});

test('checkRateLimit: window expiry resets the counter', async () => {
  const d1 = makeMockD1();
  assert.strictEqual(await checkRateLimit(d1, { key: 'w', limit: 1, windowMs: 40 }), true);
  assert.strictEqual(await checkRateLimit(d1, { key: 'w', limit: 1, windowMs: 40 }), false);
  await sleep(70);
  assert.strictEqual(await checkRateLimit(d1, { key: 'w', limit: 1, windowMs: 40 }), true, 'counter resets after window');
});

test('checkRateLimit: db=null and throwing db fall back to in-memory (never throws)', async () => {
  assert.strictEqual(await checkRateLimit(null, { key: 'f1', limit: 2, windowMs: 60000 }), true);
  assert.strictEqual(await checkRateLimit(null, { key: 'f1', limit: 2, windowMs: 60000 }), true);
  assert.strictEqual(await checkRateLimit(null, { key: 'f1', limit: 2, windowMs: 60000 }), false);
  const badDb = { prepare() { throw new Error('d1 down'); } };
  assert.strictEqual(await checkRateLimit(badDb, { key: 'f2', limit: 1, windowMs: 60000 }), true);
  assert.strictEqual(await checkRateLimit(badDb, { key: 'f2', limit: 1, windowMs: 60000 }), false);
});

test('getClientIp: prefers cf-connecting-ip, falls back to x-forwarded-for, then unknown', () => {
  assert.strictEqual(getClientIp(new Request('http://x/', { headers: { 'cf-connecting-ip': '1.2.3.4' } })), '1.2.3.4');
  assert.strictEqual(getClientIp(new Request('http://x/', { headers: { 'x-forwarded-for': '5.6.7.8, 9.9.9.9' } })), '5.6.7.8');
  assert.strictEqual(getClientIp(new Request('http://x/')), 'unknown');
});

// ---------------------------------------------------------------------------
test('login: 60 consecutive bad logins from one IP+D1 -> 429s appear (D1-backed, not per-isolate)', async () => {
  const d1 = makeMockD1();
  const platform = { env: { AUTH_SECRET: SECRET, DB: d1 } };
  const ip = '203.0.113.77';
  let count429 = 0;
  let count401 = 0;
  for (let i = 0; i < 60; i++) {
    const res = await postLogin({
      request: reqWithIp('/api/auth/token', { username: 'no_such_user', password: 'wrong' }, ip),
      platform,
      cookies: { set() {} }
    });
    if (res.status === 429) count429++;
    else if (res.status === 401) count401++;
    else assert.fail(`unexpected status ${res.status}`);
  }
  assert.strictEqual(count401, 50, 'first 50 attempts -> 401');
  assert.strictEqual(count429, 10, 'attempts 51-60 -> 429 (proves the bucket is shared, not per-isolate)');
  const body = await (await postLogin({
    request: reqWithIp('/api/auth/token', { username: 'no_such_user', password: 'wrong' }, ip),
    platform, cookies: { set() {} }
  })).json();
  assert.match(body.error, /quá nhiều|TooManyRequests/i);
});

test('login: unknown IP skips rate limiting (no shared-bucket lockout)', async () => {
  const d1 = makeMockD1();
  const platform = { env: { AUTH_SECRET: SECRET, DB: d1 } };
  for (let i = 0; i < 55; i++) {
    const res = await postLogin({
      request: reqWithIp('/api/auth/token', { username: 'ghost', password: 'x' }, null),
      platform,
      cookies: { set() {} }
    });
    assert.strictEqual(res.status, 401, 'unknown IP never 429s');
  }
});

// ---------------------------------------------------------------------------
test('register: 11th account from same IP within the hour -> 429 (was: unlimited)', async () => {
  const platform = { env: { AUTH_SECRET: SECRET, ENABLE_LOCAL_MOCK: 'true' } }; // no DB -> local mock path + in-memory fallback
  const ip = '198.51.100.23';
  let okCount = 0;
  let status429at = -1;
  for (let i = 0; i < 12; i++) {
    const res = await postRegister({
      request: reqWithIp('/api/auth/register', {
        usernameOrPhone: `spamuser${i}`,
        name: `Spam ${i}`,
        password: 'secret123',
        role: 'student'
      }, ip),
      platform
    });
    if (res.status === 201) okCount++;
    if (res.status === 429 && status429at === -1) status429at = i + 1;
    assert.ok([201, 429].includes(res.status), `unexpected status ${res.status} at attempt ${i + 1}`);
  }
  assert.strictEqual(okCount, 10, 'first 10 registrations succeed');
  assert.strictEqual(status429at, 11, '11th registration is rate-limited with 429');
});

test('register: different IPs have independent buckets', async () => {
  const platform = { env: { AUTH_SECRET: SECRET, ENABLE_LOCAL_MOCK: 'true' } };
  for (let i = 0; i < 10; i++) {
    const res = await postRegister({
      request: reqWithIp('/api/auth/register', {
        usernameOrPhone: `other${i}`, name: `O ${i}`, password: 'secret123', role: 'student'
      }, '192.0.2.99'),
      platform
    });
    assert.strictEqual(res.status, 201);
  }
  // first IP's bucket is exhausted, but a fresh IP still works
  const res = await postRegister({
    request: reqWithIp('/api/auth/register', {
      usernameOrPhone: 'freshuser1', name: 'Fresh', password: 'secret123', role: 'student'
    }, '192.0.2.100'),
    platform
  });
  assert.strictEqual(res.status, 201);
});

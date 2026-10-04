import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET, POST } from '../src/routes/api/drive/poll/+server.js';
import { runDriveSync } from '../src/lib/server/driveSync.js';

const secret = 'drive-poll-test-secret';
const CRON_SECRET = 'test-cron-secret-123';

function makePlatform({ dbState = {}, driveOk = true } = {}) {
  const queries = [];
  const DB = {
    prepare(sql) {
      const stmt = {
        bind(...params) {
          return {
            async first() {
              queries.push({ sql, params, op: 'first' });
              if (sql.includes('FROM users')) {
                const role = dbState.userRole;
                return role ? { id: `user-${role}`, username: role, role, status: 'active', metadata: '{}' } : null;
              }
              if (sql.includes('FROM auth_sessions')) {
                return dbState.userRole ? { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' } : null;
              }
              if (sql.includes('FROM drive_sync_state')) {
                return dbState.syncState || null;
              }
              return null;
            },
            async all() { return { results: [] }; },
            async run() {
              queries.push({ sql, params, op: 'run' });
              if (dbState.failWrite) throw new Error('D1 write failed');
              return { meta: { last_row_id: 1 } };
            }
          };
        },
        async first() {
          queries.push({ sql, params: [], op: 'first' });
          if (sql.includes('FROM drive_sync_state')) return dbState.syncState || null;
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          queries.push({ sql, params: [], op: 'run' });
          if (dbState.failWrite) throw new Error('D1 write failed');
          return { meta: { last_row_id: 1 } };
        }
      };
      return stmt;
    }
  };
  return {
    env: {
      DB,
      AUTH_SECRET: secret,
      CRON_SECRET,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@test.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'test-private-key',
      DRIVE_TEST_TOKEN: 'test-drive-token'
    },
    _queries: queries
  };
}

async function authedRequest(role, cronSecret = null) {
  const headers = {};
  if (role) {
    const user = { id: `user-${role}`, username: role, role };
    const token = await createSignedToken(user, secret, 60_000, 'test-session');
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (cronSecret) headers['x-cron-secret'] = cronSecret;
  return new Request('https://timbk.io.vn/api/drive/poll', { headers });
}

// Mock fetch cho Google Drive API
const origFetch = global.fetch;

test('GET không auth trả 401', async () => {
  const platform = makePlatform();
  const req = await authedRequest(null);
  const res = await GET({ request: req, platform });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('GET sai cron secret trả 401', async () => {
  const platform = makePlatform();
  const req = await authedRequest(null, 'wrong-secret');
  const res = await GET({ request: req, platform });
  assert.equal(res.status, 401);
});

test('GET đúng cron secret nhưng không lộ page token/tên file', async () => {
  const platform = makePlatform({ dbState: { syncState: { last_change_token: 'token123' } } });
  // Mock Drive API trả về changes
  global.fetch = async (url) => ({
    ok: true,
    json: async () => ({
      changes: [{ fileId: 'file1', file: { name: 'secret.doc' } }],
      newStartPageToken: 'token456'
    })
  });
  try {
    const req = await authedRequest(null, CRON_SECRET);
    const res = await GET({ request: req, platform });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.has_changes, true);
    // KHÔNG lộ page token, tên file, ID
    assert.ok(!('page_token' in body), 'page_token bị lộ');
    assert.ok(!('changes' in body) || !body.changes?.[0]?.name, 'tên file bị lộ');
    // KHÔNG advance token (chỉ update last_poll_at)
    const tokenUpdates = platform._queries.filter(q =>
      q.sql.includes('UPDATE drive_sync_state') && q.sql.includes('last_change_token')
    );
    assert.equal(tokenUpdates.length, 0, 'GET đã advance token!');
  } finally {
    global.fetch = origFetch;
  }
});

test('GET teacher (không phải manager) trả 401', async () => {
  const platform = makePlatform({ dbState: { userRole: 'teacher' } });
  const req = await authedRequest('teacher');
  const res = await GET({ request: req, platform });
  assert.equal(res.status, 401);
});

test('GET manager được phép', async () => {
  const platform = makePlatform({ dbState: { userRole: 'leader', syncState: { last_change_token: 't1' } } });
  global.fetch = async () => ({ ok: true, json: async () => ({ changes: [], newStartPageToken: 't1' }) });
  try {
    const req = await authedRequest('leader');
    const res = await GET({ request: req, platform });
    assert.equal(res.status, 200);
  } finally {
    global.fetch = origFetch;
  }
});

test('POST không auth trả 401', async () => {
  const platform = makePlatform();
  const req = await authedRequest(null);
  const res = await POST({ request: req, platform });
  assert.equal(res.status, 401);
});

test('POST Drive API lỗi trả 502 fail-closed', async () => {
  const platform = makePlatform({ dbState: { syncState: { last_change_token: 't1' } } });
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const req = await authedRequest(null, CRON_SECRET);
    const res = await POST({ request: req, platform });
    const body = await res.json();
    assert.equal(body.success, false, 'Phải fail-closed khi Drive lỗi');
  } finally {
    global.fetch = origFetch;
  }
});

test('GET lần đầu không ghi token hay last_poll_at', async () => {
  const platform = makePlatform();
  global.fetch = async () => ({ ok: true, json: async () => ({ startPageToken: 'initial-token' }) });
  try {
    const res = await GET({ request: await authedRequest(null, CRON_SECRET), platform });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).needs_initialization, true);
    assert.equal(platform._queries.filter((q) => q.op === 'run').length, 0);
  } finally {
    global.fetch = origFetch;
  }
});

test('GET đọc hết nextPageToken và không ghi state', async () => {
  const platform = makePlatform({ dbState: { syncState: { last_change_token: 'page-1' } } });
  const requested = [];
  global.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).includes('pageToken=page-1')) {
      return { ok: true, json: async () => ({ changes: [{ fileId: 'a' }], nextPageToken: 'page-2' }) };
    }
    return { ok: true, json: async () => ({ changes: [{ fileId: 'b' }], newStartPageToken: 'page-3' }) };
  };
  try {
    const res = await GET({ request: await authedRequest(null, CRON_SECRET), platform });
    const body = await res.json();
    assert.equal(body.change_count, 2);
    assert.equal(requested.length, 2);
    assert.equal(platform._queries.filter((q) => q.op === 'run').length, 0);
  } finally {
    global.fetch = origFetch;
  }
});

test('runDriveSync từ chối folder ngoài allowlist trước khi gọi Drive', async () => {
  const platform = makePlatform();
  let fetched = false;
  global.fetch = async () => { fetched = true; throw new Error('không được gọi'); };
  try {
    const result = await runDriveSync(platform, { folder_id: 'untrusted-folder' });
    assert.equal(result.success, false);
    assert.equal(result.error, 'DriveFolderNotAllowed');
    assert.equal(fetched, false);
  } finally {
    global.fetch = origFetch;
  }
});

test('runDriveSync cập nhật đúng text log id và fail khi có lỗi từng phần', async () => {
  const platform = makePlatform();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ error: { message: 'list failed' } }),
    text: async () => ''
  });
  try {
    const result = await runDriveSync(platform);
    assert.equal(result.success, false);
    assert.equal(result.error, 'DriveSyncIncomplete');
    assert.match(result.log_id, /^dsl_/);
    const finalUpdate = platform._queries.find((q) => q.op === 'run' && q.sql.includes('UPDATE drive_sync_logs') && q.sql.includes('status = ?'));
    assert.equal(finalUpdate.params[0], 'failed');
    assert.equal(finalUpdate.params.at(-1), result.log_id);
  } finally {
    global.fetch = origFetch;
  }
});

test('POST không commit change token khi sync lỗi', async () => {
  const platform = makePlatform({ dbState: { syncState: { last_change_token: 'old-token' } } });
  global.fetch = async (url) => {
    if (String(url).includes('/changes?')) {
      return { ok: true, json: async () => ({ changes: [{ fileId: 'a' }], newStartPageToken: 'new-token' }) };
    }
    return { ok: true, json: async () => ({ error: { message: 'list failed' } }), text: async () => '' };
  };
  try {
    const res = await POST({ request: await authedRequest(null, CRON_SECRET), platform });
    assert.equal(res.status, 500);
    const tokenWrites = platform._queries.filter((q) => q.op === 'run' && q.sql.includes('drive_sync_state'));
    assert.equal(tokenWrites.length, 0);
  } finally {
    global.fetch = origFetch;
  }
});

test('token 410: GET không xóa state, POST mới khởi tạo lại', async () => {
  const platform = makePlatform({ dbState: { syncState: { last_change_token: 'expired-token' } } });
  global.fetch = async (url) => {
    if (String(url).includes('startPageToken')) {
      return { ok: true, json: async () => ({ startPageToken: 'replacement-token' }) };
    }
    return { ok: false, status: 410, json: async () => ({ error: { code: 410 } }) };
  };
  try {
    const getRes = await GET({ request: await authedRequest(null, CRON_SECRET), platform });
    assert.equal(getRes.status, 410);
    assert.equal(platform._queries.filter((q) => q.op === 'run').length, 0);

    const postRes = await POST({ request: await authedRequest(null, CRON_SECRET), platform });
    assert.equal(postRes.status, 200);
    assert.equal((await postRes.json()).initialized, true);
    const stateWrite = platform._queries.find((q) => q.op === 'run' && q.sql.includes('INSERT INTO drive_sync_state'));
    assert.equal(stateWrite.params[0], 'replacement-token');
  } finally {
    global.fetch = origFetch;
  }
});

// Regression tests cho fix driveSync (DeepSeek data worker, 2026-10-06):
// 1. Không còn FTS full rebuild sau mỗi batch (triggers 0002 đã lo liệu)
// 2. Giữ content_markdown cũ khi trích xuất lại thất bại (không ghi đè placeholder)
// 3. 401 -> invalidate token cache + retry 1 lần
// 4. 429/503 -> backoff retry 1 lần
import test from 'node:test';
import assert from 'node:assert/strict';
import { runDriveSync } from '../src/lib/server/driveSync.js';

function jsonRes(obj, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    json: async () => obj,
    text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)),
    arrayBuffer: async () => new TextEncoder().encode(typeof obj === 'string' ? obj : JSON.stringify(obj)).buffer
  };
}

// Fake D1 tối thiểu cho runDriveSync: ghi log SQL để assert, lưu knowledge_vault trong Map
function makeFakeDb(seedVault = new Map()) {
  const vault = new Map(seedVault);
  const sqlLog = [];
  const db = {
    sqlLog, vault,
    prepare(sql) {
      const entry = { sql, params: null };
      sqlLog.push(entry);
      const api = {
        bind(...params) {
          entry.params = params;
          return {
            first: async () => {
              if (sql.includes('FROM knowledge_vault WHERE id = ?')) {
                const row = vault.get(params[0]);
                return row ? { source_hash: row.source_hash, content_markdown: row.content_markdown } : null;
              }
              return null; // site_settings / khác
            },
            all: async () => ({ results: [] }),
            run: async () => {
              if (sql.includes('INSERT INTO drive_sync_logs')) return { meta: { last_row_id: 7 } };
              if (sql.includes('INSERT INTO knowledge_vault')) {
                const [id, title, folder, category, tags, source_path, source_hash, content_markdown] = params;
                vault.set(id, { id, title, folder, category, tags, source_path, source_hash, content_markdown, status: 'published' });
                return {};
              }
              return {}; // UPDATE drive_sync_logs
            }
          };
        },
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({})
      };
      return api;
    }
  };
  return db;
}

function makePlatform(db) {
  return {
    env: {
      DB: db,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 't@t.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'fake-key',
      DRIVE_TEST_TOKEN: 'tok-test',
      DRIVE_SYNC_ALLOWED_FOLDER_IDS: 'folder-root'
    }
  };
}

const GDOC = { id: 'doc1', name: 'De thi.txt', mimeType: 'text/plain', modifiedTime: '2026-10-06T10:00:00.000Z', webViewLink: 'https://drive.test/doc1' };

function installFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(String(url)); return handler(url, init, calls); };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('runDriveSync: KHÔNG chạy FTS full rebuild sau batch', async () => {
  const db = makeFakeDb();
  const { restore } = installFetch(async (url) => {
    if (String(url).includes('/drive/v3/files?q=')) return jsonRes({ files: [GDOC] });
    if (String(url).includes('alt=media')) return jsonRes('nội dung đề thi trích xuất được');
    throw new Error('unexpected ' + url);
  });
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    const rebuilds = db.sqlLog.filter((e) => /knowledge_fts/.test(e.sql));
    assert.equal(rebuilds.length, 0, 'không được có câu SQL rebuild FTS');
    assert.ok(db.vault.get('db_drive_doc1'), 'file vẫn được sync vào vault');
  } finally { restore(); }
});

test('runDriveSync: giữ nội dung cũ khi trích xuất lại thất bại', async () => {
  const oldMd = '# De thi.txt\n\n---\n\nNỘI DUNG THẬT ĐÃ TRÍCH XUẤT TRƯỚC ĐÓ\n\n---\n\n🔗 link';
  const db = makeFakeDb(new Map([['db_drive_doc1', {
    id: 'db_drive_doc1', source_hash: 'drive_doc1_2026-10-05T00:00:00.000Z', content_markdown: oldMd, status: 'published'
  }]]));
  const { restore } = installFetch(async (url) => {
    if (String(url).includes('/drive/v3/files?q=')) return jsonRes({ files: [{ ...GDOC, modifiedTime: '2026-10-06T12:00:00.000Z' }] });
    if (String(url).includes('alt=media')) return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}), text: async () => '' };
    throw new Error('unexpected ' + url);
  });
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    const row = db.vault.get('db_drive_doc1');
    assert.ok(row.content_markdown.includes('NỘI DUNG THẬT ĐÃ TRÍCH XUẤT TRƯỚC ĐÓ'), 'giữ nội dung cũ');
    assert.ok(!row.content_markdown.includes('Không trích xuất được'), 'không ghi đè placeholder');
    assert.equal(row.source_hash, 'drive_doc1_2026-10-06T12:00:00.000Z', 'vẫn cập nhật hash mới');
  } finally { restore(); }
});

test('runDriveSync: 401 -> invalidate cache + retry 1 lần rồi thành công', async () => {
  const db = makeFakeDb();
  let listCalls = 0;
  const { restore } = installFetch(async (url, init) => {
    if (String(url).includes('/drive/v3/files?q=')) {
      listCalls++;
      if (listCalls === 1) return jsonRes({ error: { message: 'Invalid Credentials' } }, 401);
      // lần 2: vẫn thấy Authorization Bearer (token mới sau invalidate)
      assert.match(String(init.headers?.Authorization || ''), /^Bearer /);
      return jsonRes({ files: [GDOC] });
    }
    if (String(url).includes('alt=media')) return jsonRes('nội dung đề thi trích xuất được');
    throw new Error('unexpected ' + url);
  });
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    assert.equal(listCalls, 2, 'phải retry đúng 1 lần sau 401');
    assert.ok(db.vault.get('db_drive_doc1'));
  } finally { restore(); }
});

test('runDriveSync: 429 -> backoff retry 1 lần rồi thành công', async () => {
  const db = makeFakeDb();
  let listCalls = 0;
  const { restore } = installFetch(async (url) => {
    if (String(url).includes('/drive/v3/files?q=')) {
      listCalls++;
      if (listCalls === 1) return jsonRes({ error: { message: 'Rate limited' } }, 429, { 'retry-after': '1' });
      return jsonRes({ files: [GDOC] });
    }
    if (String(url).includes('alt=media')) return jsonRes('nội dung đề thi trích xuất được');
    throw new Error('unexpected ' + url);
  });
  try {
    const t0 = Date.now();
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    assert.equal(listCalls, 2, 'phải retry đúng 1 lần sau 429');
    assert.ok(Date.now() - t0 >= 900, 'phải có backoff trước khi retry');
  } finally { restore(); }
});

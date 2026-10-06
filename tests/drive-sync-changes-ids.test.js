// Regression tests cho fix changes-mode driveSync (Kimi deep-audit vòng 2, 2026-10-06):
// BUG GỐC: runDriveSync list 50 file đầu (orderBy=name) rồi route commit Changes
// token → change của file NGOÀI top-50 bị drop vĩnh viễn trong khi token vẫn trôi.
// FIX: sync theo changed file IDs thật từ Changes API; token chỉ advance qua
// change ĐÃ xử lý (commit theo từng page; page dở dang → commit token đầu page
// để resume; 410 → tự reinit).
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

// Fake D1: drive_sync_state + drive_sync_logs + knowledge_vault
function makeFakeDb({ token = null, vault = new Map() } = {}) {
  const state = { token, vault };
  const db = {
    state,
    prepare(sql) {
      const api = {
        bind(...params) {
          return {
            first: async () => {
              if (sql.includes('FROM drive_sync_state')) {
                return state.token ? { last_change_token: state.token } : null;
              }
              if (sql.includes('FROM knowledge_vault WHERE id = ?')) {
                const row = vault.get(params[0]);
                return row ? { source_hash: row.source_hash, content_markdown: row.content_markdown } : null;
              }
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => {
              if (sql.includes('INSERT INTO drive_sync_logs')) return { meta: { last_row_id: 7 } };
              if (sql.includes('INSERT INTO drive_sync_state')) { state.token = params[0]; return {}; }
              if (sql.includes('INSERT INTO knowledge_vault')) {
                const [id, title, folder, category, tags, source_path, source_hash, content_markdown] = params;
                vault.set(id, { id, title, folder, category, tags, source_path, source_hash, content_markdown, status: 'published' });
                return {};
              }
              return {}; // UPDATE drive_sync_logs
            }
          };
        },
        first: async () => {
          if (sql.includes('FROM drive_sync_state')) {
            return state.token ? { last_change_token: state.token } : null;
          }
          return null;
        },
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

const fileMeta = (id, name, parents = ['folder-root'], mimeType = 'text/plain') => ({
  id, name, mimeType, parents,
  modifiedTime: '2026-10-06T10:00:00.000Z',
  webViewLink: `https://drive.test/${id}`
});

function installFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(String(url)); return handler(String(url), init, calls); };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// Router fetch dùng chung cho các test changes-mode
function changesRouter({ pages = {}, startToken = 'tok-fresh', expire = false, listing = null, bareMeta = {} }) {
  return async (url) => {
    if (url.includes('changes/startPageToken')) return jsonRes({ startPageToken: startToken });
    if (url.includes('/drive/v3/changes?')) {
      if (expire) return { ok: false, status: 410, headers: { get: () => null }, json: async () => ({ error: { code: 410 } }), text: async () => '' };
      const m = url.match(/pageToken=([^&]*)/);
      const pt = decodeURIComponent(m ? m[1] : '');
      const page = pages[pt];
      if (!page) throw new Error('unexpected changes pageToken: ' + pt);
      return jsonRes(page);
    }
    if (url.includes('/drive/v3/files?q=')) {
      if (!listing) throw new Error('unexpected listing call');
      return jsonRes(listing);
    }
    const fm = url.match(/\/drive\/v3\/files\/([^?]+)\?fields=/);
    if (fm) {
      const meta = bareMeta[fm[1]];
      if (!meta) return jsonRes({ error: { message: 'not found' } }, 404);
      return jsonRes(meta);
    }
    if (url.includes('alt=media') || url.includes('/export?')) return jsonRes(`NOI DUNG TRICH XUAT ${url}`);
    throw new Error('unexpected ' + url);
  };
}

test('changes-mode: sync đúng changed file IDs, file ngoài top-50 cũ vẫn được sync, token advance sau xử lý', async () => {
  const db = makeFakeDb({ token: 'tok0' });
  const pages = {
    tok0: {
      changes: [
        { fileId: 'fileA', file: fileMeta('fileA', 'De A lop 5.txt') },
        { fileId: 'fileB', file: fileMeta('fileB', 'Ngoai pham vi.txt', ['folder-out']) },
        { fileId: 'fileC', removed: true }
      ],
      nextPageToken: 'tok1'
    },
    tok1: {
      changes: [{ fileId: 'fileD', file: fileMeta('fileD', 'De D lop 6.txt') }],
      newStartPageToken: 'tok2'
    }
  };
  const { restore } = installFetch(changesRouter({ pages, bareMeta: { 'folder-out': { id: 'folder-out', parents: [] } } }));
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    assert.equal(res.mode, 'changes');
    assert.equal(res.token_committed, true);
    // fileA + fileD (thay đổi thật) được sync — kể cả fileD "ngoài top-50" của logic cũ
    assert.ok(db.state.vault.get('db_drive_fileA'), 'fileA phải được sync');
    assert.ok(db.state.vault.get('db_drive_fileD'), 'fileD phải được sync (regression: trước đây bị drop)');
    assert.ok(db.state.vault.get('db_drive_fileA').content_markdown.includes('NOI DUNG TRICH XUAT'));
    // file ngoài allowlist + file removed: không sync
    assert.equal(db.state.vault.get('db_drive_fileB'), undefined, 'file ngoài folder cho phép phải bị loại');
    assert.equal(db.state.vault.get('db_drive_fileC'), undefined, 'file removed không sync');
    // token advance tới newStartPageToken SAU KHI mọi change đã xử lý
    assert.equal(db.state.token, 'tok2');
  } finally { restore(); }
});

test('changes-mode: hết budget giữa page → commit token ĐẦU page (resume), không drop change', async () => {
  const db = makeFakeDb({ token: 'tok0' });
  const pages = {
    tok0: {
      changes: [
        { fileId: 'fileA', file: fileMeta('fileA', 'De A.txt') },
        { fileId: 'fileD', file: fileMeta('fileD', 'De D.txt') }
      ],
      nextPageToken: 'tok1'
    }
  };
  const { restore } = installFetch(changesRouter({ pages }));
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 1 });
    assert.equal(res.success, true);
    assert.equal(res.partial, true, 'phải báo partial khi hết budget');
    assert.ok(db.state.vault.get('db_drive_fileA'), 'fileA (trong budget) được sync');
    assert.equal(db.state.vault.get('db_drive_fileD'), undefined, 'fileD (ngoài budget) chưa sync');
    // REGRESSION CORE: token phải là tok0 (đầu page) để lần sau resume,
    // TUYỆT ĐỐI không được là tok1/tok2 (drop change của fileD)
    assert.equal(db.state.token, 'tok0', 'token phải giữ ở đầu page chưa xử lý xong');
    assert.equal(res.token_committed, true);
  } finally { restore(); }
});

test('changes-mode: token 410 → tự reinit, không crash', async () => {
  const db = makeFakeDb({ token: 'tok-expired' });
  const { restore } = installFetch(changesRouter({ expire: true, startToken: 'tok-fresh' }));
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    assert.equal(res.token_reinitialized, true);
    assert.equal(res.token_committed, true);
    assert.equal(db.state.token, 'tok-fresh', 'token mới phải được commit');
  } finally { restore(); }
});

test('auto-mode không token: bootstrap full listing rồi khởi tạo token', async () => {
  const db = makeFakeDb({ token: null });
  const listing = {
    files: [
      fileMeta('doc1', 'De thi lop 7.txt'),
      { id: 'pdf1', name: 'Tai lieu.pdf', mimeType: 'application/pdf', parents: ['folder-root'], modifiedTime: '2026-10-06T09:00:00.000Z', webViewLink: 'x' }
    ]
  };
  const { restore } = installFetch(changesRouter({ listing, startToken: 'tok-boot' }));
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    assert.equal(res.mode, 'full');
    assert.ok(db.state.vault.get('db_drive_doc1'), 'file text bootstrap được sync');
    assert.equal(db.state.vault.get('db_drive_pdf1'), undefined, 'PDF by-design do Python pipeline xử lý, Worker bỏ qua');
    assert.equal(db.state.token, 'tok-boot', 'token bootstrap phải được commit sau full scan');
    assert.equal(res.full_scan_complete, true);
  } finally { restore(); }
});

test('full-mode: hash-skip không tốn budget → lần chạy sau tiến qua top-50', async () => {
  // Lần 1: 60 file, budget 50 → 50 file đầu tốn budget, full_scan_complete=false, KHÔNG commit token
  const files = Array.from({ length: 60 }, (_, i) =>
    fileMeta(`f${String(i).padStart(2, '0')}`, `File ${String(i).padStart(2, '0')}.txt`));
  const db = makeFakeDb({ token: null });
  const listing1 = { files: files.slice(0, 100) }; // 1 page 60 file
  const { restore } = installFetch(changesRouter({ listing: listing1, startToken: 'tok-boot' }));
  try {
    const res = await runDriveSync(makePlatform(db), { folder_id: 'folder-root', batch_limit: 50 });
    assert.equal(res.success, true);
    assert.equal(res.mode, 'full');
    assert.equal(res.full_scan_complete, false, 'hết budget → chưa quét hết');
    assert.equal(res.partial, true);
    assert.equal(db.state.token, null, 'chưa quét hết thì KHÔNG commit token bootstrap (tránh drop)');
    assert.equal(db.state.vault.size, 50, 'đúng 50 file tốn budget được sync');
  } finally { restore(); }
});

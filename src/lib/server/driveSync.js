// src/lib/server/driveSync.js
// Logic sync Google Drive dùng chung cho:
// - POST /api/drive/sync (manager trigger thủ công)
// - POST /api/drive/poll (cron trigger tự động)
// Issue #2 P1: cron gọi chung hàm server nội bộ, fail-closed
//
// FIX 2026-10-06 (changes-mode): trước đây runDriveSync luôn list 50 file đầu
// (orderBy=name) rồi route commit Changes token → mọi thay đổi của file nằm
// NGOÀI top-50 bị drop vĩnh viễn trong khi token vẫn trôi. Giờ sync đi theo
// CHANGED FILE IDs thật từ Changes API: token chỉ advance qua những change đã
// được xử lý (commit theo từng page; page dở dang thì commit token đầu page để
// lần sau resume). Mode 'full' (listing) chỉ còn dùng cho bootstrap lần đầu
// hoặc khi manager ép buộc.
import { getServiceAccountToken, hasServiceAccount, invalidateServiceAccountToken } from './googleServiceAccount.js';
import { commitToken } from './driveChanges.js';

export const DEFAULT_DRIVE_FOLDER = '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou';
const MAX_FILE_CONTENT = 20000;
const MAX_FILES = 10000;
const CHANGES_PAGE_SIZE = 200;
const MAX_CHANGE_PAGES = 10;   // giới hạn subrequest mỗi invocation
const MAX_LIST_PAGES = 24;     // full mode: tối đa 24 trang listing / lần chạy
const MAX_ANCESTRY_DEPTH = 8;

async function getAuth(platform) {
  if (await hasServiceAccount(platform)) {
    const token = await getServiceAccountToken(platform);
    if (token) return {
      bearer: token,
      // Làm mới token khi Drive trả 401 (cache có thể hết hạn sớm / bị revoke)
      refreshBearer: async () => {
        invalidateServiceAccountToken();
        return getServiceAccountToken(platform);
      }
    };
  }
  let key = platform?.env?.GOOGLE_DRIVE_API_KEY;
  if (!key && platform?.env?.DB) {
    try {
      const row = await platform.env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'google_drive_api_key' LIMIT 1`).first();
      if (row?.value) key = row.value;
    } catch {}
  }
  return key ? { apiKey: key } : {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch Drive dùng chung: 401 → invalidate token cache + thử lại 1 lần với token
// mới; 429/503 → backoff 1 lần theo Retry-After (tối đa 5s). Mọi call ở đây đều
// là GET nên retry an toàn.
async function driveRawFetch(url, auth, retried = false) {
  const headers = {};
  let finalUrl = url;
  if (auth.bearer) {
    headers['Authorization'] = `Bearer ${auth.bearer}`;
  } else if (auth.apiKey) {
    finalUrl = url + (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(auth.apiKey)}`;
  }
  const res = await fetch(finalUrl, { headers });
  if (res.status === 401 && auth.bearer && typeof auth.refreshBearer === 'function' && !retried) {
    const fresh = await auth.refreshBearer().catch(() => null);
    if (fresh) return driveRawFetch(url, { ...auth, bearer: fresh }, true);
  }
  if ((res.status === 429 || res.status === 503) && !retried) {
    await sleep(Math.min(Number(res.headers.get('retry-after')) || 2, 5) * 1000);
    return driveRawFetch(url, auth, true);
  }
  return res;
}

async function driveFetch(url, auth) {
  const res = await driveRawFetch(url, auth);
  return res.json();
}

async function driveFetchText(url, auth) {
  const res = await driveRawFetch(url, auth);
  if (!res.ok) return '';
  return res.text();
}

async function listFiles(folderId, auth, pageToken = '') {
  const q = `'${folderId}' in parents and trashed = false`;
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink),nextPageToken&pageSize=100&orderBy=name`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return driveFetch(url, auth);
}

async function exportDocText(fileId, mimeType, auth) {
  try {
    if (mimeType === 'application/vnd.google-apps.document') {
      const text = await driveFetchText(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, auth);
      return text.substring(0, MAX_FILE_CONTENT);
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const text = await driveFetchText(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`, auth);
      return text.substring(0, MAX_FILE_CONTENT);
    }
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
      const text = await driveFetchText(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, auth);
      return text.substring(0, MAX_FILE_CONTENT);
    }
    // PDF/DOCX: download bytes and extract locally
    if (mimeType === 'application/pdf' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const buffer = await driveFetchBytes(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, auth);
      if (!buffer) return '';
      const bytes = new Uint8Array(buffer);
      let text = '';
      if (mimeType === 'application/pdf') {
        text = await extractPdfText(bytes);
      } else {
        text = await extractDocxText(bytes);
      }
      return text.substring(0, MAX_FILE_CONTENT);
    }
  } catch {}
  return '';
}

async function driveFetchBytes(url, auth) {
  try {
    const res = await driveRawFetch(url, auth);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function extractDocxText(bytes) {
  try {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    return result.value || '';
  } catch {
    return '';
  }
}

async function extractPdfText(bytes) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pages = [];
    const maxPages = Math.min(doc.numPages, 20); // Limit to 20 pages to save subrequests
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(it => it.str).join(' '));
    }
    await doc.destroy();
    return pages.join('\n\n');
  } catch {
    return '';
  }
}

function mdEscape(s) {
  return String(s || '').replace(/[#*`\[\]]/g, '').substring(0, MAX_FILE_CONTENT);
}

function autoClassify(fileName, folderPath) {
  const text = `${folderPath} ${fileName}`.toLowerCase();
  let grade = null;
  let category = 'document';
  const tags = ['google_drive'];
  const gradeMatch = text.match(/(?:lop|lớp|grade|khoi|khối|l)\s*[_-]?\s*(\d{1,2})/);
  if (gradeMatch) {
    const g = parseInt(gradeMatch[1]);
    if (g >= 1 && g <= 12) grade = `Lớp ${g}`;
  }
  if (/de[_-]?thi|exam|test|kiem[_-]?tra/.test(text)) {
    category = 'exam'; tags.push('de_thi');
  } else if (/tu[_-]?vung|vocab|word|flashcard/.test(text)) {
    category = 'vocabulary'; tags.push('tu_vung');
  } else if (/ngu[_-]?phap|grammar/.test(text)) {
    category = 'grammar'; tags.push('ngu_phap');
  } else if (/nghe|listening|audio|mp3/.test(text)) {
    category = 'listening'; tags.push('luyen_nghe');
  } else if (/ielts/.test(text)) {
    category = 'ielts'; tags.push('ielts');
  } else if (/toeic/.test(text)) {
    category = 'toeic'; tags.push('toeic');
  } else if (/hsg|olympic|chuyen/.test(text)) {
    category = 'hsg'; tags.push('hsg');
  } else if (/giao[_-]?an|lesson[_-]?plan|sop/.test(text)) {
    category = 'teaching'; tags.push('giao_an');
  }
  if (grade) tags.push(grade.toLowerCase().replace(' ', '_'));
  return { grade, category, tags };
}

// ---------------------------------------------------------------------------
// Changes-mode helpers (FIX 2026-10-06)
// ---------------------------------------------------------------------------

async function readSavedToken(db) {
  try {
    const row = await db.prepare(`SELECT last_change_token FROM drive_sync_state WHERE id = 1`).first();
    return row?.last_change_token || null;
  } catch {
    return null;
  }
}

async function fetchChangesPage(driveAuth, pageToken) {
  const url = `https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(pageToken)}` +
    `&pageSize=${CHANGES_PAGE_SIZE}` +
    `&fields=changes(fileId,removed,file(id,name,mimeType,size,modifiedTime,webViewLink,parents,trashed)),newStartPageToken,nextPageToken`;
  const res = await driveRawFetch(url, driveAuth);
  if (res.status === 410) return { expired: true };
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive Changes API ${res.status}: ${err?.error?.message || 'unknown'}`);
  }
  return res.json();
}

async function fetchStartPageToken(driveAuth) {
  const data = await driveFetch('https://www.googleapis.com/drive/v3/changes/startPageToken', driveAuth);
  if (data?.error) throw new Error(`Drive startPageToken: ${data.error.message || 'failed'}`);
  if (!data?.startPageToken) throw new Error('Drive startPageToken: empty');
  return data.startPageToken;
}

// Metadata tối thiểu để đi ngược cây thư mục (kiểm tra file có nằm trong
// folder được phép sync không). Không tải nội dung.
// Trả về: object meta | { notFound: true } (file đã bị xóa → skip an toàn) |
// null (lỗi thoáng qua → caller PHẢI interrupt page, không được drop change).
async function fetchBareMeta(fileId, driveAuth) {
  try {
    const res = await driveRawFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,trashed`,
      driveAuth
    );
    if (res.status === 404) return { notFound: true };
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.error) return null;
    return data;
  } catch {
    return null;
  }
}

// true: nằm trong cây folder cho phép. false: ngoài phạm vi (bỏ qua).
// 'unknown': không xác định được do lỗi fetch thoáng qua → caller phải dừng
// page và resume sau (fail-closed, không drop change).
async function isWithinAllowedFolder(parents, allowedSet, driveAuth, ancestryCache) {
  const queue = [...(parents || [])];
  const seen = new Set();
  let depth = 0;
  while (queue.length && depth < MAX_ANCESTRY_DEPTH) {
    depth++;
    const fid = queue.shift();
    if (!fid || seen.has(fid)) continue;
    seen.add(fid);
    if (allowedSet.has(fid)) return true;
    let cached = ancestryCache.get(fid);
    if (cached === undefined) {
      const meta = await fetchBareMeta(fid, driveAuth);
      if (!meta) return 'unknown'; // lỗi thoáng qua → không kết luận vội
      cached = meta.parents || [];
      ancestryCache.set(fid, cached);
    }
    for (const p of cached) queue.push(p);
  }
  return false;
}

// Sync 1 file (dùng chung cho cả changes mode và full mode).
// Trả về { consumed: true } nếu đã tốn 1 lượt download nội dung (tính vào
// batch budget), { consumed: false } nếu chỉ skip/hash-match/không trích xuất
// được (rẻ, không tính budget). Ném lỗi chỉ khi D1 thất bại.
async function syncOneFile(db, driveAuth, f, folderPath, stats, errors) {
  const vid = `db_drive_${f.id}`;
  const cls = autoClassify(f.name, folderPath);
  // Skip files that can't be text-extracted (saves subrequests)
  // NOTE: PDF/DOCX extraction disabled in Worker (CPU limits) - use Python script for heavy files
  const extractable = f.mimeType === 'application/vnd.google-apps.document' ||
    f.mimeType === 'application/vnd.google-apps.spreadsheet' ||
    f.mimeType === 'text/plain' || f.mimeType === 'text/markdown' || f.mimeType === 'text/csv';
  if (!extractable) {
    stats.files++;
    stats.skipped++;
    return { consumed: false };
  }
  // Check if already in DB with same modified time (skip download if unchanged)
  const existing = await db.prepare(`SELECT source_hash, content_markdown FROM knowledge_vault WHERE id = ? LIMIT 1`).bind(vid).first().catch(() => null);
  // Use modifiedTime as hash to detect changes
  const fileHash = `drive_${f.id}_${f.modifiedTime || ''}`;
  if (existing && existing.source_hash === fileHash) {
    stats.files++;
    stats.skipped++;
    return { consumed: false };
  }
  const content = await exportDocText(f.id, f.mimeType, driveAuth);
  stats.files++;
  // Nếu trích xuất lại thất bại (lỗi thoáng qua) mà DB đã có nội dung thật từ
  // lần trước: giữ nội dung cũ thay vì ghi đè bằng placeholder rỗng.
  const oldContent = existing?.content_markdown;
  const hasRealContent = oldContent && !oldContent.includes('Không trích xuất được nội dung text');
  let md;
  if (content) {
    stats.with_content++;
    md = `# ${mdEscape(f.name)}\n\n` +
      `- **Loại:** ${f.mimeType}\n` +
      `- **Phân loại:** ${cls.category}${cls.grade ? ` / ${cls.grade}` : ''}\n` +
      `---\n\n${mdEscape(content)}\n\n---\n\n` +
      `🔗 [Mở file gốc trên Drive](${f.webViewLink || '#'})\n`;
  } else if (hasRealContent) {
    stats.skipped++;
    md = oldContent;
  } else {
    stats.skipped++;
    md = `# ${mdEscape(f.name)}\n\n` +
      `- **Loại:** ${f.mimeType}\n` +
      `- **Phân loại:** ${cls.category}${cls.grade ? ` / ${cls.grade}` : ''}\n` +
      `*(Không trích xuất được nội dung text)*\n\n` +
      `🔗 [Mở file gốc trên Drive](${f.webViewLink || '#'})\n`;
  }

  try {
    await db.prepare(`
      INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, tags=excluded.tags, content_markdown=excluded.content_markdown, source_hash=excluded.source_hash, updated_at=CURRENT_TIMESTAMP
    `).bind(vid, f.name, '07_GOOGLE_DRIVE_LIBRARY', cls.category, JSON.stringify(cls.tags), `drive://${f.id}`, fileHash, md).run();
  } catch (e) { errors.push(`file ${f.id}: ${e.message}`); throw e; }
  return { consumed: true };
}

async function syncOneFolder(db, f, stats, errors) {
  const vid = `db_drive_${f.id}`;
  stats.folders++;
  const md = `# 📁 ${mdEscape(f.name)}\n\nThư mục tài liệu trên Google Drive.\n\n🔗 [Mở trên Drive](${f.webViewLink || '#'})`;
  try {
    await db.prepare(`
      INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
    `).bind(vid, `📁 ${f.name}`, '07_GOOGLE_DRIVE_LIBRARY', 'drive_folder', JSON.stringify(['google_drive']), `drive://${f.id}`, `drive_${f.id}`, md).run();
  } catch (e) { errors.push(`folder ${f.id}: ${e.message}`); throw e; }
}

/**
 * Changes mode: sync đúng các fileId thật sự thay đổi theo Changes API.
 * Token chỉ advance qua những change ĐÃ xử lý:
 * - xử lý xong cả page → commit nextPageToken của page đó
 * - hết budget / lỗi file giữa page → commit token ĐẦU page (lần sau resume,
 *   các change đã xử lý sẽ bị hash-skip, idempotent)
 * - xử lý hết → commit newStartPageToken
 */
async function runChangesSync(platform, db, driveAuth, allowedSet, batchLimit, stats, errors) {
  const detail = { mode: 'changes', token_committed: false, changes_seen: 0, changes_processed: 0, partial: false };
  let requestToken = await readSavedToken(db);
  if (!requestToken) return { ...detail, need_bootstrap: true };

  const ancestryCache = new Map();
  let budgetLeft = batchLimit;
  let firstErrorPageToken = null;
  // commitResume: chỉ ghi D1 khi token thật sự đổi (tránh write thừa); luôn
  // đánh dấu token_committed khi resume point đã chắc chắn được persist.
  let committedToken = requestToken;
  async function commitResume(token) {
    try {
      if (token !== committedToken) {
        await commitToken(platform, token);
        committedToken = token;
      }
      detail.token_committed = true;
      return true;
    } catch {
      return false;
    }
  }

  for (let page = 0; page < MAX_CHANGE_PAGES; page++) {
    let data;
    try {
      data = await fetchChangesPage(driveAuth, requestToken);
    } catch (e) {
      errors.push(`changes: ${e.message}`);
      // Không commit gì thêm: token đã lưu vẫn là resume point an toàn.
      return { ...detail, partial: true, token_committed: detail.token_committed, error: e.message };
    }
    if (data.expired) {
      // Token hết hạn (410): khởi tạo lại như poll route vẫn làm. Các change
      // trong khoảng trống không phục hồi được — báo rõ để manager chạy full.
      try {
        const fresh = await fetchStartPageToken(driveAuth);
        await commitToken(platform, fresh);
        return { ...detail, token_committed: true, token_reinitialized: true, partial: true };
      } catch (e) {
        return { ...detail, error: `DriveChangeTokenExpired: ${e.message}`, need_reinit: true };
      }
    }

    const changes = data.changes || [];
    detail.changes_seen += changes.length;
    // Dedupe trong page: 1 file đổi nhiều lần → xử lý 1 lần (lần đầu, theo thứ tự)
    const seenInPage = new Set();
    let pageInterrupted = false;
    let pageFailed = false; // true: interrupt do LỖI (không phải hết budget) → fail-closed

    for (const ch of changes) {
      if (budgetLeft <= 0) { pageInterrupted = true; break; }
      const fileId = ch.fileId;
      if (!fileId || seenInPage.has(fileId)) continue;
      seenInPage.add(fileId);
      detail.changes_processed++;

      // File bị xóa / vào thùng rác: bỏ qua (không sync, không tốn budget)
      if (ch.removed) { stats.skipped++; continue; }
      let meta = ch.file || null;
      if (!meta) {
        meta = await fetchBareMeta(fileId, driveAuth);
        if (!meta) {
          // Lỗi thoáng qua khi lấy metadata: KHÔNG skip mù (sẽ drop change).
          // Interrupt page, giữ token đầu page để retry lần sau (fail-closed).
          pageInterrupted = true;
          pageFailed = true;
          detail.error = `DriveSyncPartialFailure: không lấy được metadata của change ${fileId}; giữ token để retry`;
          break;
        }
        if (meta.notFound) { stats.skipped++; continue; } // file đã bị xóa hẳn
      }
      if (meta.trashed) { stats.files++; stats.skipped++; continue; }

      const isFolder = meta.mimeType === 'application/vnd.google-apps.folder';
      // Chỉ sync file nằm trong cây folder được phép (allowlist)
      const within = await isWithinAllowedFolder(meta.parents, allowedSet, driveAuth, ancestryCache);
      if (within === 'unknown') {
        pageInterrupted = true; // lỗi thoáng qua → resume page này lần sau
        pageFailed = true;
        detail.error = `DriveSyncPartialFailure: không xác định được vị trí của change ${meta.id || fileId}; giữ token để retry`;
        break;
      }
      if (!within) { stats.files++; stats.skipped++; continue; }

      try {
        if (isFolder) {
          await syncOneFolder(db, meta, stats, errors);
        } else {
          const r = await syncOneFile(db, driveAuth, meta, '', stats, errors);
          if (r.consumed) budgetLeft--;
        }
      } catch (e) {
        // Lỗi D1/file: ghi nhận page để resume lại lần sau (fail-closed),
        // không advance token qua change lỗi.
        if (!firstErrorPageToken) firstErrorPageToken = requestToken;
        pageInterrupted = true;
        pageFailed = true;
        detail.error = `DriveSyncPartialFailure: lỗi xử lý change ${fileId} (${e.message}); giữ token để retry`;
        break;
      }
    }

    if (pageInterrupted) {
      detail.partial = true;
      await commitResume(requestToken);
      return detail;
    }
    if (data.nextPageToken) {
      await commitResume(data.nextPageToken);
      requestToken = data.nextPageToken;
      continue;
    }
    // Hết changes: commit token mới. Nếu có page lỗi trước đó thì chỉ advance
    // tới đầu page lỗi để lần sau retry (không drop change lỗi).
    const finalToken = firstErrorPageToken || data.newStartPageToken || requestToken;
    if (firstErrorPageToken) {
      detail.partial = true;
      detail.error = detail.error || 'DriveSyncPartialFailure: có change lỗi, giữ token để retry';
    }
    await commitResume(finalToken);
    return detail;
  }

  // Vượt quá MAX_CHANGE_PAGES: commit token page hiện tại để lần sau tiếp tục.
  detail.partial = true;
  await commitResume(requestToken);
  return detail;
}

/**
 * Full mode (bootstrap / manager ép buộc): duyệt listing như cũ nhưng budget
 * chỉ tính trên số file PHẢI TẢI nội dung (download), còn hash-skip rẻ không
 * tính → các lần chạy sau tiến dần qua toàn bộ Drive thay vì kẹt ở top-50.
 * Giới hạn số trang listing mỗi lần chạy để không vượt Worker limits.
 */
async function runFullSync(db, driveAuth, folderId, recursive, batchLimit, stats, errors) {
  const detail = { mode: 'full', token_committed: false, full_scan_complete: true };
  let budgetLeft = batchLimit;
  let listPages = 0;

  async function syncFolder(fid, depth = 0, folderPath = '') {
    if (depth > 5 || budgetLeft <= 0 || listPages >= MAX_LIST_PAGES) {
      if (listPages >= MAX_LIST_PAGES || budgetLeft <= 0) detail.full_scan_complete = false;
      return;
    }
    let pageToken = '';
    do {
      if (budgetLeft <= 0 || listPages >= MAX_LIST_PAGES) {
        detail.full_scan_complete = false;
        return;
      }
      listPages++;
      const data = await listFiles(fid, driveAuth, pageToken);
      if (data.error) {
        errors.push(`list ${fid}: ${data.error.message}`);
        detail.full_scan_complete = false;
        return;
      }
      for (const f of (data.files || [])) {
        if (budgetLeft <= 0) { detail.full_scan_complete = false; break; }
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
        const currentPath = folderPath ? `${folderPath}/${f.name}` : f.name;
        if (isFolder) {
          try { await syncOneFolder(db, f, stats, errors); } catch {}
          if (recursive) await syncFolder(f.id, depth + 1, currentPath);
          continue;
        }
        try {
          const r = await syncOneFile(db, driveAuth, f, folderPath, stats, errors);
          if (r.consumed) budgetLeft--;
        } catch {
          // syncOneFile đã push errors; tiếp tục file khác
        }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken && budgetLeft > 0 && listPages < MAX_LIST_PAGES);
    if (pageToken) detail.full_scan_complete = false;
  }

  await syncFolder(folderId);
  detail.partial = !detail.full_scan_complete;
  return detail;
}

/**
 * Chạy sync Drive → D1. Dùng chung cho cron và manager.
 * @param {object} opts.mode 'auto' (mặc định: changes nếu có token, else full),
 *   'changes' (chỉ incremental theo Changes API), 'full' (ép full listing)
 * @returns {Promise<{success: boolean, files_synced?: number, error?: string, stats?: object}>}
 */
export async function runDriveSync(platform, opts = {}) {
  const folderId = opts.folder_id || DEFAULT_DRIVE_FOLDER;
  const recursive = opts.recursive !== false;
  const triggeredBy = opts.triggered_by || 'manual';
  // Batch limit per invocation to avoid Worker resource limits (default 50 files)
  // Ý nghĩa: số file PHẢI TẢI nội dung mỗi lần chạy (hash-skip không tính).
  const batchLimit = Math.min(Number(opts.batch_limit) || 50, 200);
  const mode = opts.mode || 'auto';

  if (!platform?.env?.DB) {
    return { success: false, error: 'DatabaseUnavailable' };
  }
  const db = platform.env.DB;

  const configuredFolders = String(
    platform?.env?.DRIVE_SYNC_ALLOWED_FOLDER_IDS ||
    platform?.env?.GOOGLE_DRIVE_ALLOWED_FOLDER_IDS ||
    DEFAULT_DRIVE_FOLDER
  ).split(',').map((id) => id.trim()).filter(Boolean);
  if (!new Set(configuredFolders).has(folderId)) {
    return { success: false, error: 'DriveFolderNotAllowed' };
  }
  const allowedSet = new Set(configuredFolders);

  const driveAuth = await getAuth(platform);
  if (!driveAuth.bearer && !driveAuth.apiKey) {
    return { success: false, error: 'Chưa cấu hình Google Drive (cần Service Account hoặc API key)' };
  }

  const stats = { folders: 0, files: 0, with_content: 0, skipped: 0 };
  const errors = [];

  let logId;
  try {
    const result = await db.prepare(`
      INSERT INTO drive_sync_logs (direction, folder_id, triggered_by, status)
      VALUES ('drive_to_db', ?, ?, 'running')
    `).bind(folderId, triggeredBy).run();
    logId = result.meta.last_row_id;
  } catch (err) {
    return { success: false, error: `DriveSyncLogError: ${err.message}` };
  }

  let syncDetail = null;
  try {
    const wantChanges = mode === 'changes' || (mode === 'auto' && await readSavedToken(db));
    if (wantChanges) {
      syncDetail = await runChangesSync(platform, db, driveAuth, allowedSet, batchLimit, stats, errors);
      if (syncDetail.need_bootstrap) {
        // Chưa có token: bootstrap bằng full listing, rồi mới khởi tạo token.
        syncDetail = null;
      } else if (syncDetail.error && !syncDetail.token_reinitialized) {
        throw new Error(syncDetail.error);
      }
    }
    if (!syncDetail) {
      // Full mode: chụp startPageToken TRƯỚC khi listing để change xảy ra
      // trong lúc listing vẫn được bắt ở lần changes-mode sau.
      // Lỗi chụp token KHÔNG fail cả lần sync (file vẫn sync được) — chỉ
      // warning, lần sau sẽ full mode tiếp cho tới khi khởi tạo được token.
      let bootstrapToken = null;
      let tokenWarning = null;
      try { bootstrapToken = await fetchStartPageToken(driveAuth); } catch (e) {
        tokenWarning = `startPageToken: ${e.message}`;
      }
      syncDetail = await runFullSync(db, driveAuth, folderId, recursive, batchLimit, stats, errors);
      if (tokenWarning) syncDetail.token_warning = tokenWarning;
      // Chỉ commit token bootstrap khi đã quét HẾT (nếu dở dang, lần sau vẫn
      // full mode tiếp cho tới khi xong — tránh drop file chưa duyệt).
      if (bootstrapToken && syncDetail.full_scan_complete) {
        try { await commitToken(platform, bootstrapToken); syncDetail.token_committed = true; } catch (e) {
          errors.push(`commit bootstrap token: ${e.message}`);
        }
      }
    }
    // Không rebuild FTS thủ công: triggers trg_knowledge_vault_ai/ad/au (migration
    // 0002) đã đồng bộ knowledge_fts theo từng INSERT/UPDATE/DELETE. Rebuild full
    // sau mỗi batch chỉ tốn tài nguyên trên toàn bộ vault.

    const status = errors.length ? 'failed' : 'completed';
    await db.prepare(`
      UPDATE drive_sync_logs
      SET finished_at = CURRENT_TIMESTAMP, status = ?,
          files_scanned = ?, files_added = ?, files_skipped = ?, files_failed = ?, errors = ?
      WHERE id = ?
    `).bind(status, stats.files + stats.folders, stats.files, stats.skipped, errors.length, JSON.stringify(errors.slice(0, 20)), logId).run();

    if (errors.length) {
      return { success: false, error: 'DriveSyncIncomplete', stats, log_id: logId, errors: errors.slice(0, 10), ...syncDetail };
    }

    return {
      success: true,
      files_synced: stats.files,
      stats,
      log_id: logId,
      errors: errors.slice(0, 10),
      ...syncDetail
    };
  } catch (err) {
    try {
      await db.prepare(`UPDATE drive_sync_logs SET finished_at = CURRENT_TIMESTAMP, status = 'failed', errors = ? WHERE id = ?`)
        .bind(JSON.stringify([err.message]), logId).run();
    } catch {}
    // Propagate syncDetail (mode/partial/token_committed) để route không
    // commit token mù qua change chưa xử lý khi sync dở dang (fail-closed).
    return { success: false, error: err.message, stats, ...(syncDetail || {}) };
  }
}

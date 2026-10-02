// src/routes/api/drive/sync/+server.js
// Sync tài liệu Google Drive vào knowledge_vault (kho tri thức)
// POST /api/drive/sync { folder_id?, recursive? } — staff only
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;
const DEFAULT_FOLDER = '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou';
const MAX_FILE_CONTENT = 20000; // giới hạn ký tự mỗi file
const MAX_FILES = 100;

async function getApiKey(platform) {
  let key = platform?.env?.GOOGLE_DRIVE_API_KEY;
  if (!key && platform?.env?.DB) {
    try {
      const row = await platform.env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'google_drive_api_key' LIMIT 1`).first();
      if (row?.value) key = row.value;
    } catch {}
  }
  return key;
}

async function driveFetch(url, key) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(key)}`);
  return res.json();
}

async function listFiles(folderId, key, pageToken = '') {
  const q = `'${folderId}' in parents and trashed = false`;
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink),nextPageToken&pageSize=100&orderBy=name`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return driveFetch(url, key);
}

async function exportDocText(fileId, mimeType, key) {
  try {
    // Google Docs/Sheets/Slides → export text
    if (mimeType === 'application/vnd.google-apps.document') {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain&key=${encodeURIComponent(key)}`);
      if (!res.ok) return '';
      return (await res.text()).substring(0, MAX_FILE_CONTENT);
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv&key=${encodeURIComponent(key)}`);
      if (!res.ok) return '';
      return (await res.text()).substring(0, MAX_FILE_CONTENT);
    }
    // Text/plain trực tiếp
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${encodeURIComponent(key)}`);
      if (!res.ok) return '';
      return (await res.text()).substring(0, MAX_FILE_CONTENT);
    }
  } catch {}
  return '';
}

function mdEscape(s) {
  return String(s || '').replace(/[#*`\[\]]/g, '').substring(0, MAX_FILE_CONTENT);
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ staff' }, { status: 403 });
  if (!platform?.env?.DB) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const apiKey = await getApiKey(platform);
  if (!apiKey) return json({ success: false, error: 'Chưa cấu hình Google Drive API key' }, { status: 503 });

  let body = {};
  try { body = await request.json(); } catch {}
  const folderId = body.folder_id || DEFAULT_FOLDER;
  const recursive = body.recursive !== false;
  const db = platform.env.DB;

  const stats = { folders: 0, files: 0, with_content: 0, skipped: 0 };
  const errors = [];

  async function syncFolder(fid, depth = 0) {
    if (depth > 3 || stats.files >= MAX_FILES) return;
    let pageToken = '';
    do {
      const data = await listFiles(fid, apiKey, pageToken);
      if (data.error) {
        errors.push(`list ${fid}: ${data.error.message}`);
        return;
      }
      for (const f of (data.files || [])) {
        if (stats.files >= MAX_FILES) break;
        const vid = `db_drive_${f.id}`;
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder';

        if (isFolder) {
          stats.folders++;
          // Index folder như 1 note điều hướng
          const md = `# 📁 ${mdEscape(f.name)}\n\nThư mục tài liệu trên Google Drive.\n\n🔗 [Mở trên Drive](${f.webViewLink || '#'})\n\n> Nguồn: Google Drive (id: ${f.id})`;
          try {
            await db.prepare(`
              INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
              ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
            `).bind(vid, `📁 ${f.name}`, '07_GOOGLE_DRIVE_LIBRARY', 'drive_folder', JSON.stringify(['google_drive']), `drive://${f.id}`, `drive_${f.id}`, md).run();
          } catch (e) { errors.push(`folder ${f.id}: ${e.message}`); }
          if (recursive) await syncFolder(f.id, depth + 1);
          continue;
        }

        // File: lấy nội dung text nếu export được
        const content = await exportDocText(f.id, f.mimeType, apiKey);
        stats.files++;
        if (content) stats.with_content++; else stats.skipped++;

        const md = `# ${mdEscape(f.name)}\n\n` +
          `- **Loại:** ${f.mimeType}\n` +
          `- **Cập nhật:** ${f.modifiedTime || '—'}\n\n` +
          (content ? `---\n\n${mdEscape(content)}\n\n---\n\n` : `*(Không trích xuất được nội dung text — xem bản gốc trên Drive)*\n\n`) +
          `🔗 [Mở file gốc trên Drive](${f.webViewLink || '#'})\n\n` +
          `> Nguồn: Google Drive (id: ${f.id})`;

        try {
          await db.prepare(`
            INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
          `).bind(vid, f.name, '07_GOOGLE_DRIVE_LIBRARY', 'drive_file', JSON.stringify(['google_drive', f.mimeType]), `drive://${f.id}`, `drive_${f.id}`, md).run();
        } catch (e) { errors.push(`file ${f.id}: ${e.message}`); }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken && stats.files < MAX_FILES);
  }

  try {
    await syncFolder(folderId);
    // Rebuild FTS
    try { await db.prepare(`INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')`).run(); } catch (e) { errors.push(`fts: ${e.message}`); }
    return json({
      success: true,
      message: `Đã sync ${stats.files} files + ${stats.folders} folders từ Drive vào kho tri thức (${stats.with_content} files có nội dung text)`,
      stats,
      errors: errors.slice(0, 10)
    });
  } catch (err) {
    return json({ success: false, error: err.message, stats }, { status: 500 });
  }
}

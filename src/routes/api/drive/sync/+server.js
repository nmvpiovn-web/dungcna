// src/routes/api/drive/sync/+server.js
// Sync tài liệu Google Drive vào knowledge_vault (kho tri thức)
// POST /api/drive/sync { folder_id?, recursive? } — staff only
// Ưu tiên Service Account (đọc folder riêng tư), fallback API key
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { getServiceAccountToken, hasServiceAccount } from '$lib/server/googleServiceAccount.js';

export const prerender = false;
const DEFAULT_FOLDER = '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou';
const MAX_FILE_CONTENT = 20000; // giới hạn ký tự mỗi file
const MAX_FILES = 500;

async function getAuth(platform) {
  // Ưu tiên 1: Service Account
  if (await hasServiceAccount(platform)) {
    const token = await getServiceAccountToken(platform);
    if (token) return { bearer: token };
  }
  // Fallback: API key
  let key = platform?.env?.GOOGLE_DRIVE_API_KEY;
  if (!key && platform?.env?.DB) {
    try {
      const row = await platform.env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'google_drive_api_key' LIMIT 1`).first();
      if (row?.value) key = row.value;
    } catch {}
  }
  return key ? { apiKey: key } : {};
}

async function driveFetch(url, auth) {
  const headers = {};
  let finalUrl = url;
  if (auth.bearer) {
    headers['Authorization'] = `Bearer ${auth.bearer}`;
  } else if (auth.apiKey) {
    finalUrl = url + (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(auth.apiKey)}`;
  }
  const res = await fetch(finalUrl, { headers });
  return res.json();
}

async function driveFetchText(url, auth) {
  const headers = {};
  let finalUrl = url;
  if (auth.bearer) {
    headers['Authorization'] = `Bearer ${auth.bearer}`;
  } else if (auth.apiKey) {
    finalUrl = url + (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(auth.apiKey)}`;
  }
  const res = await fetch(finalUrl, { headers });
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
    // Google Docs/Sheets/Slides → export text
    if (mimeType === 'application/vnd.google-apps.document') {
      const text = await driveFetchText(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, auth);
      return text.substring(0, MAX_FILE_CONTENT);
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const text = await driveFetchText(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`, auth);
      return text.substring(0, MAX_FILE_CONTENT);
    }
    // Text/plain trực tiếp
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
      const text = await driveFetchText(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, auth);
      return text.substring(0, MAX_FILE_CONTENT);
    }
  } catch {}
  return '';
}

function mdEscape(s) {
  return String(s || '').replace(/[#*`\[\]]/g, '').substring(0, MAX_FILE_CONTENT);
}

// Tự động phân loại file dựa trên tên folder và tên file
// Trả về { grade, category, tags }
function autoClassify(fileName, folderPath) {
  const text = `${folderPath} ${fileName}`.toLowerCase();
  let grade = null;
  let category = 'document';
  const tags = ['google_drive'];

  // Detect grade: "lop 7", "lớp 7", "grade 7", "l07", "khoi 7"
  const gradeMatch = text.match(/(?:lop|lớp|grade|khoi|khối|l)\s*[_-]?\s*(\d{1,2})/);
  if (gradeMatch) {
    const g = parseInt(gradeMatch[1]);
    if (g >= 1 && g <= 12) grade = `Lớp ${g}`;
  }

  // Detect category từ keywords
  if (/de[_-]?thi|exam|test|kiem[_-]?tra/.test(text)) {
    category = 'exam';
    tags.push('de_thi');
  } else if (/tu[_-]?vung|vocab|word|flashcard/.test(text)) {
    category = 'vocabulary';
    tags.push('tu_vung');
  } else if (/ngu[_-]?phap|grammar/.test(text)) {
    category = 'grammar';
    tags.push('ngu_phap');
  } else if (/nghe|listening|audio|mp3/.test(text)) {
    category = 'listening';
    tags.push('luyen_nghe');
  } else if (/ielts/.test(text)) {
    category = 'ielts';
    tags.push('ielts');
  } else if (/toeic/.test(text)) {
    category = 'toeic';
    tags.push('toeic');
  } else if (/hsg|olympic|chuyen/.test(text)) {
    category = 'hsg';
    tags.push('hsg');
  } else if (/giao[_-]?an|lesson[_-]?plan|sop/.test(text)) {
    category = 'teaching';
    tags.push('giao_an');
  }

  if (grade) tags.push(grade.toLowerCase().replace(' ', '_'));

  return { grade, category, tags };
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ staff' }, { status: 403 });
  if (!platform?.env?.DB) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const driveAuth = await getAuth(platform);
  if (!driveAuth.bearer && !driveAuth.apiKey) return json({ success: false, error: 'Chưa cấu hình Google Drive (cần Service Account hoặc API key)' }, { status: 503 });

  let body = {};
  try { body = await request.json(); } catch {}
  const folderId = body.folder_id || DEFAULT_FOLDER;
  const recursive = body.recursive !== false;
  const db = platform.env.DB;

  const stats = { folders: 0, files: 0, with_content: 0, skipped: 0 };
  const errors = [];

  async function syncFolder(fid, depth = 0, folderPath = '') {
    if (depth > 5 || stats.files >= MAX_FILES) return;
    let pageToken = '';
    do {
      const data = await listFiles(fid, driveAuth, pageToken);
      if (data.error) {
        errors.push(`list ${fid}: ${data.error.message}`);
        return;
      }
      for (const f of (data.files || [])) {
        if (stats.files >= MAX_FILES) break;
        const vid = `db_drive_${f.id}`;
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
        const currentPath = folderPath ? `${folderPath}/${f.name}` : f.name;

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
          if (recursive) await syncFolder(f.id, depth + 1, currentPath);
          continue;
        }

        // File: tự động phân loại theo tên folder + tên file
        const cls = autoClassify(f.name, folderPath);
        const content = await exportDocText(f.id, f.mimeType, driveAuth);
        stats.files++;
        if (content) stats.with_content++; else stats.skipped++;

        const md = `# ${mdEscape(f.name)}\n\n` +
          `- **Loại:** ${f.mimeType}\n` +
          `- **Phân loại:** ${cls.category}${cls.grade ? ` / ${cls.grade}` : ''}\n` +
          `- **Cập nhật:** ${f.modifiedTime || '—'}\n\n` +
          (content ? `---\n\n${mdEscape(content)}\n\n---\n\n` : `*(Không trích xuất được nội dung text — xem bản gốc trên Drive)*\n\n`) +
          `🔗 [Mở file gốc trên Drive](${f.webViewLink || '#'})\n\n` +
          `> Nguồn: Google Drive (id: ${f.id})`;

        try {
          await db.prepare(`
            INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, tags=excluded.tags, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
          `).bind(vid, f.name, '07_GOOGLE_DRIVE_LIBRARY', cls.category, JSON.stringify(cls.tags), `drive://${f.id}`, `drive_${f.id}`, md).run();
        } catch (e) { errors.push(`file ${f.id}: ${e.message}`); }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken && stats.files < MAX_FILES);
  }

  // Tạo log entry
  let logId = null;
  try {
    const logRes = await db.prepare(`
      INSERT INTO drive_sync_logs (direction, folder_id, triggered_by, status)
      VALUES ('drive_to_db', ?, ?, 'running')
    `).bind(folderId, auth.user?.username || 'manual').run();
    logId = logRes.meta.last_row_id;
  } catch {}

  try {
    await syncFolder(folderId);
    // Rebuild FTS
    try { await db.prepare(`INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')`).run(); } catch (e) { errors.push(`fts: ${e.message}`); }

    // Cập nhật log hoàn thành
    if (logId) {
      try {
        await db.prepare(`
          UPDATE drive_sync_logs
          SET finished_at = CURRENT_TIMESTAMP, status = 'completed',
              files_scanned = ?, files_added = ?, files_updated = 0,
              files_skipped = ?, files_failed = ?, errors = ?
          WHERE id = ?
        `).bind(stats.files + stats.folders, stats.files, stats.skipped, errors.length, JSON.stringify(errors.slice(0, 20)), logId).run();
      } catch {}
    }

    return json({
      success: true,
      message: `Đã sync ${stats.files} files + ${stats.folders} folders từ Drive vào kho tri thức (${stats.with_content} files có nội dung text)`,
      stats,
      log_id: logId,
      errors: errors.slice(0, 10)
    });
  } catch (err) {
    if (logId) {
      try {
        await db.prepare(`UPDATE drive_sync_logs SET finished_at = CURRENT_TIMESTAMP, status = 'failed', errors = ? WHERE id = ?`)
          .bind(JSON.stringify([err.message]), logId).run();
      } catch {}
    }
    return json({ success: false, error: err.message, stats }, { status: 500 });
  }
}

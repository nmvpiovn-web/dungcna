// src/routes/api/drive/+server.js
// Google Drive API proxy: list files from a Drive folder
// Ưu tiên Service Account (đọc folder riêng tư), fallback API key (chỉ folder công khai),
// và kết hợp đồng bộ 2 chiều với Kho Tri Thức D1 (knowledge_vault + drive_file_index)
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';
import { getServiceAccountToken, hasServiceAccount } from '../../../lib/server/googleServiceAccount.js';
import { DEFAULT_DRIVE_FOLDER } from '../../../lib/server/driveSync.js';
import { normalizeVietnameseSourceTitle, classifyDriveFileGroup } from '../../../lib/quizSourceNormalizer.js';

export const prerender = false;

// Drive folder IDs are URL-safe base64-ish strings; reject anything else to
// block query-injection via the `folder_id` / `q` params.
const FOLDER_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

function getAllowedFolderIds(platform) {
  return String(
    platform?.env?.DRIVE_SYNC_ALLOWED_FOLDER_IDS ||
    platform?.env?.GOOGLE_DRIVE_ALLOWED_FOLDER_IDS ||
    DEFAULT_DRIVE_FOLDER
  ).split(',').map((id) => id.trim()).filter(Boolean);
}

async function isAllowedOrSyncedFolderId(platform, folderId) {
  if (new Set(getAllowedFolderIds(platform)).has(folderId)) return true;
  const db = platform?.env?.DB;
  if (!db) return false;
  try {
    const row = await db
      .prepare(
        `SELECT id FROM knowledge_vault
         WHERE (id = ? OR source_path = ?)
           AND folder = '07_GOOGLE_DRIVE_LIBRARY'
         LIMIT 1`
      )
      .bind(`db_drive_${folderId}`, `drive://${folderId}`)
      .first();
    return Boolean(row?.id);
  } catch {
    return false;
  }
}

export async function _listVaultMirroredDriveFiles(db, query = '') {
  if (!db) return [];
  const qNorm = String(query || '').trim().toLowerCase();
  const merged = new Map();

  try {
    const res = await db
      .prepare(
        `SELECT id, title, folder, category, content_markdown, tags, source_path, updated_at
         FROM knowledge_vault
         WHERE folder = '07_GOOGLE_DRIVE_LIBRARY'
           AND id != '00_GOOGLE_DRIVE_INDEX'
           AND title NOT LIKE '📁%'
           AND LOWER(title) NOT LIKE '%.mp3'
           AND LOWER(title) NOT LIKE '%.rar'
           AND LOWER(title) NOT LIKE '%.zip'
           AND (category IS NULL OR category NOT IN ('drive_folder', 'listening'))
           AND (content_markdown IS NULL OR content_markdown NOT LIKE '%Không trích xuất được nội dung%')
           AND LENGTH(COALESCE(content_markdown, '')) >= 80
         ORDER BY updated_at DESC
         LIMIT 100`
      )
      .all();
    for (const r of (res?.results || [])) {
      const rawName = String(r.title || r.id || '').replace(/^📄\s*/, '').trim();
      if (!rawName || /\.(mp3|rar|zip|doc)$/i.test(rawName)) continue;
      const displayTitle = normalizeVietnameseSourceTitle(rawName, r.id);
      const groupInfo = classifyDriveFileGroup(rawName, r.id);
      const driveId = String(r.source_path || '').startsWith('drive://')
        ? String(r.source_path).replace(/^drive:\/\//, '')
        : String(r.id || '').replace(/^db_drive_/, '').replace(/^drive-/, '');
      const linkMatch = String(r.content_markdown || '').match(/https:\/\/(?:drive|docs)\.google\.com\/[^\s)]+/i);
      const webViewLink =
        linkMatch?.[0] ||
        (driveId && !driveId.startsWith('07_') ? `https://drive.google.com/file/d/${driveId}/view` : `/second-brain?id=${encodeURIComponent(r.id)}`);
      const contentLen = String(r.content_markdown || '').length;
      const item = {
        id: r.id,
        driveId,
        vaultId: r.id,
        name: displayTitle || rawName,
        rawName,
        groupKey: groupInfo.key,
        groupLabel: groupInfo.label,
        mimeType: rawName.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : rawName.toLowerCase().endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/vnd.google-apps.document',
        size: contentLen > 0 ? contentLen * 2 : 24576,
        modifiedTime: r.updated_at || new Date().toISOString(),
        webViewLink,
        thumbnailLink: null,
        isFolder: false,
        syncedInVault: true
      };
      merged.set(item.driveId || item.id, item);
    }
  } catch {}

  try {
    const dfRes = await db
      .prepare(
        `SELECT drive_id, name, mime_type, size_bytes, web_view_link, modified_time
         FROM drive_file_index
         WHERE mime_type IN (
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/pdf',
           'text/plain',
           'application/vnd.google-apps.document'
         )
         ORDER BY modified_time DESC
         LIMIT 60`
      )
      .all();
    for (const row of (dfRes?.results || [])) {
      const rawName = String(row.name || '').trim();
      if (!rawName || /\.(mp3|rar|zip|doc)$/i.test(rawName)) continue;
      if (merged.has(row.drive_id)) continue;
      const displayTitle = normalizeVietnameseSourceTitle(rawName, row.drive_id);
      const groupInfo = classifyDriveFileGroup(rawName, row.drive_id);
      merged.set(row.drive_id, {
        id: row.drive_id,
        driveId: row.drive_id,
        vaultId: `db_drive_${row.drive_id}`,
        name: displayTitle || rawName,
        rawName,
        groupKey: groupInfo.key,
        groupLabel: groupInfo.label,
        mimeType: row.mime_type,
        size: row.size_bytes ? Number(row.size_bytes) : 24576,
        modifiedTime: row.modified_time || new Date().toISOString(),
        webViewLink: row.web_view_link || `https://drive.google.com/file/d/${row.drive_id}/view`,
        thumbnailLink: null,
        isFolder: false,
        syncedInVault: true
      });
    }
  } catch {}

  return Array.from(merged.values()).filter((f) => {
    if (!qNorm) return true;
    return (
      f.name.toLowerCase().includes(qNorm) ||
      f.rawName.toLowerCase().includes(qNorm) ||
      (f.groupLabel || '').toLowerCase().includes(qNorm)
    );
  });
}

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ staff mới truy cập Drive' }, { status: 403 });
  }

  const rawFolderId = (url.searchParams.get('folder_id') || '').trim();
  const folderId = !rawFolderId || rawFolderId === 'root' ? DEFAULT_DRIVE_FOLDER : rawFolderId;
  const query = url.searchParams.get('q') || '';

  // Validate folder_id format (regex) + allowlist or synced subfolder in D1
  if (!FOLDER_ID_RE.test(folderId)) {
    return json({ success: false, error: 'InvalidFolderId: folder_id không đúng định dạng' }, { status: 400 });
  }
  if (!(await isAllowedOrSyncedFolderId(platform, folderId))) {
    return json({ success: false, error: 'Forbidden: folder_id không nằm trong danh sách cho phép' }, { status: 403 });
  }

  // Ưu tiên 1: Service Account (đọc được folder riêng tư đã share cho nó)
  let bearerToken = null;
  let authMethod = 'none';
  if (await hasServiceAccount(platform)) {
    bearerToken = await getServiceAccountToken(platform);
    if (bearerToken) authMethod = 'service_account';
  }

  // Fallback: API key (chỉ folder công khai)
  let apiKey = null;
  if (!bearerToken) {
    apiKey = platform?.env?.GOOGLE_DRIVE_API_KEY;
    if (!apiKey && platform?.env?.DB) {
      try {
        const row = await platform.env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'google_drive_api_key' LIMIT 1`).bind().first();
        if (row?.value) apiKey = row.value;
      } catch {}
    }
    if (apiKey) authMethod = 'api_key';
  }

  if (!bearerToken && !apiKey) {
    const mirrored = await _listVaultMirroredDriveFiles(platform?.env?.DB, query);
    if (mirrored.length > 0) {
      return json({
        success: true,
        files: mirrored,
        source: 'knowledge_vault_mirror',
        auth_method: 'd1_mirror',
        needs_setup: false
      });
    }
    return json({
      success: false,
      error: 'Chưa cấu hình Google Drive. Cần Service Account hoặc API key.',
      needs_setup: true
    }, { status: 503 });
  }

  try {
    let driveQuery = `'${folderId}' in parents and trashed = false`;
    if (query) {
      driveQuery += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }

    const driveUrl = new URL('https://www.googleapis.com/drive/v3/files');
    driveUrl.searchParams.set('q', driveQuery);
    driveUrl.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)');
    driveUrl.searchParams.set('pageSize', '100');
    driveUrl.searchParams.set('orderBy', 'modifiedTime desc');
    const fetchHeaders = {};
    if (bearerToken) {
      fetchHeaders['Authorization'] = `Bearer ${bearerToken}`;
    } else {
      driveUrl.searchParams.set('key', apiKey);
    }

    const res = await fetch(driveUrl.toString(), { headers: fetchHeaders });
    const data = await res.json();

    if (data.error) {
      const mirrored = await _listVaultMirroredDriveFiles(platform?.env?.DB, query);
      if (mirrored.length > 0) {
        return json({
          success: true,
          files: mirrored,
          source: 'knowledge_vault_mirror',
          auth_method: 'd1_mirror'
        });
      }
      return json({ success: false, error: 'Drive API: ' + (data.error.message || 'Unknown error') }, { status: 502 });
    }

    const liveFiles = (data.files || []).map((f) => {
      const rawName = String(f.name || '');
      const displayTitle = normalizeVietnameseSourceTitle(rawName, f.id);
      const groupInfo = classifyDriveFileGroup(rawName, f.id);
      return {
        id: f.id,
        driveId: f.id,
        vaultId: `db_drive_${f.id}`,
        name: displayTitle || rawName,
        rawName,
        groupKey: groupInfo.key,
        groupLabel: groupInfo.label,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size, 10) : 0,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        thumbnailLink: f.thumbnailLink,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder'
      };
    });

    // Khi mở thư mục gốc (hoặc thư mục chỉ chứa các folder con mà chưa hiện tài liệu lẻ),
    // bổ sung danh sách tài liệu đã đồng bộ trong Kho Tri Thức D1 để giáo viên dùng ngay
    const nonFolderLiveCount = liveFiles.filter((f) => !f.isFolder).length;
    if (folderId === DEFAULT_DRIVE_FOLDER || nonFolderLiveCount === 0) {
      const mirrored = await _listVaultMirroredDriveFiles(platform?.env?.DB, query);
      const seenIds = new Set(liveFiles.map((f) => f.driveId || f.id));
      for (const m of mirrored) {
        const key = m.driveId || m.id;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          liveFiles.push(m);
        }
      }
    }

    return json({
      success: true,
      files: liveFiles,
      source: 'google_drive',
      auth_method: authMethod
    });
  } catch (err) {
    const mirrored = await _listVaultMirroredDriveFiles(platform?.env?.DB, query);
    if (mirrored.length > 0) {
      return json({
        success: true,
        files: mirrored,
        source: 'knowledge_vault_mirror',
        auth_method: 'd1_mirror'
      });
    }
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

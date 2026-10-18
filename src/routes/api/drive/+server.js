// src/routes/api/drive/+server.js
// Google Drive API proxy: list files from a Drive folder
// Ưu tiên Service Account (đọc folder riêng tư), fallback API key (chỉ folder công khai),
// hoặc fallback Kho Tri Thức D1 (các tệp Drive đã đồng bộ)
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

async function listVaultMirroredDriveFiles(db, query = '') {
  if (!db) return [];
  try {
    const qNorm = String(query || '').trim().toLowerCase();
    const res = await db
      .prepare(
        `SELECT id, title, category, content, tags, source_url, updated_at, created_at
         FROM knowledge_vault
         WHERE id LIKE 'drive-%' OR source_url LIKE '%drive.google.com%'
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 100`
      )
      .bind()
      .all();
    const rows = res?.results || [];
    return rows
      .map((r) => {
        const rawName = String(r.title || r.id || '');
        const displayTitle = normalizeVietnameseSourceTitle(rawName);
        const groupInfo = classifyDriveFileGroup(rawName);
        const driveId = String(r.id || '').replace(/^drive-/, '');
        const webViewLink =
          r.source_url ||
          (driveId ? `https://drive.google.com/file/d/${driveId}/view` : '/second-brain');
        const contentLen = String(r.content || '').length;
        return {
          id: r.id,
          driveId,
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
          modifiedTime: r.updated_at || r.created_at || new Date().toISOString(),
          webViewLink,
          thumbnailLink: null,
          isFolder: false
        };
      })
      .filter((f) => {
        if (!qNorm) return true;
        return (
          f.name.toLowerCase().includes(qNorm) ||
          f.rawName.toLowerCase().includes(qNorm) ||
          (f.groupLabel || '').toLowerCase().includes(qNorm)
        );
      });
  } catch {
    return [];
  }
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

  // Validate folder_id format (regex) + allowlist (same as /api/drive/sync)
  if (!FOLDER_ID_RE.test(folderId)) {
    return json({ success: false, error: 'InvalidFolderId: folder_id không đúng định dạng' }, { status: 400 });
  }
  if (!new Set(getAllowedFolderIds(platform)).has(folderId)) {
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
    const mirrored = await listVaultMirroredDriveFiles(platform?.env?.DB, query);
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
    // Auth: ưu tiên Bearer (service account), fallback key param
    const fetchHeaders = {};
    if (bearerToken) {
      fetchHeaders['Authorization'] = `Bearer ${bearerToken}`;
    } else {
      driveUrl.searchParams.set('key', apiKey);
    }

    const res = await fetch(driveUrl.toString(), { headers: fetchHeaders });
    const data = await res.json();

    if (data.error) {
      const mirrored = await listVaultMirroredDriveFiles(platform?.env?.DB, query);
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

    return json({
      success: true,
      files: (data.files || []).map(f => {
        const rawName = String(f.name || '');
        const displayTitle = normalizeVietnameseSourceTitle(rawName);
        const groupInfo = classifyDriveFileGroup(rawName);
        return {
          id: f.id,
          name: displayTitle || rawName,
          rawName,
          groupKey: groupInfo.key,
          groupLabel: groupInfo.label,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size) : 0,
          modifiedTime: f.modifiedTime,
          webViewLink: f.webViewLink,
          thumbnailLink: f.thumbnailLink,
          isFolder: f.mimeType === 'application/vnd.google-apps.folder'
        };
      }),
      source: 'google_drive',
      auth_method: authMethod
    });
  } catch (err) {
    const mirrored = await listVaultMirroredDriveFiles(platform?.env?.DB, query);
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

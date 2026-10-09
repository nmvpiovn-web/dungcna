// src/routes/api/drive/+server.js
// Google Drive API proxy: list files from a Drive folder
// Ưu tiên Service Account (đọc folder riêng tư), fallback API key (chỉ folder công khai)
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { getServiceAccountToken, hasServiceAccount } from '$lib/server/googleServiceAccount.js';
import { DEFAULT_DRIVE_FOLDER } from '$lib/server/driveSync.js';

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

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ staff mới truy cập Drive' }, { status: 403 });
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
    return json({
      success: false,
      error: 'Chưa cấu hình Google Drive. Cần Service Account hoặc API key.',
      needs_setup: true
    }, { status: 503 });
  }

  const folderId = url.searchParams.get('folder_id') || DEFAULT_DRIVE_FOLDER;
  const query = url.searchParams.get('q') || '';

  // Validate folder_id format (regex) + allowlist (same as /api/drive/sync)
  if (!FOLDER_ID_RE.test(folderId)) {
    return json({ success: false, error: 'InvalidFolderId: folder_id không đúng định dạng' }, { status: 400 });
  }
  if (!new Set(getAllowedFolderIds(platform)).has(folderId)) {
    return json({ success: false, error: 'Forbidden: folder_id không nằm trong danh sách cho phép' }, { status: 403 });
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
      return json({ success: false, error: 'Drive API: ' + (data.error.message || 'Unknown error') }, { status: 502 });
    }

    return json({
      success: true,
      files: (data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size) : 0,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        thumbnailLink: f.thumbnailLink,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder'
      })),
      source: 'google_drive',
      auth_method: authMethod
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

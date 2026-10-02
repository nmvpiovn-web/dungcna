// src/routes/api/drive/+server.js
// Google Drive API proxy: list files from a Drive folder
// Requires GOOGLE_DRIVE_API_KEY env var (set via Cloudflare Pages env)
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ staff mới truy cập Drive' }, { status: 403 });
  }

  let apiKey = platform?.env?.GOOGLE_DRIVE_API_KEY;
  // Fallback: key lưu trong D1 site_settings (nhập từ dashboard)
  if (!apiKey && platform?.env?.DB) {
    try {
      const row = await platform.env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'google_drive_api_key' LIMIT 1`).bind().first();
      if (row?.value) apiKey = row.value;
    } catch {}
  }
  if (!apiKey) {
    return json({
      success: false,
      error: 'Chưa cấu hình Google Drive API key. Nhập key ở ô bên dưới hoặc thêm GOOGLE_DRIVE_API_KEY vào Cloudflare Pages env.',
      needs_setup: true
    }, { status: 503 });
  }

  const folderId = url.searchParams.get('folder_id') || 'root';
  const query = url.searchParams.get('q') || '';

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
    driveUrl.searchParams.set('key', apiKey);

    const res = await fetch(driveUrl.toString());
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
      source: 'google_drive'
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

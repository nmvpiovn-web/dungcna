// src/routes/api/drive/key/+server.js
// Quản lý Google Drive API key — staff only, lưu vào D1 site_settings
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;
const KEY_NAME = 'google_drive_api_key';

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  // Không trả key thật về client — chỉ báo đã có hay chưa
  const envKey = platform?.env?.GOOGLE_DRIVE_API_KEY;
  let dbKey = false;
  try {
    const row = await platform.env.DB.prepare(`SELECT key FROM site_settings WHERE key = ? LIMIT 1`).bind(KEY_NAME).first();
    dbKey = !!row;
  } catch {}
  return json({ success: true, has_env_key: !!envKey, has_db_key: dbKey, configured: !!envKey || dbKey });
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  let body = {};
  try { body = await request.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
  const apiKey = String(body.api_key || '').trim();
  if (!apiKey || apiKey.length < 10) return json({ success: false, error: 'API key không hợp lệ' }, { status: 400 });
  try {
    // Test key: API key chỉ đọc được file public, không list được root (cần OAuth).
    // Key hợp lệ = không báo API_KEY_INVALID. 403 insufficientFilePermissions vẫn tính là key đúng.
    const testUrl = `https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)&key=${encodeURIComponent(apiKey)}`;
    const testRes = await fetch(testUrl);
    const testData = await testRes.json();
    if (testData.error) {
      const reason = testData.error.errors?.[0]?.reason || '';
      const msg = testData.error.message || '';
      // Chỉ reject khi key thật sự sai
      if (reason === 'badRequest' && msg.includes('API key not valid')) {
        return json({ success: false, error: 'API key không hợp lệ. Kiểm tra lại key.' }, { status: 400 });
      }
      // 403 = key đúng nhưng không có quyền list root (bình thường với API key) → chấp nhận
    }
    await platform.env.DB.prepare(`
      INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).bind(KEY_NAME, apiKey).run();
    return json({ success: true, message: 'Đã lưu Google Drive API key' });
  } catch (e) {
    return json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  try {
    await platform.env.DB.prepare(`DELETE FROM site_settings WHERE key = ?`).bind(KEY_NAME).run();
    return json({ success: true, message: 'Đã xóa key' });
  } catch (e) {
    return json({ success: false, error: e.message }, { status: 500 });
  }
}

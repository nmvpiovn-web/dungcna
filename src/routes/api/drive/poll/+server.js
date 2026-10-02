// src/routes/api/drive/poll/+server.js
// Poll Google Drive Changes API để phát hiện file mới/thay đổi
// Dùng cho cronjob chạy định kỳ (realtime-ish)
// GET: kiểm tra thay đổi | POST: trigger sync nếu có thay đổi
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { getServiceAccountToken } from '$lib/server/googleServiceAccount.js';

export const prerender = false;

async function getDriveAuth(platform) {
  const token = await getServiceAccountToken(platform);
  if (token) return { headers: { 'Authorization': `Bearer ${token}` } };
  return null;
}

export async function GET({ platform }) {
  // Public endpoint cho cron (không cần auth user, dùng service account)
  // Nhưng vẫn check có service account không
  const driveAuth = await getDriveAuth(platform);
  if (!driveAuth) {
    return json({ success: false, error: 'Chưa cấu hình Service Account' }, { status: 503 });
  }
  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  }

  const db = platform.env.DB;

  try {
    // Lấy change token đã lưu
    let state = await db.prepare(`SELECT last_change_token FROM drive_sync_state WHERE id = 1`).first();
    let pageToken = state?.last_change_token;

    // Nếu chưa có token, lấy token mới nhất (không sync toàn bộ, chỉ từ giờ trở đi)
    if (!pageToken) {
      const tokenRes = await fetch('https://www.googleapis.com/drive/v3/changes/startPageToken', {
        headers: driveAuth.headers
      });
      const tokenData = await tokenRes.json();
      pageToken = tokenData.startPageToken;

      await db.prepare(`
        INSERT INTO drive_sync_state (id, last_change_token, last_poll_at)
        VALUES (1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET last_change_token = excluded.last_change_token, last_poll_at = CURRENT_TIMESTAMP
      `).bind(pageToken).run();

      return json({
        success: true,
        has_changes: false,
        message: 'Đã khởi tạo change token, sẽ phát hiện thay đổi từ lần poll sau',
        page_token: pageToken
      });
    }

    // Kiểm tra thay đổi
    const changesRes = await fetch(
      `https://www.googleapis.com/drive/v3/changes?pageToken=${pageToken}&fields=changes(fileId,file(name,mimeType,parents)),newStartPageToken,nextPageToken`,
      { headers: driveAuth.headers }
    );
    const changesData = await changesRes.json();

    if (changesData.error) {
      // Token hết hạn, reset
      if (changesData.error.code === 410) {
        await db.prepare(`DELETE FROM drive_sync_state WHERE id = 1`).run();
        return json({ success: false, error: 'Change token hết hạn, đã reset', need_reinit: true }, { status: 410 });
      }
      throw new Error(changesData.error.message);
    }

    const changes = changesData.changes || [];
    const newToken = changesData.newStartPageToken || pageToken;

    // Lưu token mới
    await db.prepare(`
      UPDATE drive_sync_state SET last_change_token = ?, last_poll_at = CURRENT_TIMESTAMP WHERE id = 1
    `).bind(newToken).run();

    // Lọc file thay đổi (không phải folder đã xóa)
    const relevantChanges = changes.filter(c => c.file && !c.file.trashed);

    return json({
      success: true,
      has_changes: relevantChanges.length > 0,
      change_count: relevantChanges.length,
      changes: relevantChanges.slice(0, 20).map(c => ({
        file_id: c.fileId,
        name: c.file?.name,
        mime_type: c.file?.mimeType
      })),
      page_token: newToken
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  // Trigger sync nếu có thay đổi (dùng cho cron)
  const auth = await verifyServerAuth(request, platform);
  // Cho phép cron không auth (dùng header bí mật) hoặc staff
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = platform?.env?.CRON_SECRET;
  const isCron = cronSecret && expectedSecret && cronSecret === expectedSecret;
  const isStaff = auth.authenticated && isStaffUser(auth.user);

  if (!isCron && !isStaff) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Kiểm tra thay đổi trước
  const checkRes = await fetch(new URL('/api/drive/poll', request.url).toString());
  const checkData = await checkRes.json();

  if (!checkData.success) {
    return json({ success: false, error: checkData.error }, { status: 500 });
  }

  if (!checkData.has_changes) {
    return json({ success: true, message: 'Không có thay đổi mới', synced: false });
  }

  // Có thay đổi → trigger sync
  // Gọi sync API nội bộ
  const syncRes = await fetch(new URL('/api/drive/sync', request.url).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Truyền auth nội bộ
      ...(auth.authenticated ? { 'Authorization': request.headers.get('authorization') || '' } : {})
    },
    body: JSON.stringify({ folder_id: '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou', recursive: true })
  });

  // Nếu không có auth user (cron), cần cách khác...
  // Tạm thời trả về thông tin thay đổi để cron job bên ngoài gọi sync
  return json({
    success: true,
    message: `Phát hiện ${checkData.change_count} thay đổi`,
    has_changes: true,
    change_count: checkData.change_count,
    changes: checkData.changes,
    note: 'Gọi POST /api/drive/sync với staff token để sync'
  });
}

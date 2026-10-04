// src/routes/api/drive/poll/+server.js
// Poll Google Drive Changes API để phát hiện file mới/thay đổi
// SECURITY (issue #2 P1):
// - Mọi endpoint làm thay đổi token đều yêu cầu cron secret hoặc manager auth
// - GET công khai KHÔNG được mutate state, KHÔNG lộ tên file/ID/page token
// - Chỉ commit last_change_token SAU KHI sync thành công
// - Fail-closed: kiểm tra kết quả sync, không báo success giả
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isManager } from '../../../../lib/server/auth.js';
import { getServiceAccountToken } from '../../../../lib/server/googleServiceAccount.js';

export const prerender = false;

async function getDriveAuth(platform) {
  const token = await getServiceAccountToken(platform);
  if (token) return { headers: { 'Authorization': `Bearer ${token}` } };
  return null;
}

function isAuthorizedCron(request, platform) {
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = platform?.env?.CRON_SECRET;
  return !!(cronSecret && expectedSecret && cronSecret === expectedSecret);
}

async function isAuthorizedManager(request, platform) {
  try {
    const auth = await verifyServerAuth(request, platform);
    return auth.authenticated && isManager(auth.user);
  } catch {
    return false;
  }
}

// Kiểm tra thay đổi Drive mà KHÔNG mutate state (dùng cho GET)
// Trả về { hasChanges, changeCount, newToken } — newToken chỉ dùng nội bộ
async function checkDriveChanges(platform) {
  const driveAuth = await getDriveAuth(platform);
  if (!driveAuth) {
    return { error: 'Chưa cấu hình Service Account', status: 503 };
  }
  if (!platform?.env?.DB) {
    return { error: 'DatabaseUnavailable', status: 500 };
  }
  const db = platform.env.DB;

  const state = await db.prepare(
    `SELECT last_change_token FROM drive_sync_state WHERE id = 1`
  ).first();
  const pageToken = state?.last_change_token;

  // Chưa có token: khởi tạo nhưng KHÔNG coi là có thay đổi
  if (!pageToken) {
    const tokenRes = await fetch('https://www.googleapis.com/drive/v3/changes/startPageToken', {
      headers: driveAuth.headers
    });
    if (!tokenRes.ok) {
      return { error: `Drive API ${tokenRes.status}`, status: 502 };
    }
    const tokenData = await tokenRes.json();
    const newToken = tokenData.startPageToken;
    if (!newToken) {
      return { error: 'Không lấy được startPageToken', status: 502 };
    }
    // Lưu token khởi tạo (lần đầu, chưa có gì để mất)
    await db.prepare(`
      INSERT INTO drive_sync_state (id, last_change_token, last_poll_at)
      VALUES (1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET last_change_token = excluded.last_change_token, last_poll_at = CURRENT_TIMESTAMP
    `).bind(newToken).run();
    return { hasChanges: false, changeCount: 0, newToken, initialized: true };
  }

  const changesRes = await fetch(
    `https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(pageToken)}&fields=changes(fileId),newStartPageToken,nextPageToken`,
    { headers: driveAuth.headers }
  );
  if (!changesRes.ok) {
    const errData = await changesRes.json().catch(() => ({}));
    if (errData?.error?.code === 410) {
      await db.prepare(`DELETE FROM drive_sync_state WHERE id = 1`).run();
      return { error: 'Change token hết hạn, đã reset', status: 410, needReinit: true };
    }
    return { error: `Drive API ${changesRes.status}`, status: 502 };
  }
  const changesData = await changesRes.json();
  const changes = changesData.changes || [];
  const newToken = changesData.newStartPageToken || pageToken;

  return { hasChanges: changes.length > 0, changeCount: changes.length, newToken };
}

export async function GET({ request, platform }) {
  // Yêu cầu cron secret hoặc manager auth — không còn public
  const cron = isAuthorizedCron(request, platform);
  const manager = await isAuthorizedManager(request, platform);
  if (!cron && !manager) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await checkDriveChanges(platform);
  if (result.error) {
    return json({ success: false, error: result.error }, { status: result.status || 500 });
  }

  // KHÔNG lộ page token, tên file, ID cho caller — chỉ báo có/không thay đổi
  // KHÔNG advance token ở đây — token chỉ commit sau sync thành công
  await platform.env.DB.prepare(
    `UPDATE drive_sync_state SET last_poll_at = CURRENT_TIMESTAMP WHERE id = 1`
  ).run().catch(() => {});

  return json({
    success: true,
    has_changes: result.hasChanges,
    change_count: result.changeCount
  });
}

export async function POST({ request, platform }) {
  // Trigger sync nếu có thay đổi (dùng cho cron)
  const cron = isAuthorizedCron(request, platform);
  const manager = await isAuthorizedManager(request, platform);
  if (!cron && !manager) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Kiểm tra thay đổi (không mutate token)
  const check = await checkDriveChanges(platform);
  if (check.error) {
    return json({ success: false, error: check.error }, { status: check.status || 500 });
  }
  if (!check.hasChanges) {
    return json({ success: true, message: 'Không có thay đổi mới', synced: false });
  }

  // Gọi sync TRỰC TIẾP qua import nội bộ (không fetch HTTP vòng lại)
  // để có service auth hợp lệ và kiểm tra kết quả fail-closed
  let syncResult;
  try {
    const { runDriveSync } = await import('../../../../lib/server/driveSync.js');
    syncResult = await runDriveSync(platform, {
      folder_id: '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou',
      recursive: true,
      triggered_by: cron ? 'cron' : 'manager'
    });
  } catch (err) {
    return json({ success: false, error: `Sync failed: ${err.message}`, synced: false }, { status: 500 });
  }

  // Fail-closed: kiểm tra kết quả sync
  if (!syncResult || !syncResult.success) {
    return json({
      success: false,
      error: syncResult?.error || 'Sync không thành công, token chưa được commit',
      synced: false
    }, { status: 500 });
  }

  // CHỈ commit token SAU KHI sync thành công
  try {
    await platform.env.DB.prepare(
      `UPDATE drive_sync_state SET last_change_token = ?, last_poll_at = CURRENT_TIMESTAMP WHERE id = 1`
    ).bind(check.newToken).run();
  } catch (dbErr) {
    return json({
      success: false,
      error: `Sync OK nhưng không commit được token: ${dbErr.message}`,
      synced: true,
      token_committed: false
    }, { status: 500 });
  }

  return json({
    success: true,
    message: `Đã sync ${syncResult.files_synced || 0} file`,
    synced: true,
    token_committed: true
  });
}

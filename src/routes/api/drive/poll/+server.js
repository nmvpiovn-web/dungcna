// src/routes/api/drive/poll/+server.js
// Poll Google Drive Changes API để phát hiện file mới/thay đổi
// SECURITY (issue #2 P1):
// - Mọi endpoint làm thay đổi token đều yêu cầu cron secret hoặc manager auth
// - GET công khai KHÔNG được mutate state, KHÔNG lộ tên file/ID/page token
// - Chỉ commit last_change_token SAU KHI sync thành công
// - Fail-closed: kiểm tra kết quả sync, không báo success giả
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isManager, constantTimeEqual } from '../../../../lib/server/auth.js';
import {
  getStartPageToken,
  checkDriveChanges,
  commitToken,
  commitTokenAfterSync
} from '../../../../lib/server/driveChanges.js';

export const prerender = false;

function isAuthorizedCron(request, platform) {
  const cronSecret = request.headers.get('x-cron-secret') || '';
  const expectedSecret = platform?.env?.CRON_SECRET || '';
  // Constant-time compare: never === on secrets (timing-attack resistant)
  return !!(cronSecret && expectedSecret && constantTimeEqual(cronSecret, expectedSecret));
}

async function isAuthorizedManager(request, platform) {
  try {
    const auth = await verifyServerAuth(request, platform);
    return auth.authenticated && isManager(auth.user);
  } catch {
    return false;
  }
}

export async function GET({ request, platform }) {
  // Yêu cầu cron secret hoặc manager auth — không còn public
  const cron = isAuthorizedCron(request, platform);
  const manager = await isAuthorizedManager(request, platform);
  if (!cron && !manager) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkDriveChanges(platform);
    if (result.error) {
      return json({ success: false, error: result.error }, { status: result.status || 500 });
    }

    return json({
      success: true,
      has_changes: result.hasChanges,
      change_count: result.changeCount,
      needs_initialization: !!result.initialized
    });
  } catch (e) {
    console.error('[drive-poll] GET failed:', e.message);
    return json({ success: false, error: 'PollFailed' }, { status: 500 });
  }
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
  if (check.needReinit) {
    const initial = await getStartPageToken(platform);
    if (initial.error) return json({ success: false, error: initial.error }, { status: initial.status || 500 });
    try {
      await commitToken(platform, initial.newToken);
    } catch (dbErr) {
      return json({ success: false, error: `Không lưu được token khởi tạo lại: ${dbErr.message}` }, { status: 500 });
    }
    return json({ success: true, message: 'Token Drive hết hạn; đã khởi tạo lại', initialized: true, synced: false });
  }
  if (check.error) {
    return json({ success: false, error: check.error }, { status: check.status || 500 });
  }
  if (check.initialized) {
    try {
      await commitToken(platform, check.newToken);
    } catch (dbErr) {
      return json({ success: false, error: `Không lưu được token khởi tạo: ${dbErr.message}` }, { status: 500 });
    }
    return json({ success: true, message: 'Đã khởi tạo Drive change token', initialized: true, synced: false });
  }
  if (!check.hasChanges) {
    // POST được phép advance token khi Google xác nhận không có thay đổi.
    try {
      await commitToken(platform, check.newToken);
    } catch (dbErr) {
      return json({ success: false, error: `Không commit được token: ${dbErr.message}` }, { status: 500 });
    }
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
  const tokenRes = await commitTokenAfterSync(platform);
  if (!tokenRes.committed) {
    return json({
      success: false,
      error: `Sync OK nhưng không commit được token: ${tokenRes.error}`,
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

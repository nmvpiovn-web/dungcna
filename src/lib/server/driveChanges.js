// src/lib/server/driveChanges.js
// Logic Google Drive Changes API dùng chung:
// - POST /api/drive/poll (cron trigger: check → sync → commit token)
// - POST /api/drive/sync (manager trigger: sync → commit token)
// Fix 2026-10-06: trước đây chỉ POST /api/drive/poll commit token,
// còn POST /api/drive/sync không commit → cron (GET poll + POST sync)
// kẹt vĩnh viễn ở has_changes=true. Giờ cả hai đều commit sau sync thành công.
import { getServiceAccountToken } from './googleServiceAccount.js';

export async function getDriveAuth(platform) {
  const token = await getServiceAccountToken(platform);
  if (token) return { headers: { 'Authorization': `Bearer ${token}` } };
  return null;
}

export async function getStartPageToken(platform) {
  const driveAuth = await getDriveAuth(platform);
  if (!driveAuth) return { error: 'Chưa cấu hình Service Account', status: 503 };
  const tokenRes = await fetch('https://www.googleapis.com/drive/v3/changes/startPageToken', {
    headers: driveAuth.headers
  });
  if (!tokenRes.ok) return { error: `Drive API ${tokenRes.status}`, status: 502 };
  const tokenData = await tokenRes.json();
  return tokenData.startPageToken
    ? { newToken: tokenData.startPageToken }
    : { error: 'Không lấy được startPageToken', status: 502 };
}

// Kiểm tra thay đổi Drive mà KHÔNG mutate state.
// Theo hết nextPageToken để không bỏ sót hoặc lặp vĩnh viễn trang đầu.
export async function checkDriveChanges(platform) {
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

  // Chưa có token: chỉ lấy token. Caller sẽ là nơi lưu token khởi tạo.
  if (!pageToken) {
    const initial = await getStartPageToken(platform);
    return initial.error ? initial : { hasChanges: false, changeCount: 0, newToken: initial.newToken, initialized: true };
  }

  let requestToken = pageToken;
  let changeCount = 0;
  const seenTokens = new Set([requestToken]);
  // Limit pagination to avoid Cloudflare subrequest limits (max 50 per invocation)
  for (let page = 0; page < 10; page++) {
    const changesRes = await fetch(
      `https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(requestToken)}&fields=changes(fileId),newStartPageToken,nextPageToken`,
      { headers: driveAuth.headers }
    );
    if (!changesRes.ok) {
      const errData = await changesRes.json().catch(() => ({}));
      if (changesRes.status === 410 || errData?.error?.code === 410) {
        return { error: 'Change token hết hạn; cần POST để khởi tạo lại', status: 410, needReinit: true };
      }
      return { error: `Drive API ${changesRes.status}`, status: 502 };
    }
    const changesData = await changesRes.json();
    changeCount += (changesData.changes || []).length;
    if (changesData.nextPageToken) {
      // Loop detection: break if we've seen this token
      if (seenTokens.has(changesData.nextPageToken)) break;
      seenTokens.add(changesData.nextPageToken);
      requestToken = changesData.nextPageToken;
      continue;
    }
    return {
      hasChanges: changeCount > 0,
      changeCount,
      newToken: changesData.newStartPageToken || requestToken
    };
  }
  // Hit pagination limit — return what we have with the latest token
  return {
    hasChanges: changeCount > 0,
    changeCount,
    newToken: requestToken,
    paginationTruncated: true
  };
}

export async function commitToken(platform, token) {
  await platform.env.DB.prepare(`
    INSERT INTO drive_sync_state (id, last_change_token, last_poll_at)
    VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET last_change_token = excluded.last_change_token, last_poll_at = CURRENT_TIMESTAMP
  `).bind(token).run();
}

// Commit token sau khi sync thành công. Dùng chung cho cả
// POST /api/drive/poll và POST /api/drive/sync để token luôn advance,
// tránh kẹt vĩnh viễn ở has_changes=true.
// Trả về { committed: true } hoặc { committed: false, error }.
export async function commitTokenAfterSync(platform) {
  try {
    const check = await checkDriveChanges(platform);
    if (check.error && !check.needReinit && !check.initialized) {
      return { committed: false, error: check.error };
    }
    const tokenToCommit = check.newToken;
    if (!tokenToCommit) {
      return { committed: false, error: 'Không lấy được token để commit' };
    }
    await commitToken(platform, tokenToCommit);
    return { committed: true, changeCount: check.changeCount || 0 };
  } catch (e) {
    return { committed: false, error: e.message };
  }
}

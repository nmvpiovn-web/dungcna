// src/routes/api/drive/sync/+server.js
// Sync tài liệu Google Drive vào knowledge_vault (kho tri thức)
// POST /api/drive/sync { folder_id?, recursive? } — MANAGER only (issue #2 P1)
// Logic sync dùng chung với cron qua $lib/server/driveSync.js
// Fix 2026-10-06: commit change token sau sync thành công (dùng chung
// logic với POST /api/drive/poll) để tránh kẹt vĩnh viễn has_changes=true.
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isManager } from '$lib/server/auth.js';
import { runDriveSync } from '$lib/server/driveSync.js';
import { commitTokenAfterSync } from '$lib/server/driveChanges.js';

export const prerender = false;

async function auditLog(platform, action, user, detail) {
  try {
    await platform.env.DB.prepare(`
      INSERT INTO drive_credential_audit (id, action, actor_user_id, actor_username, detail)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      `dca_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action, user?.id || '', user?.username || '', detail || ''
    ).run();
  } catch {}
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  // Issue #2 P1: thao tác sync toàn cục chỉ dành cho manager (leader/admin/superadmin), không cho teacher
  if (!isManager(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ quản lý' }, { status: 403 });

  let body = {};
  try { body = await request.json(); } catch {}
  const folderId = body.folder_id || '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou';
  const recursive = body.recursive !== false;
  const batchLimit = Math.min(Number(body.batch_limit) || 50, 200);

  const result = await runDriveSync(platform, {
    folder_id: folderId,
    recursive,
    batch_limit: batchLimit,
    triggered_by: auth.user?.username || 'manager'
  });

  await auditLog(platform, 'drive_sync', auth.user, `folder=${folderId} success=${result.success} files=${result.files_synced || 0}`);

  if (!result.success) {
    return json({ success: false, error: result.error, stats: result.stats }, { status: 500 });
  }

  // Commit change token sau sync thành công để poll không báo
  // has_changes=true vĩnh viễn. runDriveSync ở changes mode đã tự commit
  // token chính xác theo từng page (resume-safe) → bỏ qua bước này để không
  // advance token qua change chưa xử lý. Chỉ commit mù khi sync trọn vẹn
  // (!partial) và runDriveSync chưa commit.
  let tokenCommitted = !!result.token_committed;
  if (!tokenCommitted && !result.partial) {
    try {
      const tokenRes = await commitTokenAfterSync(platform);
      tokenCommitted = tokenRes.committed;
      if (!tokenCommitted) {
        console.warn('[drive-sync] Sync OK nhưng commit token thất bại:', tokenRes.error);
      }
    } catch (e) {
      console.warn('[drive-sync] Commit token sau sync lỗi:', e.message);
    }
  }

  return json({
    success: true,
    message: `Đã sync ${result.files_synced} files từ Drive vào kho tri thức`,
    stats: result.stats,
    log_id: result.log_id,
    errors: result.errors,
    token_committed: tokenCommitted,
    mode: result.mode || 'unknown',
    partial: !!result.partial,
    full_scan_complete: result.full_scan_complete
  });
}

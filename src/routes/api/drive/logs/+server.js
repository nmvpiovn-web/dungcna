// src/routes/api/drive/logs/+server.js
// Xem lịch sử sync Drive
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;

export async function GET({ request, platform, url }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  if (!platform?.env?.DB) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '20'));

  try {
    const logs = await platform.env.DB.prepare(`
      SELECT id, started_at, finished_at, direction, folder_id, folder_name,
             files_scanned, files_added, files_updated, files_skipped, files_failed,
             triggered_by, status
      FROM drive_sync_logs
      ORDER BY started_at DESC
      LIMIT ?
    `).bind(limit).all();

    const state = await platform.env.DB.prepare(
      `SELECT last_poll_at FROM drive_sync_state WHERE id = 1`
    ).first();

    return json({
      success: true,
      logs: logs.results || [],
      last_poll_at: state?.last_poll_at || null
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../lib/server/auth.js';
import { inspectBundleHealth } from '../../../../lib/server/quizDrive.js';

export const prerender = false;

export async function GET({ request, platform, url }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const role = String(auth.user.role || '').toLowerCase();
  const isManager = ['superadmin', 'admin', 'leader'].includes(role);

  const searchRaw = url.searchParams.get('search')?.trim() || '';
  if (searchRaw.length > 100) {
    return json({ success: false, error: 'InvalidSearchQuery', message: 'Độ dài tìm kiếm tối đa 100 ký tự' }, { status: 400 });
  }

  const rawStatus = url.searchParams.get('status')?.trim().toLowerCase() || '';
  const ALLOWED_STATUSES = new Set(['', 'all', 'synced', 'conflict', 'error', 'stale', 'draft']);
  if (!ALLOWED_STATUSES.has(rawStatus)) {
    return json({ success: false, error: 'InvalidStatusFilter', message: 'Bộ lọc trạng thái không hợp lệ' }, { status: 400 });
  }
  const statusFilter = (rawStatus === 'all') ? '' : rawStatus;

  const rawLimit = Number(url.searchParams.get('limit'));
  const rawOffset = Number(url.searchParams.get('offset'));
  let limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const isRefresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true';
  if (isRefresh) {
    limit = Math.min(limit, 10);
  }

  const conditions = [];
  const params = [];

  if (!isManager) {
    conditions.push('q.created_by = ?');
    params.push(auth.user.id);
  }

  if (statusFilter) {
    conditions.push('qb.sync_status = ?');
    params.push(statusFilter);
  }

  if (searchRaw) {
    conditions.push('q.title LIKE ?');
    params.push(`%${searchRaw}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) as total
    FROM quiz_bundles qb
    JOIN quizzes q ON q.id = qb.quiz_id
    ${whereClause}
  `;
  const countRow = await db.prepare(countQuery).bind(...params).first();
  const total = Number(countRow?.total || 0);

  const listQuery = `
    SELECT
      qb.quiz_id,
      qb.revision,
      qb.sync_status,
      qb.last_synced_at,
      qb.created_at,
      qb.updated_at,
      qb.google_doc_file_id,
      q.title as quiz_title,
      q.created_by,
      q.creator_name
    FROM quiz_bundles qb
    JOIN quizzes q ON q.id = qb.quiz_id
    ${whereClause}
    ORDER BY qb.updated_at DESC
    LIMIT ? OFFSET ?
  `;
  const listRows = await db.prepare(listQuery).bind(...params, limit, offset).all();

  const bundles = await Promise.all((listRows.results || []).map(async (row) => {
    const base = {
      quiz_id: row.quiz_id,
      quiz_title: row.quiz_title,
      created_by: row.created_by,
      creator_name: row.creator_name || 'Giáo viên',
      revision: Number(row.revision || 0),
      sync_status: row.sync_status || 'unknown',
      last_synced_at: row.last_synced_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      google_doc_url: row.google_doc_file_id ? `https://docs.google.com/document/d/${row.google_doc_file_id}/edit` : null,
      quiz_url: `/quiz-menu?quiz=${encodeURIComponent(row.quiz_id)}`
    };

    if (isRefresh) {
      try {
        const health = await inspectBundleHealth(platform, db, row.quiz_id);
        return {
          ...base,
          health_mode: 'live',
          health_status: health.status,
          quiz_changed: health.quiz_changed,
          docs_changed: health.docs_changed,
          drive_healthy: health.drive_healthy
        };
      } catch {
        return {
          ...base,
          health_mode: 'live',
          health_status: 'drive_unavailable',
          quiz_changed: false,
          docs_changed: false,
          drive_healthy: false
        };
      }
    }

    const isStale = row.sync_status === 'stale' || (row.last_synced_at ? (Date.now() - new Date(row.last_synced_at).getTime() > 3600000) : false);
    let latestEvent = null;
    try {
      const eventRow = await db.prepare(`
        SELECT event_type, created_at, error_code
        FROM quiz_bundle_sync_events
        WHERE quiz_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `).bind(row.quiz_id).first();
      if (eventRow) {
        latestEvent = {
          event_type: eventRow.event_type,
          created_at: eventRow.created_at,
          error_code: eventRow.error_code || null
        };
      }
    } catch {}

    return {
      ...base,
      health_mode: 'stored',
      stale: isStale,
      latest_event: latestEvent
    };
  }));

  return json({
    success: true,
    bundles,
    total,
    limit,
    offset,
    refresh: isRefresh
  });
}

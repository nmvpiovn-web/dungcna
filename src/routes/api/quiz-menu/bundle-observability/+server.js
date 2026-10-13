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
  const ALLOWED_STATUSES = new Set(['', 'all', 'synced', 'conflict', 'error', 'stale']);
  if (!ALLOWED_STATUSES.has(rawStatus)) {
    return json({ success: false, error: 'InvalidStatusFilter', message: 'Bộ lọc trạng thái không hợp lệ' }, { status: 400 });
  }
  const statusFilter = (rawStatus === 'all') ? '' : rawStatus;
  const rawHealthStatus = url.searchParams.get('health_status')?.trim().toLowerCase() || '';
  const ALLOWED_HEALTH_STATUSES = new Set(['', 'all', 'clean', 'conflict', 'quiz_changed', 'docs_changed', 'both_changed', 'drive_unavailable', 'bundle_missing']);
  if (!ALLOWED_HEALTH_STATUSES.has(rawHealthStatus)) {
    return json({ success: false, error: 'InvalidHealthStatusFilter', message: 'Bộ lọc health_status không hợp lệ' }, { status: 400 });
  }
  const healthStatusFilter = (rawHealthStatus === 'all') ? '' : rawHealthStatus;

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

  if (searchRaw) {
    conditions.push('q.title LIKE ?');
    params.push(`%${searchRaw}%`);
  }

  if (!isRefresh) {
    if (statusFilter === 'stale') {
      conditions.push("(qb.last_synced_at IS NULL OR datetime(qb.last_synced_at) < datetime('now', '-1 hour'))");
    } else if (statusFilter) {
      conditions.push('qb.sync_status = ?');
      params.push(statusFilter);
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

      const isStale = row.sync_status === 'stale' || (row.last_synced_at ? (Date.now() - new Date(row.last_synced_at).getTime() > 3600000) : true);
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
      refresh: false
    });
  }

  // isRefresh mode: scan live health, support live conflict filter even if DB says synced
  if (statusFilter === 'stale') {
    conditions.push("(qb.last_synced_at IS NULL OR datetime(qb.last_synced_at) < datetime('now', '-1 hour'))");
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) as total
    FROM quiz_bundles qb
    JOIN quizzes q ON q.id = qb.quiz_id
    ${whereClause}
  `;
  const countRow = await db.prepare(countQuery).bind(...params).first();
  const dbTotal = Number(countRow?.total || 0);

  const scanLimitParam = Number(url.searchParams.get('scan_limit'));
  const scanLimit = Number.isInteger(scanLimitParam) && scanLimitParam > 0
    ? Math.min(scanLimitParam, 50)
    : Math.min(Math.max(limit * 3, 20), 50);

  const scanOffsetParam = Number(url.searchParams.get('scan_offset') ?? url.searchParams.get('cursor') ?? url.searchParams.get('offset'));
  const scanOffset = Number.isInteger(scanOffsetParam) && scanOffsetParam >= 0 ? scanOffsetParam : 0;

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
    ORDER BY qb.updated_at DESC, qb.quiz_id DESC
    LIMIT ? OFFSET ?
  `;
  const listRows = await db.prepare(listQuery).bind(...params, scanLimit, scanOffset).all();
  const candidates = listRows.results || [];
  const scanned_count = candidates.length;

  const inspected = await Promise.all(candidates.map(async (row) => {
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

    let health;
    try {
      health = await inspectBundleHealth(platform, db, row.quiz_id);
    } catch {
      health = {
        status: 'drive_unavailable',
        quiz_changed: false,
        docs_changed: false,
        drive_healthy: false
      };
    }

    return {
      ...base,
      health_mode: 'live',
      health_status: health.status,
      quiz_changed: health.quiz_changed,
      docs_changed: health.docs_changed,
      drive_healthy: health.drive_healthy
    };
  }));

  const hasLiveFilter = Boolean(statusFilter || healthStatusFilter);
  let matched = inspected;

  if (hasLiveFilter) {
    matched = inspected.filter((b) => {
      if (statusFilter === 'conflict') {
        return b.docs_changed || b.quiz_changed || b.health_status === 'both_changed' || b.health_status === 'docs_changed' || b.health_status === 'quiz_changed' || b.sync_status === 'conflict';
      }
      if (statusFilter === 'synced') {
        return b.health_status === 'clean' && b.drive_healthy && b.sync_status === 'synced';
      }
      if (statusFilter === 'error') {
        return !b.drive_healthy || b.health_status === 'drive_unavailable' || b.sync_status === 'error';
      }
      if (statusFilter === 'stale') {
        return b.last_synced_at ? (Date.now() - new Date(b.last_synced_at).getTime() > 3600000) : true;
      }
      if (healthStatusFilter) {
        if (healthStatusFilter === 'conflict') {
          return b.docs_changed || b.quiz_changed || b.health_status === 'both_changed' || b.health_status === 'docs_changed' || b.health_status === 'quiz_changed';
        }
        return b.health_status === healthStatusFilter;
      }
      return true;
    });
  }

  const scanComplete = (scanOffset + scanned_count >= dbTotal);
  const nextScanOffset = scanComplete ? null : scanOffset + scanned_count;
  const nextCursor = scanComplete ? null : String(scanOffset + scanned_count);

  return json({
    success: true,
    bundles: matched,
    scan_complete: scanComplete,
    scan_limit: scanLimit,
    scan_offset: scanOffset,
    cursor: nextCursor,
    next_cursor: nextCursor,
    next_scan_offset: nextScanOffset,
    scanned_count,
    matched_count: matched.length,
    returned_count: matched.length,
    total: scanComplete ? (hasLiveFilter ? matched.length : dbTotal) : null,
    total_is_lower_bound: !scanComplete && hasLiveFilter,
    limit,
    offset: scanOffset,
    refresh: true
  });
}

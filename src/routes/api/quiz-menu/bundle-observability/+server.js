import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../lib/server/auth.js';

export const prerender = false;

export async function GET({ request, platform, url }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const role = String(auth.user.role || '').toLowerCase();
  const isManager = ['superadmin', 'admin', 'leader'].includes(role);

  const statusFilter = url.searchParams.get('status')?.trim() || '';
  const search = url.searchParams.get('search')?.trim() || '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

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

  if (search) {
    conditions.push('q.title LIKE ?');
    params.push(`%${search}%`);
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

  const bundles = (listRows.results || []).map((row) => ({
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
  }));

  return json({
    success: true,
    bundles,
    total,
    limit,
    offset
  });
}

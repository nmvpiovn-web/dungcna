import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../lib/server/auth.js';

export const prerender = false;

function sanitizeFtsQuery(q) {
  return String(q || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w}"*`)
    .join(' ');
}

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const q = url.searchParams.get('q')?.trim() || '';
  const category = url.searchParams.get('category')?.trim() || '';
  const limitParam = Number.parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1), 50);
  const offsetParam = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

  let articles = [];
  let total = 0;

  if (q) {
    const ftsQuery = sanitizeFtsQuery(q);
    let ftsOk = false;
    if (ftsQuery) {
      try {
        const countRes = await db.prepare(
          `SELECT COUNT(*) AS total
           FROM knowledge_fts fts
           JOIN knowledge_vault kv ON fts.id = kv.id
            WHERE knowledge_fts MATCH ? AND (kv.status = 'active' OR kv.status IS NULL)
           ${category ? 'AND kv.category = ?' : ''}`
        ).bind(...(category ? [ftsQuery, category] : [ftsQuery])).first();

        total = Number(countRes?.total || 0);

        const rows = await db.prepare(
          `SELECT kv.id, kv.title, kv.category, kv.folder, kv.tags,
                  SUBSTR(kv.content_markdown, 1, 300) AS preview,
                  LENGTH(kv.content_markdown) AS content_length
           FROM knowledge_fts fts
           JOIN knowledge_vault kv ON fts.id = kv.id
           WHERE knowledge_fts MATCH ? AND (kv.status = 'active' OR kv.status IS NULL)
           ${category ? 'AND kv.category = ?' : ''}
           LIMIT ? OFFSET ?`
        ).bind(...(category ? [ftsQuery, category, limit, offset] : [ftsQuery, limit, offset])).all();

        articles = rows.results || [];
        ftsOk = total > 0;
      } catch {
        ftsOk = false;
      }
    }

    if (!ftsOk) {
      // LIKE fallback
      const likePattern = `%${q}%`;
      const countRes = await db.prepare(
        `SELECT COUNT(*) AS total FROM knowledge_vault kv
         WHERE (kv.status = 'active' OR kv.status IS NULL)
           AND (kv.title LIKE ? OR kv.content_markdown LIKE ?)
           ${category ? 'AND kv.category = ?' : ''}`
      ).bind(...(category ? [likePattern, likePattern, category] : [likePattern, likePattern])).first();

      total = Number(countRes?.total || 0);

      const rows = await db.prepare(
        `SELECT kv.id, kv.title, kv.category, kv.folder, kv.tags,
                SUBSTR(kv.content_markdown, 1, 300) AS preview,
                LENGTH(kv.content_markdown) AS content_length
         FROM knowledge_vault kv
         WHERE (kv.status = 'active' OR kv.status IS NULL)
           AND (kv.title LIKE ? OR kv.content_markdown LIKE ?)
           ${category ? 'AND kv.category = ?' : ''}
         ORDER BY kv.id ASC
         LIMIT ? OFFSET ?`
      ).bind(...(category ? [likePattern, likePattern, category, limit, offset] : [likePattern, likePattern, limit, offset])).all();

      articles = rows.results || [];
    }
  } else {
    // Non-search browse
    const countRes = await db.prepare(
      `SELECT COUNT(*) AS total FROM knowledge_vault kv
       WHERE (kv.status = 'active' OR kv.status IS NULL)
       ${category ? 'AND kv.category = ?' : ''}`
    ).bind(...(category ? [category] : [])).first();

    total = Number(countRes?.total || 0);

    const rows = await db.prepare(
      `SELECT kv.id, kv.title, kv.category, kv.folder, kv.tags,
              SUBSTR(kv.content_markdown, 1, 300) AS preview,
              LENGTH(kv.content_markdown) AS content_length
       FROM knowledge_vault kv
       WHERE (kv.status = 'active' OR kv.status IS NULL)
       ${category ? 'AND kv.category = ?' : ''}
       ORDER BY kv.updated_at DESC, kv.id ASC
       LIMIT ? OFFSET ?`
    ).bind(...(category ? [category, limit, offset] : [limit, offset])).all();

    articles = rows.results || [];
  }

  return json({
    success: true,
    articles,
    total,
    limit,
    offset
  });
}

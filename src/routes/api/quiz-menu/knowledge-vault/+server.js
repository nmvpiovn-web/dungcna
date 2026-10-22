import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../lib/server/auth.js';
import { classifyKnowledgeVaultArticle, KNOWLEDGE_VAULT_GROUPS } from '../../../../lib/quizSourceNormalizer.js';

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

const GROUP_SQL_MAP = {
  ngu_phap: `AND (kv.category IN ('Chuyên Đề Ngữ Pháp Master', 'grammar') OR kv.folder LIKE '%GRAMMAR%')`,
  tu_vung_ngu_am: `AND (kv.category IN ('Bản Đồ Từ Vựng & Phonics', 'vocabulary', 'phonics') OR kv.folder LIKE '%VOCAB%')`,
  de_thi_hsg: `AND (kv.category IN ('Ngân Hàng Đề Thi & Kỹ Năng', 'exam', 'question', 'hsg') OR kv.folder LIKE '%EXAM%')`,
  gdpt_tieu_hoc: `AND (kv.category IN ('Tiếng Anh Lớp 1', 'Tiếng Anh Lớp 2', 'Tiếng Anh Lớp 3', 'Tiếng Anh Lớp 4', 'Tiếng Anh Lớp 5'))`,
  gdpt_thcs_thpt: `AND (kv.category IN ('Tiếng Anh Lớp 6', 'Tiếng Anh Lớp 7', 'Tiếng Anh Lớp 8', 'Tiếng Anh Lớp 9', 'Tiếng Anh Lớp 10', 'Tiếng Anh Lớp 11', 'Tiếng Anh Lớp 12', 'Chương Trình GDPT 2018', 'curriculum'))`,
  tai_lieu_bo_tro: `AND (kv.category IN ('Tài Liệu Chung', 'Tài Liệu Google Drive', 'document', 'drive_file', 'listening'))`,
  su_pham_sop: `AND (kv.category IN ('Sư Phạm & Vận Hành SOP', 'Mạng Nơ-ron & Tương Tác', 'Bản Đồ Tổng MOC'))`
};

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const q = url.searchParams.get('q')?.trim() || '';
  const category = url.searchParams.get('category')?.trim() || '';
  const groupKey = url.searchParams.get('group')?.trim() || '';
  const limitParam = Number.parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1), 50);
  const offsetParam = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

  const groupSql = groupKey && GROUP_SQL_MAP[groupKey] ? GROUP_SQL_MAP[groupKey] : '';
  const excludeStubsSql = `AND (kv.category IS NULL OR kv.category != 'drive_folder') AND kv.title NOT LIKE '📁%' AND kv.title NOT LIKE '%.mp3' AND kv.title NOT LIKE '%.rar' AND (kv.content_markdown IS NULL OR kv.content_markdown NOT LIKE '%Không trích xuất được nội dung%')`;

  let articles = [];
  let total = 0;

  if (q) {
    const ftsQuery = sanitizeFtsQuery(q);
    const likePattern = `%${q}%`;
    let useFts = false;
    if (ftsQuery) {
      try {
        await db.prepare(`SELECT 1 FROM knowledge_fts WHERE knowledge_fts MATCH ? LIMIT 1`).bind(ftsQuery).first();
        useFts = true;
      } catch {
        useFts = false;
      }
    }

    if (useFts) {
      const countRes = await db.prepare(
        `SELECT COUNT(DISTINCT kv.id) AS total
         FROM knowledge_vault kv
         WHERE (kv.status IN ('active', 'published') OR kv.status IS NULL)
           ${excludeStubsSql}
           ${groupSql}
           ${category ? 'AND kv.category = ?' : ''}
           AND (
             kv.id IN (SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH ?)
             OR kv.title LIKE ?
             OR kv.content_markdown LIKE ?
           )`
      ).bind(...(category ? [category, ftsQuery, likePattern, likePattern] : [ftsQuery, likePattern, likePattern])).first();

      total = Number(countRes?.total || 0);

      const rows = await db.prepare(
        `SELECT kv.id, kv.title, kv.category, kv.folder, kv.tags,
                SUBSTR(kv.content_markdown, 1, 300) AS preview,
                LENGTH(kv.content_markdown) AS content_length
         FROM knowledge_vault kv
         WHERE (kv.status IN ('active', 'published') OR kv.status IS NULL)
           ${excludeStubsSql}
           ${groupSql}
           ${category ? 'AND kv.category = ?' : ''}
           AND (
             kv.id IN (SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH ?)
             OR kv.title LIKE ?
             OR kv.content_markdown LIKE ?
           )
         ORDER BY kv.id ASC
         LIMIT ? OFFSET ?`
      ).bind(...(category ? [category, ftsQuery, likePattern, likePattern, limit, offset] : [ftsQuery, likePattern, likePattern, limit, offset])).all();

      articles = rows.results || [];
    } else {
      const countRes = await db.prepare(
        `SELECT COUNT(*) AS total FROM knowledge_vault kv
         WHERE (kv.status IN ('active', 'published') OR kv.status IS NULL)
           ${excludeStubsSql}
           ${groupSql}
           AND (kv.title LIKE ? OR kv.content_markdown LIKE ?)
           ${category ? 'AND kv.category = ?' : ''}`
      ).bind(...(category ? [likePattern, likePattern, category] : [likePattern, likePattern])).first();

      total = Number(countRes?.total || 0);

      const rows = await db.prepare(
        `SELECT kv.id, kv.title, kv.category, kv.folder, kv.tags,
                SUBSTR(kv.content_markdown, 1, 300) AS preview,
                LENGTH(kv.content_markdown) AS content_length
         FROM knowledge_vault kv
         WHERE (kv.status IN ('active', 'published') OR kv.status IS NULL)
           ${excludeStubsSql}
           ${groupSql}
           AND (kv.title LIKE ? OR kv.content_markdown LIKE ?)
           ${category ? 'AND kv.category = ?' : ''}
         ORDER BY kv.id ASC
         LIMIT ? OFFSET ?`
      ).bind(...(category ? [likePattern, likePattern, category, limit, offset] : [likePattern, likePattern, limit, offset])).all();

      articles = rows.results || [];
    }
  } else {
    const countRes = await db.prepare(
      `SELECT COUNT(*) AS total FROM knowledge_vault kv
       WHERE (kv.status IN ('active', 'published') OR kv.status IS NULL)
       ${excludeStubsSql}
       ${groupSql}
       ${category ? 'AND kv.category = ?' : ''}`
    ).bind(...(category ? [category] : [])).first();

    total = Number(countRes?.total || 0);

    const rows = await db.prepare(
      `SELECT kv.id, kv.title, kv.category, kv.folder, kv.tags,
              SUBSTR(kv.content_markdown, 1, 300) AS preview,
              LENGTH(kv.content_markdown) AS content_length
       FROM knowledge_vault kv
       WHERE (kv.status IN ('active', 'published') OR kv.status IS NULL)
       ${excludeStubsSql}
       ${groupSql}
       ${category ? 'AND kv.category = ?' : ''}
       ORDER BY kv.updated_at DESC, kv.id ASC
       LIMIT ? OFFSET ?`
    ).bind(...(category ? [category, limit, offset] : [limit, offset])).all();

    articles = rows.results || [];
  }

  const normalizedArticles = articles.map((art) => {
    const classified = classifyKnowledgeVaultArticle(art);
    return {
      ...art,
      raw_title: art.title,
      raw_category: art.category,
      title: classified.title_vi || art.title,
      title_vi: classified.title_vi || art.title,
      category_vi: classified.category_vi,
      group_key: classified.group_key
    };
  });

  return json({
    success: true,
    articles: normalizedArticles,
    groups: KNOWLEDGE_VAULT_GROUPS,
    total,
    limit,
    offset
  });
}

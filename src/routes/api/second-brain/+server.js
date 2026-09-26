import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;

// Helper to escape FTS5 special characters while preserving Unicode/Vietnamese diacritics
function sanitizeFtsQuery(q) {
  if (!q) return '';
  // Remove special FTS5 operators: " * ( ) { } [ ] ^ : + - NOT AND OR NEAR
  return q.replace(/["*(){}\[\]^:+\-]/g, ' ')
          .replace(/\b(NOT|AND|OR|NEAR)\b/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
}

// Safely escape raw text to prevent XSS while allowing styled highlight tags
function sanitizeFtsSnippet(rawSnippet) {
  if (!rawSnippet) return '';
  // 1. First escape all raw HTML characters to neutralize scripts/HTML tags
  const escaped = rawSnippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // 2. Safely transform our sentinel markers into trusted HTML <mark> tags
  return escaped
    .replace(/\[\[_FTS_HL_START_\]\]/g, '<mark class="bg-amber-200 dark:bg-amber-800 text-slate-900 dark:text-amber-100 font-bold px-1 rounded">')
    .replace(/\[\[_FTS_HL_END_\]\]/g, '</mark>');
}

export async function GET({ request, url, platform }) {
  // 1. Strict Server Authentication (Fail-Closed)
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập để truy cập kho tri thức Second Brain.'
    }, { status: auth.status || 401 });
  }

  // 2. Strict Role-Based Access Control (Only Teacher, Leader, SuperAdmin)
  if (!isStaffUser(auth.user)) {
    return json({
      success: false,
      error: 'Forbidden: Kho tri thức và giáo án Second Brain chỉ dành riêng cho Giáo Viên và Ban Quản Lý Cô Dung.'
    }, { status: 403 });
  }

  const query = (url.searchParams.get('q') || '').trim();
  const folder = url.searchParams.get('folder') || 'all';
  const noteId = url.searchParams.get('id') || '';
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

  // 3. Cloudflare D1 Query
  if (!platform?.env?.DB) {
    return json({
      success: false,
      error: 'DatabaseUnavailable: Cloudflare D1 binding platform.env.DB không khả dụng.'
    }, { status: 500 });
  }

  const db = platform.env.DB;

  try {
    // Case A: Specific note requested by ID -> return full markdown content & links
    if (noteId) {
      const noteRes = await db.prepare(`
        SELECT * FROM knowledge_vault 
        WHERE id = ? OR LOWER(id) = LOWER(?)
        LIMIT 1;
      `).bind(noteId, noteId).all();

      const row = noteRes.results?.[0];
      if (!row) {
        return json({ success: false, error: 'Note không tồn tại trong kho tri thức.' }, { status: 404 });
      }

      // Reverse backlinks (where to_id matches row.id or row.title)
      const backlinksRes = await db.prepare(`
        SELECT kl.from_id as id, kv.title, kv.folder 
        FROM knowledge_links kl 
        JOIN knowledge_vault kv ON kl.from_id = kv.id 
        WHERE kl.to_id = ? OR LOWER(kl.to_id) = LOWER(?)
        ORDER BY kv.folder ASC, kv.title ASC;
      `).bind(row.id, row.title).all();

      // Forward wikilinks
      const forwardRes = await db.prepare(`
        SELECT to_id as target FROM knowledge_links WHERE from_id = ?;
      `).bind(row.id).all();

      let parsedTags = [];
      try {
        parsedTags = JSON.parse(row.tags || '[]');
      } catch {
        parsedTags = [];
      }

      const fullNote = {
        id: row.id,
        filename: `${row.id}.md`,
        title: row.title,
        folder: row.folder,
        category: row.category,
        tags: parsedTags,
        source_path: row.source_path,
        source_hash: row.source_hash,
        content: row.content_markdown,
        raw: row.content_markdown,
        status: row.status,
        updated_at: row.updated_at,
        wikilinks: (forwardRes.results || []).map(r => ({ target: r.target })),
        backlinks: backlinksRes.results || []
      };

      return json({
        success: true,
        note: fullNote
      });
    }

    // Case B: Search query using SQLite FTS5 (preserving Vietnamese Unicode)
    if (query) {
      const ftsQuery = sanitizeFtsQuery(query);
      let notes = [];
      let total = 0;

      if (ftsQuery) {
        // Query FTS5 joined with folder filter and pagination in SQL
        let sql = `
          SELECT kv.id, kv.title, kv.folder, kv.category, kv.tags, kv.source_path, kv.updated_at,
                 snippet(knowledge_fts, 2, '[[_FTS_HL_START_]]', '[[_FTS_HL_END_]]', '...', 15) as snippet
          FROM knowledge_fts kf
          JOIN knowledge_vault kv ON kf.id = kv.id
          WHERE knowledge_fts MATCH ?
        `;
        const params = [`"${ftsQuery}"*`];

        if (folder !== 'all') {
          sql += ` AND (kv.folder = ? OR kv.folder LIKE ?)`;
          params.push(folder, `%${folder}%`);
        }

        sql += ` ORDER BY rank LIMIT ? OFFSET ?;`;
        params.push(limit, offset);

        try {
          const ftsRes = await db.prepare(sql).bind(...params).all();
          notes = ftsRes.results || [];
        } catch {
          // Fallback to LIKE if FTS syntax edge case
          let likeSql = `
            SELECT id, title, folder, category, tags, source_path, updated_at
            FROM knowledge_vault
            WHERE (title LIKE ? OR content_markdown LIKE ? OR tags LIKE ?)
          `;
          const likeParams = [`%${query}%`, `%${query}%`, `%${query}%`];
          if (folder !== 'all') {
            likeSql += ` AND (folder = ? OR folder LIKE ?)`;
            likeParams.push(folder, `%${folder}%`);
          }
          likeSql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?;`;
          likeParams.push(limit, offset);

          const likeRes = await db.prepare(likeSql).bind(...likeParams).all();
          notes = likeRes.results || [];
        }
      }

      const formattedNotes = notes.map(r => {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch {}
        return {
          id: r.id,
          filename: `${r.id}.md`,
          title: r.title,
          folder: r.folder,
          category: r.category,
          tags: tags,
          source_path: r.source_path,
          snippet: sanitizeFtsSnippet(r.snippet),
          updated_at: r.updated_at
        };
      });

      return json({
        success: true,
        total: formattedNotes.length,
        limit,
        offset,
        notes: formattedNotes,
        folders: await getDynamicFolderStats(db)
      });
    }

    // Case C: Metadata-only listing with pagination (NO heavy content_markdown)
    let listSql = `
      SELECT id, title, folder, category, tags, source_path, updated_at 
      FROM knowledge_vault
    `;
    const params = [];

    if (folder !== 'all') {
      listSql += ` WHERE folder = ? OR folder LIKE ?`;
      params.push(folder, `%${folder}%`);
    }

    listSql += ` ORDER BY folder ASC, title ASC LIMIT ? OFFSET ?;`;
    params.push(limit, offset);

    const listRes = await db.prepare(listSql).bind(...params).all();
    const rows = listRes.results || [];

    // Total count for pagination
    let countSql = `SELECT count(*) as total FROM knowledge_vault`;
    const countParams = [];
    if (folder !== 'all') {
      countSql += ` WHERE folder = ? OR folder LIKE ?`;
      countParams.push(folder, `%${folder}%`);
    }
    const countRes = await db.prepare(countSql).bind(...countParams).all();
    const totalCount = countRes.results?.[0]?.total || rows.length;

    const notes = rows.map(r => {
      let tags = [];
      try { tags = JSON.parse(r.tags || '[]'); } catch {}
      return {
        id: r.id,
        filename: `${r.id}.md`,
        title: r.title,
        folder: r.folder,
        category: r.category,
        tags: tags,
        source_path: r.source_path,
        updated_at: r.updated_at
      };
    });

    return json({
      success: true,
      total: totalCount,
      limit,
      offset,
      notes,
      folders: await getDynamicFolderStats(db),
      version: '2.5.0-D1',
      updated_at: new Date().toISOString()
    });

  } catch (err) {
    // Strict Fail-Closed error response
    console.error('D1 Knowledge Vault query error:', err);
    return json({
      success: false,
      error: `D1DatabaseError: ${err.message || 'Lỗi truy vấn cơ sở dữ liệu D1'}`
    }, { status: 500 });
  }
}

async function getDynamicFolderStats(db) {
  try {
    const res = await db.prepare(`
      SELECT folder as id, count(*) as count 
      FROM knowledge_vault 
      GROUP BY folder 
      ORDER BY folder ASC;
    `).all();

    const folderMap = new Map();
    (res.results || []).forEach(r => folderMap.set(r.id, r.count));

    const totalRes = await db.prepare(`SELECT count(*) as total FROM knowledge_vault;`).all();
    const grandTotal = totalRes.results?.[0]?.total || 0;

    return [
      { id: '07_GOOGLE_DRIVE_LIBRARY', name: '📄 07. Tài liệu Google Drive', count: folderMap.get('07_GOOGLE_DRIVE_LIBRARY') || 0 },
      { id: 'all', name: '📂 Toàn Bộ Tri Thức', count: grandTotal },
      { id: 'Root', name: '🏠 Bản Đồ Tổng MOC', count: folderMap.get('Root') || 0 },
      { id: '01_CURRICULUM_GDPT', name: '📚 01. Chương Trình GDPT', count: folderMap.get('01_CURRICULUM_GDPT') || 0 },
      { id: '02_GRAMMAR_KNOWLEDGE_BASE', name: '📐 02. Chuyên Đề Ngữ Pháp', count: folderMap.get('02_GRAMMAR_KNOWLEDGE_BASE') || 0 },
      { id: '03_VOCABULARY_ATLAS', name: '🔤 03. Bản Đồ Từ Vựng & Phonics', count: folderMap.get('03_VOCABULARY_ATLAS') || 0 },
      { id: '04_EXAMS_AND_QUESTION_BANK', name: '📝 04. Ngân Hàng Đề Thi', count: folderMap.get('04_EXAMS_AND_QUESTION_BANK') || 0 },
      { id: '05_TEACHING_SOP_AND_PEDAGOGY', name: '👩‍🏫 05. Sư Phạm & SOP Cô Dung', count: folderMap.get('05_TEACHING_SOP_AND_PEDAGOGY') || 0 },
      { id: '06_CROSS_DISCIPLINARY_SYNAPSES', name: '⚡ 06. Mạng Nơ-ron & Synapses', count: folderMap.get('06_CROSS_DISCIPLINARY_SYNAPSES') || 0 }
    ];
  } catch {
    return [];
  }
}

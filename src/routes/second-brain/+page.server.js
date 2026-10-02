// src/routes/second-brain/+page.server.js
// Server-side load vault data để tránh client fetch bị treo
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;

export async function load({ request, platform, url }) {
  // Xác thực qua cookie session_token (browser tự gửi)
  const auth = await verifyServerAuth(request, platform);

  if (!auth.authenticated || !isStaffUser(auth.user)) {
    return {
      forbidden: true,
      notes: [],
      folders: [],
      version: '2.5.0-D1'
    };
  }

  if (!platform?.env?.DB) {
    return {
      forbidden: true,
      error: 'DatabaseUnavailable',
      notes: [],
      folders: [],
      version: '2.5.0-D1'
    };
  }

  try {
    const db = platform.env.DB;
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));

    // Lấy notes (không kèm content để nhẹ)
    const notesRes = await db.prepare(`
      SELECT id, filename, title, folder, category, tags, source_path, updated_at
      FROM knowledge_vault
      WHERE status = 'published'
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(limit).all();

    // Lấy folders với count
    const foldersRes = await db.prepare(`
      SELECT folder as id, COUNT(*) as count
      FROM knowledge_vault
      WHERE status = 'published' AND folder IS NOT NULL
      GROUP BY folder
      ORDER BY folder ASC
    `).all();

    const folderNames = {
      '07_GOOGLE_DRIVE_LIBRARY': '📄 07. Tài liệu Google Drive',
      '01_CURRICULUM_GDPT': '📚 01. Chương Trình GDPT',
      '02_GRAMMAR_KNOWLEDGE_BASE': '📐 02. Chuyên Đề Ngữ Pháp',
      '03_VOCABULARY_ATLAS': '🔤 03. Bản Đồ Từ Vựng & Phonics',
      '04_EXAMS_AND_QUESTION_BANK': '📝 04. Ngân Hàng Đề Thi',
      '05_TEACHING_SOP_AND_PEDAGOGY': '👩‍🏫 05. Sư Phạm & SOP Cô Dung',
      '06_CROSS_DISCIPLINARY_SYNAPSES': '⚡ 06. Mạng Nơ-ron & Synapses',
      'Root': '🏠 Bản Đồ Tổng (MOC)'
    };

    const folders = [
      { id: 'all', name: '📂 Toàn Bộ Tri Thức', count: notesRes.results?.length || 0 }
    ];
    for (const f of (foldersRes.results || [])) {
      folders.push({
        id: f.id,
        name: folderNames[f.id] || `📁 ${f.id}`,
        count: f.count
      });
    }

    return {
      forbidden: false,
      notes: notesRes.results || [],
      folders,
      version: '2.5.0-D1'
    };
  } catch (err) {
    console.error('[second-brain] server load error:', err.message);
    return {
      forbidden: true,
      error: err.message,
      notes: [],
      folders: [],
      version: '2.5.0-D1'
    };
  }
}

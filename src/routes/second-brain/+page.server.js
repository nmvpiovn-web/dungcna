// src/routes/second-brain/+page.server.js
// Server-side load vault data để tránh client fetch bị treo
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { normalizeVietnameseSourceTitle } from '$lib/quizSourceNormalizer.js';

export const prerender = false;

const VALID_VAULT_NOTES_WHERE = `
  status = 'published'
  AND title NOT LIKE '📁%'
  AND LOWER(title) NOT LIKE '%.mp3'
  AND LOWER(title) NOT LIKE '%.rar'
  AND LOWER(title) NOT LIKE '%.zip'
  AND (category IS NULL OR category NOT IN ('drive_folder', 'listening'))
  AND (content_markdown IS NULL OR content_markdown NOT LIKE '%Không trích xuất được nội dung%')
`;

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

    // Lấy notes (đã lọc bỏ folder stub, file mp3/rar và file lỗi trích xuất)
    const notesRes = await db.prepare(`
      SELECT id, filename, title, folder, category, tags, source_path, updated_at
      FROM knowledge_vault
      WHERE ${VALID_VAULT_NOTES_WHERE}
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(limit).all();

    // Lấy folders với count chuẩn xác
    const foldersRes = await db.prepare(`
      SELECT folder as id, COUNT(*) as count
      FROM knowledge_vault
      WHERE ${VALID_VAULT_NOTES_WHERE} AND folder IS NOT NULL
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
      '08_EXAM_BANK': '📝 08. Đề Thi & Quiz từ D1',
      '09_VOCABULARY': '🔤 09. Từ Vựng / Flashcard từ D1',
      '01_CURRICULUM': '📚 01. Chương Trình từ D1',
      'Root': '🏠 Bản Đồ Tổng (MOC)'
    };

    const normalizedNotes = (notesRes.results || []).map((r) => {
      const cleanTitle = normalizeVietnameseSourceTitle(String(r.title || r.id || '').replace(/^📄\s*/, ''), r.id) || r.title;
      return {
        ...r,
        raw_title: r.title,
        title: cleanTitle
      };
    });

    const folders = [
      { id: 'all', name: '📂 Toàn Bộ Tri Thức', count: normalizedNotes.length }
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
      notes: normalizedNotes,
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

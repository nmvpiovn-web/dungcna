import { json } from '@sveltejs/kit';
import vaultData from '$lib/data/second_brain_vault.json';

export const prerender = false;

export async function GET({ url }) {
  const query = (url.searchParams.get('q') || '').toLowerCase().trim();
  const folder = url.searchParams.get('folder') || '';
  const noteId = url.searchParams.get('id') || '';

  // If specific note requested
  if (noteId) {
    const note = vaultData.notes.find(n => n.id === noteId || n.id.toLowerCase() === noteId.toLowerCase());
    if (note) {
      // Find backlinks
      const backlinks = vaultData.notes.filter(n => 
        n.id !== note.id && n.wikilinks.some(wl => wl.target === note.id || wl.target === note.title)
      ).map(n => ({ id: n.id, title: n.title, folder: n.folder }));

      return json({
        success: true,
        note: {
          ...note,
          backlinks
        }
      });
    }
    return json({ success: false, error: 'Note không tồn tại' }, { status: 404 });
  }

  // Filter notes
  let filtered = vaultData.notes;
  if (folder && folder !== 'all') {
    filtered = filtered.filter(n => n.folder === folder || (n.folder && n.folder.includes(folder)));
  }
  if (query) {
    filtered = filtered.filter(n => 
      (n.title && n.title.toLowerCase().includes(query)) ||
      (n.content && n.content.toLowerCase().includes(query)) ||
      (Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase().includes(query)))
    );
  }

  return json({
    success: true,
    total: filtered.length,
    notes: filtered,
    folders: [
      { id: '07_GOOGLE_DRIVE_LIBRARY', name: '📄 07. Tài liệu Google Drive', count: vaultData.notes.filter(n => n.folder === '07_GOOGLE_DRIVE_LIBRARY').length },
      { id: 'all', name: '📂 Toàn Bộ Tri Thức', count: vaultData.notes.length },
      { id: 'Root', name: '🏠 Bản Đồ Tổng MOC', count: vaultData.notes.filter(n => n.folder === 'Root').length },
      { id: '01_CURRICULUM_GDPT', name: '📚 01. Chương Trình GDPT', count: vaultData.notes.filter(n => n.folder && n.folder.includes('01')).length },
      { id: '02_GRAMMAR_KNOWLEDGE_BASE', name: '📐 02. Chuyên Đề Ngữ Pháp', count: vaultData.notes.filter(n => n.folder && n.folder.includes('02')).length },
      { id: '03_VOCABULARY_ATLAS', name: '🔤 03. Bản Đồ Từ Vựng & Phonics', count: vaultData.notes.filter(n => n.folder && n.folder.includes('03')).length },
      { id: '04_EXAMS_AND_QUESTION_BANK', name: '📝 04. Ngân Hàng Đề Thi', count: vaultData.notes.filter(n => n.folder && n.folder.includes('04')).length },
      { id: '05_TEACHING_SOP_AND_PEDAGOGY', name: '👩‍🏫 05. Sư Phạm & SOP Cô Dung', count: vaultData.notes.filter(n => n.folder && n.folder.includes('05')).length },
      { id: '06_CROSS_DISCIPLINARY_SYNAPSES', name: '⚡ 06. Mạng Nơ-ron & Synapses', count: vaultData.notes.filter(n => n.folder && n.folder.includes('06')).length }
    ],
    version: vaultData.version,
    updated_at: vaultData.updated_at
  });
}

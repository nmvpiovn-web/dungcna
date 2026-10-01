// src/routes/api/second-brain/sync/+server.js
// Mount toàn bộ database vào knowledge_vault: exams, questions, vocabulary, curricula, flashcards
// POST /api/second-brain/sync — staff only
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;

function mdEscape(s) {
  return String(s || '').replace(/[#*`\[\]]/g, '');
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ staff' }, { status: 403 });
  }
  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  }

  const db = platform.env.DB;
  const stats = { exams: 0, questions: 0, vocabulary: 0, curricula: 0, flashcards: 0, skipped: 0 };
  const errors = [];

  try {
    // 1. EXAMS → knowledge_vault
    const exams = await db.prepare(`SELECT id, title, grade, curriculum_id, format_type, duration_minutes, description FROM exams`).all();
    for (const ex of (exams.results || [])) {
      const vid = `db_exam_${ex.id}`;
      const gradeLabel = ex.grade > 0 ? `Lớp ${ex.grade}` : 'Chứng chỉ / Tổng hợp';
      const md = `# ${mdEscape(ex.title)}\n\n` +
        `- **Khối:** ${gradeLabel}\n` +
        `- **Chương trình:** ${mdEscape(ex.curriculum_id || '—')}\n` +
        `- **Định dạng:** ${mdEscape(ex.format_type || '—')}\n` +
        `- **Thời gian:** ${ex.duration_minutes || '—'} phút\n\n` +
        `${mdEscape(ex.description || '')}\n\n` +
        `> Nguồn: database.exams (id: ${ex.id})`;
      try {
        await db.prepare(`
          INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
        `).bind(
          vid, ex.title || `Đề thi ${ex.id}`, '08_EXAM_BANK', 'exam',
          JSON.stringify([gradeLabel, ex.curriculum_id, ex.format_type].filter(Boolean)),
          `db://exams/${ex.id}`, `exam_${ex.id}`,
          md
        ).run();
        stats.exams++;
      } catch (e) { errors.push(`exam ${ex.id}: ${e.message}`); }
    }

    // 2. QUESTIONS → knowledge_vault (group by exam/curriculum)
    const questions = await db.prepare(`SELECT id, exam_id, question_text, question_type, options_json, correct_answer, explanation, skill FROM questions LIMIT 5000`).all();
    for (const q of (questions.results || [])) {
      const vid = `db_question_${q.id}`;
      let options = '';
      try {
        const opts = JSON.parse(q.options_json || '[]');
        if (Array.isArray(opts)) {
          options = opts.map((o, i) => `- ${String.fromCharCode(65 + i)}. ${mdEscape(o.text || o)}`).join('\n');
        }
      } catch {}
      const md = `## Câu hỏi\n\n${mdEscape(q.question_text || '')}\n\n${options}\n\n**Đáp án đúng:** ${mdEscape(q.correct_answer || '—')}\n\n**Giải thích:** ${mdEscape(q.explanation || '—')}\n\n- **Kỹ năng:** ${mdEscape(q.skill || '—')}\n- **Loại:** ${mdEscape(q.question_type || '—')}\n\n> Nguồn: database.questions (id: ${q.id})`;
      try {
        await db.prepare(`
          INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
        `).bind(
          vid, `Câu hỏi: ${(q.question_text || '').substring(0, 60)}...`, '08_EXAM_BANK', 'question',
          JSON.stringify([q.skill, q.question_type].filter(Boolean)),
          `db://questions/${q.id}`, `question_${q.id}`,
          md
        ).run();
        stats.questions++;
      } catch (e) { errors.push(`question ${q.id}: ${e.message}`); }
    }

    // 3. VOCABULARY → knowledge_vault (flashcard format)
    const vocab = await db.prepare(`SELECT id, word, phonetic, meaning_vi, meaning_en, example_en, example_vi, level, topic FROM cambridge_vocabulary LIMIT 5000`).all();
    for (const v of (vocab.results || [])) {
      const vid = `db_vocab_${v.id}`;
      const md = `# ${mdEscape(v.word)}\n\n` +
        `- **Phiên âm:** /${mdEscape(v.phonetic || '')}/\n` +
        `- **Nghĩa:** ${mdEscape(v.meaning_vi || v.meaning_en || '')}\n` +
        `- **Level:** ${mdEscape(v.level || '—')}\n` +
        `- **Chủ đề:** ${mdEscape(v.topic || '—')}\n\n` +
        `**Ví dụ:**\n${mdEscape(v.example_en || '')}\n${mdEscape(v.example_vi || '')}\n\n` +
        `> Nguồn: database.cambridge_vocabulary (id: ${v.id}) — dùng làm flashcard`;
      try {
        await db.prepare(`
          INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
        `).bind(
          vid, `Từ vựng: ${v.word}`, '09_VOCABULARY', 'vocabulary',
          JSON.stringify([v.level, v.topic].filter(Boolean)),
          `db://cambridge_vocabulary/${v.id}`, `vocab_${v.id}`,
          md
        ).run();
        stats.vocabulary++;
        stats.flashcards++;
      } catch (e) { errors.push(`vocab ${v.id}: ${e.message}`); }
    }

    // 4. CURRICULA → knowledge_vault
    try {
      const curr = await db.prepare(`SELECT id, name, description, grade_level FROM curricula`).all();
      for (const c of (curr.results || [])) {
        const vid = `db_curriculum_${c.id}`;
        const md = `# ${mdEscape(c.name)}\n\n- **Khối:** ${mdEscape(c.grade_level || '—')}\n\n${mdEscape(c.description || '')}\n\n> Nguồn: database.curricula (id: ${c.id})`;
        try {
          await db.prepare(`
            INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
          `).bind(
            vid, `Chương trình: ${c.name}`, '01_CURRICULUM', 'curriculum',
            JSON.stringify([c.grade_level].filter(Boolean)),
            `db://curricula/${c.id}`, `curriculum_${c.id}`,
            md
          ).run();
          stats.curricula++;
        } catch (e) { errors.push(`curriculum ${c.id}: ${e.message}`); }
      }
    } catch (e) {
      // curricula table may not have expected columns
      errors.push(`curricula: ${e.message}`);
    }

    // 5. Rebuild FTS index
    try {
      await db.prepare(`INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')`).run();
    } catch (e) {
      errors.push(`fts rebuild: ${e.message}`);
    }

    return json({
      success: true,
      message: `Đã mount ${stats.exams + stats.questions + stats.vocabulary + stats.curricula} items vào kho tri thức`,
      stats,
      errors: errors.slice(0, 20)
    });
  } catch (err) {
    return json({ success: false, error: err.message, stats }, { status: 500 });
  }
}

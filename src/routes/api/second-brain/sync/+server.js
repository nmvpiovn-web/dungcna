// src/routes/api/second-brain/sync/+server.js
// Mount toàn bộ hệ sinh thái D1 + Google Drive vào knowledge_vault:
// exams, questions, vocabulary, curricula, quizzes (published), quiz_drive_sources, session_quality_audits
// POST /api/second-brain/sync — staff only
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { syncDriveSourceToKnowledgeVault } from '$lib/server/quizDrive.js';

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
  const stats = {
    exams: 0,
    questions: 0,
    vocabulary: 0,
    curricula: 0,
    flashcards: 0,
    quizzes: 0,
    drive_sources: 0,
    session_audits: 0,
    skipped: 0
  };
  const errors = [];

  try {
    // 1. EXAMS → knowledge_vault
    try {
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
    } catch (e) { errors.push(`exams: ${e.message}`); }

    // 2. QUESTIONS → knowledge_vault
    try {
      const questions = await db.prepare(`SELECT id, exam_id, question_index, skill, type, passage, prompt, options_json, correct_answer, explanation, cambridge_level FROM questions LIMIT 5000`).all();
      for (const q of (questions.results || [])) {
        const vid = `db_question_${q.id}`;
        let options = '';
        try {
          const opts = JSON.parse(q.options_json || '[]');
          if (Array.isArray(opts)) {
            options = opts.map((o, i) => `- ${String.fromCharCode(65 + i)}. ${mdEscape(o.text || o)}`).join('\n');
          }
        } catch {}
        const md = `## Câu hỏi\n\n${mdEscape(q.prompt || '')}\n\n${options}\n\n**Đáp án đúng:** ${mdEscape(q.correct_answer || '—')}\n\n**Giải thích:** ${mdEscape(q.explanation || '—')}\n\n- **Kỹ năng:** ${mdEscape(q.skill || '—')}\n- **Loại:** ${mdEscape(q.type || '—')}\n- **Trình độ Cambridge:** ${mdEscape(q.cambridge_level || '—')}\n\n> Nguồn: database.questions (id: ${q.id}, exam: ${q.exam_id || '—'})`;
        try {
          await db.prepare(`
            INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
          `).bind(
            vid, `Câu hỏi: ${(q.prompt || '').substring(0, 60)}...`, '08_EXAM_BANK', 'question',
            JSON.stringify([q.skill, q.type, q.cambridge_level].filter(Boolean)),
            `db://questions/${q.id}`, `question_${q.id}`,
            md
          ).run();
          stats.questions++;
        } catch (e) { errors.push(`question ${q.id}: ${e.message}`); }
      }
    } catch (e) { errors.push(`questions: ${e.message}`); }

    // 3. VOCABULARY → knowledge_vault
    try {
      const vocab = await db.prepare(`SELECT id, word, ipa, pos, cefr_level, meaning_vi, example_en, example_vi, collocations, grade_suitability FROM cambridge_vocabulary LIMIT 5000`).all();
      for (const v of (vocab.results || [])) {
        const vid = `db_vocab_${v.id}`;
        const md = `# ${mdEscape(v.word)}\n\n` +
          `- **Phiên âm:** /${mdEscape(v.ipa || '')}/\n` +
          `- **Từ loại:** ${mdEscape(v.pos || '—')}\n` +
          `- **Nghĩa:** ${mdEscape(v.meaning_vi || '')}\n` +
          `- **CEFR:** ${mdEscape(v.cefr_level || '—')}\n` +
          `- **Phù hợp khối:** ${mdEscape(v.grade_suitability || '—')}\n\n` +
          `**Ví dụ:**\n${mdEscape(v.example_en || '')}\n${mdEscape(v.example_vi || '')}\n\n` +
          (v.collocations ? `**Cụm từ:** ${mdEscape(v.collocations)}\n\n` : '') +
          `> Nguồn: database.cambridge_vocabulary (id: ${v.id}) — dùng làm flashcard`;
        try {
          await db.prepare(`
            INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
          `).bind(
            vid, `Từ vựng: ${v.word}`, '09_VOCABULARY', 'vocabulary',
            JSON.stringify([v.cefr_level, v.pos, v.grade_suitability].filter(Boolean)),
            `db://cambridge_vocabulary/${v.id}`, `vocab_${v.id}`,
            md
          ).run();
          stats.vocabulary++;
          stats.flashcards++;
        } catch (e) { errors.push(`vocab ${v.id}: ${e.message}`); }
      }
    } catch (e) { errors.push(`vocab: ${e.message}`); }

    // 4. CURRICULA → knowledge_vault
    try {
      const curr = await db.prepare(`SELECT id, code, category, title, description, icon FROM curricula`).all();
      for (const c of (curr.results || [])) {
        const vid = `db_curriculum_${c.id}`;
        const md = `# ${mdEscape(c.title)}\n\n- **Mã:** ${mdEscape(c.code || '—')}\n- **Nhóm:** ${mdEscape(c.category || '—')}\n\n${mdEscape(c.description || '')}\n\n> Nguồn: database.curricula (id: ${c.id})`;
        try {
          await db.prepare(`
            INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
          `).bind(
            vid, `Chương trình: ${c.title}`, '01_CURRICULUM', 'curriculum',
            JSON.stringify([c.code, c.category].filter(Boolean)),
            `db://curricula/${c.id}`, `curriculum_${c.id}`,
            md
          ).run();
          stats.curricula++;
        } catch (e) { errors.push(`curriculum ${c.id}: ${e.message}`); }
      }
    } catch (e) {
      errors.push(`curricula: ${e.message}`);
    }

    // 5. QUIZZES + QUIZ_QUESTIONS (Published từ Quiz Studio) → knowledge_vault (08_EXAM_BANK)
    try {
      const quizzesRes = await db.prepare(
        `SELECT id, title, description, time_limit_minutes, source_file_id, source_file_name, source_text_excerpt, updated_at
         FROM quizzes
         WHERE status = 'published'
         ORDER BY updated_at DESC
         LIMIT 300`
      ).all();
      for (const qz of (quizzesRes.results || [])) {
        const vid = `db_quiz_${qz.id}`;
        const qRes = await db.prepare(
          `SELECT q_order, type, prompt, options_json, correct_answer, explanation
           FROM quiz_questions
           WHERE quiz_id = ?
           ORDER BY q_order ASC
           LIMIT 60`
        ).bind(qz.id).all();
        const qList = qRes.results || [];
        const qLines = qList.map((item, idx) => {
          let optsText = '';
          try {
            const parsed = JSON.parse(item.options_json || 'null');
            if (Array.isArray(parsed)) {
              optsText = '\n' + parsed.map((o) => `  - ${mdEscape(o)}`).join('\n');
            }
          } catch {}
          return `${idx + 1}. **(${mdEscape(item.type)})** ${mdEscape(item.prompt)}${optsText}\n   - *Đáp án:* ${mdEscape(item.correct_answer || '—')}`;
        }).join('\n\n');

        const md =
          `# 📝 Quiz: ${mdEscape(qz.title)}\n\n` +
          `- **Thời lượng:** ${qz.time_limit_minutes || 15} phút\n` +
          `- **Số câu hỏi:** ${qList.length} câu\n` +
          (qz.source_file_name ? `- **Tài liệu nguồn:** ${mdEscape(qz.source_file_name)}\n` : '') +
          `\n${mdEscape(qz.description || '')}\n\n---\n\n` +
          (qLines || mdEscape(qz.source_text_excerpt || ''));

        await db.prepare(`
          INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
          VALUES (?, ?, '08_EXAM_BANK', 'quiz', ?, ?, ?, ?, 'published')
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
        `).bind(
          vid,
          `Đề Quiz: ${qz.title}`,
          JSON.stringify(['quiz-studio', qz.source_file_name].filter(Boolean)),
          `db://quizzes/${qz.id}`,
          `quiz_${qz.id}_${qList.length}`,
          md
        ).run();
        stats.quizzes++;

        if (qz.source_text_excerpt && String(qz.source_text_excerpt).length >= 80 && qz.source_file_id) {
          const synced = await syncDriveSourceToKnowledgeVault(
            db,
            { id: qz.source_file_id, name: qz.source_file_name || qz.title },
            qz.source_text_excerpt
          );
          if (synced) stats.drive_sources++;
        }
      }
    } catch (e) {
      errors.push(`quizzes: ${e.message}`);
    }

    // 6. SESSION_QUALITY_AUDITS (Giáo án & Tổng kết ca dạy) → knowledge_vault (05_TEACHING_SOP_AND_PEDAGOGY)
    try {
      const auditsRes = await db.prepare(
        `SELECT session_id, class_id, vault_article_title, drive_file_name, drive_file_url,
                lesson_plan_content, effectiveness_notes, roadmap_recommendation, updated_at
         FROM session_quality_audits
         WHERE (lesson_plan_content IS NOT NULL AND LENGTH(TRIM(lesson_plan_content)) > 20)
            OR (effectiveness_notes IS NOT NULL AND LENGTH(TRIM(effectiveness_notes)) > 10)
            OR (drive_file_url IS NOT NULL AND LENGTH(TRIM(drive_file_url)) > 5)
         ORDER BY updated_at DESC
         LIMIT 200`
      ).all();
      for (const aud of (auditsRes.results || [])) {
        const vid = `db_audit_${aud.session_id}`;
        const md =
          `# 👩‍🏫 Hồ sơ Ca dạy & Giáo án (${mdEscape(aud.session_id)})\n\n` +
          (aud.vault_article_title ? `- **Bài học Kho Tri Thức:** ${mdEscape(aud.vault_article_title)}\n` : '') +
          (aud.drive_file_name ? `- **Tài liệu Google Drive:** ${mdEscape(aud.drive_file_name)}\n` : '') +
          (aud.drive_file_url ? `- **Link bài giảng:** [Mở tài liệu](${aud.drive_file_url})\n` : '') +
          (aud.lesson_plan_content ? `\n## Giáo án / Nội dung bài giảng\n\n${aud.lesson_plan_content}\n\n` : '') +
          (aud.effectiveness_notes ? `## Tổng kết & Nhận xét sau ca dạy\n\n${aud.effectiveness_notes}\n\n` : '') +
          (aud.roadmap_recommendation ? `## Đề xuất lộ trình tiếp theo\n\n${aud.roadmap_recommendation}\n\n` : '') +
          `> Nguồn: database.session_quality_audits (session_id: ${aud.session_id})`;
        await db.prepare(`
          INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)
          VALUES (?, ?, '05_TEACHING_SOP_AND_PEDAGOGY', 'session_audit', ?, ?, ?, ?, 'published')
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, updated_at=CURRENT_TIMESTAMP
        `).bind(
          vid,
          `Hồ sơ Ca dạy: ${aud.session_id}`,
          JSON.stringify(['session-audit', 'giao-an', aud.class_id].filter(Boolean)),
          `db://session_quality_audits/${aud.session_id}`,
          `audit_${aud.session_id}`,
          md
        ).run();
        stats.session_audits++;
      }
    } catch (e) {
      errors.push(`session_audits: ${e.message}`);
    }

    // 7. Rebuild FTS index
    try {
      await db.prepare(`INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')`).run();
    } catch (e) {
      errors.push(`fts rebuild: ${e.message}`);
    }

    const totalMounted =
      stats.exams +
      stats.questions +
      stats.vocabulary +
      stats.curricula +
      stats.quizzes +
      stats.drive_sources +
      stats.session_audits;

    return json({
      success: true,
      message: `Đã đồng bộ ${totalMounted} học liệu (Đề thi, Câu hỏi, Từ vựng, Quiz, Tài liệu Drive & Hồ sơ ca dạy) vào Kho Tri Thức D1`,
      stats,
      errors: errors.slice(0, 20)
    });
  } catch (err) {
    console.error('Second-brain sync error:', err);
    return json({ success: false, error: 'Lỗi máy chủ nội bộ.', stats }, { status: 500 });
  }
}

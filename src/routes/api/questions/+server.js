import { json } from '@sveltejs/kit';

export const prerender = false;

function parseGradeLevel(gl) {
  if (gl === null || gl === undefined) return 0;
  const m = String(gl).match(/(\d{1,2})/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function GET({ url, platform }) {
  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }
  const grade = url.searchParams.get('grade');
  const examId = url.searchParams.get('exam_id');
  const limit = Math.min(2000, Number(url.searchParams.get('limit')) || 500);

  const res = await db.prepare(
    `SELECT id, grade_level, skill_category, question_type, question_text,
      options_json, correct_option_id, explanation, source_ref
     FROM question_bank WHERE status = 'published' OR status IS NULL
     ORDER BY id LIMIT ?`
  ).bind(limit).all();

  let rows = (res.results || []).map(r => {
    let eid = '';
    if (r.source_ref && String(r.source_ref).startsWith('exam:')) {
      eid = String(r.source_ref).slice(5);
    }
    return {
      id: r.id,
      exam_id: eid,
      grade: parseGradeLevel(r.grade_level),
      skill: r.skill_category || '',
      type: r.question_type || 'multiple_choice',
      prompt: r.question_text || '',
      options_json: r.options_json || '[]',
      correct_answer: r.correct_option_id || '',
      explanation: r.explanation || ''
    };
  });

  if (grade) {
    const g = parseInt(grade, 10);
    rows = rows.filter(q => q.grade === g);
  }
  if (examId) {
    rows = rows.filter(q => q.exam_id === examId);
  }

  return json({ success: true, total: rows.length, source: 'd1', data: rows });
}

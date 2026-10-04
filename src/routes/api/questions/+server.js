import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

function parseGradeLevel(gl) {
  if (gl === null || gl === undefined) return 0;
  const m = String(gl).match(/(\d{1,2})/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function GET({ url, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  // Auth: xác định staff để quyết định có trả đáp án không
  let isStaff = false;
  if (request) {
    try {
      const auth = await verifyServerAuth(request, platform);
      if (auth && auth.authenticated) {
        isStaff = isStaffUser(auth.user);
      }
    } catch {
      // Không auth -> coi như guest, không trả đáp án
    }
  }
  const includeAnswers = url.searchParams.get('include_answers') === '1';
  const canSeeAnswers = isStaff && includeAnswers;

  const grade = url.searchParams.get('grade');
  const examId = url.searchParams.get('exam_id');

  // Enforce limit 1..200 (chặn limit=-1, NaN, quá lớn để dump bank)
  let limit = parseInt(url.searchParams.get('limit'), 10);
  if (!Number.isFinite(limit)) limit = 100;
  limit = Math.max(1, Math.min(200, limit));

  // Chỉ SELECT cột nhạy cảm khi staff yêu cầu rõ ràng
  const cols = canSeeAnswers
    ? 'id, grade_level, skill_category, question_type, question_text, options_json, correct_option_id, explanation, source_ref'
    : 'id, grade_level, skill_category, question_type, question_text, options_json, source_ref';

  const where = [`(status = 'published' OR status IS NULL)`];
  const params = [];
  if (examId) {
    where.push(`source_ref = ?`);
    params.push(`exam:${examId}`);
  }
  if (grade) {
    const parsedGrade = parseInt(grade, 10);
    if (!Number.isInteger(parsedGrade) || parsedGrade < 1 || parsedGrade > 12) {
      return json({ success: false, error: 'Invalid grade' }, { status: 400 });
    }
    // Production contains grade values such as "7", "lop_7" and "Lớp 7".
    where.push(`CAST(TRIM(REPLACE(REPLACE(REPLACE(LOWER(grade_level), 'lớp', ''), 'lop_', ''), 'lop', '')) AS INTEGER) = ?`);
    params.push(parsedGrade);
  }
  params.push(limit);

  const res = await db.prepare(
    `SELECT ${cols}
     FROM question_bank
     WHERE ${where.join(' AND ')}
     ORDER BY id LIMIT ?`
  ).bind(...params).all();

  let rows = (res.results || []).map(r => {
    let eid = '';
    if (r.source_ref && String(r.source_ref).startsWith('exam:')) {
      eid = String(r.source_ref).slice(5);
    }
    const q = {
      id: r.id,
      exam_id: eid,
      grade: parseGradeLevel(r.grade_level),
      skill: r.skill_category || '',
      type: r.question_type || 'multiple_choice',
      prompt: r.question_text || '',
      options_json: r.options_json || '[]'
    };
    // SECURITY: chỉ staff + include_answers=1 mới nhận đáp án
    if (canSeeAnswers) {
      q.correct_answer = r.correct_option_id || '';
      q.explanation = r.explanation || '';
    }
    return q;
  });

  return json({ success: true, total: rows.length, source: 'd1', data: rows });
}

import { json } from '@sveltejs/kit';
import { getAllEvaluations, getEvaluationsByStudent, saveEvaluation, formatParentReportCard, dispatchBotReport } from '$lib/unifiedStore';

export const prerender = false;

export async function GET({ url, platform }) {
  const studentId = url.searchParams.get('student_id');

  if (platform?.env?.DB) {
    try {
      let query = 'SELECT * FROM student_evaluations ORDER BY created_at DESC';
      let params = [];
      if (studentId) {
        query = 'SELECT * FROM student_evaluations WHERE student_id = ? ORDER BY created_at DESC';
        params = [studentId];
      }
      const d1Res = await platform.env.DB.prepare(query).bind(...params).all();
      if (d1Res?.results?.length > 0) {
        return json({
          success: true,
          total: d1Res.results.length,
          evaluations: d1Res.results,
          source: 'cloudflare_d1'
        });
      }
    } catch (e) {
      console.error('D1 evaluations query error:', e);
    }
  }

  if (studentId) {
    const list = getEvaluationsByStudent(studentId);
    return json({ success: true, evaluations: list, source: 'local_store' });
  }

  const all = getAllEvaluations();
  return json({ success: true, total: all.length, evaluations: all, source: 'local_store' });
}

export async function POST({ request, platform }) {
  try {
    const body = await request.json();
    if (!body.student_name || !body.teacher_name) {
      return json({ success: false, error: 'Thiếu thông tin học sinh hoặc giáo viên đánh giá' }, { status: 400 });
    }

    const saved = saveEvaluation(body);
    const parentReport = formatParentReportCard(saved);

    if (platform?.env?.DB) {
      try {
        await platform.env.DB.prepare(`
          INSERT INTO student_evaluations (
            id, student_id, student_name, teacher_id, teacher_name, grade_level,
            listening_score, reading_score, writing_score, speaking_score, grammar_vocab_score,
            overall_score, primary_aptitude, secondary_aptitude, strengths, weaknesses,
            teacher_feedback, action_plan, recommended_materials, parent_name, parent_phone, parent_zalo_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET overall_score = excluded.overall_score, updated_at = CURRENT_TIMESTAMP;
        `).bind(
          saved.id, saved.student_id, saved.student_name, saved.teacher_id || 'usr_super_2',
          saved.teacher_name, saved.grade_level || 'Lớp 7', saved.listening_score,
          saved.reading_score, saved.writing_score, saved.speaking_score,
          saved.grammar_vocab_score, saved.overall_score, saved.primary_aptitude,
          saved.secondary_aptitude || '', saved.strengths || '', saved.weaknesses || '',
          saved.teacher_feedback || '', saved.action_plan || '', saved.recommended_materials || '',
          saved.parent_name || '', saved.parent_phone || '', saved.parent_zalo_id || ''
        ).run();
      } catch (d1Err) {
        console.error('D1 evaluation insert error:', d1Err);
      }
    }

    // Trigger webhook notification if parent report is generated
    dispatchBotReport('STUDENT_EVALUATION_CREATED', {
      student_id: saved.student_id,
      student_name: saved.student_name,
      teacher_name: saved.teacher_name,
      aptitude: saved.primary_aptitude,
      report_card: parentReport,
      parent_phone: saved.parent_phone,
      parent_zalo_id: saved.parent_zalo_id
    });

    return json({
      success: true,
      message: 'Lưu đánh giá học sinh thành công và đã chuẩn bị phiếu báo cáo phụ huynh!',
      evaluation: saved,
      report_card: parentReport
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

import { json } from '@sveltejs/kit';
import { getAllEvaluations, getEvaluationsByStudent, saveEvaluation, formatParentReportCard, dispatchBotReport } from '../../../lib/unifiedStore.js';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Dữ liệu đánh giá chỉ dành cho staff.' }, { status: 403 });
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
      const evaluations = d1Res?.results || [];
      return json({ success: true, total: evaluations.length, evaluations, source: 'cloudflare_d1' });
    } catch (e) {
      console.error('D1 evaluations query error:', e);
      return json({ success: false, error: 'DatabaseError: Không thể đọc đánh giá.' }, { status: 503 });
    }
  }
  const localMock = platform?.env?.ENABLE_LOCAL_MOCK === 'true' || (typeof process !== 'undefined' && process.env?.ENABLE_LOCAL_MOCK === 'true');
  if (!localMock) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
  const list = studentId ? getEvaluationsByStudent(studentId) : getAllEvaluations();
  return json({ success: true, total: list.length, evaluations: list, source: 'local_mock' });
}

export async function POST({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
    if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ staff được tạo đánh giá.' }, { status: 403 });
    const body = await request.json();
    if (!body.student_id || !body.student_name || !body.grade_level) {
      return json({ success: false, error: 'Thiếu student_id, student_name hoặc grade_level.' }, { status: 400 });
    }
    const localMock = platform?.env?.ENABLE_LOCAL_MOCK === 'true' || (typeof process !== 'undefined' && process.env?.ENABLE_LOCAL_MOCK === 'true');
    if (!platform?.env?.DB && !localMock) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
    const saved = saveEvaluation({ ...body, teacher_id: auth.user.id, teacher_name: auth.user.name || auth.user.username });
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
          saved.id, saved.student_id, saved.student_name, auth.user.id,
          auth.user.name || auth.user.username, saved.grade_level, saved.listening_score,
          saved.reading_score, saved.writing_score, saved.speaking_score,
          saved.grammar_vocab_score, saved.overall_score, saved.primary_aptitude,
          saved.secondary_aptitude || '', saved.strengths || '', saved.weaknesses || '',
          saved.teacher_feedback || '', saved.action_plan || '', saved.recommended_materials || '',
          saved.parent_name || '', saved.parent_phone || '', saved.parent_zalo_id || ''
        ).run();
      } catch (d1Err) {
        console.error('D1 evaluation insert error:', d1Err);
        return json({ success: false, error: 'DatabaseError: Không thể lưu đánh giá.' }, { status: 503 });
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

import { json } from '@sveltejs/kit';
import { addStudent, removeStudent, saveEvaluation, formatParentReportCard, getAllUsers, getEvaluationsByStudent, logSnapshot } from '$lib/unifiedStore';

export const prerender = false;

export async function POST({ request }) {
  try {
    const payload = await request.json();
    const action = payload.action || 'info';

    // 1. Add Student via Zalo Bot
    if (action === 'add_student') {
      const student = addStudent({
        name: payload.name,
        email: payload.email,
        grade: payload.grade || 'Lớp 7',
        school: payload.school || '',
        target: payload.target || '',
        parent_name: payload.parent_name || '',
        parent_phone: payload.parent_phone || '',
        parent_zalo_id: payload.parent_zalo_id || payload.zalo_user_id || '',
        class_id: payload.class_id || 'ZALO_BOT_CLASS'
      });

      return json({
        success: true,
        message: `🤖 [Bot Zalo] Đã thêm học sinh "${student.name}" vào hệ thống thành công!`,
        student
      });
    }

    // 2. Remove Student via Zalo Bot
    if (action === 'remove_student') {
      const ok = removeStudent(payload.student_id);
      return json({
        success: ok,
        message: ok ? `🤖 [Bot Zalo] Đã xóa học sinh có ID ${payload.student_id}` : 'Không tìm thấy học sinh cần xóa'
      });
    }

    // 3. Evaluate Student & Output Parent Report Card
    if (action === 'evaluate_student') {
      const evaluation = saveEvaluation({
        student_id: payload.student_id,
        student_name: payload.student_name,
        teacher_id: payload.teacher_id || 'usr_teach_zalo',
        teacher_name: payload.teacher_name || 'Giáo viên phụ trách',
        grade_level: payload.grade_level || 'Lớp 7',
        listening_score: payload.listening || 7.0,
        reading_score: payload.reading || 7.0,
        writing_score: payload.writing || 7.0,
        speaking_score: payload.speaking || 7.0,
        grammar_vocab_score: payload.grammar || 7.0,
        strengths: payload.strengths || 'Tiếp thu bài nhanh, thái độ học tập tích cực',
        weaknesses: payload.weaknesses || 'Cần chú ý cẩn thận hơn khi làm bài viết',
        teacher_feedback: payload.feedback || 'Em có nhiều tiến bộ trong quá trình học.',
        action_plan: payload.action_plan || '1. Làm bài tập bổ trợ 15p hàng ngày.\n2. Luyện nghe nói phản xạ cuối tuần.',
        recommended_materials: payload.materials || 'Tài liệu Tiếng Anh K12 chuẩn 2026',
        parent_name: payload.parent_name || '',
        parent_phone: payload.parent_phone || '',
        parent_zalo_id: payload.parent_zalo_id || ''
      });

      const reportCard = formatParentReportCard(evaluation);

      return json({
        success: true,
        message: '🤖 [Bot Zalo] Đã lưu đánh giá học sinh và trích xuất phiếu báo cáo phụ huynh thành công!',
        evaluation,
        zalo_message: reportCard
      });
    }

    // 4. Get Student Parent Report
    if (action === 'get_report') {
      const evals = getEvaluationsByStudent(payload.student_id);
      if (!evals || evals.length === 0) {
        return json({ success: false, message: 'Chưa có dữ liệu đánh giá cho học sinh này' }, { status: 404 });
      }
      const latest = evals[0];
      const card = formatParentReportCard(latest);
      return json({
        success: true,
        student_name: latest.student_name,
        evaluation: latest,
        zalo_message: card
      });
    }

    return json({
      success: true,
      service: 'Zalo Bot Management Endpoint',
      supported_actions: ['add_student', 'remove_student', 'evaluate_student', 'get_report']
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

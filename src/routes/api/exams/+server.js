import { json } from '@sveltejs/kit';
import { 
  getExams, 
  getAllExamAttempts, 
  saveExamAttempt, 
  saveBatchExamAttempts,
  getAttendedStudentsForSession 
} from '$lib/unifiedStore';

export const prerender = false;

export async function GET({ url }) {
  try {
    const studentId = url.searchParams.get('student_id');
    const examId = url.searchParams.get('exam_id');
    const sessionId = url.searchParams.get('session_id');

    let attempts = getAllExamAttempts();
    if (studentId) attempts = attempts.filter(a => a.user_id === studentId);
    if (examId) attempts = attempts.filter(a => a.exam_id === examId);
    if (sessionId) attempts = attempts.filter(a => a.session_id === sessionId);

    return json({
      success: true,
      total: attempts.length,
      attempts,
      exams: getExams()
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();

    // Check if batch submission
    if (body.is_batch && body.student_scores && body.session_id) {
      const savedList = saveBatchExamAttempts(
        body.session_id,
        body.class_id || '',
        body.exam_id,
        body.exam_title,
        body.student_scores,
        body.teacher || null
      );
      return json({
        success: true,
        message: `Đã chấm điểm thành công cho ${savedList.length} học sinh có mặt!`,
        attempts: savedList
      });
    }

    // Single attempt submission
    const saved = saveExamAttempt({
      user_id: body.user_id,
      user_name: body.user_name || body.student_name,
      user_email: body.user_email,
      exam_id: body.exam_id,
      exam_title: body.exam_title,
      score: body.score,
      max_score: body.max_score || 10,
      answers: body.answers || {},
      duration_seconds: body.duration_seconds || 0,
      session_id: body.session_id || '',
      class_id: body.class_id || ''
    });

    return json({
      success: true,
      message: 'Đã lưu kết quả thi thành công!',
      attempt: saved
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

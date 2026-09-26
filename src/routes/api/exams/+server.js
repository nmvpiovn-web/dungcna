import { json } from '@sveltejs/kit';
import { 
  getExams, 
  getAllExamAttempts, 
  saveExamAttempt, 
  saveBatchExamAttempts,
  getAttendedStudentsForSession 
} from '../../../lib/unifiedStore.js';
import questionsData from '../../../lib/data/questions.json' with { type: 'json' };

export const prerender = false;

export async function GET({ url }) {
  try {
    const studentId = url.searchParams.get('student_id');
    const examId = url.searchParams.get('exam_id');
    const sessionId = url.searchParams.get('session_id');
    const grade = url.searchParams.get('grade');
    const includeQuestions = url.searchParams.get('include_questions') === '1';
    const isRandom = url.searchParams.get('random') === '1';

    // Dynamic random test generator from questions pool
    if (isRandom) {
      const targetGrade = grade ? parseInt(grade, 10) : 7;
      const duration = parseInt(url.searchParams.get('duration') || '15', 10);
      const skill = url.searchParams.get('skill') || 'all';

      let pool = [...questionsData];
      if (targetGrade > 0) {
        pool = pool.filter(q => Number(q.grade) === Number(targetGrade));
      } else {
        pool = pool.filter(q => Number(q.grade) === 0 || (q.cambridge_level && ['KET_A2', 'PET_B1', 'IELTS_7'].includes(q.cambridge_level)));
      }

      if (skill !== 'all') {
        const filteredBySkill = pool.filter(q => (q.skill || '').toLowerCase().includes(skill.toLowerCase()));
        if (filteredBySkill.length >= 5) pool = filteredBySkill;
      }

      const count = duration <= 5 ? 5 : (duration <= 15 ? 10 : Math.min(25, pool.length));
      const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

      return json({
        success: true,
        is_generated: true,
        grade: targetGrade,
        duration_minutes: duration,
        total_questions: shuffled.length,
        questions: shuffled
      });
    }

    let attempts = getAllExamAttempts();
    if (studentId) attempts = attempts.filter(a => a.user_id === studentId);
    if (examId) attempts = attempts.filter(a => a.exam_id === examId);
    if (sessionId) attempts = attempts.filter(a => a.session_id === sessionId);

    let exams = getExams();
    if (grade) {
      const grNum = parseInt(grade, 10);
      exams = exams.filter(e => e.grade === grNum);
    }

    let linkedQuestions = [];
    if (includeQuestions && examId) {
      linkedQuestions = questionsData.filter(q => q.exam_id === examId);
    }

    return json({
      success: true,
      total: attempts.length,
      attempts,
      exams,
      questions: includeQuestions ? linkedQuestions : undefined,
      total_questions_bank: questionsData.length
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

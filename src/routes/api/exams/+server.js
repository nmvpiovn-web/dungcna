import { json } from '@sveltejs/kit';
import { 
  getExams, 
  getAllExamAttempts, 
  saveExamAttempt, 
  saveBatchExamAttempts,
  getAttendedStudentsForSession 
} from '../../../lib/unifiedStore.js';
import questionsData from '../../../lib/data/questions.json' with { type: 'json' };
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

export async function GET({ url, request, platform }) {
  let user = null;
  let isStaff = false;

  if (request) {
    try {
      const auth = await verifyServerAuth(request, platform);
      if (auth && auth.authenticated) {
        user = auth.user;
        isStaff = isStaffUser(user);
      }
    } catch {
      // Unauthenticated caller or missing token; proceed with public exam catalog permissions
    }
  }

  const studentId = url.searchParams.get('student_id');
  const examId = url.searchParams.get('exam_id');
  const sessionId = url.searchParams.get('session_id');
  const grade = url.searchParams.get('grade');
  const includeQuestions = url.searchParams.get('include_questions') === '1';
  const includeAnswers = url.searchParams.get('include_answers') === '1';
  const isRandom = url.searchParams.get('random') === '1';

  try {
    // 1. Dynamic random test generator from questions pool (Anti-leakage enforced)
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

      // SECURITY RULE: Never leak correct_answer and explanation in random practice exams
      const sanitizedQuestions = (isStaff && includeAnswers) 
        ? shuffled 
        : shuffled.map(({ correct_answer, explanation, ...rest }) => rest);

      return json({
        success: true,
        is_generated: true,
        grade: targetGrade,
        duration_minutes: duration,
        total_questions: shuffled.length,
        questions: sanitizedQuestions
      });
    }

    // 2. Exam attempts (Strict RBAC protection)
    let attempts = [];
    if (user) {
      attempts = getAllExamAttempts();
      if (!isStaff) {
        attempts = attempts.filter(a => a.user_id === user.id);
      } else if (studentId) {
        attempts = attempts.filter(a => a.user_id === studentId);
      }

      if (examId) attempts = attempts.filter(a => a.exam_id === examId);
      if (sessionId) attempts = attempts.filter(a => a.session_id === sessionId);
    }

    let exams = getExams();
    if (grade) {
      const grNum = parseInt(grade, 10);
      exams = exams.filter(e => e.grade === grNum);
    }

    // 3. Questions linkage with strict anti-leakage protection
    let linkedQuestions = [];
    if (includeQuestions && examId) {
      const rawQuestions = questionsData.filter(q => q.exam_id === examId);

      // SECURITY ENFORCEMENT: Never leak correct_answer and explanation to students before submission!
      if (isStaff && includeAnswers) {
        linkedQuestions = rawQuestions;
      } else {
        linkedQuestions = rawQuestions.map(({ correct_answer, explanation, ...rest }) => rest);
      }
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

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const isStaff = isStaffUser(user);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON' }, { status: 400 });
  }

  try {
    // 1. Batch grading submission (STAFF ONLY)
    if (body.is_batch && body.student_scores && body.session_id) {
      if (!isStaff) {
        return json({ success: false, error: 'Forbidden: Chỉ giáo viên hoặc quản trị viên mới có quyền chấm điểm theo ca' }, { status: 403 });
      }

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

    // 2. Single attempt submission
    // OWNERSHIP CHECK: Student can ONLY submit an attempt for themselves
    const effectiveUserId = isStaff ? (body.user_id || user.id) : user.id;
    const effectiveUserName = isStaff ? (body.user_name || body.student_name || user.name) : user.name;
    const examId = body.exam_id;
    const userAnswers = body.answers || {};

    if (!examId) {
      return json({ success: false, error: 'MissingExamId: Thiếu mã đề thi' }, { status: 400 });
    }

    // ANTI-EMPTY SUBMISSION CHECK
    if (Object.keys(userAnswers).length === 0) {
      return json({ success: false, error: 'EmptySubmission: Không thể nộp bài thi trống (chưa chọn câu trả lời)' }, { status: 400 });
    }

    // SERVER-SIDE SCORING: Calculate score from authoritative question bank
    // NEVER TRUST CLIENT-SUPPLIED body.score!
    const examQuestions = questionsData.filter(q => q.exam_id === examId);
    let serverCalculatedScore = 0;
    const maxScore = Number(body.max_score) || 10.0;

    if (examQuestions.length > 0) {
      let correctCount = 0;
      for (const q of examQuestions) {
        const qKey = q.id !== undefined ? String(q.id) : String(q.question_index);
        const givenAnswer = userAnswers[qKey] || userAnswers[String(q.question_index)];
        if (givenAnswer && String(givenAnswer).trim().toUpperCase() === String(q.correct_answer).trim().toUpperCase()) {
          correctCount++;
        }
      }
      serverCalculatedScore = Number(((correctCount / examQuestions.length) * maxScore).toFixed(1));
    } else if (isStaff && body.score !== undefined) {
      // Custom teacher manual evaluation
      serverCalculatedScore = Math.min(maxScore, Math.max(0, Number(body.score)));
    } else {
      serverCalculatedScore = 0;
    }

    const saved = saveExamAttempt({
      user_id: effectiveUserId,
      user_name: effectiveUserName,
      user_email: user.email || body.user_email || '',
      exam_id: examId,
      exam_title: body.exam_title || 'Bài kiểm tra',
      score: serverCalculatedScore,
      max_score: maxScore,
      answers: userAnswers,
      duration_seconds: body.duration_seconds || 0,
      session_id: body.session_id || '',
      class_id: body.class_id || ''
    });

    return json({
      success: true,
      message: 'Đã chấm điểm và lưu kết quả thi thành công!',
      server_calculated_score: serverCalculatedScore,
      attempt: saved
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

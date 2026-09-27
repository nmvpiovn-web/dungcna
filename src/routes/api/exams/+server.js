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
    // 1. Dynamic random test generator from questions pool (Strict blueprints & shortage check)
    if (isRandom) {
      const targetGrade = grade ? parseInt(grade, 10) : 7;
      const duration = parseInt(url.searchParams.get('duration') || '15', 10);
      const skill = url.searchParams.get('skill') || 'all';

      // Standard Master Plan blueprints: 5m: 5, 15m: 15, 30m: 20, 45m: 30, thpt_qg: 40
      const requiredCount = duration <= 5 ? 5 : (duration <= 15 ? 15 : (duration <= 30 ? 20 : (duration <= 45 ? 30 : 40)));

      let pool = [...questionsData];
      if (targetGrade > 0) {
        pool = pool.filter(q => Number(q.grade) === Number(targetGrade));
      } else {
        pool = pool.filter(q => Number(q.grade) === 0 || (q.cambridge_level && ['KET_A2', 'PET_B1', 'IELTS_7'].includes(q.cambridge_level)));
      }

      if (skill !== 'all') {
        const filteredBySkill = pool.filter(q => (q.skill || '').toLowerCase().includes(skill.toLowerCase()));
        if (filteredBySkill.length < requiredCount) {
          return json({
            success: false,
            error: `ShortageError: Ngân hàng câu hỏi không đủ số lượng cho kỹ năng '${skill}'. Yêu cầu ${requiredCount} câu, hiện có ${filteredBySkill.length} câu.`
          }, { status: 400 });
        }
        pool = filteredBySkill;
      }

      if (pool.length < requiredCount) {
        return json({
          success: false,
          error: `ShortageError: Ngân hàng câu hỏi khối ${targetGrade} không đủ số lượng (${pool.length}/${requiredCount} câu) cho bài thi ${duration} phút.`
        }, { status: 400 });
      }

      const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, requiredCount);

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

    // 2. Exam attempts (Strict RBAC & D1 Persistence)
    let attempts = [];
    if (user) {
      if (platform?.env?.DB) {
        try {
          await platform.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS exam_attempts (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              user_name TEXT,
              user_email TEXT,
              exam_id TEXT NOT NULL,
              exam_title TEXT,
              score REAL NOT NULL,
              max_score REAL NOT NULL,
              answers_json TEXT NOT NULL,
              duration_seconds INTEGER DEFAULT 0,
              session_id TEXT,
              class_id TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `).run();

          let query = 'SELECT * FROM exam_attempts WHERE 1=1';
          const params = [];
          if (!isStaff) {
            query += ' AND user_id = ?';
            params.push(user.id);
          } else if (studentId) {
            query += ' AND user_id = ?';
            params.push(studentId);
          }
          if (examId) {
            query += ' AND exam_id = ?';
            params.push(examId);
          }
          if (sessionId) {
            query += ' AND session_id = ?';
            params.push(sessionId);
          }
          query += ' ORDER BY created_at DESC;';

          const d1Res = await platform.env.DB.prepare(query).bind(...params).all();
          attempts = d1Res.results || [];
        } catch (dbErr) {
          console.error('D1 exam_attempts read error:', dbErr);
          return json({
            success: false,
            error: `DatabasePersistenceError: Lỗi truy vấn bảng exam_attempts trên D1 (${dbErr.message})`
          }, { status: 500 });
        }
      } else {
        attempts = getAllExamAttempts();
        if (!isStaff) attempts = attempts.filter(a => a.user_id === user.id);
      }
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
    if (!userAnswers || typeof userAnswers !== 'object' || Object.keys(userAnswers).length === 0) {
      return json({ success: false, error: 'EmptySubmission: Không thể nộp bài thi trống (chưa chọn câu trả lời)' }, { status: 400 });
    }

    // SERVER-SIDE DETERMINED MAX SCORE:
    // Never trust client-controlled body.max_score!
    const officialExam = getExams().find(e => e.id === examId);
    const maxScore = isStaff && body.max_score !== undefined
      ? Math.min(100, Math.max(1, Number(body.max_score)))
      : (officialExam?.max_score ? Number(officialExam.max_score) : 10.0);

    // SERVER-SIDE SCORING: Calculate score from authoritative question bank
    const examQuestions = questionsData.filter(q => q.exam_id === examId);
    let serverCalculatedScore = 0;

    if (examQuestions.length > 0) {
      const validQuestionKeys = new Set(examQuestions.map(q => q.id !== undefined ? String(q.id) : String(q.question_index)));
      
      // Foreign key & type validation: Ensure submitted answers belong to question bank and are valid primitives
      for (const [key, val] of Object.entries(userAnswers)) {
        if (!validQuestionKeys.has(String(key))) {
          return json({ 
            success: false, 
            error: `ForeignKeyError: Câu hỏi '${key}' không thuộc đề thi này. Từ chối câu trả lời ngoài đề thi.` 
          }, { status: 400 });
        }
        if (typeof val === 'object' && val !== null) {
          return json({ 
            success: false, 
            error: `InvalidAnswerType: Câu trả lời cho '${key}' phải là chuỗi đáp án hợp lệ` 
          }, { status: 400 });
        }
      }

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

    // ANTI-REPLAY & RETAKE LOCK:
    // Students can submit an exam strictly once; staff is debounced against rapid double-clicks
    if (platform?.env?.DB) {
      try {
        if (!isStaff) {
          const priorAttempt = await platform.env.DB.prepare(`
            SELECT id FROM exam_attempts 
            WHERE user_id = ? AND exam_id = ?
            LIMIT 1;
          `).bind(effectiveUserId, examId).first();

          if (priorAttempt) {
            return json({
              success: false,
              error: `DuplicateSubmissionError: Học sinh đã hoàn thành và nộp bài thi '${examId}'. Mỗi bài thi chỉ được nộp một lần (Anti-Replay / Retake Lock).`
            }, { status: 409 });
          }
        } else {
          const recentAttempt = await platform.env.DB.prepare(`
            SELECT id FROM exam_attempts 
            WHERE user_id = ? AND exam_id = ? AND created_at > datetime('now', '-3 seconds')
            LIMIT 1;
          `).bind(effectiveUserId, examId).first();

          if (recentAttempt) {
            return json({
              success: false,
              error: `DuplicateSubmissionError: Bài làm cho đề thi này vừa được tiếp nhận. Chống nộp lặp (Anti-Replay Guard).`
            }, { status: 409 });
          }
        }
      } catch {
        // Table may not exist yet, will be ensured below
      }
    }

    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const saved = {
      id: attemptId,
      user_id: effectiveUserId,
      user_name: effectiveUserName,
      user_email: user.email || body.user_email || '',
      exam_id: examId,
      exam_title: body.exam_title || officialExam?.title || 'Bài kiểm tra',
      score: serverCalculatedScore,
      max_score: maxScore,
      answers: userAnswers,
      duration_seconds: body.duration_seconds || 0,
      session_id: body.session_id || '',
      class_id: body.class_id || '',
      created_at: new Date().toISOString()
    };

    // D1 Persistence with fail-closed guarantee
    if (platform?.env?.DB) {
      try {
        await platform.env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS exam_attempts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_name TEXT,
            user_email TEXT,
            exam_id TEXT NOT NULL,
            exam_title TEXT,
            score REAL NOT NULL,
            max_score REAL NOT NULL,
            answers_json TEXT NOT NULL,
            duration_seconds INTEGER DEFAULT 0,
            session_id TEXT,
            class_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `).run();

        await platform.env.DB.prepare(`
          INSERT INTO exam_attempts (
            id, user_id, user_name, user_email, exam_id, exam_title,
            score, max_score, answers_json, duration_seconds, session_id, class_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).bind(
          saved.id,
          saved.user_id,
          saved.user_name,
          saved.user_email,
          saved.exam_id,
          saved.exam_title,
          saved.score,
          saved.max_score,
          JSON.stringify(saved.answers),
          saved.duration_seconds,
          saved.session_id,
          saved.class_id
        ).run();
      } catch (dbErr) {
        console.error('D1 exam_attempts write error:', dbErr);
        return json({
          success: false,
          error: `DatabasePersistenceError: Không thể lưu kết quả thi vào D1 (${dbErr.message})`
        }, { status: 500 });
      }
    }

    saveExamAttempt(saved);

    return json({
      success: true,
      message: 'Đã chấm điểm và lưu kết quả thi thành công!',
      server_calculated_score: serverCalculatedScore,
      max_score: maxScore,
      attempt: saved
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

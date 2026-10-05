import { json } from '@sveltejs/kit';
import {
  getAllExamAttempts,
  saveExamAttempt
} from '../../../lib/unifiedStore.js';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

// ---- D1-only data loaders (thay the JSON/unifiedStore) ----
function parseGradeLevel(gl) {
  if (gl === null || gl === undefined) return 0;
  const m = String(gl).match(/(\d{1,2})/);
  return m ? parseInt(m[1], 10) : 0;
}

function mapQuestionRow(r) {
  let examId = '';
  if (r.source_ref && String(r.source_ref).startsWith('exam:')) {
    examId = String(r.source_ref).slice(5);
  }
  return {
    id: r.id,
    exam_id: examId,
    question_index: 0,
    grade: parseGradeLevel(r.grade_level),
    skill: r.skill_category || '',
    type: r.question_type || 'multiple_choice',
    prompt: r.question_text || '',
    options_json: r.options_json || '[]',
    correct_answer: r.correct_option_id || '',
    explanation: r.explanation || '',
    cambridge_level: ''
  };
}

async function loadExamsFromD1(db) {
  const res = await db.prepare(
    `SELECT id, curriculum_id, title, description, grade, format_type,
      skill_category, duration_minutes, total_questions, pass_percentage,
      is_published FROM exams WHERE is_published = 1 ORDER BY grade, title`
  ).all();
  return res.results || [];
}

async function loadQuestionsFromD1(db) {
  const res = await db.prepare(
    `SELECT id, grade_level, skill_category, question_type, question_text,
      options_json, correct_option_id, explanation, source_ref
     FROM question_bank WHERE status = 'published' OR status IS NULL`
  ).all();
  return (res.results || []).map(mapQuestionRow);
}

async function getExamsD1(db) {
  if (db) {
    try { return await loadExamsFromD1(db); } catch (e) {
      console.error('[exams] D1 loadExams error:', e.message);
    }
  }
  return [];
}

async function getQuestionsD1(db) {
  if (db) {
    try { return await loadQuestionsFromD1(db); } catch (e) {
      console.error('[exams] D1 loadQuestions error:', e.message);
    }
  }
  return [];
}

export async function _ensureExamSchema(db) {
  return ensureExamSchemaInternal(db);
}

const ensureExamSchema = ensureExamSchemaInternal;

async function safeAddColumn(db, table, columnDef) {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`).run();
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
      throw err;
    }
  }
}

async function ensureExamSchemaInternal(db) {
  if (!db) return;
  try {
    await db.prepare(`
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
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS exam_attempts_archive (
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
        created_at DATETIME,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archive_reason TEXT DEFAULT 'pre_unique_migration_duplicate'
      );
    `).run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS exam_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        attempt_number INTEGER DEFAULT 1,
        questions_snapshot_json TEXT NOT NULL,
        answer_key_snapshot_json TEXT,
        time_limit_minutes INTEGER NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deadline_at DATETIME NOT NULL,
        submitted_at DATETIME,
        status TEXT DEFAULT 'in_progress',
        score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();
    await safeAddColumn(db, 'exam_sessions', 'questions_snapshot_json TEXT');
    await safeAddColumn(db, 'exam_sessions', 'answer_key_snapshot_json TEXT');
    await safeAddColumn(db, 'exam_attempts', 'session_id TEXT');
    await safeAddColumn(db, 'exam_attempts', 'user_name TEXT');
    await safeAddColumn(db, 'exam_attempts', 'exam_title TEXT');
    await safeAddColumn(db, 'exam_attempts', 'class_id TEXT');
    await db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_user_exam ON exam_attempts (user_id, exam_id);
    `).run();
    await db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_session_id ON exam_attempts (session_id) WHERE session_id IS NOT NULL AND session_id != '';
    `).run();
  } catch (err) {
    if (err.message && (err.message.includes('unique') || err.message.includes('indexed columns are not unique'))) {
      try {
        await db.prepare(`
          INSERT OR IGNORE INTO exam_attempts_archive (
            id, user_id, user_name, user_email, exam_id, exam_title,
            score, max_score, answers_json, duration_seconds, session_id, class_id, created_at, archive_reason
          )
          SELECT a.id, a.user_id, a.user_name, a.user_email, a.exam_id, a.exam_title,
                 a.score, a.max_score, a.answers_json, a.duration_seconds, a.session_id, a.class_id, a.created_at,
                 'duplicate_prior_attempt'
          FROM exam_attempts a
          WHERE a.id NOT IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (
                PARTITION BY user_id, exam_id
                ORDER BY datetime(created_at) DESC, rowid DESC
              ) as rn
              FROM exam_attempts
            ) WHERE rn = 1
          );
        `).run();
        await db.prepare(`
          DELETE FROM exam_attempts
          WHERE id IN (
            SELECT id FROM exam_attempts_archive
            WHERE archive_reason = 'duplicate_prior_attempt'
          );
        `).run();
        await db.prepare(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_user_exam ON exam_attempts (user_id, exam_id);
        `).run();
      } catch (archErr) {
        throw new Error(`ExamAttemptsArchiveMigrationError: Lỗi khi xử lý dedup bản ghi thi cũ (${archErr.message})`);
      }
    } else {
      throw new Error(`ExamSchemaInitializationError: Không thể khởi tạo bảng thi trên D1 (${err.message})`);
    }
  }
}

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

      const db = platform?.env?.DB;
      if (!db) {
        return json({ success: false, error: 'DatabaseUnavailable: Không thể tạo đề khi thiếu kết nối D1' }, { status: 503 });
      }
      let pool = await getQuestionsD1(db);
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
          await ensureExamSchema(platform.env.DB);

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

    let exams = await getExamsD1(platform?.env?.DB);
    if (grade) {
      const grNum = parseInt(grade, 10);
      exams = exams.filter(e => e.grade === grNum);
    }

    // 3. Questions linkage with strict anti-leakage protection
    let linkedQuestions = [];
    const dbQ = platform?.env?.DB;
    const allQuestions = await getQuestionsD1(dbQ);
    const totalBank = allQuestions.length;
    if (includeQuestions && examId) {
      const rawQuestions = allQuestions.filter(q => q.exam_id === examId);

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
      total_questions_bank: totalBank
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

      // P1 FIX (2026-10-01): persist batch grades to D1 exam_attempts.
      // Before, saveBatchExamAttempts() only wrote to localStorage (client-only),
      // so on the server grades silently vanished while returning fake success.
      const db = platform?.env?.DB;
      if (!db) {
        return json({ success: false, error: 'DatabaseUnavailable: Không thể lưu điểm khi thiếu kết nối D1' }, { status: 503 });
      }

      const savedList = [];
      const now = new Date().toISOString();
      for (const s of body.student_scores) {
        // exam_attempts.session_id is UNIQUE — use composite key per student
        const attemptId = `batch_${body.session_id}_${s.student_id}_${Date.now()}`;
        const compositeSessionId = `${body.session_id}::${s.student_id}`;
        await db.prepare(`
          INSERT INTO exam_attempts
            (id, session_id, user_id, user_name, user_email, exam_id, exam_title, class_id,
             score, max_score, answers_json, duration_seconds, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
          ON CONFLICT(session_id) DO UPDATE SET
            score = excluded.score, max_score = excluded.max_score,
            answers_json = excluded.answers_json, created_at = excluded.created_at
        `).bind(
          attemptId,
          compositeSessionId,
          s.student_id,
          s.student_name || '',
          s.student_email || '',
          body.exam_id || '',
          body.exam_title || '',
          body.class_id || '',
          Number(s.score) || 0,
          Number(s.max_score) || 10,
          JSON.stringify(s.answers || { note: s.note || 'Giáo viên chấm điểm trực tiếp tại lớp' }),
          Number(s.duration_seconds) || 900,
          now
        ).run();
        savedList.push({ student_id: s.student_id, score: Number(s.score) || 0 });
      }
      return json({
        success: true,
        message: `Đã chấm điểm thành công cho ${savedList.length} học sinh có mặt!`,
        attempts: savedList
      });
    }

    // 2. Exam Session Lifecycle: Start Session (Server-owned instance & deadline)
    if (body.action === 'start_session' || body.action === 'start') {
      const examId = body.exam_id;
      if (!examId) {
        return json({ success: false, error: 'MissingExamId: Thiếu mã đề thi' }, { status: 400 });
      }

      if (platform?.env?.DB) {
        await ensureExamSchema(platform.env.DB);
      }

      const effectiveUserId = isStaff ? (body.user_id || user.id) : user.id;
      const officialExam = (await getExamsD1(platform?.env?.DB)).find(e => e.id === examId);
      const officialDuration = officialExam?.duration_minutes ? Number(officialExam.duration_minutes) : 45;
      const durationMinutes = isStaff && body.duration_minutes !== undefined
        ? Math.min(180, Math.max(5, Number(body.duration_minutes)))
        : officialDuration;

      const allowRetake = isStaff && Boolean(body.allow_retake);

      // Check if student already submitted this exam
      if (platform?.env?.DB && !allowRetake) {
        const priorAttempt = await platform.env.DB.prepare(`
          SELECT id FROM exam_attempts WHERE user_id = ? AND exam_id = ? LIMIT 1;
        `).bind(effectiveUserId, examId).first();
        if (priorAttempt) {
          return json({
            success: false,
            error: `DuplicateSubmissionError: Học sinh đã hoàn thành và nộp bài thi '${examId}'. Mỗi bài thi chỉ được nộp một lần (Anti-Replay / Retake Lock).`
          }, { status: 409 });
        }
      }

      // Check if an active session already exists for this user and exam
      let existingSession = null;
      if (platform?.env?.DB) {
        existingSession = await platform.env.DB.prepare(`
          SELECT * FROM exam_sessions
          WHERE user_id = ? AND exam_id = ? AND status = 'in_progress'
          ORDER BY started_at DESC LIMIT 1;
        `).bind(effectiveUserId, examId).first();
      }

      if (existingSession) {
        const deadline = new Date(existingSession.deadline_at);
        if (deadline > new Date()) {
          let snapshotQuestions = [];
          try {
            snapshotQuestions = JSON.parse(existingSession.questions_snapshot_json);
          } catch {}
          return json({
            success: true,
            resumed: true,
            session_instance: {
              instance_id: existingSession.id,
              exam_id: existingSession.exam_id,
              user_id: existingSession.user_id,
              started_at: existingSession.started_at,
              deadline_at: existingSession.deadline_at,
              time_limit_minutes: existingSession.time_limit_minutes,
              remaining_seconds: Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000)),
              questions: snapshotQuestions
            }
          });
        } else {
          if (platform?.env?.DB) {
            await platform.env.DB.prepare(`
              UPDATE exam_sessions SET status = 'expired' WHERE id = ?;
            `).bind(existingSession.id).run();
          }
        }
      }

      // Create new session instance with sanitized questions snapshot AND server-side answer key snapshot
      const rawQuestions = (await getQuestionsD1(platform?.env?.DB)).filter(q => q.exam_id === examId);
      const sanitizedSnapshot = rawQuestions.map(({ correct_answer, explanation, ...rest }) => rest);
      const answerKeySnapshot = {};
      rawQuestions.forEach(q => {
        const key = q.id !== undefined ? String(q.id) : String(q.question_index);
        // Defensive: handle all correct answer field variants (correct_answer, correct_option_id, correct_id)
        const correctAns = q.correct_answer || q.correct_option_id || q.correct_id || '';
        answerKeySnapshot[key] = correctAns;
      });
      const instanceId = `exm_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const startedAt = new Date();
      const deadlineAt = new Date(startedAt.getTime() + (durationMinutes * 60 + 60) * 1000); // 60s network grace

      if (platform?.env?.DB) {
        await platform.env.DB.prepare(`
          INSERT INTO exam_sessions (
            id, user_id, exam_id, questions_snapshot_json, answer_key_snapshot_json,
            time_limit_minutes, started_at, deadline_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress');
        `).bind(
          instanceId,
          effectiveUserId,
          examId,
          JSON.stringify(sanitizedSnapshot),
          JSON.stringify(answerKeySnapshot),
          durationMinutes,
          startedAt.toISOString(),
          deadlineAt.toISOString()
        ).run();
      }

      return json({
        success: true,
        session_instance: {
          instance_id: instanceId,
          exam_id: examId,
          user_id: effectiveUserId,
          started_at: startedAt.toISOString(),
          deadline_at: deadlineAt.toISOString(),
          time_limit_minutes: durationMinutes,
          remaining_seconds: durationMinutes * 60,
          questions: sanitizedSnapshot
        }
      });
    }

    // 3. Single attempt submission
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

    const officialExam = (await getExamsD1(platform?.env?.DB)).find(e => e.id === examId);
    const maxScore = isStaff && body.max_score !== undefined
      ? Math.min(100, Math.max(1, Number(body.max_score)))
      : (officialExam?.max_score ? Number(officialExam.max_score) : 10.0);

    let activeSession = null;

    // D1 Session Resolution & Prior Attempt Checks
    if (platform?.env?.DB) {
      await ensureExamSchema(platform.env.DB);

      // ANTI-REPLAY & RETAKE LOCK:
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

      // Session Resolution
      if (body.instance_id) {
        activeSession = await platform.env.DB.prepare(`
          SELECT * FROM exam_sessions WHERE id = ? LIMIT 1;
        `).bind(body.instance_id).first();

        if (!activeSession) {
          return json({
            success: false,
            error: `SessionNotFoundError: Không tìm thấy phiên thi '${body.instance_id}'.`
          }, { status: 404 });
        }
      } else if (!isStaff) {
        activeSession = await platform.env.DB.prepare(`
          SELECT * FROM exam_sessions
          WHERE user_id = ? AND exam_id = ? AND status = 'in_progress'
          ORDER BY started_at DESC LIMIT 1;
        `).bind(effectiveUserId, examId).first();
      }

      if (activeSession) {
        // STRICT OWNERSHIP CHECK
        if (activeSession.user_id !== effectiveUserId && !isStaff) {
          return json({
            success: false,
            error: `ForbiddenSessionAccess: Phiên thi '${activeSession.id}' không thuộc về tài khoản người dùng hiện tại.`
          }, { status: 403 });
        }

        // STRICT EXAM BINDING CHECK
        if (activeSession.exam_id !== examId) {
          return json({
            success: false,
            error: `ExamMismatchError: Phiên thi '${activeSession.id}' thuộc đề '${activeSession.exam_id}', không khớp với đề thi nộp '${examId}'.`
          }, { status: 400 });
        }

        if (activeSession.status === 'submitted') {
          return json({
            success: false,
            error: `DuplicateSubmissionError: Phiên thi này đã được hoàn tất trước đó.`
          }, { status: 409 });
        }
      }
    }

    // P1-03: ELIMINATE DIRECT SUBMISSION FOR STUDENTS (SessionRequiredError)
    // Non-staff students MUST create a session (start_session) prior to submitting
    if (!isStaff && !activeSession) {
      return json({
        success: false,
        error: 'SessionRequiredError: Học sinh bắt buộc phải bắt đầu phiên thi (start_session) trước khi nộp bài. Không cho phép nộp bài trực tiếp không qua phiên thi.'
      }, { status: 400 });
    }

    // P1-04: SERVER-SIDE SCORING FROM AUTHORITATIVE ANSWER KEY SNAPSHOT
    let serverCalculatedScore = 0;
    // Per-question results để client hiển thị review SAU khi nộp (thay cho q.correct_answer client-side)
    const questionResults = [];

    if (activeSession) {
      // Must score strictly against answer_key_snapshot_json frozen in this session record!
      if (!activeSession.answer_key_snapshot_json) {
        return json({
          success: false,
          error: 'MissingAnswerSnapshotError: Không tìm thấy snapshot đáp án của phiên thi, từ chối chấm điểm (fail-closed).'
        }, { status: 500 });
      }

      let answerKeySnapshot = null;
      try {
        answerKeySnapshot = typeof activeSession.answer_key_snapshot_json === 'string'
          ? JSON.parse(activeSession.answer_key_snapshot_json)
          : activeSession.answer_key_snapshot_json;
      } catch (parseErr) {
        return json({
          success: false,
          error: `CorruptAnswerSnapshotError: Snapshot đáp án của phiên thi bị lỗi định dạng (${parseErr.message}) (fail-closed).`
        }, { status: 500 });
      }

      if (!answerKeySnapshot || typeof answerKeySnapshot !== 'object' || Object.keys(answerKeySnapshot).length === 0) {
        return json({
          success: false,
          error: 'EmptyAnswerSnapshotError: Snapshot đáp án của phiên thi rỗng, từ chối chấm điểm (fail-closed).'
        }, { status: 500 });
      }

      const questionKeys = Object.keys(answerKeySnapshot);
      const validQuestionKeys = new Set(questionKeys);

      // Validate submitted answers against snapshot
      const nonQuestionKeys = new Set(['essay', 'transcript', 'notes']);
      for (const [key, val] of Object.entries(userAnswers)) {
        if (nonQuestionKeys.has(key)) continue;
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
      // (questionResults đã khai báo ở trên)
      // Lấy explanation cho review (chỉ trả SAU khi nộp bài)
      let explanationMap = {};
      try {
        const expRows = await platform.env.DB.prepare(
          `SELECT id, explanation FROM question_bank WHERE id IN (${questionKeys.map(() => '?').join(',')})`
        ).bind(...questionKeys).all();
        for (const r of (expRows.results || [])) {
          explanationMap[String(r.id)] = r.explanation || '';
        }
      } catch { /* explanation optional */ }
      for (const key of questionKeys) {
        const expected = answerKeySnapshot[key];
        const given = userAnswers[key];
        const isCorrect = given && String(given).trim().toUpperCase() === String(expected).trim().toUpperCase();
        if (isCorrect) correctCount++;
        questionResults.push({
          question_id: key,
          user_answer: given || '',
          correct_answer: expected || '',
          is_correct: !!isCorrect,
          explanation: explanationMap[key] || ''
        });
      }
      serverCalculatedScore = Number(((correctCount / questionKeys.length) * maxScore).toFixed(1));
    } else if (isStaff && body.score !== undefined) {
      // Custom teacher manual evaluation
      serverCalculatedScore = Math.min(maxScore, Math.max(0, Number(body.score)));
    } else {
      // Legacy / direct attempt scoring from D1 question_bank when no session instance is bound
      const examQuestions = (await getQuestionsD1(platform?.env?.DB)).filter(q => q.exam_id === examId);
      if (examQuestions.length > 0) {
        const validQuestionKeys = new Set(examQuestions.map(q => q.id !== undefined ? String(q.id) : String(q.question_index)));
        const nonQuestionKeys = new Set(['essay', 'transcript', 'notes']);
        for (const [key, val] of Object.entries(userAnswers)) {
          if (nonQuestionKeys.has(key)) continue;
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
          const correctAns = q.correct_answer || q.correct_option_id || q.correct_id || '';
          const isCorrect = givenAnswer && String(givenAnswer).trim().toUpperCase() === String(correctAns).trim().toUpperCase();
          if (isCorrect) correctCount++;
          questionResults.push({
            question_id: qKey,
            user_answer: givenAnswer || '',
            correct_answer: correctAns || '',
            is_correct: !!isCorrect,
            explanation: q.explanation || ''
          });
        }
        serverCalculatedScore = Number(((correctCount / examQuestions.length) * maxScore).toFixed(1));
      } else {
        serverCalculatedScore = 0;
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
      session_id: activeSession ? activeSession.id : (body.session_id || ''),
      class_id: body.class_id || '',
      created_at: new Date().toISOString()
    };

    // P1-03: ATOMIC D1 PERSISTENCE
    if (platform?.env?.DB) {
      if (activeSession) {
        if (typeof platform.env.DB.batch !== 'function') {
          return json({
            success: false,
            error: 'ExamTransactionError: Hệ thống yêu cầu hỗ trợ giao dịch nguyên tử (db.batch) để nộp bài thi.'
          }, { status: 500 });
        }

        // P1-03: ATOMIC MUTUAL EXCLUSION
        // Statement 1: Conditional INSERT attempt strictly requiring session to be 'in_progress' and within deadline.
        // If another concurrent worker already submitted the session, this statement inserts ZERO rows.
        const insertAttemptSql = `
          INSERT INTO exam_attempts (
            id, user_id, user_name, user_email, exam_id, exam_title,
            score, max_score, answers_json, duration_seconds, session_id, class_id
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM exam_sessions 
            WHERE id = ? 
              AND user_id = ? 
              AND exam_id = ? 
              AND status = 'in_progress'
              AND datetime('now') <= datetime(deadline_at, '+60 seconds')
          );
        `;

        // Statement 2: CAS UPDATE session to 'submitted' strictly requiring status = 'in_progress'.
        const updateSessSql = `
          UPDATE exam_sessions
          SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, score = ?
          WHERE id = ? 
            AND user_id = ? 
            AND exam_id = ? 
            AND status = 'in_progress'
            AND datetime('now') <= datetime(deadline_at, '+60 seconds');
        `;

        try {
          const batchRes = await platform.env.DB.batch([
            platform.env.DB.prepare(insertAttemptSql).bind(
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
              saved.class_id,
              activeSession.id,
              effectiveUserId,
              examId
            ),
            platform.env.DB.prepare(updateSessSql).bind(saved.score, activeSession.id, effectiveUserId, examId)
          ]);

          if (!batchRes || batchRes[0]?.meta?.changes === 0 || batchRes[1]?.meta?.changes === 0) {
            return json({
              success: false,
              error: `DuplicateSubmissionError: Phiên thi này đã được hoàn tất trước đó hoặc đã được nộp đồng thời bởi tiến trình khác.`
            }, { status: 409 });
          }
        } catch (batchErr) {
          if (batchErr.message && (batchErr.message.includes('UNIQUE') || batchErr.message.includes('constraint'))) {
            return json({
              success: false,
              error: `DuplicateSubmissionError: Bài làm cho đề thi này đã được tiếp nhận trong một phiên đồng thời. Chống nộp lặp (Unique Concurrency Guard).`
            }, { status: 409 });
          }
          return json({
            success: false,
            error: `DatabasePersistenceError: Không thể lưu kết quả thi vào D1 (${batchErr.message})`
          }, { status: 500 });
        }
      } else {
        // Direct attempt submission without an active session (ONLY permitted for isStaff)
        try {
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
        } catch (insertErr) {
          if (insertErr.message && (insertErr.message.includes('UNIQUE') || insertErr.message.includes('constraint'))) {
            return json({
              success: false,
              error: `DuplicateSubmissionError: Bài làm cho đề thi này đã được tiếp nhận trong một phiên đồng thời. Chống nộp lặp (Unique Concurrency Guard).`
            }, { status: 409 });
          }
          return json({
            success: false,
            error: `DatabasePersistenceError: Không thể lưu kết quả thi vào D1 (${insertErr.message})`
          }, { status: 500 });
        }
      }
    }

    saveExamAttempt(saved);

    return json({
      success: true,
      message: 'Đã chấm điểm và lưu kết quả thi thành công!',
      server_calculated_score: serverCalculatedScore,
      max_score: maxScore,
      // Chi tiết từng câu CHỈ trả sau khi nộp bài (chống lộ đáp án trước giờ thi)
      question_results: questionResults,
      attempt: saved
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

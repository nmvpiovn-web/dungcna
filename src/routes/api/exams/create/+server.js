// POST /api/exams/create — tạo quiz mới + câu hỏi (STAFF ONLY)
// Body: { title, description, grade, duration_minutes, is_published?, questions: [
//   { question_text, question_type: 'multiple_choice'|'essay', options: [..4], correct_option_index, explanation?, hint? }
// ]}
// Lưu vào D1: exams + questions (columns theo migration 0001).
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;

async function ensureQuizSchema(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      curriculum_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      grade INTEGER DEFAULT 0,
      format_type TEXT,
      skill_category TEXT,
      duration_minutes INTEGER NOT NULL,
      total_questions INTEGER DEFAULT 0,
      pass_percentage INTEGER DEFAULT 60,
      created_by TEXT,
      is_published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      skill TEXT,
      type TEXT,
      passage TEXT,
      prompt TEXT NOT NULL,
      audio_url TEXT,
      image_url TEXT,
      options_json TEXT,
      correct_answer TEXT,
      explanation TEXT,
      cambridge_level TEXT,
      rubric_json TEXT
    );
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions (exam_id);
  `).run();
}

const QUESTION_TYPES = new Set(['multiple_choice', 'essay']);
const ALLOWED_GRADES = Array.from({ length: 13 }, (_, i) => i); // 0..12

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ giáo viên hoặc quản trị viên mới được tạo quiz' }, { status: 403 });
  }
  const user = auth.user;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON' }, { status: 400 });
  }

  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const grade = Number(body.grade);
  const duration = Number(body.duration_minutes);
  const questions = Array.isArray(body.questions) ? body.questions : [];

  if (!title) {
    return json({ success: false, error: 'MissingTitle: Thiếu tiêu đề quiz' }, { status: 400 });
  }
  if (!ALLOWED_GRADES.includes(grade)) {
    return json({ success: false, error: 'InvalidGrade: Khối lớp phải từ 0 đến 12' }, { status: 400 });
  }
  if (!Number.isFinite(duration) || duration < 5 || duration > 180) {
    return json({ success: false, error: 'InvalidDuration: Thời lượng phải từ 5 đến 180 phút' }, { status: 400 });
  }
  if (questions.length === 0) {
    return json({ success: false, error: 'EmptyQuestions: Quiz cần ít nhất 1 câu hỏi' }, { status: 400 });
  }
  if (questions.length > 200) {
    return json({ success: false, error: 'TooManyQuestions: Tối đa 200 câu hỏi' }, { status: 400 });
  }

  const normalized = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] || {};
    const qText = String(q.question_text || '').trim();
    const qType = String(q.question_type || 'multiple_choice');
    if (!qText) {
      return json({ success: false, error: `InvalidQuestion[${i}]: Thiếu nội dung câu hỏi` }, { status: 400 });
    }
    if (!QUESTION_TYPES.has(qType)) {
      return json({ success: false, error: `InvalidQuestion[${i}]: Loại câu hỏi không hợp lệ` }, { status: 400 });
    }
    if (qType === 'multiple_choice') {
      const opts = Array.isArray(q.options) ? q.options.map(o => String(o ?? '').trim()) : [];
      if (opts.length !== 4 || opts.some(o => !o)) {
        return json({ success: false, error: `InvalidQuestion[${i}]: Trắc nghiệm cần đủ 4 đáp án` }, { status: 400 });
      }
      let correctIdx = q.correct_option_index;
      if (typeof q.correct_option_id === 'string' && ['A', 'B', 'C', 'D'].includes(q.correct_option_id.toUpperCase())) {
        correctIdx = 'ABCD'.indexOf(q.correct_option_id.toUpperCase());
      }
      correctIdx = Number(correctIdx);
      if (![0, 1, 2, 3].includes(correctIdx)) {
        return json({ success: false, error: `InvalidQuestion[${i}]: Chưa chọn đáp án đúng` }, { status: 400 });
      }
      normalized.push({
        question_text: qText,
        question_type: 'multiple_choice',
        options: opts,
        correct_option_id: 'ABCD'[correctIdx],
        explanation: String(q.explanation || '').trim()
      });
    } else {
      normalized.push({
        question_text: qText,
        question_type: 'essay',
        options: [],
        correct_option_id: '',
        explanation: String(q.hint || q.explanation || '').trim()
      });
    }
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable: Không thể lưu quiz khi thiếu kết nối D1' }, { status: 503 });
  }

  try {
    await ensureQuizSchema(db);

    const stamp = Date.now();
    const rand = () => Math.random().toString(36).substring(2, 8);
    const examId = `exam_${stamp}_${rand()}`;
    const isPublished = body.is_published === false ? 0 : 1;

    const statements = [
      db.prepare(`
        INSERT INTO exams
          (id, title, description, grade, duration_minutes, total_questions, is_published, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).bind(
        examId,
        title,
        description,
        grade,
        duration,
        normalized.length,
        isPublished,
        user.id,
        new Date().toISOString()
      )
    ];

    normalized.forEach((q, idx) => {
      statements.push(
        db.prepare(`
          INSERT INTO questions
            (id, exam_id, question_index, type, prompt, options_json, correct_answer, explanation)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `).bind(
          `q_${stamp}_${rand()}${idx}`,
          examId,
          idx + 1,
          q.question_type,
          q.question_text,
          JSON.stringify(q.options),
          q.correct_option_id,
          q.explanation
        )
      );
    });

    if (typeof db.batch !== 'function') {
      return json({ success: false, error: 'DatabaseError: D1 không hỗ trợ batch trên runtime này' }, { status: 500 });
    }
    await db.batch(statements);

    return json({
      success: true,
      message: `Đã tạo quiz "${title}" với ${normalized.length} câu hỏi.`,
      exam: { id: examId, title, grade, duration_minutes: duration, total_questions: normalized.length, is_published: isPublished }
    });
  } catch (err) {
    console.error('[api/exams/create] D1 error:', err);
    return json({ success: false, error: `DatabaseError: Không thể lưu quiz (${err.message})` }, { status: 500 });
  }
}

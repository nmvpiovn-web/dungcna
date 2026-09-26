import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';

export const prerender = false;

// Exam Matrices: Standardized Exam Blueprints
// Note: Total 40 questions in 50 minutes strictly follows Ministry of Education & Training (MoET) High School Graduation Exam format from 2025 (Decision 764/QD-BGDDT).
// The cognitive level breakdown (14 Nhan biet, 14 Thong hieu, 8 Van dung, 4 Van dung cao) is the internal standardized matrix specification of Tieng Anh Co Dung Academy.
const EXAM_MATRICES = {
  '15m': {
    title: 'Bài Kiểm Tra 15 Phút Nhanh (Quy chuẩn nội bộ Cô Dung)',
    duration_minutes: 15,
    total_questions: 15,
    distribution: {
      'nhan_biet': 6,
      'thong_hieu': 5,
      'van_dung': 4,
      'van_dung_cao': 0
    }
  },
  '45m': {
    title: 'Đề Kiểm Tra 1 Tiết 45 Phút Định Kỳ (Quy chuẩn nội bộ Cô Dung)',
    duration_minutes: 45,
    total_questions: 30,
    distribution: {
      'nhan_biet': 12,
      'thong_hieu': 9,
      'van_dung': 6,
      'van_dung_cao': 3
    }
  },
  'thpt_qg': {
    title: 'Đề Thi Thử Tốt Nghiệp THPT (Chuẩn Bộ GD&ĐT 2025: 40 câu - 50 phút; Ma trận nội bộ 14/14/8/4)',
    duration_minutes: 50,
    total_questions: 40,
    distribution: {
      'nhan_biet': 14,
      'thong_hieu': 14,
      'van_dung': 8,
      'van_dung_cao': 4
    }
  }
};

/**
 * POST /api/exams/random (action: 'create')
 * Strictly requires POST to prevent accidental generation via GET.
 * Enforces exact grade, atomic snapshot batch, and fail-closed error handling.
 */
async function handleCreateExam({ body, platform, auth }) {
  if (!platform?.env?.DB) {
    return json({
      success: false,
      error: 'DatabaseUnavailable: Cloudflare D1 database không khả dụng.'
    }, { status: 500 });
  }

  const db = platform.env.DB;
  const examType = body.exam_type || body.type || 'thpt_qg';
  const grade = body.grade || (examType === 'thpt_qg' ? 'lop_12' : 'lop_7');

  if (!grade || grade === 'all') {
    return json({
      success: false,
      error: 'InvalidGrade: Tạo đề thi bắt buộc phải chỉ định khối lớp cụ thể (VD: lop_7, lop_9, lop_12).'
    }, { status: 400 });
  }

  const matrix = EXAM_MATRICES[examType];
  if (!matrix) {
    return json({ success: false, error: `Loại đề thi không hợp lệ: '${examType}'` }, { status: 400 });
  }

  const instanceId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const title = `${matrix.title} - Mã Đề ${Math.floor(100 + Math.random() * 900)}`;
  const candidateIds = [];

  // Two-stage sampling per cognitive level with STRICT quota check
  for (const [cogLevel, requiredCount] of Object.entries(matrix.distribution)) {
    if (requiredCount <= 0) continue;

    // Strict query: exact grade_level match, published questions only
    const query = `
      SELECT id FROM question_bank 
      WHERE status = 'published' AND grade_level = ? AND cognitive_level = ?
      ORDER BY RANDOM() LIMIT ?;
    `;
    const res = await db.prepare(query).bind(grade, cogLevel, requiredCount).all();
    const rows = res.results || [];

    // STRICT CHECK: Reject with exact shortage count if bank lacks questions
    if (rows.length < requiredCount) {
      return json({
        success: false,
        error: `Ngân hàng câu hỏi không đủ số lượng cho mức nhận thức '${cogLevel}'. Khối '${grade}' yêu cầu ${requiredCount} câu, hiện chỉ có ${rows.length} câu đã duyệt.`
      }, { status: 400 });
    }

    rows.forEach(r => candidateIds.push(r.id));
  }

  // Fetch full questions by candidate IDs
  const placeholders = candidateIds.map(() => '?').join(',');
  const fullRes = await db.prepare(`
    SELECT * FROM question_bank WHERE id IN (${placeholders});
  `).bind(...candidateIds).all();

  const selectedQuestions = fullRes.results || [];
  if (selectedQuestions.length !== matrix.total_questions) {
    return json({
      success: false,
      error: `Lỗi tổng hợp câu hỏi: Yêu cầu ${matrix.total_questions} câu nhưng chỉ nạp được ${selectedQuestions.length} câu.`
    }, { status: 500 });
  }

  // Shuffle question presentation order
  selectedQuestions.sort(() => Math.random() - 0.5);

  // ATOMIC SNAPSHOT BATCH (Fail-Closed)
  try {
    const insertInstanceStmt = db.prepare(`
      INSERT INTO exam_instances (id, exam_type, grade_level, title, total_questions, duration_minutes, created_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', CURRENT_TIMESTAMP);
    `).bind(instanceId, examType, grade, title, selectedQuestions.length, matrix.duration_minutes, auth.user.id);

    const insertItemStmt = db.prepare(`
      INSERT INTO exam_instance_items 
      (instance_id, item_order, question_id, question_text, options_json, correct_option_id, explanation, reading_passage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const batchStatements = [insertInstanceStmt];
    selectedQuestions.forEach((q, idx) => {
      batchStatements.push(
        insertItemStmt.bind(
          instanceId,
          idx + 1,
          q.id,
          q.question_text,
          q.options_json,
          q.correct_option_id,
          q.explanation || '',
          q.reading_passage || null
        )
      );
    });

    const batchRes = await db.batch(batchStatements);
    if (!batchRes || batchRes.length === 0) {
      throw new Error('D1 batch execution returned empty response');
    }
  } catch (snapshotErr) {
    console.error('Critical failure saving exam snapshot to D1:', snapshotErr);
    // Strict Fail-Closed: DO NOT return exam if snapshot write fails
    return json({
      success: false,
      error: `SnapshotWriteFailed: Không thể lưu bản chụp đề thi vào D1 (${snapshotErr.message}). Quá trình tạo đề đã bị hủy.`
    }, { status: 500 });
  }

  // Build client payload: STRICTLY OMIT correct_option_id and explanation!
  const clientItems = selectedQuestions.map((q, idx) => {
    let options = [];
    try {
      options = typeof q.options_json === 'string' ? JSON.parse(q.options_json) : (q.options_json || []);
    } catch {
      options = [];
    }

    return {
      item_order: idx + 1,
      question_id: q.id,
      question_text: q.question_text,
      options: options,
      reading_passage: q.reading_passage || null
    };
  });

  return json({
    success: true,
    instance_id: instanceId,
    exam_type: examType,
    grade_level: grade,
    title: title,
    total_questions: clientItems.length,
    duration_minutes: matrix.duration_minutes,
    items: clientItems
  });
}

/**
 * POST /api/exams/random (action: 'submit')
 * Strictly enforces:
 *  1. Ownership: ONLY instance.created_by can submit their own test
 *  2. Anti-empty: Rejects empty submission payloads
 *  3. Time deadline check: Rejects submissions after duration + 5m buffer
 *  4. Atomic conditional update: Prevents race conditions and double submission
 *  5. Full answers persistence in answers_json
 */
async function handleSubmitExam({ body, platform, auth }) {
  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  }

  const db = platform.env.DB;
  const { instance_id, answers = {}, duration_seconds = 0 } = body;

  if (!instance_id) {
    return json({ success: false, error: 'Thiếu instance_id đề thi cần chấm điểm' }, { status: 400 });
  }

  // 1. Rejection of empty submissions (Anti-Cheat)
  if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
    return json({
      success: false,
      error: 'EmptySubmission: Bài làm trống. Vui lòng hoàn thành câu trả lời trước khi nộp bài.'
    }, { status: 400 });
  }

  // Filter valid non-empty answers
  const answeredKeys = Object.keys(answers).filter(k => String(answers[k] || '').trim() !== '');
  if (answeredKeys.length === 0) {
    return json({
      success: false,
      error: 'EmptySubmission: Không có câu trả lời hợp lệ nào được chọn.'
    }, { status: 400 });
  }

  // 2. Fetch exam instance to verify ownership and initial state
  const instanceRes = await db.prepare(`
    SELECT * FROM exam_instances WHERE id = ? LIMIT 1;
  `).bind(instance_id).all();

  const instance = instanceRes.results?.[0];
  if (!instance) {
    return json({ success: false, error: 'Không tìm thấy thông tin lượt thi (Instance not found)' }, { status: 404 });
  }

  // 3. Strict Ownership Check: Only creator can submit their own exam!
  if (instance.created_by !== auth.user.id) {
    return json({
      success: false,
      error: 'Forbidden: Bạn không phải chủ sở hữu của lượt thi này. Không được phép nộp thay.'
    }, { status: 403 });
  }

  // 4. Repeat Submission Check: Return existing graded result idempotently
  if (instance.status === 'completed') {
    if (instance.answers_json) {
      const itemsRes = await db.prepare(`
        SELECT * FROM exam_instance_items 
        WHERE instance_id = ? 
        ORDER BY item_order ASC;
      `).bind(instance_id).all();
      const items = itemsRes.results || [];
      let savedAnswers = {};
      try {
        savedAnswers = JSON.parse(instance.answers_json || '{}');
      } catch {
        savedAnswers = {};
      }
      let correctCount = 0;
      const detailedResults = items.map(item => {
        const studentAns = savedAnswers[String(item.item_order)] || savedAnswers[item.question_id] || '';
        const isCorrect = studentAns === item.correct_option_id;
        if (isCorrect) correctCount++;
        return {
          item_order: item.item_order,
          question_id: item.question_id,
          question_text: item.question_text,
          student_answer: studentAns,
          correct_option: item.correct_option_id,
          is_correct: isCorrect,
          explanation: item.explanation
        };
      });
      return json({
        success: true,
        already_submitted: true,
        message: 'Lượt thi này đã được nộp trước đó. Trả về kết quả đã lưu trữ.',
        instance_id: instance.id,
        score: instance.score,
        correct_count: correctCount,
        total_questions: instance.total_questions,
        percentage: Math.round((correctCount / instance.total_questions) * 100),
        detailed_results: detailedResults
      });
    }

    return json({
      success: false,
      error: 'Bài thi này đã được nộp và chấm điểm trước đó. Không được nộp lặp lại.'
    }, { status: 400 });
  }

  // 5. Server Deadline / Timeout Check
  const createdAtMs = new Date(instance.created_at).getTime();
  const maxAllowedDurationMs = (instance.duration_minutes * 60 + 300) * 1000; // duration + 5 mins buffer
  const elapsedMs = Date.now() - createdAtMs;

  if (elapsedMs > maxAllowedDurationMs) {
    return json({
      success: false,
      error: `ExamExpired: Đề thi đã quá thời hạn nộp bài cho phép (Thời gian làm: ${instance.duration_minutes} phút).`
    }, { status: 400 });
  }

  // 6. Fetch snapshot items to grade
  const itemsRes = await db.prepare(`
    SELECT * FROM exam_instance_items 
    WHERE instance_id = ? 
    ORDER BY item_order ASC;
  `).bind(instance_id).all();

  const items = itemsRes.results || [];
  if (items.length === 0) {
    return json({ success: false, error: 'Snapshot items không tồn tại' }, { status: 500 });
  }

  // 7. Grade answers against server snapshot
  let correctCount = 0;
  const detailedResults = [];

  for (const item of items) {
    const studentAns = (answers[item.item_order] || answers[String(item.item_order)] || '').trim().toUpperCase();
    const isCorrect = studentAns === item.correct_option_id.trim().toUpperCase();
    if (isCorrect) correctCount++;

    let parsedOptions = [];
    try { parsedOptions = JSON.parse(item.options_json); } catch {}

    detailedResults.push({
      item_order: item.item_order,
      question_id: item.question_id,
      question_text: item.question_text,
      options: parsedOptions,
      student_answer: studentAns,
      correct_option_id: item.correct_option_id,
      is_correct: isCorrect,
      explanation: item.explanation
    });
  }

  const totalQuestions = items.length;
  const score = Number(((correctCount / totalQuestions) * 10).toFixed(2));
  const percentage = Math.round((correctCount / totalQuestions) * 100);

  // 8. ATOMIC CONDITIONAL UPDATE: Prevents concurrent submission race condition
  const updateRes = await db.prepare(`
    UPDATE exam_instances 
    SET status = 'completed', score = ?, answers_json = ?, submitted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND created_by = ? AND status = 'in_progress';
  `).bind(score, JSON.stringify(answers), instance_id, auth.user.id).run();

  // If 0 changes occurred, another concurrent request already updated it!
  if (!updateRes || updateRes.meta?.changes !== 1) {
    return json({
      success: false,
      error: 'Bài thi này đã được nộp đồng thời bởi một phiên khác.'
    }, { status: 409 });
  }

  return json({
    success: true,
    instance_id,
    student_id: auth.user.id,
    student_name: auth.user.name || auth.user.username,
    total_questions: totalQuestions,
    correct_count: correctCount,
    wrong_count: totalQuestions - correctCount,
    score: score,
    max_score: 10,
    percentage: percentage,
    duration_seconds: duration_seconds,
    submitted_at: new Date().toISOString(),
    detailed_results: detailedResults
  });
}

// GET is strictly prohibited for creation to prevent accidental generation
export async function GET() {
  return json({
    success: false,
    error: 'MethodNotAllowed: Tạo đề thi hoặc nộp bài bắt buộc sử dụng phương thức POST kèm Bearer token.'
  }, { status: 405 });
}

// Main POST handler with action routing
export async function POST(event) {
  const { request, url, platform } = event;
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' }, { status: auth.status || 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = url.searchParams.get('action') || body.action || 'submit';

  if (action === 'create') {
    return handleCreateExam({ body, platform, auth });
  }

  return handleSubmitExam({ body, platform, auth });
}

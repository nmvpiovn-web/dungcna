import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';

export const prerender = false;

// Exam Matrices with verified references
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
    title: 'Đề Thi Thử Tốt Nghiệp THPT (Quy định Bộ GD&ĐT 2025: 40 câu - 50 phút)',
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
 * Handle Exam Generation (Strict Fail-Closed, Ownership & Matrix Validation)
 */
async function handleGenerateExam({ request, url, platform, auth }) {
  if (!platform?.env?.DB) {
    return json({
      success: false,
      error: 'DatabaseUnavailable: Cloudflare D1 database không khả dụng.'
    }, { status: 500 });
  }

  const db = platform.env.DB;
  const examType = url.searchParams.get('type') || 'thpt_qg';
  const gradeParam = url.searchParams.get('grade') || (examType === 'thpt_qg' ? 'lop_12' : 'lop_7');
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

    let query = `
      SELECT id FROM question_bank 
      WHERE status = 'published' AND cognitive_level = ?
    `;
    const params = [cogLevel];

    if (gradeParam !== 'all') {
      query += ` AND (grade_level = ? OR curriculum_id LIKE ?)`;
      params.push(gradeParam, `%${gradeParam}%`);
    }

    query += ` ORDER BY RANDOM() LIMIT ?;`;
    params.push(requiredCount);

    const res = await db.prepare(query).bind(...params).all();
    const rows = res.results || [];

    // STRICT CHECK: Do NOT silently backfill or alter matrix
    if (rows.length < requiredCount) {
      return json({
        success: false,
        error: `Ngân hàng câu hỏi không đủ số lượng cho mức nhận thức '${cogLevel}'. Yêu cầu ${requiredCount} câu, hiện chỉ có ${rows.length} câu khả dụng cho khối '${gradeParam}'.`
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

  // Shuffle order of questions
  selectedQuestions.sort(() => Math.random() - 0.5);

  // ATOMIC SNAPSHOT BATCH (Fail-Closed)
  try {
    const insertInstanceStmt = db.prepare(`
      INSERT INTO exam_instances (id, exam_type, grade_level, title, total_questions, duration_minutes, created_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', CURRENT_TIMESTAMP);
    `).bind(instanceId, examType, gradeParam, title, selectedQuestions.length, matrix.duration_minutes, auth.user.id);

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
      throw new Error('D1 batch execution returned empty result');
    }
  } catch (snapshotErr) {
    console.error('Critical failure saving exam snapshot to D1:', snapshotErr);
    // Strict Fail-Closed: DO NOT return exam if snapshot fails
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
    grade_level: gradeParam,
    title: title,
    total_questions: clientItems.length,
    duration_minutes: matrix.duration_minutes,
    items: clientItems
  });
}

/**
 * Handle Exam Submission & Server-side Grading
 */
async function handleSubmitExam({ request, platform, auth }) {
  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });
  }

  const db = platform.env.DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { instance_id, answers = {}, duration_seconds = 0 } = body;
  if (!instance_id) {
    return json({ success: false, error: 'Thiếu instance_id đề thi cần chấm điểm' }, { status: 400 });
  }

  // 1. Fetch exam instance to verify ownership and status
  const instanceRes = await db.prepare(`
    SELECT * FROM exam_instances WHERE id = ? LIMIT 1;
  `).bind(instance_id).all();

  const instance = instanceRes.results?.[0];
  if (!instance) {
    return json({ success: false, error: 'Không tìm thấy thông tin lượt thi (Instance not found)' }, { status: 404 });
  }

  // 2. Ownership verification: Only creator or staff (teacher/admin) can submit
  const isOwner = instance.created_by === auth.user.id;
  const isStaff = auth.user.role === 'teacher' || auth.user.role === 'admin' || auth.user.role === 'superadmin';
  if (!isOwner && !isStaff) {
    return json({ success: false, error: 'Forbidden: Bạn không có quyền nộp bài cho lượt thi của người khác.' }, { status: 403 });
  }

  // 3. Repeat submission prevention
  if (instance.status === 'completed') {
    return json({
      success: false,
      error: 'Bài thi này đã được nộp và chấm điểm trước đó. Không được nộp lặp lại.'
    }, { status: 400 });
  }

  // 4. Fetch snapshot items
  const itemsRes = await db.prepare(`
    SELECT * FROM exam_instance_items 
    WHERE instance_id = ? 
    ORDER BY item_order ASC;
  `).bind(instance_id).all();

  const items = itemsRes.results || [];
  if (items.length === 0) {
    return json({ success: false, error: 'Snapshot items không tồn tại' }, { status: 500 });
  }

  // 5. Grade submission
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

  // 6. Update exam instance status to completed
  await db.prepare(`
    UPDATE exam_instances 
    SET status = 'completed', score = ?, submitted_at = CURRENT_TIMESTAMP
    WHERE id = ?;
  `).bind(score, instance_id).run();

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

export async function GET(event) {
  const { request, platform } = event;
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' }, { status: auth.status || 401 });
  }

  return handleGenerateExam({ ...event, auth });
}

export async function POST(event) {
  const { request, url, platform } = event;
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập.' }, { status: auth.status || 401 });
  }

  const action = url.searchParams.get('action') || 'submit';
  if (action === 'create') {
    return handleGenerateExam({ ...event, auth });
  }

  return handleSubmitExam({ ...event, auth });
}

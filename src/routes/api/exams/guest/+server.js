import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

export const prerender = false;

// Persistent storage across multi-worker isolates and module instances
// 1. Shared global store for single-process / multi-module instances in Node/test
if (!globalThis.__GUEST_EXAM_SESSIONS__) {
  globalThis.__GUEST_EXAM_SESSIONS__ = new Map();
}
const GUEST_SESSIONS = globalThis.__GUEST_EXAM_SESSIONS__;

// Helper to ensure D1 table exists for true multi-worker Cloudflare persistence
async function ensureD1SessionTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS guest_exam_sessions (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        grade TEXT NOT NULL,
        candidate_name TEXT,
        duration_minutes INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        questions_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_progress',
        answers_json TEXT,
        result_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();
  } catch (err) {
    console.warn('Could not create guest_exam_sessions table:', err);
  }
}

async function saveGuestSession(db, session) {
  GUEST_SESSIONS.set(session.id, session);
  if (db) {
    await ensureD1SessionTable(db);
    try {
      await db.prepare(`
        INSERT OR REPLACE INTO guest_exam_sessions 
        (id, token, grade, candidate_name, duration_minutes, start_time, expires_at, questions_json, status, answers_json, result_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).bind(
        session.id,
        session.token,
        session.grade,
        session.candidate_name || '',
        session.duration_minutes,
        session.startTime,
        session.expiresAt,
        JSON.stringify(session.questions),
        session.status,
        session.answers ? JSON.stringify(session.answers) : null,
        session.result ? JSON.stringify(session.result) : null
      ).run();
    } catch (e) {
      console.warn('Error saving session to D1:', e);
    }
  }
}

async function getGuestSession(db, sessionId) {
  let session = GUEST_SESSIONS.get(sessionId);
  if (session) return session;

  if (db) {
    await ensureD1SessionTable(db);
    try {
      const row = await db.prepare('SELECT * FROM guest_exam_sessions WHERE id = ?').bind(sessionId).first();
      if (row) {
        session = {
          id: row.id,
          token: row.token,
          grade: row.grade,
          candidate_name: row.candidate_name,
          duration_minutes: row.duration_minutes,
          startTime: row.start_time,
          expiresAt: row.expires_at,
          questions: JSON.parse(row.questions_json),
          status: row.status,
          answers: row.answers_json ? JSON.parse(row.answers_json) : null,
          result: row.result_json ? JSON.parse(row.result_json) : null
        };
        GUEST_SESSIONS.set(sessionId, session);
        return session;
      }
    } catch (e) {
      console.warn('Error querying session from D1:', e);
    }
  }
  return null;
}

async function completeGuestSession(db, sessionId, answers, result) {
  const session = GUEST_SESSIONS.get(sessionId);
  if (session) {
    session.status = 'completed';
    session.answers = answers;
    session.result = result;
  }
  if (db) {
    try {
      const res = await db.prepare(`
        UPDATE guest_exam_sessions 
        SET status = 'completed', answers_json = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'in_progress';
      `).bind(JSON.stringify(answers), JSON.stringify(result), sessionId).run();
      return res?.meta?.changes ?? 1;
    } catch (e) {
      console.warn('Error updating session in D1:', e);
    }
  }
  return 1;
}

// Supported Curated Grade & Duration Matrix
// Strictly declare what is verified. ZERO cloning, ZERO fake looping.
const SUPPORTED_GRADES = {
  lop_7: 'Lớp 7 (Nền Tảng THCS)',
  lop_12: 'Lớp 12 (Thi THPT QG / IELTS)'
};

const SUPPORTED_CONFIGS = {
  lop_7: {
    '5m': 5,
    '15m': 10
  },
  lop_12: {
    '5m': 5
  }
};

// Verified Question Banks with 100% Unique, Non-Duplicated Questions
const GUEST_QUESTION_BANK = {
  lop_7: [
    {
      id: 'gst_q_mcq_1',
      type: 'mcq',
      skill: 'grammar',
      question_text: 'She _____ English every day because she wants to study abroad.',
      options: [
        { id: 'A', text: 'practices' },
        { id: 'B', text: 'practice' },
        { id: 'C', text: 'practiced' },
        { id: 'D', text: 'practicing' }
      ],
      correct_id: 'A',
      explanation: 'Thì hiện tại đơn diễn tả thói quen lặp lại hàng ngày (every day) với chủ ngữ số ít She -> practices.'
    },
    {
      id: 'gst_q_audio_2',
      type: 'listening',
      skill: 'listening',
      question_text: 'Nghe đoạn phát âm và chọn từ có trọng âm rơi vào âm tiết thứ hai:',
      audio_term: 'pollute',
      options: [
        { id: 'A', text: 'energy (/ˈenədʒi/)' },
        { id: 'B', text: 'pollute (/pəˈluːt/)' },
        { id: 'C', text: 'solar (/ˈsəʊlə(r)/)' },
        { id: 'D', text: 'source (/sɔːs/)' }
      ],
      correct_id: 'B',
      explanation: 'Pollute có trọng âm rơi vào âm tiết thứ hai (/pəˈluːt/), các từ còn lại rơi vào âm tiết thứ nhất.'
    },
    {
      id: 'gst_q_cloze_3',
      type: 'open_cloze',
      skill: 'reading_cloze',
      passage: 'Solar energy is renewable, clean and abundant. It does not cause (1)_____ to the environment like coal or oil.',
      question_text: 'Tự luận điền từ: Nhập danh từ thích hợp vào chỗ trống (1):',
      correct_text: 'pollution',
      acceptable_answers: ['pollution', 'pollutions'],
      explanation: 'Sau động từ cause cần một danh từ không đếm được chỉ tác hại ô nhiễm -> pollution.'
    },
    {
      id: 'gst_q_mcq_4',
      type: 'mcq',
      skill: 'vocabulary',
      question_text: 'My sister really enjoys _____ origami paper flowers in her free time.',
      options: [
        { id: 'A', text: 'making' },
        { id: 'B', text: 'to make' },
        { id: 'C', text: 'make' },
        { id: 'D', text: 'made' }
      ],
      correct_id: 'A',
      explanation: 'Cấu trúc enjoy + V-ing -> enjoys making.'
    },
    {
      id: 'gst_q_cloze_5',
      type: 'open_cloze',
      skill: 'reading_cloze',
      passage: 'Dao Son Tay school in Thu Duc has modern facilities and an active English club for students who (2)_____ to improve speaking.',
      question_text: 'Tự luận điền từ: Nhập động từ nguyên thể thích hợp vào chỗ trống (2):',
      correct_text: 'wish',
      acceptable_answers: ['wish', 'want', 'hope'],
      explanation: 'Mệnh đề quan hệ bổ nghĩa cho students (danh từ số nhiều) -> wish / want / hope.'
    },
    {
      id: 'gst_q_mcq_6',
      type: 'mcq',
      skill: 'grammar',
      question_text: 'If it _____ tomorrow, we will plant trees in the school garden.',
      options: [
        { id: 'A', text: 'does not rain' },
        { id: 'B', text: 'will not rain' },
        { id: 'C', text: 'did not rain' },
        { id: 'D', text: 'not rain' }
      ],
      correct_id: 'A',
      explanation: 'Câu điều kiện loại 1: Mệnh đề If dùng hiện tại đơn (does not rain).'
    },
    {
      id: 'gst_q_cloze_7',
      type: 'open_cloze',
      skill: 'grammar',
      passage: 'We should use public transport instead (3)_____ personal cars to reduce traffic congestion.',
      question_text: 'Tự luận điền từ: Nhập giới từ thích hợp vào chỗ trống (3):',
      correct_text: 'of',
      acceptable_answers: ['of'],
      explanation: 'Cụm giới từ cố định: instead of (thay vì).'
    },
    {
      id: 'gst_q_audio_8',
      type: 'listening',
      skill: 'listening',
      question_text: 'Nghe và xác định từ phát âm có phụ âm cuối /t/ (âm đuôi):',
      audio_term: 'planted',
      options: [
        { id: 'A', text: 'played (/d/)' },
        { id: 'B', text: 'watched (/t/)' },
        { id: 'C', text: 'waited (/ɪd/)' },
        { id: 'D', text: 'cleaned (/d/)' }
      ],
      correct_id: 'B',
      explanation: 'Từ watched kết thúc bằng phụ âm vô thanh /tʃ/ nên -ed phát âm là /t/.'
    },
    {
      id: 'gst_q_mcq_9',
      type: 'mcq',
      skill: 'vocabulary',
      question_text: 'Volunteering gives teenagers a sense of _____ responsibility.',
      options: [
        { id: 'A', text: 'community' },
        { id: 'B', text: 'communicate' },
        { id: 'C', text: 'communication' },
        { id: 'D', text: 'communicative' }
      ],
      correct_id: 'A',
      explanation: 'Cụm danh từ: community responsibility (trách nhiệm cộng đồng).'
    },
    {
      id: 'gst_q_cloze_10',
      type: 'open_cloze',
      skill: 'vocabulary',
      passage: 'Eating too much fast food and sugary drinks is very harmful (4)_____ your health.',
      question_text: 'Tự luận điền từ: Nhập giới từ thích hợp vào chỗ trống (4):',
      correct_text: 'to',
      acceptable_answers: ['to', 'for'],
      explanation: 'Tính từ harmful đi với giới từ to (hoặc for): harmful to health.'
    }
  ],
  lop_12: [
    {
      id: 'gst_q_12_1',
      type: 'mcq',
      skill: 'grammar',
      question_text: 'Had the government invested more in clean energy, greenhouse emissions _____ substantially.',
      options: [
        { id: 'A', text: 'would have decreased' },
        { id: 'B', text: 'will decrease' },
        { id: 'C', text: 'would decrease' },
        { id: 'D', text: 'decreased' }
      ],
      correct_id: 'A',
      explanation: 'Đảo ngữ câu điều kiện loại 3: Had + S + PII, S + would have + PII.'
    },
    {
      id: 'gst_q_12_2',
      type: 'open_cloze',
      skill: 'reading_cloze',
      passage: 'The transition towards carbon neutrality requires not only technological breakthroughs but also concerted (1)_____ from all international stakeholders.',
      question_text: 'Tự luận điền từ: Nhập danh từ số nhiều phù hợp đi kèm tính từ "concerted":',
      correct_text: 'efforts',
      acceptable_answers: ['efforts', 'actions'],
      explanation: 'Collocation học thuật: concerted efforts (những nỗ lực đồng bộ).'
    },
    {
      id: 'gst_q_12_3',
      type: 'mcq',
      skill: 'vocabulary',
      question_text: 'The newly appointed CEO is expected to _____ crucial changes in corporate governance.',
      options: [
        { id: 'A', text: 'bring about' },
        { id: 'B', text: 'bring up' },
        { id: 'C', text: 'bring round' },
        { id: 'D', text: 'bring off' }
      ],
      correct_id: 'A',
      explanation: 'Phrasal verb: bring about (gây ra, mang lại sự thay đổi).'
    },
    {
      id: 'gst_q_12_4',
      type: 'open_cloze',
      skill: 'grammar',
      passage: 'Hardly had the keynote speaker commenced his presentation (2)_____ the electricity supply was abruptly interrupted.',
      question_text: 'Tự luận điền từ: Nhập liên từ thích hợp đi cặp với "Hardly had...":',
      correct_text: 'when',
      acceptable_answers: ['when', 'before'],
      explanation: 'Cấu trúc đảo ngữ: Hardly had + S + V3/ed + when + S + V2/ed.'
    },
    {
      id: 'gst_q_12_5',
      type: 'mcq',
      skill: 'reading_cloze',
      question_text: 'Artificial Intelligence has become an indispensable tool, _____ revolutionized various academic sectors.',
      options: [
        { id: 'A', text: 'having' },
        { id: 'B', text: 'have' },
        { id: 'C', text: 'which' },
        { id: 'D', text: 'has' }
      ],
      correct_id: 'A',
      explanation: 'Rút gọn mệnh đề phân từ hoàn thành chỉ nguyên nhân/kết quả: having revolutionized.'
    }
  ]
};

// Automatic cleanup of expired guest sessions
async function pruneExpiredSessions(db) {
  const now = Date.now();
  for (const [id, s] of GUEST_SESSIONS.entries()) {
    if (now > s.expiresAt) {
      GUEST_SESSIONS.delete(id);
    }
  }
  if (db) {
    try {
      await db.prepare('DELETE FROM guest_exam_sessions WHERE expires_at < ?').bind(now).run();
    } catch {}
  }
}

export async function POST({ request, platform }) {
  await pruneExpiredSessions(platform?.env?.DB);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu định dạng JSON.' }, { status: 400 });
  }

  const action = body.action || 'start';

  // 1. ACTION: START GUEST TEST SESSION
  if (action === 'start') {
    const { grade = 'lop_7', duration_type = '5m', guest_role = 'student', candidate_name = 'Khách Trải Nghiệm' } = body;

    // Strict validation of grade
    if (!SUPPORTED_GRADES[grade]) {
      return json({
        success: false,
        error: `Khối lớp "${grade}" chưa được hỗ trợ đề thi thử chuẩn hóa. Hiện hệ thống đã phát hành đề cho: Lớp 7 (THCS) và Lớp 12 (THPT). Các khối khác đang trong lộ trình thẩm định chuyên môn.`,
        supported_grades: SUPPORTED_GRADES
      }, { status: 400 });
    }

    // Strict validation of duration for this grade - ZERO question looping or cloning!
    const availableDurations = SUPPORTED_CONFIGS[grade];
    const targetQuestionCount = availableDurations ? availableDurations[duration_type] : null;

    if (!targetQuestionCount) {
      return json({
        success: false,
        error: `Khối lớp ${SUPPORTED_GRADES[grade]} hiện hỗ trợ các mốc thời lượng: ${Object.keys(availableDurations || {}).join(', ')}. Mốc "${duration_type}" chưa có đủ ngân hàng câu hỏi độc lập được phê duyệt.`
      }, { status: 400 });
    }

    const durationMinutes = duration_type === '15m' ? 15 : 5;
    const guestSessionId = `gst_${Date.now()}_${randomUUID().substring(0, 8)}`;
    const guestToken = `gtok_${randomUUID()}`;
    const startTime = Date.now();
    const expiresAt = startTime + (durationMinutes + 10) * 60 * 1000; // duration + 10m buffer

    // Select exact non-repeating unique questions
    const questionPool = GUEST_QUESTION_BANK[grade];
    const selectedQuestions = questionPool.slice(0, targetQuestionCount);

    // Save server-side session (strictly storing answers and token on server only!)
    const sessionRecord = {
      id: guestSessionId,
      token: guestToken,
      grade,
      guest_role,
      candidate_name,
      duration_minutes: durationMinutes,
      startTime,
      expiresAt,
      questions: selectedQuestions,
      status: 'in_progress',
      answers: null,
      score: null
    };

    await saveGuestSession(platform?.env?.DB, sessionRecord);

    // Build client payload: STRICTLY OMIT correct_id, correct_text, and explanation!
    const clientQuestions = selectedQuestions.map((q, idx) => ({
      item_order: idx + 1,
      id: q.id,
      type: q.type, // 'mcq' | 'listening' | 'open_cloze'
      skill: q.skill,
      question_text: q.question_text,
      passage: q.passage || null,
      audio_term: q.audio_term || null,
      // Open cloze does NOT have options! MCQ and listening have options.
      options: q.type === 'open_cloze' ? null : q.options
    }));

    return json({
      success: true,
      guest_session_id: guestSessionId,
      guest_token: guestToken,
      grade,
      candidate_name,
      duration_minutes: durationMinutes,
      total_questions: clientQuestions.length,
      expires_at: expiresAt,
      questions: clientQuestions
    });
  }

  // 2. ACTION: SUBMIT GUEST TEST
  if (action === 'submit') {
    const { guest_session_id, guest_token, answers = {}, duration_seconds = 0 } = body;
    if (!guest_session_id) {
      return json({ success: false, error: 'Thiếu guest_session_id lượt thi.' }, { status: 400 });
    }

    const session = await getGuestSession(platform?.env?.DB, guest_session_id);
    if (!session) {
      return json({ success: false, error: 'Phiên thi thử không tồn tại hoặc đã hết hạn (2h TTL).' }, { status: 404 });
    }

    // MANDATORY TOKEN AUTHENTICATION (Strict matching, never bypass if token missing)
    if (!guest_token || !session.token || session.token !== guest_token) {
      return json({ success: false, error: 'Unauthorized: Thiếu hoặc sai mã xác thực guest_token của phiên thi.' }, { status: 401 });
    }

    // Deadline check (Reject submissions after expiry)
    if (Date.now() > session.expiresAt) {
      return json({ success: false, error: 'Hết giờ làm bài: Bài thi đã quá thời gian quy định.' }, { status: 403 });
    }

    // 1. Check if answers is a plain non-array object
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return json({
        success: false,
        error: 'SchemaError: answers phải là một JSON object với format { question_id: answer_string }.'
      }, { status: 400 });
    }

    const sessionQuestionMap = new Map(session.questions.map(q => [q.id, q]));
    const submittedKeys = Object.keys(answers);

    if (submittedKeys.length === 0) {
      return json({
        success: false,
        error: 'Bài nộp không hợp lệ: Thí sinh chưa làm bất kỳ câu hỏi nào. Vui lòng hoàn thành ít nhất một câu trước khi nộp bài.'
      }, { status: 400 });
    }

    // 2. Validate every key and value type: strict checking on foreign keys & non-string values
    for (const qId of submittedKeys) {
      if (!sessionQuestionMap.has(qId)) {
        return json({
          success: false,
          error: `SchemaError: Mã câu hỏi '${qId}' không thuộc đề thi của phiên này.`
        }, { status: 400 });
      }

      const val = answers[qId];
      if (val === null || val === undefined || typeof val !== 'string') {
        const valType = Array.isArray(val) ? 'array' : (val === null ? 'null' : typeof val);
        return json({
          success: false,
          error: `SchemaError: Giá trị câu trả lời cho câu '${qId}' không hợp lệ (phải là chuỗi ký tự string, nhận được kiểu ${valType}).`
        }, { status: 400 });
      }
    }

    // 3. Ensure at least one non-empty string answer
    const nonEmptyEntries = submittedKeys.filter(k => answers[k].trim() !== '');
    if (nonEmptyEntries.length === 0) {
      return json({
        success: false,
        error: 'Bài nộp không hợp lệ: Không tìm thấy câu trả lời nào có nội dung hợp lệ.'
      }, { status: 400 });
    }

    // Idempotent check
    if (session.status === 'completed' && session.result) {
      return json({ success: true, message: 'Đã nộp bài trước đó.', result: session.result });
    }

    // Server-side scoring (evaluates both MCQ choices and Open Cloze text entries)
    let correctCount = 0;
    const itemFeedback = [];

    session.questions.forEach((q, idx) => {
      const rawAnswer = (answers[q.id] || '').trim();
      let isCorrect = false;

      if (q.type === 'open_cloze') {
        const cleanAnswer = rawAnswer.toLowerCase();
        const validList = (q.acceptable_answers || [q.correct_text]).map(a => a.toLowerCase().trim());
        isCorrect = validList.includes(cleanAnswer);
      } else {
        const studentChoice = rawAnswer.toUpperCase();
        isCorrect = studentChoice === q.correct_id;
      }

      if (isCorrect) correctCount++;

      itemFeedback.push({
        item_order: idx + 1,
        id: q.id,
        type: q.type,
        skill: q.skill,
        question_text: q.question_text,
        student_input: rawAnswer,
        correct_answer: q.type === 'open_cloze' ? q.correct_text : q.correct_id,
        is_correct: isCorrect,
        explanation: q.explanation
      });
    });

    const totalQuestions = session.questions.length;
    const score10 = Number(((correctCount / totalQuestions) * 10).toFixed(1));

    // Determine CEFR Band & Commentary
    let cefrLevel = 'A1';
    let rankTitle = 'Khởi Động Nền Tảng (A1)';
    let recommendation = 'Nên củng cố phát âm chuẩn IPA và các thì cơ bản (Hiện tại đơn, Quá khứ đơn) tại lớp nền tảng Cô Dung.';

    if (score10 >= 8.5) {
      cefrLevel = session.grade === 'lop_12' ? 'C1' : 'B2';
      rankTitle = `Xuất Sắc (${cefrLevel})`;
      recommendation = 'Năng lực ngữ pháp & từ vựng rất vững. Đủ điều kiện tham gia lớp Chuyên Sâu Học Sinh Giỏi / Luyện Thi THPT Điểm 9+.';
    } else if (score10 >= 7.0) {
      cefrLevel = session.grade === 'lop_12' ? 'B2' : 'B1';
      rankTitle = `Khá Giỏi (${cefrLevel})`;
      recommendation = 'Kỹ năng làm bài tốt, cần rèn thêm bài tập điền từ đoạn văn (Open Cloze) và collocations nâng cao.';
    } else if (score10 >= 5.0) {
      cefrLevel = session.grade === 'lop_12' ? 'B1' : 'A2';
      rankTitle = `Trung Bình Khá (${cefrLevel})`;
      recommendation = 'Cần luyện tập thêm phản xạ nghe và phân biệt các cặp từ dễ nhầm lẫn.';
    }

    const result = {
      score_10: score10,
      correct_count: correctCount,
      total_questions: totalQuestions,
      cefr_level: cefrLevel,
      rank_title: rankTitle,
      recommendation,
      duration_seconds,
      item_feedback: itemFeedback
    };

    await completeGuestSession(platform?.env?.DB, guest_session_id, answers, result);

    return json({
      success: true,
      message: 'Chấm điểm bài test hoàn tất!',
      result
    });
  }

  // 3. ACTION: VOLUNTARY LEAD SUBMISSION (Strictly verifies DB write)
  if (action === 'voluntary_lead') {
    const { guest_session_id, phone, student_target, parent_notes } = body;
    if (!phone || phone.trim().length < 8) {
      return json({ success: false, error: 'Vui lòng cung cấp số điện thoại hợp lệ (tối thiểu 8 chữ số).' }, { status: 400 });
    }

    // Persist to D1 database
    if (!platform?.env?.DB) {
      return json({
        success: false,
        error: 'Dịch vụ lưu trữ cơ sở dữ liệu tạm thời gián đoạn. Vui lòng liên hệ trực tiếp hotline hoặc nhắn Zalo để được tư vấn ngay.'
      }, { status: 503 });
    }

    try {
      const dbRes = await platform.env.DB.prepare(`
        INSERT INTO system_notifications (id, target_role, title, body, category, reference_id)
        VALUES (?, 'leader', 'Khách đăng ký tư vấn sau bài test', ?, 'consultation', ?);
      `).bind(
        `notif_lead_${Date.now()}_${randomUUID().substring(0, 6)}`,
        `Khách hàng để lại SĐT: ${phone.trim()} sau bài test thử. Mục tiêu: ${student_target || 'Nâng cao điểm số'}. Ghi chú: ${parent_notes || 'Không có'}`,
        guest_session_id || 'guest_direct'
      ).run();

      if (!dbRes || dbRes.meta?.changes < 1) {
        return json({
          success: false,
          error: 'Không thể ghi nhận thông tin liên hệ vào hệ thống. Vui lòng thử lại sau.'
        }, { status: 500 });
      }

      return json({
        success: true,
        message: 'Cảm ơn Quý Phụ Huynh! Cô Dung sẽ liên hệ tư vấn lộ trình học phù hợp nhất qua Zalo trong vòng 24h.'
      });
    } catch (dbErr) {
      console.error('Lead submission D1 write error:', dbErr);
      return json({
        success: false,
        error: `Lỗi ghi nhận thông tin vào hệ thống: ${dbErr.message}`
      }, { status: 500 });
    }
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}

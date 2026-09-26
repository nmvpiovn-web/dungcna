import { json } from '@sveltejs/kit';

export const prerender = false;

// In-memory or D1-backed guest sessions store with 2-hour TTL expiration
const GUEST_SESSIONS = new Map();

// Standardized Open Cloze and Listening Sample Questions for Guest Assessment
const GUEST_CURATED_QUESTIONS = {
  'lop_7': [
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
      audio_term: 'volunteer',
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
      question_text: 'Điền từ thích hợp vào chỗ trống (1):',
      options: [
        { id: 'A', text: 'pollution' },
        { id: 'B', text: 'pollute' },
        { id: 'C', text: 'polluted' },
        { id: 'D', text: 'pollutant' }
      ],
      correct_id: 'A',
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
      question_text: 'Điền động từ vào chỗ trống (2):',
      options: [
        { id: 'A', text: 'wish' },
        { id: 'B', text: 'wishes' },
        { id: 'C', text: 'wishing' },
        { id: 'D', text: 'wished' }
      ],
      correct_id: 'A',
      explanation: 'Mệnh đề quan hệ bổ nghĩa cho students (danh từ số nhiều) -> wish.'
    }
  ],
  'lop_12': [
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
      question_text: 'Chọn danh từ ghép phù hợp với tính từ concerted:',
      options: [
        { id: 'A', text: 'efforts' },
        { id: 'B', text: 'struggles' },
        { id: 'C', text: 'battles' },
        { id: 'D', text: 'contests' }
      ],
      correct_id: 'A',
      explanation: 'Collocation học thuật: concerted efforts (nỗ lực đồng bộ, phối hợp).'
    }
  ]
};

export async function POST({ request, platform }) {
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
    const durationMinutes = duration_type === '45m' ? 45 : duration_type === '15m' ? 15 : 5;

    const guestSessionId = `gst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const startTime = Date.now();
    const expiresAt = startTime + (durationMinutes + 10) * 60 * 1000; // duration + 10m buffer

    // Select questions
    const questionPool = GUEST_CURATED_QUESTIONS[grade] || GUEST_CURATED_QUESTIONS['lop_7'];
    const count = durationMinutes === 45 ? Math.min(25, questionPool.length) : durationMinutes === 15 ? Math.min(10, questionPool.length) : Math.min(5, questionPool.length);
    const selectedQuestions = questionPool.slice(0, count);

    // Save server-side session (strictly storing correct answers on server only!)
    const sessionRecord = {
      id: guestSessionId,
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

    GUEST_SESSIONS.set(guestSessionId, sessionRecord);

    // Build client payload: STRICTLY OMIT correct_id and explanation!
    const clientQuestions = selectedQuestions.map((q, idx) => ({
      item_order: idx + 1,
      id: q.id,
      type: q.type,
      skill: q.skill,
      question_text: q.question_text,
      passage: q.passage || null,
      audio_term: q.audio_term || null,
      options: q.options
    }));

    return json({
      success: true,
      guest_session_id: guestSessionId,
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
    const { guest_session_id, answers = {}, duration_seconds = 0 } = body;
    if (!guest_session_id) {
      return json({ success: false, error: 'Thiếu guest_session_id lượt thi.' }, { status: 400 });
    }

    const session = GUEST_SESSIONS.get(guest_session_id);
    if (!session) {
      return json({ success: false, error: 'Phiên thi thử không tồn tại hoặc đã hết hạn (2h TTL).' }, { status: 404 });
    }

    // Deadline check (Reject submissions after expiry)
    if (Date.now() > session.expiresAt) {
      return json({ success: false, error: 'Hết giờ làm bài: Bài thi đã quá thời gian quy định.' }, { status: 403 });
    }

    // Idempotent check
    if (session.status === 'completed' && session.result) {
      return json({ success: true, message: 'Đã nộp bài trước đó.', result: session.result });
    }

    // Server-side scoring (never trust client score!)
    let correctCount = 0;
    const itemFeedback = [];

    session.questions.forEach((q, idx) => {
      const studentChoice = (answers[q.id] || '').trim().toUpperCase();
      const isCorrect = studentChoice === q.correct_id;
      if (isCorrect) correctCount++;

      itemFeedback.push({
        item_order: idx + 1,
        id: q.id,
        type: q.type,
        skill: q.skill,
        question_text: q.question_text,
        student_choice: studentChoice,
        correct_id: q.correct_id,
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

    session.status = 'completed';
    session.result = result;
    GUEST_SESSIONS.set(guest_session_id, session);

    return json({
      success: true,
      message: 'Chấm điểm bài test hoàn tất!',
      result
    });
  }

  // 3. ACTION: VOLUNTARY LEAD SUBMISSION (Separate opt-in, never forced)
  if (action === 'voluntary_lead') {
    const { guest_session_id, phone, student_target, parent_notes } = body;
    if (!phone || phone.trim().length < 8) {
      return json({ success: false, error: 'Vui lòng cung cấp số điện thoại hợp lệ để nhận tư vấn.' }, { status: 400 });
    }

    // Save lead to D1 if available or memory
    if (platform?.env?.DB) {
      try {
        await platform.env.DB.prepare(`
          INSERT INTO system_notifications (id, target_role, title, body, category, reference_id)
          VALUES (?, 'leader', 'Khách đăng ký tư vấn sau bài test', ?, 'consultation', ?);
        `).bind(
          `notif_lead_${Date.now()}`,
          `Khách hàng để lại SĐT: ${phone.trim()} sau bài test thử. Mục tiêu: ${student_target || 'Nâng cao điểm số'}. Ghi chú: ${parent_notes || 'Không có'}`,
          guest_session_id || 'guest_direct'
        ).run();
      } catch (dbErr) {
        console.warn('DB notification write error:', dbErr);
      }
    }

    return json({
      success: true,
      message: 'Cảm ơn Quý Phụ Huynh! Cô Dung sẽ liên hệ tư vấn lộ trình học phù hợp nhất qua Zalo trong vòng 24h.'
    });
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}

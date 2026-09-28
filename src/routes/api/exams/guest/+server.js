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
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS guest_exam_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      grade TEXT NOT NULL,
      curriculum TEXT NOT NULL DEFAULT 'global_success',
      blueprint_json TEXT,
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

  // Backward compatibility migration for pre-existing tables
  try { await db.prepare("ALTER TABLE guest_exam_sessions ADD COLUMN curriculum TEXT NOT NULL DEFAULT 'global_success'").run(); } catch {}
  try { await db.prepare("ALTER TABLE guest_exam_sessions ADD COLUMN blueprint_json TEXT").run(); } catch {}
}

async function saveGuestSession(db, session) {
  if (db) {
    await ensureD1SessionTable(db);
    const dbRes = await db.prepare(`
      INSERT OR REPLACE INTO guest_exam_sessions 
      (id, token, grade, curriculum, blueprint_json, candidate_name, duration_minutes, start_time, expires_at, questions_json, status, answers_json, result_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).bind(
      session.id,
      session.token,
      session.grade,
      session.curriculum || 'global_success',
      session.blueprint ? JSON.stringify(session.blueprint) : null,
      session.candidate_name || '',
      session.duration_minutes,
      session.startTime,
      session.expiresAt,
      JSON.stringify(session.questions),
      session.status,
      session.answers ? JSON.stringify(session.answers) : null,
      session.result ? JSON.stringify(session.result) : null
    ).run();

    if (dbRes && dbRes.meta && typeof dbRes.meta.changes === 'number' && dbRes.meta.changes < 1) {
      throw new Error('D1 session insert failed: 0 rows changed');
    }
    // Only update memory cache AFTER durable database write succeeds
    GUEST_SESSIONS.set(session.id, session);
  } else {
    // Only in local development environment without DB binding
    GUEST_SESSIONS.set(session.id, session);
  }
}

async function getGuestSession(db, sessionId) {
  if (db) {
    // Authoritative primary source: query D1 database first
    await ensureD1SessionTable(db);
    const row = await db.prepare('SELECT * FROM guest_exam_sessions WHERE id = ?').bind(sessionId).first();
    if (row) {
      const session = {
        id: row.id,
        token: row.token,
        grade: row.grade,
        curriculum: row.curriculum || 'global_success',
        blueprint: row.blueprint_json ? JSON.parse(row.blueprint_json) : null,
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
    // Not found in DB -> return null (fail-closed, never fallback to stale in-memory state)
    return null;
  }
  return GUEST_SESSIONS.get(sessionId) || null;
}

async function completeGuestSession(db, sessionId, answers, result, now = Date.now()) {
  if (db) {
    // Atomic CAS Update with deadline check in WHERE condition
    const res = await db.prepare(`
      UPDATE guest_exam_sessions 
      SET status = 'completed', answers_json = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'in_progress' AND expires_at >= ?;
    `).bind(JSON.stringify(answers), JSON.stringify(result), sessionId, now).run();

    const changes = res?.meta?.changes ?? 0;
    if (changes === 1) {
      // Only commit to local memory cache if database write strictly won the CAS race
      const session = GUEST_SESSIONS.get(sessionId);
      if (session) {
        session.status = 'completed';
        session.answers = answers;
        session.result = result;
      }
    }
    return changes;
  }

  // Development environment without DB binding
  const session = GUEST_SESSIONS.get(sessionId);
  if (session && session.status === 'in_progress' && session.expiresAt >= now) {
    session.status = 'completed';
    session.answers = answers;
    session.result = result;
    return 1;
  }
  return 0;
}

// Supported Curated Grade & Curriculum Matrix
// Strictly declare what is verified. ZERO cloning, ZERO fake looping.
const SUPPORTED_GRADES = {
  lop_7: 'Lớp 7 (Nền Tảng THCS)',
  lop_12: 'Lớp 12 (Thi THPT QG / IELTS)'
};

const SUPPORTED_CURRICULA = {
  lop_7: {
    global_success: 'Kết nối tri thức (Global Success)',
    friends_plus: 'Chân trời sáng tạo (Friends Plus)',
    smart_world: 'i-Learn Smart World'
  },
  lop_12: {
    thpt_qg: 'Chương trình GDPT Chuẩn & Ôn thi THPT Quốc Gia',
    ielts_academic: 'Định hướng Học thuật & IELTS Foundation'
  }
};

const SUPPORTED_CONFIGS = {
  lop_7: {
    global_success: { '5m': 5, '15m': 10 },
    friends_plus: { '5m': 5 },
    smart_world: { '5m': 5 }
  },
  lop_12: {
    thpt_qg: { '5m': 5 },
    ielts_academic: { '5m': 5 }
  }
};

// Verified Question Banks with 100% Unique, Non-Duplicated Questions per Curriculum
const GUEST_QUESTION_BANK = {
  lop_7: {
    global_success: [
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
    friends_plus: [
      {
        id: 'gst_fp7_1',
        type: 'mcq',
        skill: 'grammar',
        question_text: 'How often _____ your brother play soccer after school? - Twice a week.',
        options: [
          { id: 'A', text: 'does' },
          { id: 'B', text: 'do' },
          { id: 'C', text: 'is' },
          { id: 'D', text: 'are' }
        ],
        correct_id: 'A',
        explanation: 'Chủ ngữ your brother là ngôi thứ ba số ít, câu hỏi thì hiện tại đơn mượn trợ động từ does.'
      },
      {
        id: 'gst_fp7_2',
        type: 'mcq',
        skill: 'vocabulary',
        question_text: 'I usually send text _____ to my friends instead of making phone calls.',
        options: [
          { id: 'A', text: 'messages' },
          { id: 'B', text: 'letters' },
          { id: 'C', text: 'parcels' },
          { id: 'D', text: 'speeches' }
        ],
        correct_id: 'A',
        explanation: 'Collocation trong Friends Plus Unit 2: text messages (tin nhắn văn bản).'
      },
      {
        id: 'gst_fp7_3',
        type: 'open_cloze',
        skill: 'reading_cloze',
        passage: 'Last weekend, Nam went to the bookstore in Thu Duc and (1)_____ a new English dictionary.',
        question_text: 'Tự luận điền từ: Nhập dạng quá khứ đơn của động từ "buy" vào chỗ trống (1):',
        correct_text: 'bought',
        acceptable_answers: ['bought'],
        explanation: 'Thì quá khứ đơn của động từ bất quy tắc buy là bought.'
      },
      {
        id: 'gst_fp7_4',
        type: 'listening',
        skill: 'listening',
        question_text: 'Nghe phát âm và chọn từ có đuôi -ed phát âm là /ɪd/:',
        audio_term: 'decided',
        options: [
          { id: 'A', text: 'decided (/ɪd/)' },
          { id: 'B', text: 'looked (/t/)' },
          { id: 'C', text: 'stayed (/d/)' },
          { id: 'D', text: 'washed (/t/)' }
        ],
        correct_id: 'A',
        explanation: 'Từ decided có tận cùng là âm /d/ nên khi thêm -ed phát âm là /ɪd/.'
      },
      {
        id: 'gst_fp7_5',
        type: 'open_cloze',
        skill: 'grammar',
        passage: 'My elder sister loves music and she is very good (2)_____ playing the acoustic guitar.',
        question_text: 'Tự luận điền từ: Nhập giới từ thích hợp vào chỗ trống (2):',
        correct_text: 'at',
        acceptable_answers: ['at'],
        explanation: 'Cấu trúc be good at something / doing something (giỏi về cái gì).'
      }
    ],
    smart_world: [
      {
        id: 'gst_sw7_1',
        type: 'mcq',
        skill: 'grammar',
        question_text: 'My cousin is fond _____ collecting comic books and action figures.',
        options: [
          { id: 'A', text: 'of' },
          { id: 'B', text: 'at' },
          { id: 'C', text: 'with' },
          { id: 'D', text: 'in' }
        ],
        correct_id: 'A',
        explanation: 'Cấu trúc be fond of + V-ing/N (thích, say mê cái gì) trong Smart World Unit 1.'
      },
      {
        id: 'gst_sw7_2',
        type: 'open_cloze',
        skill: 'reading_cloze',
        passage: 'Doctors recommend that teenagers should get at least eight hours of (1)_____ every night to stay healthy.',
        question_text: 'Tự luận điền từ: Nhập danh từ thích hợp chỉ giấc ngủ vào chỗ trống (1):',
        correct_text: 'sleep',
        acceptable_answers: ['sleep'],
        explanation: 'Cụm danh từ: hours of sleep (số giờ ngủ).'
      },
      {
        id: 'gst_sw7_3',
        type: 'mcq',
        skill: 'vocabulary',
        question_text: 'Our school youth club decided to _____ warm clothes and old textbooks to children in highland areas.',
        options: [
          { id: 'A', text: 'donate' },
          { id: 'B', text: 'borrow' },
          { id: 'C', text: 'purchase' },
          { id: 'D', text: 'damage' }
        ],
        correct_id: 'A',
        explanation: 'Động từ donate (quyên góp, ủng hộ) trong chủ đề Community Services của Smart World Unit 3.'
      },
      {
        id: 'gst_sw7_4',
        type: 'mcq',
        skill: 'grammar',
        question_text: 'Pop music is completely different _____ traditional folk music.',
        options: [
          { id: 'A', text: 'from' },
          { id: 'B', text: 'as' },
          { id: 'C', text: 'like' },
          { id: 'D', text: 'with' }
        ],
        correct_id: 'A',
        explanation: 'Cấu trúc so sánh khác biệt: different from (khác với).'
      },
      {
        id: 'gst_sw7_5',
        type: 'open_cloze',
        skill: 'grammar',
        passage: 'We want to make fresh strawberry smoothies. Is there (2)_____ milk left in the refrigerator?',
        question_text: 'Tự luận điền từ: Nhập lượng từ thích hợp dùng trong câu nghi vấn với danh từ không đếm được (2):',
        correct_text: 'any',
        acceptable_answers: ['any'],
        explanation: 'Lượng từ any dùng trong câu hỏi nghi vấn với danh từ không đếm được milk.'
      }
    ]
  },
  lop_12: {
    thpt_qg: [
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
    ],
    ielts_academic: [
      {
        id: 'gst_ielts_1',
        type: 'mcq',
        skill: 'vocabulary',
        question_text: 'The chart illustrates a significant _____ in the proportion of renewable energy consumption over the last two decades.',
        options: [
          { id: 'A', text: 'surge' },
          { id: 'B', text: 'soared' },
          { id: 'C', text: 'escalation' },
          { id: 'D', text: 'rises' }
        ],
        correct_id: 'A',
        explanation: 'Sau tính từ "significant" và mạo từ "a" cần một danh từ đếm được số ít -> surge (sự tăng vọt).'
      },
      {
        id: 'gst_ielts_2',
        type: 'open_cloze',
        skill: 'reading_cloze',
        passage: '(1)_____, implementing green technologies fosters long-term economic resilience and creates sustainable jobs.',
        question_text: 'Tự luận điền từ: Nhập liên từ học thuật đồng nghĩa với "Furthermore" bắt đầu bằng chữ "M":',
        correct_text: 'moreover',
        acceptable_answers: ['moreover', 'more over'],
        explanation: 'Liên từ chuyển tiếp học thuật Moreover (hơn nữa, ngoài ra).'
      },
      {
        id: 'gst_ielts_3',
        type: 'mcq',
        skill: 'grammar',
        question_text: 'Under no circumstances _____ candidates permitted to access external electronic dictionaries during the test.',
        options: [
          { id: 'A', text: 'are' },
          { id: 'B', text: 'were' },
          { id: 'C', text: 'will' },
          { id: 'D', text: 'have' }
        ],
        correct_id: 'A',
        explanation: 'Cấu trúc đảo ngữ với cụm phủ định đầu câu: Under no circumstances + be + S + PII.'
      },
      {
        id: 'gst_ielts_4',
        type: 'listening',
        skill: 'listening',
        question_text: 'Nghe phát âm và xác định từ có trọng âm rơi vào âm tiết thứ ba:',
        audio_term: 'academic',
        options: [
          { id: 'A', text: 'academic (/ˌækəˈdemɪk/)' },
          { id: 'B', text: 'convenient (/kənˈviːniənt/)' },
          { id: 'C', text: 'photography (/fəˈtɒɡrəfi/)' },
          { id: 'D', text: 'development (/dɪˈveləpmənt/)' }
        ],
        correct_id: 'A',
        explanation: 'Academic có trọng âm chính rơi vào âm tiết thứ ba (/ˌækəˈdemɪk/).'
      },
      {
        id: 'gst_ielts_5',
        type: 'open_cloze',
        skill: 'grammar',
        passage: 'In (2)_____ of substantial financial investments, several infrastructure projects experienced severe delays.',
        question_text: 'Tự luận điền từ: Nhập danh từ thích hợp đi trong cụm "In ... of" chỉ sự nhượng bộ:',
        correct_text: 'spite',
        acceptable_answers: ['spite'],
        explanation: 'Cụm liên từ chỉ sự nhượng bộ: In spite of (mặc dù).'
      }
    ]
  }
};

// Automatic cleanup of expired guest sessions (Retention TTL: 2 hours after exam expiry)
async function pruneExpiredSessions(db) {
  const RETENTION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  const cutoff = Date.now() - RETENTION_TTL_MS;
  for (const [id, s] of GUEST_SESSIONS.entries()) {
    if (cutoff > s.expiresAt) {
      GUEST_SESSIONS.delete(id);
    }
  }
  if (db) {
    try {
      await db.prepare('DELETE FROM guest_exam_sessions WHERE expires_at < ?').bind(cutoff).run();
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
    // 1. Strict validation of grade - NO SILENT FALLBACK TO LỚP 7
    if (!body.grade || typeof body.grade !== 'string' || !body.grade.trim()) {
      return json({
        success: false,
        error: 'MissingGradeError: Vui lòng chọn khối lớp của bạn trước khi bắt đầu bài thi thử.'
      }, { status: 400 });
    }

    const grade = body.grade.trim();
    const duration_type = body.duration_type || '5m';
    const guest_role = body.guest_role || 'student';
    const candidate_name = (body.candidate_name && body.candidate_name.trim()) || 'Khách Trải Nghiệm';

    if (!SUPPORTED_GRADES[grade]) {
      return json({
        success: false,
        error: `Khối lớp "${grade}" chưa được hỗ trợ đề thi thử chuẩn hóa. Hiện hệ thống đã phát hành đề cho: Lớp 7 (THCS) và Lớp 12 (THPT). Các khối khác đang trong lộ trình thẩm định chuyên môn.`,
        supported_grades: SUPPORTED_GRADES
      }, { status: 400 });
    }

    // 2. Curriculum validation & filtering
    const gradeCurricula = SUPPORTED_CURRICULA[grade] || {};
    const defaultCurriculum = Object.keys(gradeCurricula)[0] || 'global_success';
    const curriculum = body.curriculum ? body.curriculum.trim() : defaultCurriculum;

    if (!gradeCurricula[curriculum]) {
      return json({
        success: false,
        error: `Chương trình "${curriculum}" không tồn tại hoặc chưa được hỗ trợ cho ${SUPPORTED_GRADES[grade]}. Vui lòng chọn một trong các chương trình: ${Object.values(gradeCurricula).join(', ')}.`,
        supported_curricula: gradeCurricula
      }, { status: 400 });
    }

    const gradePools = GUEST_QUESTION_BANK[grade] || {};
    const curriculumPool = gradePools[curriculum] || [];
    const targetQuestionCount = duration_type === '15m' ? 10 : 5;

    if (curriculumPool.length < targetQuestionCount) {
      return json({
        success: false,
        error: `Chương trình '${gradeCurricula[curriculum]}' hiện có sẵn ${curriculumPool.length} câu hỏi chuẩn hóa (phù hợp mốc 5 phút). Mốc ${duration_type} (${targetQuestionCount} câu) đang được cập nhật thêm theo lộ trình.`,
        available_counts: { '5m': Math.min(5, curriculumPool.length) }
      }, { status: 400 });
    }

    const durationMinutes = duration_type === '15m' ? 15 : 5;
    const guestSessionId = `gst_${Date.now()}_${randomUUID().substring(0, 8)}`;
    const guestToken = `gtok_${randomUUID()}`;
    const startTime = Date.now();
    const expiresAt = startTime + (durationMinutes + 10) * 60 * 1000; // duration + 10m buffer

    // Select exact non-repeating unique questions
    const selectedQuestions = curriculumPool.slice(0, targetQuestionCount);

    const blueprint = {
      grade,
      curriculum,
      curriculum_label: gradeCurricula[curriculum],
      duration_minutes: durationMinutes,
      total_questions: selectedQuestions.length,
      skills_distribution: {
        grammar: selectedQuestions.filter(q => q.skill === 'grammar').length,
        vocabulary: selectedQuestions.filter(q => q.skill === 'vocabulary').length,
        listening: selectedQuestions.filter(q => q.skill === 'listening').length,
        reading_cloze: selectedQuestions.filter(q => q.skill === 'reading_cloze').length
      },
      question_types: {
        mcq: selectedQuestions.filter(q => q.type === 'mcq').length,
        open_cloze: selectedQuestions.filter(q => q.type === 'open_cloze').length,
        listening: selectedQuestions.filter(q => q.type === 'listening').length
      },
      generated_at: new Date(startTime).toISOString()
    };

    // Save server-side session (strictly storing answers and token on server only!)
    const sessionRecord = {
      id: guestSessionId,
      token: guestToken,
      grade,
      curriculum,
      blueprint,
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

    try {
      await saveGuestSession(platform?.env?.DB, sessionRecord);
    } catch (saveErr) {
      console.error('Failed to persist guest session to D1:', saveErr);
      return json({
        success: false,
        error: `Lỗi khởi tạo phiên thi (Fail-Closed): Không thể lưu trữ phiên làm bài vào cơ sở dữ liệu (${saveErr.message}). Vui lòng thử lại.`
      }, { status: 500 });
    }

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
      curriculum,
      blueprint,
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

    let session;
    try {
      session = await getGuestSession(platform?.env?.DB, guest_session_id);
    } catch (dbReadErr) {
      console.error('Failed to read guest session from D1:', dbReadErr);
      return json({
        success: false,
        error: `Lỗi truy vấn phiên thi (Fail-Closed): Không thể đọc dữ liệu từ cơ sở dữ liệu (${dbReadErr.message}).`
      }, { status: 500 });
    }

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
      grade: session.grade,
      curriculum: session.curriculum,
      blueprint: session.blueprint,
      cefr_level: cefrLevel,
      rank_title: rankTitle,
      recommendation,
      duration_seconds,
      item_feedback: itemFeedback
    };

    let changes = 0;
    try {
      changes = await completeGuestSession(platform?.env?.DB, guest_session_id, answers, result, Date.now());
    } catch (dbWriteErr) {
      console.error('Failed to complete guest session in D1:', dbWriteErr);
      return json({
        success: false,
        error: `Lỗi ghi nhận kết quả thi (Fail-Closed): Cơ sở dữ liệu không thể hoàn tất lưu điểm (${dbWriteErr.message}).`
      }, { status: 500 });
    }

    if (changes === 1) {
      return json({
        success: true,
        message: 'Chấm điểm bài test hoàn tất!',
        result
      });
    }

    // CAS Update returned 0 changes:
    // Either another concurrent worker completed it, or it expired at write-time.
    // Query authoritative state from database:
    try {
      const winningSession = await getGuestSession(platform?.env?.DB, guest_session_id);
      if (winningSession) {
        if (winningSession.status === 'completed' && winningSession.result) {
          // Return the committed winning result, NEVER return our local different result!
          return json({
            success: true,
            message: 'Bài thi đã được ghi nhận hoàn tất bởi lượt nộp trước đó.',
            result: winningSession.result,
            concurrent_resolution: true
          });
        }
        if (Date.now() > winningSession.expiresAt) {
          return json({
            success: false,
            error: 'Hết giờ làm bài: Bài thi đã quá thời gian quy định tại thời điểm ghi nhận.'
          }, { status: 403 });
        }
      }
    } catch (recheckErr) {
      console.warn('Could not recheck winning session:', recheckErr);
    }

    return json({
      success: false,
      error: 'Xung đột ghi nhận bài thi: Phiên thi đã được hoàn thành hoặc không thể cập nhật (changes = 0).'
    }, { status: 409 });
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

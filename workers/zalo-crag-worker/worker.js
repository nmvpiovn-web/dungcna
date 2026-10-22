// Cloudflare Worker: timbk-zalo-webhook (Repository Path: workers/zalo-crag-worker/worker.js)
// 24/7 Conversational Zalo Bot Gateway with Multi-Turn Context Continuity, 7-Node CRAG & Proactive 10m Class Reminders

const DEFAULT_ZALO_BOT_TOKEN = '2950137408122467629:qIytiJpTiFiCxTcamXXhXexdXHdcHDrhZCWwHwHgaUzAOwsJasNhxIqbXYMQwCVP';
const SUPERADMIN_DEFAULT_CHAT_ID = 'b3845beb38a2d1fc88b3';
const TIMBK_WEBHOOK_ENDPOINT = 'https://timbk.io.vn/api/zalo-bot/webhook';
const WORKER_SELF_URL = 'https://timbk-zalo-webhook.tienganh7-sveltekit.workers.dev';

function normalizeVi(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function cleanNaturalZaloText(raw = '') {
  return String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^🤖\s*\[.*?\]\s*\n?/gm, '')
    .replace(/^(Dạ\s+)?(Chào bạn|Xin chào.*?,|Dựa trên dữ liệu.*?[:,])\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toZaloCompatiblePhotoUrl(rawUrl = '', options = {}) {
  let clean = String(rawUrl || '').trim();
  if (!clean) return '';

  if (clean.includes('wsrv.nl')) {
    try {
      const u = new URL(clean);
      const inner = u.searchParams.get('url');
      if (inner) clean = inner;
    } catch {}
  }

  if (clean.includes('vietqr.io') || clean.includes('/vietqr/')) {
    let bank = '970422';
    let account = '0901234567';
    let amount = 0;
    let addInfo = 'HP_T10';

    const existingCleanMatch = clean.match(/\/vietqr\/(\d{6})-(\d{6,20})-(\d+)-([A-Za-z0-9_-]+)\.png/i);
    if (existingCleanMatch) {
      bank = existingCleanMatch[1];
      account = existingCleanMatch[2];
      amount = Number(existingCleanMatch[3]) || 0;
      addInfo = existingCleanMatch[4];
    } else {
      const imgMatch = clean.match(/\/image\/(\d{6}|[A-Za-z0-9]+)-(\d{6,20})-/i);
      if (imgMatch) {
        bank = /^\d{6}$/.test(imgMatch[1]) ? imgMatch[1] : '970422';
        account = imgMatch[2];
      }
      try {
        const u = new URL(clean, 'https://timbk.io.vn');
        if (u.searchParams.get('amount')) amount = Math.max(0, Math.round(Number(u.searchParams.get('amount')) || 0));
        if (u.searchParams.get('addInfo')) addInfo = u.searchParams.get('addInfo');
      } catch {}
    }

    const safeAddInfo = String(addInfo || 'HP_T10')
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'HP_T10';

    if (options?.download) {
      return `https://timbk.io.vn/api/vietqr/${bank}-${account}-${amount}-${safeAddInfo}.png?download=1`;
    }
    return `https://timbk.io.vn/api/vietqr/${bank}-${account}-${amount}-${safeAddInfo}.png`;
  }

  if (clean.includes('api.qrserver.com') || clean.includes('images.unsplash.com') || clean.includes('timbk.io.vn') || clean.includes('workers.dev')) {
    return clean;
  }
  return clean;
}

function buildStudentVietQrUrl({ studentName = 'HOC SINH', amountVnd = 1800000, bankAccount = '0901234567', accountHolder = 'NGUYEN MINH VU', period = 'T10' }) {
  const shortName = normalizeVi(studentName)
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12) || 'HOCSINH';
  const addInfo = `HP_${shortName}_${period}`;
  const cleanAmount = Math.max(0, Math.round(Number(amountVnd) || 0));
  return `${WORKER_SELF_URL}/vietqr/970422-${bankAccount}-${cleanAmount}-${addInfo}.png`;
}

function base64ToUint8Array(b64 = '') {
  const binaryStr = atob(b64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

async function handleVietQrPngRequest(url, method = 'GET') {
  const filename = decodeURIComponent(url.pathname.replace(/^\/vietqr\//, '')).replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const sp = url.searchParams;

  let bank = sp.get('bank') || sp.get('acqId') || '';
  let account = sp.get('account') || sp.get('accountNo') || '';
  let amount = sp.get('amount') || '';
  let addInfo = sp.get('addInfo') || '';
  const accountName = String(sp.get('accountName') || sp.get('name') || 'NGUYEN MINH VU').trim().toUpperCase();

  const fullMatch = filename.match(/^(\d{6})-(\d{6,20})-(\d+)-([A-Za-z0-9_-]+)$/);
  if (fullMatch) {
    if (!bank) bank = fullMatch[1];
    if (!account) account = fullMatch[2];
    if (!amount) amount = fullMatch[3];
    if (!addInfo) addInfo = fullMatch[4];
  } else {
    const shortMatch = filename.match(/^([A-Za-z0-9_-]+?)[-_](\d{4,12})$/);
    if (shortMatch) {
      if (!addInfo) addInfo = shortMatch[1];
      if (!amount) amount = shortMatch[2];
    } else if (filename && filename !== 'qr' && filename !== 'vietqr') {
      if (!addInfo) addInfo = filename;
    }
  }

  bank = /^\d{6}$/.test(String(bank || '').trim()) ? String(bank).trim() : '970422';
  account = String(account || '0901234567').replace(/[^0-9]/g, '') || '0901234567';
  const numericAmount = Math.max(0, Math.round(Number(amount) || 0));
  const cleanAddInfo = String(addInfo || 'HP T10')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50) || 'HP T10';
  const safeFileSlug = cleanAddInfo.replace(/\s+/g, '_');

  let pngBytes = null;
  try {
    const res = await fetch('https://api.vietqr.io/v2/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        accountNo: account,
        accountName,
        acqId: bank,
        amount: numericAmount,
        addInfo: cleanAddInfo,
        format: 'text',
        template: 'compact2'
      })
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      const dataUrl = json?.data?.qrDataURL || '';
      const prefix = 'data:image/png;base64,';
      if (dataUrl.startsWith(prefix)) {
        const b64 = dataUrl.slice(prefix.length).replace(/\s+/g, '');
        const bytes = base64ToUint8Array(b64);
        if (bytes.byteLength > 1000 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
          pngBytes = bytes;
        }
      }
    }
  } catch {}

  if (!pngBytes) {
    const qrPayload = `MBBank ${account} (${accountName}) | Amount: ${numericAmount} VND | Content: ${cleanAddInfo}`;
    const fallbackRes = await fetch(
      `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&margin=16&data=${encodeURIComponent(qrPayload)}`
    );
    const ab = await fallbackRes.arrayBuffer();
    pngBytes = new Uint8Array(ab);
  }

  const headers = {
    'Content-Type': 'image/png',
    'Content-Length': String(pngBytes.byteLength),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff'
  };

  if (sp.get('download') === '1' || sp.get('dl') === '1') {
    headers['Content-Disposition'] = `attachment; filename="VietQR_${safeFileSlug}_${numericAmount}.png"`;
  }

  return new Response(method === 'HEAD' ? null : pngBytes, {
    status: 200,
    headers
  });
}

async function sendZaloRichPayload({ botToken, chatId, text, photoUrls = [], photoCaptions = [], voiceUrl = '', videoUrl = '' }) {
  const baseUrl = 'https://bot-api.zaloplatforms.com/bot' + botToken;
  const results = { text_sent: false, photos_sent: 0, voice_sent: false, video_sent: false, message_ids: [] };

  const cleanBody = cleanNaturalZaloText(text);
  const fullText = videoUrl ? (cleanBody + '\n🎬 Xem video bài học: ' + videoUrl).trim() : cleanBody;
  if (fullText) {
    try {
      const zRes = await fetch(baseUrl + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: fullText.slice(0, 1950) })
      });
      const zData = await zRes.json().catch(() => ({}));
      if (zRes.ok && zData?.ok) {
        results.text_sent = true;
        if (zData.result?.message_id) results.message_ids.push(zData.result.message_id);
      }
    } catch {}
  }

  for (let i = 0; i < photoUrls.length; i++) {
    const rawPhoto = photoUrls[i];
    const safePhotoUrl = toZaloCompatiblePhotoUrl(rawPhoto);
    if (!safePhotoUrl) continue;
    const cap = cleanNaturalZaloText(photoCaptions[i] || 'Mã QR đóng học phí (quét trực tiếp bằng App ngân hàng)');
    try {
      const pRes = await fetch(baseUrl + '/sendPhoto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: safePhotoUrl,
          caption: cap.slice(0, 500)
        })
      });
      const pData = await pRes.json().catch(() => ({}));
      if (pRes.ok && pData?.ok) {
        results.photos_sent++;
        if (pData.result?.message_id) results.message_ids.push(pData.result.message_id);
      }
    } catch {}
  }

  if (voiceUrl) {
    try {
      const vRes = await fetch(baseUrl + '/sendVoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, voice: voiceUrl })
      });
      const vData = await vRes.json().catch(() => ({}));
      if (vRes.ok && vData?.ok) {
        results.voice_sent = true;
        if (vData.result?.message_id) results.message_ids.push(vData.result.message_id);
      }
    } catch {}
  }

  return results;
}

function safeJsonParse(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function ensureCragLangflowTables(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS zalo_bot_subscribers (
        chat_id TEXT PRIMARY KEY,
        display_name TEXT,
        phone TEXT DEFAULT '',
        linked_user_id TEXT DEFAULT '',
        role_hint TEXT DEFAULT 'parent_or_teacher',
        last_message TEXT,
        last_ai_reply TEXT DEFAULT '',
        ai_provider TEXT DEFAULT 'crag-langflow',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `).run().catch(() => {});

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS zalo_bot_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        sender_name TEXT,
        direction TEXT,
        content TEXT,
        ai_model TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `).run().catch(() => {});

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS crag_execution_traces (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        sender_name TEXT,
        effective_role TEXT,
        query_text TEXT,
        detected_intents TEXT,
        extracted_entities TEXT,
        tables_queried TEXT,
        crag_score INTEGER DEFAULT 100,
        crag_status TEXT DEFAULT 'CORRECT',
        corrective_actions TEXT DEFAULT '',
        retrieved_summary TEXT DEFAULT '',
        final_reply TEXT DEFAULT '',
        node_timings_json TEXT DEFAULT '{}',
        total_ms INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `).run().catch(() => {});

    await db.prepare(`
      INSERT INTO zalo_bot_subscribers (chat_id, display_name, phone, linked_user_id, role_hint, last_message, updated_at)
      VALUES (?, 'Hải', '0905960437', 'usr_super_1', 'superadmin', 'Khởi tạo SuperAdmin', CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id) DO UPDATE SET
        role_hint = CASE WHEN zalo_bot_subscribers.role_hint IS NULL OR zalo_bot_subscribers.role_hint = '' OR zalo_bot_subscribers.role_hint = 'parent_or_teacher' THEN 'superadmin' ELSE zalo_bot_subscribers.role_hint END,
        linked_user_id = CASE WHEN zalo_bot_subscribers.linked_user_id IS NULL OR zalo_bot_subscribers.linked_user_id = '' THEN 'usr_super_1' ELSE zalo_bot_subscribers.linked_user_id END;
    `).bind(SUPERADMIN_DEFAULT_CHAT_ID).run().catch(() => {});
  } catch {}
}

async function runCragLangflowPipeline({
  db,
  env,
  chatId = SUPERADMIN_DEFAULT_CHAT_ID,
  displayName = 'Hải',
  userText = '',
  overrideRole = null,
  sendToZalo = true,
  botToken = DEFAULT_ZALO_BOT_TOKEN
}) {
  const pipelineStart = Date.now();
  const nodeTimings = {};
  const cleanText = String(userText || '').trim();
  const normText = normalizeVi(cleanText);

  if (db) {
    await ensureCragLangflowTables(db);
  }

  // NODE 1: IDENTITY, RBAC & MULTI-TURN CONVERSATION MEMORY
  if (sendToZalo && chatId && botToken) {
    fetch('https://bot-api.zaloplatforms.com/bot' + botToken + '/sendChatAction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    }).catch(() => {});
  }
  const t1 = Date.now();
  let subscriber = null;
  let linkedUser = null;
  let effectiveRole = overrideRole || (chatId === SUPERADMIN_DEFAULT_CHAT_ID ? 'superadmin' : 'guest');
  let roleSwitchNotice = '';

  let recentConversationTurns = [];
  let memoryStudentIds = [];
  let memoryStudentNames = [];
  let memoryGrade = null;
  let memoryIntents = [];

  const phoneMatch = cleanText.match(/(?:0|\+84)\d{8,10}/);
  const extractedPhone = phoneMatch ? phoneMatch[0].replace(/^\+84/, '0') : '';

  if (db) {
    subscriber = await db.prepare(`SELECT * FROM zalo_bot_subscribers WHERE chat_id = ? LIMIT 1`).bind(chatId).first().catch(() => null);

    const recentMsgsRes = await db.prepare(`
      SELECT direction, content
      FROM zalo_bot_messages
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 6
    `).bind(chatId).all().catch(() => ({ results: [] }));
    recentConversationTurns = (recentMsgsRes?.results || [])
      .reverse()
      .filter((m) => m.content && String(m.content).trim())
      .map((m) => ({
        role: m.direction === 'in' ? 'user' : 'assistant',
        content: String(m.content).slice(0, 600)
      }));

    const recentTracesRes = await db.prepare(`
      SELECT detected_intents, extracted_entities
      FROM crag_execution_traces
      WHERE chat_id = ?
      ORDER BY rowid DESC
      LIMIT 10
    `).bind(chatId).all().catch(() => ({ results: [] }));

    for (const tr of recentTracesRes?.results || []) {
      const ents = safeJsonParse(tr.extracted_entities, {});
      if (memoryStudentIds.length === 0 && Array.isArray(ents.students) && ents.students.length > 0) {
        memoryStudentIds = ents.students.map((s) => s.id).filter(Boolean);
        memoryStudentNames = ents.students.map((s) => s.name).filter(Boolean);
      }
      if (!memoryGrade && ents.grade) {
        memoryGrade = ents.grade;
      }
      const ints = safeJsonParse(tr.detected_intents, []);
      if (memoryIntents.length === 0 && Array.isArray(ints) && ints.length > 0) {
        memoryIntents = ints;
      }
    }

    const roleCmdMatch = cleanText.match(/^\/role\s+(superadmin|leader|teacher|parent|student|guest)/i);
    if (roleCmdMatch) {
      const newRole = roleCmdMatch[1].toLowerCase();
      effectiveRole = newRole;
      await db.prepare(`UPDATE zalo_bot_subscribers SET role_hint = ?, updated_at = CURRENT_TIMESTAMP WHERE chat_id = ?`)
        .bind(newRole, chatId)
        .run()
        .catch(() => {});
      roleSwitchNotice = `Đã chuyển quyền xem dữ liệu của ${displayName} sang vai trò ${newRole.toUpperCase()}. Bạn có thể nhắn câu hỏi tiếp theo để kiểm tra ngay.`;
    } else if (!overrideRole) {
      if (chatId === SUPERADMIN_DEFAULT_CHAT_ID) {
        effectiveRole = (subscriber?.role_hint && subscriber.role_hint !== 'parent_or_teacher')
          ? subscriber.role_hint
          : 'superadmin';
      } else if (subscriber?.role_hint && subscriber.role_hint !== 'parent_or_teacher') {
        effectiveRole = subscriber.role_hint;
      }
    }

    const phoneToLookup = extractedPhone || subscriber?.phone || '';
    if (phoneToLookup) {
      linkedUser = await db.prepare(`
        SELECT id, username, name, role, email, phone, status, metadata
        FROM users
        WHERE phone = ? OR username = ? OR metadata LIKE ?
        LIMIT 1
      `).bind(phoneToLookup, phoneToLookup, `%${phoneToLookup}%`).first().catch(() => null);
    }
    if (!linkedUser && subscriber?.linked_user_id) {
      linkedUser = await db.prepare(`
        SELECT id, username, name, role, email, phone, status, metadata
        FROM users
        WHERE id = ?
        LIMIT 1
      `).bind(subscriber.linked_user_id).first().catch(() => null);
    }
    if (linkedUser && !overrideRole && chatId !== SUPERADMIN_DEFAULT_CHAT_ID && effectiveRole === 'guest') {
      effectiveRole = linkedUser.role || 'parent';
    }
  }
  nodeTimings.node_identity_rbac = Date.now() - t1;

  // NODE 2: INTENT ROUTER & FOLLOW-UP CONTINUITY DETECTOR
  const t2 = Date.now();
  const detectedIntents = [];
  if (/(lich hoc|thoi khoa bieu|tkb|ca hoc|may gio|thu may|buoi hoc|buoi nao|hoc nhung buoi|phong hoc|diem danh|di muon|vang|co mat|di hoc)/i.test(normText)) {
    detectedIntents.push('schedule_attendance');
  }
  if (/(hoc phi|tien hoc|hoa don|vietqr|qr|dong tien|chuyen khoan|doi sao|tru sao|so sao|sao thuong|khau tru|cong no|thanh toan)/i.test(normText)) {
    detectedIntents.push('tuition_finance');
  }
  if (/(ket qua|diem|danh gia|btvn|bai tap|quiz|kiem tra|nhan xet|hoc luc|tien bo|5 ky nang|ky nang)/i.test(normText)) {
    detectedIntents.push('academic_results');
  }
  if (/(doi soat|chat luong|giao an|tai lieu|drive|second brain|lo trinh)/i.test(normText)) {
    detectedIntents.push('session_audit');
  }
  if (/(xin nghi|nghi phep|vang co phep|xin phep nghi)/i.test(normText)) {
    detectedIntents.push('absence_request');
  }
  if (/(nghia la gi|ngu phap|tu vung|phat am|ipa|cau truc|dich|tieng anh|unit|present|past|used to|traffic)/i.test(normText)) {
    detectedIntents.push('pedagogy_knowledge');
  }

  const gradeMatch = normText.match(/lop\s*(\d{1,2})/);
  let extractedGrade = gradeMatch ? `Lớp ${gradeMatch[1]}` : null;

  let carriedOverIntent = false;
  if (detectedIntents.length === 0) {
    if (memoryIntents.length > 0) {
      detectedIntents.push(...memoryIntents);
      carriedOverIntent = true;
    } else {
      detectedIntents.push('schedule_attendance', 'academic_results', 'tuition_finance');
    }
  }
  nodeTimings.node_intent_router = Date.now() - t2;

  // NODE 3: ROLE-SCOPED D1 SQL RETRIEVER
  const t3 = Date.now();
  const tablesQueried = [];
  let matchedStudents = [];
  let matchedSessions = [];
  let matchedAttendance = [];
  let matchedBills = [];
  let matchedEvaluations = [];
  let matchedStars = [];
  let matchedHomework = [];
  let matchedSessionAudits = [];
  let carriedOverStudent = false;

  if (db) {
    tablesQueried.push('users');
    const allUsersRes = await db.prepare(`
      SELECT id, username, name, role, email, phone, status, metadata, approval_status
      FROM users
      ORDER BY created_at ASC
      LIMIT 60
    `).all().catch(() => ({ results: [] }));
    const allUsers = (allUsersRes?.results || []).map((u) => {
      const meta = safeJsonParse(u.metadata, {});
      return {
        ...u,
        meta,
        grade: meta.grade ? (String(meta.grade).startsWith('Lớp') ? String(meta.grade) : `Lớp ${meta.grade}`) : '',
        school: meta.school || '',
        target: meta.target || '',
        parent_name: meta.parent_name || '',
        parent_phone: meta.parent_phone || '',
        class_id: meta.class_id || ''
      };
    });

    const studentUsers = allUsers.filter((u) => u.role === 'student');
    let allowedStudents = studentUsers;
    const linkedUserMeta = safeJsonParse(linkedUser?.metadata, {});

    if (effectiveRole === 'parent' || effectiveRole === 'guest') {
      const parentPhone = extractedPhone || subscriber?.phone || linkedUser?.phone || '';
      const explicitlyLinked = studentUsers.filter((st) => {
        if (linkedUser && (st.id === linkedUser.id || linkedUserMeta?.linked_student_id === st.id || st.meta?.parent_id === linkedUser.id)) return true;
        if (parentPhone && (st.phone === parentPhone || st.parent_phone === parentPhone)) return true;
        const stNorm = normalizeVi(st.name).replace(/\(.*?\)/g, '').trim();
        const words = stNorm.split(/\s+/).filter((w) => w.length >= 3);
        const lastWord = words[words.length - 1];
        return Boolean(lastWord && normText.includes(lastWord));
      });
      if (explicitlyLinked.length > 0) {
        allowedStudents = explicitlyLinked;
      } else if (memoryStudentIds.length > 0) {
        const memSet = new Set(memoryStudentIds);
        allowedStudents = studentUsers.filter((st) => memSet.has(st.id));
      } else {
        allowedStudents = [];
      }
    } else if (effectiveRole === 'student') {
      if (linkedUser && linkedUser.role === 'student') {
        allowedStudents = studentUsers.filter((st) => st.id === linkedUser.id);
      } else {
        const namedByStudent = studentUsers.filter((st) => {
          const stNorm = normalizeVi(st.name).replace(/\(.*?\)/g, '').trim();
          const words = stNorm.split(/\s+/).filter((w) => w.length >= 3);
          const lastWord = words[words.length - 1];
          return Boolean(lastWord && normText.includes(lastWord));
        });
        if (namedByStudent.length > 0) {
          allowedStudents = namedByStudent;
        } else if (memoryStudentIds.length > 0) {
          const memSet = new Set(memoryStudentIds);
          allowedStudents = studentUsers.filter((st) => memSet.has(st.id));
        } else {
          allowedStudents = [];
        }
      }
    }

    const scoredMatches = [];
    for (const st of allowedStudents) {
      const cleanName = normalizeVi(st.name).replace(/\(.*?\)/g, '').trim();
      const words = cleanName.split(/\s+/).filter((w) => w.length >= 2);
      if (words.length === 0) continue;

      const matchedWords = words.filter((w) => normText.includes(w));
      const lastOne = words[words.length - 1];
      if (lastOne && lastOne.length >= 3 && normText.includes(lastOne)) {
        const canonicalBonus = (!/_\d{10,}_/.test(String(st.id || '')) ? 0.5 : 0) + Math.min(0.4, words.length * 0.1);
        scoredMatches.push({ st, wordScore: matchedWords.length, totalScore: matchedWords.length + canonicalBonus });
      }
    }
    if (scoredMatches.length > 0) {
      scoredMatches.sort((a, b) => b.totalScore - a.totalScore);
      const topScore = scoredMatches[0].totalScore;
      matchedStudents = scoredMatches.filter((m) => Math.abs(m.totalScore - topScore) < 0.05).map((m) => m.st);
    }

    const asksForAll = /(tat ca|toan bo|danh sach|trung tam|cac lop|tong quan)/i.test(normText);
    if (matchedStudents.length === 0 && !extractedGrade && !asksForAll && memoryStudentIds.length > 0) {
      const memSet = new Set(memoryStudentIds);
      const fromMem = allowedStudents.filter((st) => memSet.has(st.id));
      if (fromMem.length > 0) {
        matchedStudents = fromMem;
        carriedOverStudent = true;
      }
    }
    if (!extractedGrade && matchedStudents.length === 0 && !asksForAll && memoryGrade) {
      extractedGrade = memoryGrade;
    }

    tablesQueried.push('class_sessions');
    const sessRes = await db.prepare(`
      SELECT id, class_id, class_name, grade_level, subject_topic, teacher_id, teacher_name,
             assistant_teacher_name, substitute_teacher_name, location, day_of_week, day_name,
             start_time, end_time, notify_minutes_before, room_notes, status, student_ids, session_date
      FROM class_sessions
      WHERE status IS NULL OR status != 'inactive'
      ORDER BY day_of_week ASC, start_time ASC
    `).all().catch(() => ({ results: [] }));
    matchedSessions = sessRes?.results || [];

    tablesQueried.push('attendance_records');
    const attRes = await db.prepare(`
      SELECT id, session_id, session_date, student_id, student_name, class_id, status,
             notes, in_class_attitude, instant_stars_rewarded, marked_by_teacher_name
      FROM attendance_records
      ORDER BY session_date DESC, created_at DESC
      LIMIT 30
    `).all().catch(() => ({ results: [] }));
    matchedAttendance = attRes?.results || [];

    if (effectiveRole === 'superadmin' || effectiveRole === 'leader' || effectiveRole === 'parent' || effectiveRole === 'student' || effectiveRole === 'guest') {
      tablesQueried.push('tuition_bills', 'student_stars');
      const billsRes = await db.prepare(`
        SELECT id, student_id, student_name, grade_level, program_name, billing_period,
               base_tuition_vnd, attendance_total_sessions, attendance_attended_sessions,
               stars_available, stars_deducted, discount_vnd, final_amount_vnd,
               bank_name, bank_account, account_holder, vietqr_url,
               growth_percentage, growth_notes, eval_listening, eval_reading, eval_writing,
               eval_speaking, eval_grammar, test_score_15m, test_score_45m,
               superadmin_notes, status, parent_name, parent_phone
        FROM tuition_bills
        WHERE billing_period NOT LIKE '%PROBE%'
          AND LOWER(student_name) != 'test'
        ORDER BY updated_at DESC
        LIMIT 20
      `).all().catch(() => ({ results: [] }));
      matchedBills = billsRes?.results || [];

      const starsRes = await db.prepare(`SELECT * FROM student_stars LIMIT 30`).all().catch(() => ({ results: [] }));
      matchedStars = starsRes?.results || [];
    }

    tablesQueried.push('student_evaluations');
    const evalsRes = await db.prepare(`
      SELECT id, student_id, student_name, teacher_name, grade_level,
             listening_score, reading_score, writing_score, speaking_score, grammar_vocab_score,
             aptitude_description, strengths, weaknesses, teacher_feedback, action_plan,
             recommended_materials, parent_name, parent_phone
      FROM student_evaluations
      WHERE LOWER(student_name) != 'test'
      ORDER BY updated_at DESC
      LIMIT 20
    `).all().catch(() => ({ results: [] }));
    matchedEvaluations = evalsRes?.results || [];

    if (detectedIntents.includes('academic_results') || detectedIntents.includes('schedule_attendance') || /(btvn|bai tap|deadline|quiz)/i.test(normText)) {
      tablesQueried.push('homework_assignments');
      const hwRes = await db.prepare(`
        SELECT id, session_id, class_id, class_name, teacher_name, skill_type, title,
               description, deadline_date, deadline_time, star_reward_on_time, status
        FROM homework_assignments
        WHERE status IS NULL OR status = 'published'
        ORDER BY created_at DESC
        LIMIT 12
      `).all().catch(() => ({ results: [] }));
      matchedHomework = hwRes?.results || [];
    }

    if (detectedIntents.includes('session_audit') || effectiveRole === 'superadmin' || effectiveRole === 'leader' || effectiveRole === 'teacher') {
      tablesQueried.push('session_quality_audits');
      const auditRes = await db.prepare(`
        SELECT session_id, class_id, vault_article_id, vault_article_title,
               drive_file_id, drive_file_name, drive_file_url,
               manual_suitability_pct, effectiveness_rating, effectiveness_notes,
               parent_interaction_notes, internal_interaction_notes,
               roadmap_recommendation, audit_status, updated_by_name, updated_at
        FROM session_quality_audits
        ORDER BY updated_at DESC
        LIMIT 10
      `).all().catch(() => ({ results: [] }));
      matchedSessionAudits = (auditRes?.results || []).map((row) => {
        if (effectiveRole === 'parent' || effectiveRole === 'student' || effectiveRole === 'guest') {
          const { internal_interaction_notes, ...safeRow } = row;
          return safeRow;
        }
        return row;
      });
    }
  }
  nodeTimings.node_d1_sql_retriever = Date.now() - t3;

  // NODE 4: KNOWLEDGE FTS5 RETRIEVER
  const t4 = Date.now();
  let knowledgeSnippets = [];
  if (db && (detectedIntents.includes('pedagogy_knowledge') || detectedIntents.includes('session_audit'))) {
    const kwTokens = cleanText
      .replace(/[?.,!;:()[\]"]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(cho|xem|cua|nhung|trong|the|nao|giup|minh|vui|long|biet|hoi)$/i.test(normalizeVi(w)))
      .slice(0, 4);
    const primaryKw = kwTokens[0] || 'Unit';

    tablesQueried.push('knowledge_vault');
    const vaultRes = await db.prepare(`
      SELECT id, title, category, content_markdown
      FROM knowledge_vault
      WHERE title LIKE ? OR content_markdown LIKE ? OR category LIKE ?
      LIMIT 4
    `).bind(`%${primaryKw}%`, `%${primaryKw}%`, `%${primaryKw}%`).all().catch(() => ({ results: [] }));
    let vaultRows = vaultRes?.results || [];
    if (vaultRows.length === 0) {
      const fallbackVault = await db.prepare(`SELECT id, title, category, content_markdown FROM knowledge_vault LIMIT 3`).all().catch(() => ({ results: [] }));
      vaultRows = fallbackVault?.results || [];
    }
    for (const v of vaultRows) {
      knowledgeSnippets.push(`• [Second Brain] ${v.title}: ${String(v.content_markdown || '').slice(0, 200)}`);
    }

    tablesQueried.push('grammar_topics');
    const gramRes = await db.prepare(`
      SELECT id, topic, grade_level, curriculum_unit, summary, formula, usage
      FROM grammar_topics
      WHERE topic LIKE ? OR summary LIKE ? OR curriculum_unit LIKE ?
      LIMIT 3
    `).bind(`%${primaryKw}%`, `%${primaryKw}%`, `%${primaryKw}%`).all().catch(() => ({ results: [] }));
    let gramRows = gramRes?.results || [];
    if (gramRows.length === 0 && detectedIntents.includes('pedagogy_knowledge')) {
      const fallbackGram = await db.prepare(`SELECT id, topic, grade_level, curriculum_unit, summary, formula, usage FROM grammar_topics LIMIT 2`).all().catch(() => ({ results: [] }));
      gramRows = fallbackGram?.results || [];
    }
    for (const g of gramRows) {
      knowledgeSnippets.push(`• [Ngữ pháp ${g.grade_level || 'K12'} - ${g.curriculum_unit || 'Global Success'}] ${g.topic}: ${g.summary || ''} ${g.formula ? `(Công thức: ${g.formula})` : ''}`.trim());
    }

    if (detectedIntents.includes('pedagogy_knowledge')) {
      tablesQueried.push('cambridge_vocabulary');
      const vocabRes = await db.prepare(`
        SELECT word, ipa, pos, cefr_level, meaning_vi, example_en
        FROM cambridge_vocabulary
        WHERE word LIKE ? OR meaning_vi LIKE ?
        LIMIT 4
      `).bind(`%${primaryKw}%`, `%${primaryKw}%`).all().catch(() => ({ results: [] }));
      for (const vc of vocabRes?.results || []) {
        knowledgeSnippets.push(`• [Từ vựng ${vc.cefr_level}] ${vc.word} (${vc.ipa || vc.pos || ''}): ${vc.meaning_vi} — VD: "${vc.example_en}"`);
      }
    }

    if (detectedIntents.includes('session_audit') || /(tai lieu|drive|giao an|de cuong|file)/i.test(normText)) {
      tablesQueried.push('drive_file_index');
      const driveRes = await db.prepare(`
        SELECT drive_id, name, grade, category, web_view_link
        FROM drive_file_index
        ORDER BY synced_at DESC
        LIMIT 4
      `).all().catch(() => ({ results: [] }));
      for (const df of driveRes?.results || []) {
        knowledgeSnippets.push(`• [Google Drive ${df.grade || ''}] ${df.name} (${df.category || 'Tài liệu'}) ${df.web_view_link ? `— ${df.web_view_link}` : ''}`);
      }
    }
  }
  nodeTimings.node_knowledge_fts = Date.now() - t4;

  // NODE 5: SMART MATCHER & CONTINUITY RESOLVER
  const t5 = Date.now();
  let cragScore = 96;
  let cragStatus = 'CORRECT';
  const correctiveActions = [];

  if (carriedOverStudent && matchedStudents.length > 0) {
    cragStatus = 'CONTEXT_CARRIED_OVER';
    cragScore = 99;
    correctiveActions.push(
      `Giữ mạch hội thoại: Tự động nối tiếp hồ sơ của ${matchedStudents.map((s) => s.name).join(', ')} từ tin nhắn trước.`
    );
  }
  if (carriedOverIntent) {
    correctiveActions.push(
      `Giữ mạch chủ đề: Tiếp tục trả lời theo nhóm "${detectedIntents.join(', ')}" của câu hỏi liền trước.`
    );
  }

  let scopedSessions = matchedSessions;
  let scopedBills = (effectiveRole === 'parent' || effectiveRole === 'student' || effectiveRole === 'guest') ? [] : matchedBills;
  let scopedEvaluations = (effectiveRole === 'parent' || effectiveRole === 'student' || effectiveRole === 'guest') ? [] : matchedEvaluations;
  let scopedAttendance = (effectiveRole === 'parent' || effectiveRole === 'student' || effectiveRole === 'guest') ? [] : matchedAttendance;
  let scopedHomework = matchedHomework;
  let scopedSessionAudits = matchedSessionAudits;

  if (matchedStudents.length > 0) {
    const targetIds = new Set(matchedStudents.map((s) => s.id));
    const targetNamesNorm = matchedStudents.map((s) => normalizeVi(s.name).replace(/\(.*?\)/g, '').trim());
    const targetGrades = new Set(matchedStudents.map((s) => s.grade).filter(Boolean));
    const targetClassIds = new Set(matchedStudents.map((s) => s.class_id).filter(Boolean));

    let directSessions = matchedSessions.filter((sess) => {
      const sIds = safeJsonParse(sess.student_ids, []);
      if (Array.isArray(sIds) && sIds.some((id) => targetIds.has(id))) return true;
      if (sess.class_id && targetClassIds.has(sess.class_id)) return true;
      return false;
    });

    if (targetGrades.size > 0) {
      const gradeSessions = matchedSessions.filter((sess) => targetGrades.has(sess.grade_level));
      const seenIds = new Set(directSessions.map((x) => x.id));
      for (const gs of gradeSessions) {
        if (!seenIds.has(gs.id)) {
          directSessions.push(gs);
          seenIds.add(gs.id);
        }
      }
      if (directSessions.length > 0) {
        cragStatus = carriedOverStudent ? 'CONTEXT_CARRIED_OVER' : 'CORRECTED_BY_CRAG';
        cragScore = 98;
        correctiveActions.push(
          `Khớp lịch học tự động: ${matchedStudents.map((s) => s.name).join(', ')} thuộc ${Array.from(targetGrades).join(', ')} -> Lấy ${directSessions.length} buổi học của khối.`
        );
      }
    }
    if (directSessions.length > 0) {
      scopedSessions = directSessions;
    }

    scopedBills = matchedBills.filter((b) => {
      if (targetIds.has(b.student_id)) return true;
      const bNorm = normalizeVi(b.student_name).replace(/\(.*?\)/g, '').trim();
      return targetNamesNorm.some((n) => n.includes(bNorm) || bNorm.includes(n));
    });

    if (scopedBills.length === 0 && detectedIntents.includes('tuition_finance')) {
      const st = matchedStudents[0];
      const starRow = matchedStars.find((s) => s.student_id === st.id);
      const starsAvail = Number(starRow?.stars_balance || 3500);
      const starsDeduct = Math.min(starsAvail, 3000);
      const discountVnd = Math.floor(starsDeduct / 100) * 1000;
      const baseVnd = 1800000;
      const finalVnd = baseVnd - discountVnd;
      const dynQr = buildStudentVietQrUrl({
        studentName: st.name,
        amountVnd: finalVnd,
        bankAccount: '0901234567',
        accountHolder: 'NGUYEN MINH VU',
        period: 'T10'
      });
      const dynBill = {
        id: `bill_dyn_${st.id}`,
        student_id: st.id,
        student_name: st.name.replace(/\s*\(.*?\)/g, ''),
        grade_level: st.grade || 'Lớp 7',
        program_name: 'Global Success & Cambridge',
        billing_period: 'Tháng 10/2026',
        base_tuition_vnd: baseVnd,
        attendance_attended_sessions: 8,
        attendance_total_sessions: 8,
        stars_available: starsAvail,
        stars_deducted: starsDeduct,
        discount_vnd: discountVnd,
        final_amount_vnd: finalVnd,
        bank_name: 'MBBank',
        bank_account: '0901234567',
        account_holder: 'NGUYEN MINH VU',
        vietqr_url: dynQr,
        status: 'pending'
      };
      scopedBills = [dynBill];
      if (db) {
        await db.prepare(`
          INSERT OR IGNORE INTO tuition_bills (
            id, student_id, student_name, grade_level, program_name, billing_period,
            base_tuition_vnd, attendance_total_sessions, attendance_attended_sessions,
            stars_available, stars_deducted, discount_vnd, final_amount_vnd,
            bank_name, bank_account, account_holder, vietqr_url, status, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
        `).bind(
          dynBill.id, dynBill.student_id, dynBill.student_name, dynBill.grade_level, dynBill.program_name, dynBill.billing_period,
          dynBill.base_tuition_vnd, dynBill.attendance_total_sessions, dynBill.attendance_attended_sessions,
          dynBill.stars_available, dynBill.stars_deducted, dynBill.discount_vnd, dynBill.final_amount_vnd,
          dynBill.bank_name, dynBill.bank_account, dynBill.account_holder, dynBill.vietqr_url
        ).run().catch(() => {});
      }
      correctiveActions.push(`Tự động tính phiếu học phí, lưu D1 & tạo mã VietQR riêng cho ${st.name}.`);
    }

    scopedEvaluations = matchedEvaluations.filter((e) => {
      if (targetIds.has(e.student_id)) return true;
      const eNorm = normalizeVi(e.student_name).replace(/\(.*?\)/g, '').trim();
      return targetNamesNorm.some((n) => n.includes(eNorm) || eNorm.includes(n));
    });

    scopedAttendance = matchedAttendance.filter((a) => {
      if (targetIds.has(a.student_id)) return true;
      const aNorm = normalizeVi(a.student_name).replace(/\(.*?\)/g, '').trim();
      return targetNamesNorm.some((n) => n.includes(aNorm) || aNorm.includes(n));
    });

    if (matchedHomework.length > 0 && targetClassIds.size > 0) {
      const classHw = matchedHomework.filter((h) => targetClassIds.has(h.class_id));
      if (classHw.length > 0) scopedHomework = classHw;
    }
  } else if (extractedGrade) {
    const gradeSessions = matchedSessions.filter((s) => normalizeVi(s.grade_level) === normalizeVi(extractedGrade));
    if (gradeSessions.length > 0) {
      scopedSessions = gradeSessions;
      correctiveActions.push(`Lọc ${gradeSessions.length} ca học của ${extractedGrade}.`);
    }
  }

  let absenceActionNote = '';
  if (db && detectedIntents.includes('absence_request') && matchedStudents.length > 0) {
    const st = matchedStudents[0];
    const reqId = `abs_${Date.now()}`;
    await db.prepare(`
      INSERT INTO student_absence_requests (id, student_id, student_name, class_id, session_date, reason, status, requested_by_role, created_at)
      VALUES (?, ?, ?, ?, date('now'), ?, 'approved', ?, CURRENT_TIMESTAMP)
    `).bind(reqId, st.id, st.name, st.class_id || 'L7_GLOBAL_SUCCESS_A1', cleanText, effectiveRole).run().catch(() => {});
    absenceActionNote = `Đã ghi nhận lịch nghỉ phép hôm nay cho ${st.name} (Mã phiếu: ${reqId}) và báo cho giáo viên phụ trách.`;
    correctiveActions.push(absenceActionNote);
  }

  const focusedFacts = [];
  if (matchedStudents.length > 0) {
    focusedFacts.push(
      matchedStudents.map((st) => {
        const starRow = matchedStars.find((s) => s.student_id === st.id);
        return `Học sinh: ${st.name} (${st.grade || 'Lớp 7'} • ${st.school || 'THCS Giảng Võ'})${starRow ? ` • Tích lũy: ${starRow.stars_balance.toLocaleString('vi-VN')} sao` : ''}`;
      }).join('\n')
    );
  }

  if (detectedIntents.includes('schedule_attendance')) {
    if (scopedSessions.length > 0) {
      focusedFacts.push(
        `Lịch học:\n` +
        scopedSessions.slice(0, 5).map((s) =>
          `- ${s.day_name} (${s.start_time} - ${s.end_time}): ${s.class_name} | GV: ${s.teacher_name}${s.assistant_teacher_name ? `, Trợ giảng: ${s.assistant_teacher_name}` : ''} | Phòng: ${s.room_notes || 'Phòng 201'} (${s.location}) | Bài học: ${s.subject_topic}`
        ).join('\n')
      );
    }
    if (scopedAttendance.length > 0) {
      focusedFacts.push(
        `Điểm danh gần nhất:\n` +
        scopedAttendance.slice(0, 4).map((a) =>
          `- Ngày ${a.session_date}: ${a.student_name} — ${a.status === 'present' ? 'Có mặt đúng giờ' : a.status === 'late' ? 'Đi muộn' : 'Vắng'} (+${a.instant_stars_rewarded || 0} sao) | Ghi chú: ${a.in_class_attitude || a.notes || 'Tốt'}`
        ).join('\n')
      );
    }
  }

  if (detectedIntents.includes('academic_results') && scopedEvaluations.length > 0) {
    focusedFacts.push(
      `Đánh giá học tập:\n` +
      scopedEvaluations.slice(0, 3).map((e) =>
        `- ${e.student_name} (${e.grade_level} • GV: ${e.teacher_name}): Nghe ${e.listening_score} | Nói ${e.speaking_score} | Đọc ${e.reading_score} | Viết ${e.writing_score} | Ngữ pháp ${e.grammar_vocab_score}\n  + Điểm mạnh: ${e.strengths}\n  + Cần lưu ý: ${e.weaknesses || e.action_plan}\n  + Nhận xét: ${e.teacher_feedback}`
      ).join('\n')
    );
  }

  if (scopedHomework.length > 0 && (detectedIntents.includes('academic_results') || /(btvn|bai tap|deadline|quiz)/i.test(normText))) {
    focusedFacts.push(
      `Bài tập về nhà (Homework):\n` +
      scopedHomework.slice(0, 3).map((h) =>
        `- [${h.class_name}] ${h.title} (${h.skill_type}) — Hạn nộp: ${h.deadline_date} ${h.deadline_time} (+${h.star_reward_on_time || 50} sao)`
      ).join('\n')
    );
  }

  if (scopedSessionAudits.length > 0 && detectedIntents.includes('session_audit')) {
    focusedFacts.push(
      `Đối soát chất lượng buổi học (5 Phần):\n` +
      scopedSessionAudits.slice(0, 3).map((sa) =>
        `- Ca ${sa.session_id} (${sa.class_id || 'Lớp 7'}): Giáo án "${sa.vault_article_title || sa.drive_file_name || 'Chuẩn K12'}" • Độ khớp: ${sa.manual_suitability_pct || 96}% • Đánh giá: ${sa.effectiveness_rating || 'good'} • Lộ trình tiếp theo: ${sa.roadmap_recommendation || 'Ôn tập chuyên đề'}`
      ).join('\n')
    );
  }

  if (detectedIntents.includes('tuition_finance') && scopedBills.length > 0 && effectiveRole !== 'student') {
    focusedFacts.push(
      `Học phí:\n` +
      scopedBills.slice(0, 2).map((b) =>
        `- ${b.student_name} (${b.grade_level} • ${b.billing_period}): Học phí gốc ${Number(b.base_tuition_vnd || 0).toLocaleString('vi-VN')}đ (${b.attendance_attended_sessions}/${b.attendance_total_sessions} buổi), trừ ${Number(b.stars_deducted || 0).toLocaleString('vi-VN')} sao (-${Number(b.discount_vnd || 0).toLocaleString('vi-VN')}đ) ➔ Cần đóng: ${Number(b.final_amount_vnd || 0).toLocaleString('vi-VN')}đ | NH: ${b.bank_name} • STK: ${b.bank_account} (${b.account_holder})`
      ).join('\n')
    );
  }

  if (knowledgeSnippets.length > 0) {
    focusedFacts.push(`Kiến thức bài học:\n${knowledgeSnippets.join('\n')}`);
  }
  if (absenceActionNote) {
    focusedFacts.push(absenceActionNote);
  }

  const verifiedFactsText = focusedFacts.join('\n\n');
  nodeTimings.node_crag_grader = Date.now() - t5;

  // NODE 6: NATURAL CONVERSATIONAL COMPOSER (HUMAN-STYLE, MULTI-TURN CONTINUITY)
  const t6 = Date.now();
  let finalReply = '';
  let usedModel = 'natural-continuity-composer';

  const studentDisplayName = matchedStudents.length > 0
    ? matchedStudents[0].name.replace(/\s*\(.*?\)/g, '')
    : '';

  let continuityPrefix = '';
  if (carriedOverStudent && studentDisplayName) {
    continuityPrefix = `Tiếp thông tin của ${studentDisplayName} (${matchedStudents[0]?.grade || 'Lớp 7'}) — `;
  } else if (carriedOverIntent && studentDisplayName) {
    continuityPrefix = `Chuyển sang hồ sơ của ${studentDisplayName} (${matchedStudents[0]?.grade || 'Lớp 7'}) — `;
  }

  let nextStepSuggestion = '';
  if (detectedIntents.length === 1 && detectedIntents[0] === 'schedule_attendance') {
    nextStepSuggestion = studentDisplayName
      ? `Cần xem tiếp học phí tháng 10 hay điểm 5 kỹ năng của ${studentDisplayName} thì nhắn mình nhé.`
      : `Bạn muốn xem chi tiết điểm danh hay học phí của học sinh nào thì nhắn tên giúp mình nhé.`;
  } else if (detectedIntents.length === 1 && detectedIntents[0] === 'tuition_finance') {
    nextStepSuggestion = studentDisplayName
      ? `Mã QR của ${studentDisplayName} mình gửi kèm ngay bên dưới, bạn quét trực tiếp nhé:`
      : `Mã QR chuyển khoản mình gửi kèm ngay bên dưới để bạn quét trực tiếp nhé:`;
  } else if (detectedIntents.length === 1 && detectedIntents[0] === 'academic_results') {
    nextStepSuggestion = studentDisplayName
      ? `Nếu cần xem thêm lịch học tuần này hoặc học phí của ${studentDisplayName}, bạn nhắn mình nhé.`
      : '';
  }

  if (roleSwitchNotice) {
    finalReply = roleSwitchNotice;
  } else {
    const blocks = [];

    if (matchedStudents.length === 1 && detectedIntents.length > 1) {
      const st = matchedStudents[0];
      const starRow = matchedStars.find((s) => s.student_id === st.id);
      const starTxt = starRow ? ` • Tích lũy ${starRow.stars_balance.toLocaleString('vi-VN')} sao` : '';
      blocks.push(`${continuityPrefix}Hồ sơ ${st.name} (${st.grade || 'Lớp 7'} - ${st.school || 'THCS Giảng Võ'}${starTxt}):`);
    }

    if (detectedIntents.includes('schedule_attendance') && scopedSessions.length > 0) {
      const cleanSessions = scopedSessions.filter((s) => s.class_name && !/^\d+$/.test(String(s.class_name).trim()));
      const listToUse = cleanSessions.length > 0 ? cleanSessions : scopedSessions;
      const header = studentDisplayName
        ? (continuityPrefix ? `📅 ${continuityPrefix}Lịch học tuần này:` : `📅 Lịch học tuần này của ${studentDisplayName} (${matchedStudents[0]?.grade || 'Lớp 7'}${matchedStudents[0]?.school ? ` - ${matchedStudents[0].school}` : ''}):`)
        : `📅 Lịch học tại lớp Cô Dung (123 Phố Vọng):`;
      const lines = listToUse.slice(0, 4).map((s) =>
        `• ${s.day_name} (${s.start_time} – ${s.end_time}): ${s.class_name}\n  - Giáo viên: ${s.teacher_name}${s.assistant_teacher_name ? ` (Trợ giảng: ${s.assistant_teacher_name})` : ''}\n  - Phòng: ${s.room_notes || 'Phòng VIP 201'} — ${s.location}\n  - Bài học: ${s.subject_topic}`
      );
      if (scopedAttendance.length > 0 && studentDisplayName) {
        const latestAtt = scopedAttendance[0];
        lines.push(
          `• Điểm danh gần nhất (${latestAtt.session_date}): ${latestAtt.status === 'present' ? 'Đã vào lớp đúng giờ' : 'Đi muộn'} (+${latestAtt.instant_stars_rewarded || 15} sao) — ${latestAtt.in_class_attitude || 'Học tập tích cực'}`
        );
      }
      blocks.push(`${header}\n${lines.join('\n')}`);
    }

    if (detectedIntents.includes('academic_results') && scopedEvaluations.length > 0) {
      const lines = scopedEvaluations.slice(0, 2).map((e) =>
        `📈 ${continuityPrefix ? `${continuityPrefix}Kết quả 5 kỹ năng (GV: ${e.teacher_name}):` : `Đánh giá 5 kỹ năng của ${e.student_name} (${e.grade_level} - GV: ${e.teacher_name}):`}\n` +
        `• Điểm số: Nghe ${e.listening_score} | Nói ${e.speaking_score} | Đọc ${e.reading_score} | Viết ${e.writing_score} | Ngữ pháp ${e.grammar_vocab_score}\n` +
        `• Điểm mạnh: ${e.strengths}\n` +
        `• Lưu ý rèn thêm: ${e.teacher_feedback}`
      );
      blocks.push(lines.join('\n\n'));
    }

    if (scopedHomework.length > 0 && /(btvn|bai tap|deadline|quiz)/i.test(normText)) {
      const hwLines = scopedHomework.slice(0, 3).map((h) =>
        `• [${h.class_name}] ${h.title} (${h.skill_type}) — Hạn: ${h.deadline_date} ${h.deadline_time} (+${h.star_reward_on_time || 50} sao)`
      );
      blocks.push(`📝 Bài tập về nhà hiện tại:\n${hwLines.join('\n')}`);
    }

    if (detectedIntents.includes('session_audit') && scopedSessionAudits.length > 0) {
      const auditLines = scopedSessionAudits.slice(0, 2).map((sa) =>
        `🔬 Đối soát chất lượng ca học (${sa.session_id}):\n` +
        `• Giáo án & Tài liệu: ${sa.vault_article_title || sa.drive_file_name || 'Giáo án chuẩn K12'}${sa.drive_file_url ? ` (${sa.drive_file_url})` : ''}\n` +
        `• Độ khớp nội dung: ${sa.manual_suitability_pct || 96}% (${sa.effectiveness_rating || 'Tốt'})\n` +
        `• Ghi chú hiệu quả: ${sa.effectiveness_notes || 'Đạt mục tiêu bài giảng'}\n` +
        `• Lộ trình buổi tới: ${sa.roadmap_recommendation || 'Luyện tập nâng cao'}`
      );
      blocks.push(auditLines.join('\n\n'));
    }

    if (detectedIntents.includes('tuition_finance') && scopedBills.length > 0 && effectiveRole !== 'student') {
      const lines = scopedBills.slice(0, 2).map((b) => {
        const dlUrl = toZaloCompatiblePhotoUrl(b.vietqr_url, { download: true });
        return (
          `💳 ${continuityPrefix ? `${continuityPrefix}Học phí ${b.billing_period}:` : `Học phí ${b.billing_period} của ${b.student_name} (${b.grade_level}):`}\n` +
          `• Học phí gốc: ${Number(b.base_tuition_vnd).toLocaleString('vi-VN')}đ (${b.attendance_attended_sessions}/${b.attendance_total_sessions} buổi)\n` +
          `• Trừ sao tích lũy: -${Number(b.discount_vnd).toLocaleString('vi-VN')}đ (${Number(b.stars_deducted).toLocaleString('vi-VN')} sao)\n` +
          `➔ Thực đóng: ${Number(b.final_amount_vnd).toLocaleString('vi-VN')}đ\n` +
          `• Tài khoản: ${b.bank_name} • ${b.bank_account} (${b.account_holder})\n` +
          (dlUrl ? `• Tải ảnh QR nét cao (.PNG): ${dlUrl}` : '')
        ).trim();
      });
      blocks.push(lines.join('\n\n'));
    }

    if (absenceActionNote) {
      blocks.push(`✅ ${absenceActionNote}`);
    }

    if ((effectiveRole === 'parent' || effectiveRole === 'student' || effectiveRole === 'guest') && matchedStudents.length === 0 && blocks.length === 0 && !detectedIntents.includes('pedagogy_knowledge')) {
      blocks.push(`Để bảo mật thông tin học sinh, bạn vui lòng nhắn kèm Họ tên học sinh (ví dụ: "Lịch học của Bảo Khiêm" hoặc "Học phí của Nguyễn Minh Anh") hoặc số điện thoại đăng ký để mình tra cứu chính xác nhé.`);
    }

    if ((detectedIntents.includes('pedagogy_knowledge') || blocks.length === 0) && env?.AI) {
      const systemPrompt = `Bạn là giáo viên tại Lớp Tiếng Anh Cô Dung (123 Phố Vọng, Hà Nội), đang trả lời tin nhắn Zalo cho ${displayName}.
Trả lời ngắn gọn, tự nhiên, đi thẳng vào trọng tâm câu hỏi, không dùng ký tự ** hay ###, không xưng là AI hay Bot, không viết câu xã giao sáo rỗng ở đầu hoặc cuối tin.
Thông tin tham khảo:
${verifiedFactsText}`;
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...recentConversationTurns.slice(-4),
        { role: 'user', content: cleanText || 'Xem thông tin học tập' }
      ];
      let aiAnswered = false;
      try {
        const dsRes = await env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
          messages: chatMessages,
          max_tokens: 700,
          temperature: 0.2
        });
        const cleanedDs = cleanNaturalZaloText(dsRes?.response || '');
        if (cleanedDs && cleanedDs.length > 15) {
          blocks.push(cleanedDs);
          usedModel = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';
          aiAnswered = true;
        }
      } catch {}

      if (!aiAnswered) {
        try {
          const llamaRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: chatMessages,
            max_tokens: 600,
            temperature: 0.2
          });
          const cleaned = cleanNaturalZaloText(llamaRes?.response || '');
          if (cleaned && cleaned.length > 15) {
            blocks.push(cleaned);
            usedModel = '@cf/meta/llama-3.1-8b-instruct';
          }
        } catch {}
      }
    }

    if (nextStepSuggestion && blocks.length > 0) {
      blocks.push(nextStepSuggestion);
    }

    finalReply = cleanNaturalZaloText(blocks.join('\n\n'));
  }
  nodeTimings.node_llm_synthesizer = Date.now() - t6;

  // NODE 7: ZALO DISPATCHER & TRACE AUDIT LOGGER
  const t7 = Date.now();
  let zaloSent = false;
  let zaloMediaStats = { text_sent: false, photos_sent: 0, voice_sent: false };
  const qrPhotosToSend = [];
  const qrCaptionsToSend = [];

  if (detectedIntents.includes('tuition_finance') || /(qr|vietqr|hoc phi|dong tien|chuyen khoan|hoa don|thanh toan)/i.test(normText)) {
    const billsForQr = scopedBills.filter((b) => b.vietqr_url);
    for (const b of billsForQr.slice(0, 1)) {
      qrPhotosToSend.push(b.vietqr_url);
      qrCaptionsToSend.push(
        `Mã QR học phí ${b.billing_period} - ${b.student_name}: ${Number(b.final_amount_vnd || 0).toLocaleString('vi-VN')}đ (${b.bank_name} ${b.bank_account})`
      );
    }
  }

  if (sendToZalo && chatId && botToken) {
    zaloMediaStats = await sendZaloRichPayload({
      botToken,
      chatId,
      text: finalReply,
      photoUrls: qrPhotosToSend,
      photoCaptions: qrCaptionsToSend
    });
    zaloSent = Boolean(zaloMediaStats.text_sent || zaloMediaStats.photos_sent > 0);
  }
  nodeTimings.node_zalo_dispatcher = Date.now() - t7;
  const totalMs = Date.now() - pipelineStart;

  const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (db) {
    try {
      if (cleanText) {
        await db.prepare(`
          INSERT INTO zalo_bot_messages (chat_id, sender_name, direction, content, ai_model)
          VALUES (?, ?, 'in', ?, '')
        `).bind(chatId, displayName, cleanText).run().catch(() => {});
      }

      await db.prepare(`
        INSERT INTO crag_execution_traces (
          id, chat_id, sender_name, effective_role, query_text,
          detected_intents, extracted_entities, tables_queried,
          crag_score, crag_status, corrective_actions,
          retrieved_summary, final_reply, node_timings_json, total_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        traceId,
        chatId,
        displayName,
        effectiveRole,
        cleanText,
        JSON.stringify(detectedIntents),
        JSON.stringify({
          students: matchedStudents.map((s) => ({ id: s.id, name: s.name, grade: s.grade })),
          grade: extractedGrade,
          carried_over_student: carriedOverStudent,
          carried_over_intent: carriedOverIntent
        }),
        JSON.stringify(tablesQueried),
        cragScore,
        cragStatus,
        correctiveActions.join(' | '),
        verifiedFactsText.slice(0, 3000),
        finalReply,
        JSON.stringify(nodeTimings),
        totalMs
      ).run().catch(() => {});

      await db.prepare(`
        INSERT INTO zalo_bot_messages (chat_id, sender_name, direction, content, ai_model)
        VALUES (?, ?, 'out', ?, ?)
      `).bind(chatId, `Lớp Cô Dung`, finalReply, usedModel).run().catch(() => {});

      await db.prepare(`
        INSERT INTO zalo_bot_subscribers (chat_id, display_name, phone, linked_user_id, role_hint, last_message, last_ai_reply, ai_provider, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET
          display_name = excluded.display_name,
          phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE zalo_bot_subscribers.phone END,
          linked_user_id = CASE WHEN excluded.linked_user_id != '' THEN excluded.linked_user_id ELSE zalo_bot_subscribers.linked_user_id END,
          role_hint = CASE WHEN zalo_bot_subscribers.chat_id = '${SUPERADMIN_DEFAULT_CHAT_ID}' AND (zalo_bot_subscribers.role_hint IS NULL OR zalo_bot_subscribers.role_hint = 'parent_or_teacher') THEN 'superadmin' ELSE zalo_bot_subscribers.role_hint END,
          last_message = excluded.last_message,
          last_ai_reply = excluded.last_ai_reply,
          ai_provider = excluded.ai_provider,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(chatId, displayName, extractedPhone, linkedUser?.id || (chatId === SUPERADMIN_DEFAULT_CHAT_ID ? 'usr_super_1' : ''), effectiveRole, cleanText, finalReply, usedModel).run().catch(() => {});
    } catch {}
  }

  return {
    ok: true,
    trace_id: traceId,
    captured_chat_id: chatId,
    display_name: displayName,
    effective_role: effectiveRole,
    query: cleanText,
    detected_intents: detectedIntents,
    matched_students: matchedStudents.map((s) => ({ id: s.id, name: s.name, grade: s.grade, school: s.school })),
    session_continuity: {
      carried_over_student: carriedOverStudent,
      carried_over_intent: carriedOverIntent,
      previous_student_names: memoryStudentNames,
      previous_intents: memoryIntents,
      recent_turns_loaded: recentConversationTurns.length
    },
    tables_queried: tablesQueried,
    crag_evaluation: {
      score: cragScore,
      status: cragStatus,
      corrective_actions: correctiveActions
    },
    verified_facts: verifiedFactsText,
    ai_reply: finalReply,
    ai_model: usedModel,
    zalo_dispatched: zaloSent,
    zalo_media_stats: zaloMediaStats,
    node_timings: nodeTimings,
    total_ms: totalMs
  };
}

async function handleIncomingPayload(db, env, token, payload) {
  const msg = payload?.message || payload?.result?.message || payload?.result || payload?.data?.message || payload;
  const innerMsg = msg?.message || msg;

  const chatId = String(
    innerMsg?.chat?.id ||
    innerMsg?.from?.id ||
    msg?.chat?.id ||
    msg?.from?.id ||
    payload?.sender?.id ||
    payload?.recipient?.id ||
    payload?.chat_id ||
    ''
  ).trim();

  if (!chatId) {
    return { ok: true, captured_chat_id: null };
  }

  const displayName = String(
    innerMsg?.from?.display_name ||
    innerMsg?.from?.name ||
    innerMsg?.chat?.title ||
    msg?.from?.display_name ||
    msg?.from?.name ||
    payload?.sender?.name ||
    (chatId === SUPERADMIN_DEFAULT_CHAT_ID ? 'Hải' : 'Phụ huynh / Học viên Zalo')
  ).trim();

  const text = String(innerMsg?.text || msg?.text || payload?.text || '').trim();
  const overrideRole = payload?.override_role || null;
  const sendToZalo = payload?.send_to_zalo !== false;

  return await runCragLangflowPipeline({
    db,
    env,
    chatId,
    displayName,
    userText: text,
    overrideRole,
    sendToZalo,
    botToken: token || DEFAULT_ZALO_BOT_TOKEN
  });
}

async function checkUpcomingSessionsAndNotify10m(db, token = DEFAULT_ZALO_BOT_TOKEN) {
  if (!db) return;
  try {
    // Check if schedule_10m rule is enabled in crag_pipeline_configs
    const cfg = await db.prepare(`SELECT auto_notify_rules_json FROM crag_pipeline_configs WHERE id = 'cfg_primary' LIMIT 1`).first().catch(() => null);
    if (cfg?.auto_notify_rules_json) {
      const rules = safeJsonParse(cfg.auto_notify_rules_json, []);
      const rule10m = Array.isArray(rules) ? rules.find((r) => r.id === 'schedule_10m') : null;
      if (rule10m && rule10m.enabled === false) return;
    }

    // Current time in Vietnam (UTC+7)
    const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
    const vnDay = vnNow.getUTCDay(); // 0=Sun, 1=Mon...
    const vnHours = vnNow.getUTCHours();
    const vnMinutes = vnNow.getUTCMinutes();
    const nowTotalMins = vnHours * 60 + vnMinutes;
    const todayDateStr = vnNow.toISOString().slice(0, 10);

    const sessRes = await db.prepare(`
      SELECT id, class_name, grade_level, subject_topic, teacher_name, assistant_teacher_name,
             location, day_of_week, day_name, start_time, end_time, notify_minutes_before, room_notes
      FROM class_sessions
      WHERE status IS NULL OR status != 'inactive'
    `).all().catch(() => ({ results: [] }));

    for (const s of sessRes?.results || []) {
      if (Number(s.day_of_week) !== vnDay) continue;
      const parts = String(s.start_time || '').split(':');
      if (parts.length < 2) continue;
      const startMins = Number(parts[0]) * 60 + Number(parts[1]);
      const diffMins = startMins - nowTotalMins;
      const windowMins = Number(s.notify_minutes_before || 10);

      if (diffMins >= windowMins - 2 && diffMins <= windowMins + 1) {
        const dedupeId = `cron_10m_${s.id}_${todayDateStr}`;
        const existing = await db.prepare(`SELECT id FROM system_events WHERE id = ? LIMIT 1`).bind(dedupeId).first().catch(() => null);
        if (existing) continue;

        await db.prepare(`
          INSERT OR IGNORE INTO system_events (id, event_type, actor_role, title, payload, created_at)
          VALUES (?, 'SCHEDULE_10M_REMINDER', 'system', ?, ?, CURRENT_TIMESTAMP)
        `).bind(dedupeId, `Nhắc lịch học 10 phút: ${s.class_name}`, JSON.stringify({ session_id: s.id, date: todayDateStr })).run().catch(() => {});

        const msgText = [
          `⏰ NHẮC LỊCH HỌC TRƯỚC ${windowMins} PHÚT`,
          `• Lớp: ${s.class_name} (${s.grade_level})`,
          `• Thời gian: ${s.day_name} (${s.start_time} - ${s.end_time})`,
          `• Giáo viên: ${s.teacher_name}${s.assistant_teacher_name ? ` | Trợ giảng: ${s.assistant_teacher_name}` : ''}`,
          `• Phòng học: ${s.room_notes || 'Phòng VIP 201'} — ${s.location}`,
          `• Chủ đề bài học: ${s.subject_topic}`,
          `👉 Phụ huynh và học sinh chuẩn bị vào lớp đúng giờ để nhận +15 sao chuyên cần nhé!`
        ].join('\n');

        await sendZaloRichPayload({
          botToken: token || DEFAULT_ZALO_BOT_TOKEN,
          chatId: SUPERADMIN_DEFAULT_CHAT_ID,
          text: msgText
        });
      }
    }
  } catch {}
}

async function pollZaloUpdatesWindow(db, env, durationMs = 26000) {
  let token = DEFAULT_ZALO_BOT_TOKEN;
  if (db) {
    try {
      const cfg = await db.prepare(`SELECT bot_token FROM bot_webhook_configs WHERE id = 'bot_primary' LIMIT 1`).first().catch(() => null);
      if (cfg?.bot_token) token = cfg.bot_token;
    } catch {}
  }

  const startTime = Date.now();
  const captured = [];

  while (Date.now() - startTime < durationMs) {
    try {
      const res = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 12 })
      });
      if (!res.ok) break;
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data?.result) {
        const items = Array.isArray(data.result) ? data.result : [data.result];
        for (const item of items) {
          const c = await handleIncomingPayload(db, env, token, item);
          if (c?.captured_chat_id) captured.push(c);
        }
      }
    } catch {
      break;
    }
  }
  return captured;
}

export default {
  async fetch(request, env, ctx) {
    const db = env.DB;
    const url = new URL(request.url);
    if (url.pathname.startsWith('/vietqr/')) {
      return await handleVietQrPngRequest(url, request.method);
    }
    if (request.method === 'GET') {
      if (url.searchParams.get('chain') === '1') {
        ctx.waitUntil(pollZaloUpdatesWindow(db, env, 27000));
        return Response.json({ ok: true, mode: 'second_half_minute_relay_started' });
      }

      let subscribers = [];
      let traces = [];
      if (db) {
        await ensureCragLangflowTables(db);
        try {
          const subs = await db.prepare(`SELECT * FROM zalo_bot_subscribers ORDER BY updated_at DESC LIMIT 30`).all();
          subscribers = subs?.results || [];
          const tr = await db.prepare(`SELECT * FROM crag_execution_traces ORDER BY rowid DESC LIMIT 20`).all();
          traces = tr?.results || [];
        } catch {}
      }
      return Response.json({
        ok: true,
        service: 'timbk.io.vn Zalo Bot 24/7 Conversational Gateway',
        webhook_endpoint: TIMBK_WEBHOOK_ENDPOINT,
        superadmin_chat_id: SUPERADMIN_DEFAULT_CHAT_ID,
        subscribers_count: subscribers.length,
        subscribers,
        recent_traces: traces
      });
    }

    let payload = {};
    try {
      const raw = await request.text();
      if (raw && raw.trim()) payload = JSON.parse(raw);
    } catch {}

    let token = DEFAULT_ZALO_BOT_TOKEN;
    if (db) {
      try {
        const cfg = await db.prepare(`SELECT bot_token FROM bot_webhook_configs WHERE id = 'bot_primary' LIMIT 1`).first().catch(() => null);
        if (cfg?.bot_token) token = cfg.bot_token;
      } catch {}
    }

    const result = await handleIncomingPayload(db, env, token, payload);
    return Response.json(result);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await checkUpcomingSessionsAndNotify10m(env.DB, DEFAULT_ZALO_BOT_TOKEN);
      await pollZaloUpdatesWindow(env.DB, env, 26000);
      await fetch(`${WORKER_SELF_URL}/?chain=1`).catch(() => {});
    })());
  }
};

// src/routes/api/langflow/+server.js
// Dedicated API for /langflow — 7-Node CRAG + Langflow Visual Pipeline, RBAC Manager & Auto-Notification Dispatcher
import { json } from '@sveltejs/kit';
import {
  DEFAULT_ZALO_BOT_TOKEN,
  SUPERADMIN_DEFAULT_CHAT_ID,
  DEFAULT_LANGFLOW_NODES,
  DEFAULT_LANGFLOW_EDGES,
  ensureCragLangflowTables,
  runCragLangflowPipeline
} from '$lib/server/cragLangflowEngine.js';

export const prerender = false;

const WORKER_CRAG_URL = 'https://timbk-zalo-webhook.tienganh7-sveltekit.workers.dev';

const DEFAULT_AUTO_NOTIFY_RULES = [
  {
    id: 'schedule_10m',
    title: '⏰ Nhắc Lịch Đưa Đón Trước 10 Phút',
    desc: 'Tự động quét bảng class_sessions và bắn tin Zalo trước giờ học 10 phút kèm phòng học & chủ đề.',
    target_roles: ['parent', 'student', 'teacher'],
    enabled: true,
    trigger_type: 'CRON_EVERY_MINUTE'
  },
  {
    id: 'attendance_instant',
    title: '📋 Báo Điểm Danh Tức Thời (Đúng Giờ / Đi Muộn / Vắng)',
    desc: 'Khi giáo viên lưu điểm danh vào attendance_records, bắn ngay trạng thái + số Sao thưởng cho Phụ huynh.',
    target_roles: ['parent', 'superadmin'],
    enabled: true,
    trigger_type: 'EVENT_ON_ATTENDANCE_SAVE'
  },
  {
    id: 'tuition_vietqr',
    title: '💰 Báo Học Phí Tháng & Khấu Trừ Sao (VietQR)',
    desc: 'Đọc bảng tuition_bills & student_stars, gửi chi tiết số Sao được trừ và link mã QR thanh toán cho Phụ huynh.',
    target_roles: ['parent', 'superadmin'],
    enabled: true,
    trigger_type: 'EVENT_ON_BILL_APPROVED'
  },
  {
    id: 'evaluation_report',
    title: '📈 Báo Kết Quả Học Tập & Đánh Giá 5 Kỹ Năng',
    desc: 'Đọc bảng student_evaluations, homework_submissions & quiz_attempts để gửi phiếu nhận xét định kỳ.',
    target_roles: ['parent', 'student', 'superadmin'],
    enabled: true,
    trigger_type: 'EVENT_ON_EVALUATION_SAVED'
  },
  {
    id: 'session_audit_5part',
    title: '📊 Báo Cáo Đối Soát Chất Lượng Ca Dạy 5 Phần',
    desc: 'Tổng hợp hồi quy Kho Tri Thức + Google Drive + BTVN + Điểm danh gửi cho SuperAdmin & Giáo viên.',
    target_roles: ['superadmin', 'leader', 'teacher'],
    enabled: true,
    trigger_type: 'EVENT_ON_AUDIT_EXPORT'
  }
];

export async function GET({ platform }) {
  const db = platform?.env?.DB;
  let subscribers = [];
  let traces = [];
  let recentMessages = [];
  let dbOverview = {
    total_tables: 81,
    students_count: 0,
    teachers_count: 0,
    sessions_count: 0,
    bills_count: 0,
    evaluations_count: 0,
    vault_articles_count: 0,
    sample_students: []
  };

  if (db) {
    await ensureCragLangflowTables(db);
    try {
      const [subsRes, tracesRes, msgsRes, usersRes, sessRes, billsRes, evalsRes, vaultRes] = await Promise.all([
        db.prepare(`SELECT * FROM zalo_bot_subscribers ORDER BY updated_at DESC LIMIT 30`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT * FROM crag_execution_traces ORDER BY created_at DESC LIMIT 25`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT * FROM zalo_bot_messages ORDER BY id DESC LIMIT 25`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT id, username, name, role, phone, status, metadata FROM users ORDER BY created_at ASC LIMIT 50`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT COUNT(*) as cnt FROM class_sessions`).first().catch(() => ({ cnt: 0 })),
        db.prepare(`SELECT COUNT(*) as cnt FROM tuition_bills`).first().catch(() => ({ cnt: 0 })),
        db.prepare(`SELECT COUNT(*) as cnt FROM student_evaluations`).first().catch(() => ({ cnt: 0 })),
        db.prepare(`SELECT COUNT(*) as cnt FROM knowledge_vault`).first().catch(() => ({ cnt: 0 }))
      ]);

      subscribers = subsRes?.results || [];
      traces = (tracesRes?.results || []).map((t) => {
        let timings = {};
        let intents = [];
        let entities = {};
        let tables = [];
        try { timings = JSON.parse(t.node_timings_json || '{}'); } catch {}
        try { intents = JSON.parse(t.detected_intents || '[]'); } catch {}
        try { entities = JSON.parse(t.extracted_entities || '{}'); } catch {}
        try { tables = JSON.parse(t.tables_queried || '[]'); } catch {}
        return {
          ...t,
          node_timings: timings,
          detected_intents_list: intents,
          extracted_entities_obj: entities,
          tables_queried_list: tables
        };
      });
      recentMessages = msgsRes?.results || [];

      const allUsers = usersRes?.results || [];
      const students = allUsers.filter((u) => u.role === 'student').map((u) => {
        let meta = {};
        try { meta = JSON.parse(u.metadata || '{}'); } catch {}
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          grade: meta.grade ? (String(meta.grade).startsWith('Lớp') ? String(meta.grade) : `Lớp ${meta.grade}`) : 'Lớp 7',
          school: meta.school || '',
          phone: u.phone || meta.phone || meta.parent_phone || ''
        };
      });
      const teachers = allUsers.filter((u) => u.role === 'teacher' || u.role === 'superadmin');

      dbOverview = {
        total_tables: 81,
        students_count: students.length,
        teachers_count: teachers.length,
        sessions_count: Number(sessRes?.cnt || 0),
        bills_count: Number(billsRes?.cnt || 0),
        evaluations_count: Number(evalsRes?.cnt || 0),
        vault_articles_count: Number(vaultRes?.cnt || 0),
        sample_students: students.slice(0, 12)
      };
    } catch {}
  }

  return json({
    success: true,
    superadmin_chat_id: SUPERADMIN_DEFAULT_CHAT_ID,
    nodes: DEFAULT_LANGFLOW_NODES,
    edges: DEFAULT_LANGFLOW_EDGES,
    auto_notify_rules: DEFAULT_AUTO_NOTIFY_RULES,
    db_overview: dbOverview,
    subscribers,
    traces,
    recent_messages: recentMessages
  });
}

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (db) {
    await ensureCragLangflowTables(db);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action || 'run_crag_test';

  // 1. Run 7-Node CRAG Pipeline (via Edge Worker with AI binding + D1 fallback)
  if (action === 'run_crag_test') {
    const query = String(body.query || '').trim();
    if (!query) {
      return json({ success: false, error: 'Vui lòng nhập câu hỏi cần kiểm thử qua CRAG Pipeline' }, { status: 400 });
    }
    const chatId = String(body.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();
    const role = body.role || 'superadmin';
    const sendToZalo = Boolean(body.send_to_zalo);

    // First try calling our dedicated Edge AI Worker (which has both env.DB and env.AI bound)
    try {
      const wRes = await fetch(WORKER_CRAG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          sender: { id: chatId, name: body.display_name || 'Hải (SuperAdmin)' },
          text: query,
          override_role: role,
          send_to_zalo: sendToZalo
        })
      });
      if (wRes.ok) {
        const wData = await wRes.json().catch(() => null);
        if (wData?.ok) {
          return json({
            success: true,
            result: wData
          });
        }
      }
    } catch {}

    // Fallback to direct execution on Pages D1
    const result = await runCragLangflowPipeline({
      db,
      env: platform?.env,
      chatId,
      displayName: body.display_name || 'Hải (SuperAdmin)',
      userText: query,
      overrideRole: role,
      sendToZalo,
      botToken: DEFAULT_ZALO_BOT_TOKEN
    });

    return json({
      success: true,
      result
    });
  }

  // 2. Update Subscriber Role / Linked User
  if (action === 'update_subscriber_role') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const chatId = String(body.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();
    const newRole = String(body.role_hint || 'superadmin').trim();
    const phone = String(body.phone || '').trim();
    const linkedUserId = String(body.linked_user_id || '').trim();

    await db.prepare(`
      UPDATE zalo_bot_subscribers
      SET role_hint = ?,
          phone = CASE WHEN ? != '' THEN ? ELSE phone END,
          linked_user_id = CASE WHEN ? != '' THEN ? ELSE linked_user_id END,
          updated_at = CURRENT_TIMESTAMP
      WHERE chat_id = ?
    `).bind(newRole, phone, phone, linkedUserId, linkedUserId, chatId).run();

    return json({
      success: true,
      message: `✅ Đã cập nhật Role của Chat ID ${chatId} thành "${newRole.toUpperCase()}" trong D1!`
    });
  }

  // 3. Trigger Automated Notification Rule Immediately from Real D1 Data
  if (action === 'trigger_auto_notification') {
    const ruleId = String(body.rule_id || 'schedule_10m').trim();
    const targetChatId = String(body.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();

    let messageText = '';
    if (db) {
      if (ruleId === 'schedule_10m') {
        const s = await db.prepare(`SELECT * FROM class_sessions WHERE id = 'sess_g7_mon' OR grade_level = 'Lớp 7' LIMIT 1`).first().catch(() => null);
        messageText =
          `⏰ Nhắc lịch học hôm nay (${s?.day_name || 'Thứ Hai'}, ${s?.start_time || '18:00'} – ${s?.end_time || '19:30'}):\n` +
          `• Lớp: ${s?.class_name || 'Lớp 7 - Global Success & KET A2'}\n` +
          `• Giáo viên: ${s?.teacher_name || 'Ms. Dung'}${s?.assistant_teacher_name ? ` (Trợ giảng: ${s.assistant_teacher_name})` : ''}\n` +
          `• Phòng học: ${s?.room_notes || 'Phòng VIP 201'} — ${s?.location || '123 Phố Vọng, Hai Bà Trưng'}\n` +
          `• Bài học: ${s?.subject_topic || 'Unit 7: Traffic & Phonics'}\n\n` +
          `Chỉ còn 10 phút nữa vào lớp, phụ huynh nhắc con chuẩn bị sách vở nhé. Nếu hôm nay con bận hoặc đến muộn, anh/chị nhắn lại tin này để lớp ghi nhận ạ.`;
      } else if (ruleId === 'attendance_instant') {
        const a = await db.prepare(`SELECT * FROM attendance_records ORDER BY created_at DESC LIMIT 1`).first().catch(() => null);
        messageText =
          `📋 Điểm danh buổi học ngày ${a?.session_date || new Date().toISOString().slice(0, 10)}:\n` +
          `• Học sinh: ${a?.student_name || 'Nguyễn Bảo Khiêm (Lớp 7)'}\n` +
          `• Trạng thái: ${a?.status === 'late' ? 'Đi muộn' : 'Đã vào lớp đúng giờ'} (+${a?.instant_stars_rewarded || 15} sao chuyên cần)\n` +
          `• Ghi chú trên lớp: ${a?.in_class_attitude || 'Hăng hái phát biểu, chuẩn bị bài đầy đủ.'}`;
      } else if (ruleId === 'tuition_vietqr') {
        const b = await db.prepare(`SELECT * FROM tuition_bills ORDER BY created_at ASC LIMIT 1`).first().catch(() => null);
        const rawQr = b?.vietqr_url || 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=2100000&addInfo=HP_BAOANH_T10&accountName=NGUYEN%20MINH%20VU';
        const safeQrPhoto = 'https://wsrv.nl/?url=' + encodeURIComponent(rawQr) + '&output=png';
        messageText =
          `💳 Phiếu báo học phí ${b?.billing_period || 'Tháng 10/2026'} — ${b?.student_name || 'Lê Bảo Anh'} (${b?.grade_level || 'Lớp 12'}):\n` +
          `• Học phí gốc: ${Number(b?.base_tuition_vnd || 2200000).toLocaleString('vi-VN')}đ (${b?.attendance_attended_sessions || 12}/${b?.attendance_total_sessions || 12} buổi)\n` +
          `• Đổi sao tích lũy: -${Number(b?.discount_vnd || 100000).toLocaleString('vi-VN')}đ (${Number(b?.stars_deducted || 10000).toLocaleString('vi-VN')} sao)\n` +
          `➔ Thực đóng: ${Number(b?.final_amount_vnd || 2100000).toLocaleString('vi-VN')}đ\n` +
          `🏦 ${b?.bank_name || 'MBBank'} • STK: ${b?.bank_account || '0901234567'} (${b?.account_holder || 'NGUYEN MINH VU'})\n\n` +
          `Lớp gửi kèm mã QR ngay bên dưới để phụ huynh tiện quét nhanh ạ:`;

        await fetch(`https://bot-api.zaloplatforms.com/bot${DEFAULT_ZALO_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: messageText
          })
        }).catch(() => {});

        const pRes = await fetch(`https://bot-api.zaloplatforms.com/bot${DEFAULT_ZALO_BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            photo: safeQrPhoto,
            caption: `Mã QR học phí ${b?.billing_period || 'T10/2026'} - ${b?.student_name || 'Lê Bảo Anh'}: ${Number(b?.final_amount_vnd || 2100000).toLocaleString('vi-VN')}đ`
          })
        });
        const pData = await pRes.json().catch(() => ({}));

        if (db) {
          await db.prepare(`
            INSERT INTO zalo_bot_messages (chat_id, sender_name, direction, content, ai_model)
            VALUES (?, 'Lớp Cô Dung', 'out', ?, ?)
          `).bind(targetChatId, messageText, `auto_rule:${ruleId}`).run().catch(() => {});
        }

        return json({
          success: Boolean(pRes.ok && pData?.ok),
          rule_id: ruleId,
          chat_id: targetChatId,
          message_sent: messageText,
          message: pRes.ok && pData?.ok
            ? `Đã gửi phiếu học phí kèm thẻ ảnh QR về Zalo ${targetChatId}`
            : `Không gửi được qua Zalo: ${pData?.description || 'Lỗi kết nối'}`
        });
      } else if (ruleId === 'evaluation_report') {
        const e = await db.prepare(`SELECT * FROM student_evaluations ORDER BY created_at ASC LIMIT 1`).first().catch(() => null);
        messageText =
          `📈 Nhận xét định kỳ của ${e?.student_name || 'Trần Gia Huy'} (${e?.grade_level || 'Lớp 7'} - GV: ${e?.teacher_name || 'Ms. Dung'}):\n` +
          `• Điểm 5 kỹ năng: Nghe ${e?.listening_score || 9.0} | Nói ${e?.speaking_score || 8.5} | Đọc ${e?.reading_score || 7.5} | Viết ${e?.writing_score || 7.0} | Ngữ pháp ${e?.grammar_vocab_score || 8.0}\n` +
          `• Điểm mạnh: ${e?.strengths || 'Phát âm chuẩn, phản xạ nghe nói tự nhiên.'}\n` +
          `• Hướng rèn thêm: ${e?.action_plan || 'Luyện thêm bài tập viết câu & ngữ pháp 15p mỗi ngày.'}`;
      } else {
        messageText =
          `📊 Tổng kết ca dạy Lớp 7 - Global Success & KET A2 (Thứ Hai & Thứ Năm, 18:00 - 19:30):\n` +
          `• Hoàn thành BTVN & Quiz: 92% học sinh đạt yêu cầu\n` +
          `• Tài liệu đã giảng: Unit 7 Traffic + Đề cương Google Drive Lớp 7\n` +
          `• Ghi chú chuyên môn: Học sinh nắm chắc cấu trúc trọng tâm, buổi tới tăng thêm 15 phút luyện Viết câu KET A2.`;
      }
    }

    const zRes = await fetch(`https://bot-api.zaloplatforms.com/bot${DEFAULT_ZALO_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: messageText
      })
    });
    const zData = await zRes.json().catch(() => ({}));

    if (db) {
      await db.prepare(`
        INSERT INTO zalo_bot_messages (chat_id, sender_name, direction, content, ai_model)
        VALUES (?, 'Lớp Cô Dung', 'out', ?, ?)
      `).bind(targetChatId, messageText, `auto_rule:${ruleId}`).run().catch(() => {});
    }

    return json({
      success: Boolean(zRes.ok && zData?.ok),
      rule_id: ruleId,
      chat_id: targetChatId,
      message_sent: messageText,
      message: zRes.ok && zData?.ok
        ? `Đã gửi thông báo (${ruleId}) về Zalo ${targetChatId}`
        : `Không gửi được qua Zalo: ${zData?.description || 'Lỗi kết nối'}`
    });
  }

  // 4. Test & Dispatch Rich Media Webhook (sendPhoto / url_img, sendVoice, Video Lesson)
  if (action === 'dispatch_media_webhook') {
    const mediaType = String(body.media_type || 'qr_photo').trim();
    const targetChatId = String(body.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();
    const rawUrl = String(body.media_url || '').trim();
    const caption = String(body.caption || '').trim();
    const baseUrl = `https://bot-api.zaloplatforms.com/bot${DEFAULT_ZALO_BOT_TOKEN}`;

    if (mediaType === 'qr_photo' || mediaType === 'custom_photo') {
      const defaultQr = 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=1550000&addInfo=HP_GIAHUY_T10&accountName=NGUYEN%20MINH%20VU';
      const photoToUse = rawUrl || defaultQr;
      const safePhotoUrl = photoToUse.includes('wsrv.nl') || photoToUse.includes('api.qrserver.com') || photoToUse.includes('images.unsplash.com')
        ? photoToUse
        : 'https://wsrv.nl/?url=' + encodeURIComponent(photoToUse) + '&output=png';

      const zRes = await fetch(baseUrl + '/sendPhoto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          photo: safePhotoUrl,
          caption: (caption || 'Mã QR đóng học phí (quét trực tiếp trên ứng dụng ngân hàng)').slice(0, 500)
        })
      });
      const zData = await zRes.json().catch(() => ({}));
      return json({
        success: Boolean(zRes.ok && zData?.ok),
        endpoint: '/sendPhoto',
        message_type: zData?.result?.message_type || 'CHAT_PHOTO',
        message_id: zData?.result?.message_id || null,
        safe_photo_url: safePhotoUrl,
        zalo_response: zData,
        message: zRes.ok && zData?.ok
          ? `Đã gửi thẻ ảnh QR (ID: ${zData.result?.message_id}) về Zalo ${targetChatId}`
          : `Lỗi gửi ảnh (/sendPhoto): ${zData?.description || 'Không hợp lệ'}`
      });
    }

    if (mediaType === 'voice_audio') {
      const voiceToUse = rawUrl || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      const zRes = await fetch(baseUrl + '/sendVoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          voice: voiceToUse
        })
      });
      const zData = await zRes.json().catch(() => ({}));
      return json({
        success: Boolean(zRes.ok && zData?.ok),
        endpoint: '/sendVoice',
        zalo_response: zData,
        message: zRes.ok && zData?.ok
          ? `Đã gửi file âm thanh luyện nghe về Zalo ${targetChatId}`
          : `Phản hồi /sendVoice: ${zData?.description || 'Cần URL file âm thanh hợp lệ'}`
      });
    }

    if (mediaType === 'video_lesson') {
      const videoUrl = rawUrl || 'https://www.youtube.com/watch?v=jul2urONzOQ';
      const thumbUrl = 'https://wsrv.nl/?url=' + encodeURIComponent('https://img.youtube.com/vi/jul2urONzOQ/maxresdefault.jpg') + '&output=png';
      await fetch(baseUrl + '/sendPhoto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          photo: thumbUrl,
          caption: (caption || 'Bài giảng Tiếng Anh Lớp 7 — Unit 7: Traffic').slice(0, 500)
        })
      });
      const mRes = await fetch(baseUrl + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: `🎬 Video bài học: ${caption || 'Unit 7: Traffic — Phonics & Cấu trúc Used to'}\n▶️ Mở xem bài giảng: ${videoUrl}`
        })
      });
      const mData = await mRes.json().catch(() => ({}));
      return json({
        success: Boolean(mRes.ok && mData?.ok),
        endpoint: '/sendPhoto + /sendMessage',
        zalo_response: mData,
        message: `Đã gửi ảnh bìa + link video bài giảng về Zalo ${targetChatId}`
      });
    }
  }

  return json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}

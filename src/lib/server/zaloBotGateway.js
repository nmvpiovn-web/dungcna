// src/lib/server/zaloBotGateway.js
// Unified Zalo Bot Platform Gateway for https://timbk.io.vn (Zero Grokbot Dependency)

export const DEFAULT_ZALO_BOT_TOKEN = '2267052943606876676:BohTEeIARkSRcUEqfZLDnvxEjSwPVyNSujkIEWeAYRXoCCljFJwYXhhkDbGIUVwd';
export const TIMBK_WEBHOOK_ENDPOINT = 'https://timbk.io.vn/api/zalo-bot/webhook';

export function isZaloBotPlatformToken(token = '') {
  return /^\d{10,}:[A-Za-z0-9_-]{20,}$/.test(String(token || '').trim());
}

export async function ensureZaloSubscribersSchema(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS zalo_bot_subscribers (
      chat_id TEXT PRIMARY KEY,
      display_name TEXT,
      phone TEXT DEFAULT '',
      linked_user_id TEXT DEFAULT '',
      role_hint TEXT DEFAULT 'parent_or_teacher',
      last_message TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run().catch(() => {});

  // Add phone / linked_user_id columns if table existed earlier
  await db.prepare(`ALTER TABLE zalo_bot_subscribers ADD COLUMN phone TEXT DEFAULT ''`).run().catch(() => {});
  await db.prepare(`ALTER TABLE zalo_bot_subscribers ADD COLUMN linked_user_id TEXT DEFAULT ''`).run().catch(() => {});
}

export async function processIncomingZaloMessage(db, token, payload) {
  const effectiveToken = String(token || DEFAULT_ZALO_BOT_TOKEN).trim();
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
    'Phụ huynh / Học viên Zalo'
  ).trim();

  const text = String(innerMsg?.text || msg?.text || payload?.text || '').trim();
  const phoneMatch = text.match(/(?:0|\+84)\d{8,10}/);
  const extractedPhone = phoneMatch ? phoneMatch[0].replace(/^\+84/, '0') : '';

  let linkedUser = null;

  if (db) {
    try {
      await ensureZaloSubscribersSchema(db);

      if (extractedPhone) {
        linkedUser = await db.prepare(`
          SELECT id, username, name, role, grade, phone, metadata
          FROM users
          WHERE phone = ? OR username = ? OR metadata LIKE ?
          LIMIT 1
        `).bind(extractedPhone, extractedPhone, `%${extractedPhone}%`).first().catch(() => null);

        if (linkedUser) {
          let meta = {};
          try {
            meta = typeof linkedUser.metadata === 'string' ? JSON.parse(linkedUser.metadata) : (linkedUser.metadata || {});
          } catch {}
          meta.zalo_id = chatId;
          meta.parent_zalo_id = chatId;
          await db.prepare(`UPDATE users SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(JSON.stringify(meta), linkedUser.id)
            .run()
            .catch(() => {});
        }

        await db.prepare(`UPDATE tuition_bills SET parent_zalo_id = ? WHERE parent_phone = ?`)
          .bind(chatId, extractedPhone)
          .run()
          .catch(() => {});
      }

      await db.prepare(`
        INSERT INTO zalo_bot_subscribers (chat_id, display_name, phone, linked_user_id, last_message, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET
          display_name = excluded.display_name,
          phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE zalo_bot_subscribers.phone END,
          linked_user_id = CASE WHEN excluded.linked_user_id != '' THEN excluded.linked_user_id ELSE zalo_bot_subscribers.linked_user_id END,
          last_message = excluded.last_message,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(chatId, displayName, extractedPhone, linkedUser?.id || '', text).run();

      await db.prepare(`
        UPDATE bot_webhook_configs
        SET chat_id = CASE WHEN chat_id IS NULL OR chat_id = '' THEN ? ELSE chat_id END,
            webhook_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'bot_primary';
      `).bind(chatId, TIMBK_WEBHOOK_ENDPOINT).run().catch(() => {});
    } catch {}
  }

  // Send instant Vietnamese reply directly from timbk.io.vn
  if (effectiveToken) {
    try {
      const replyText = linkedUser
        ? `✅ Hệ thống Tiếng Anh Cô Dung (timbk.io.vn) đã liên kết Zalo của ${displayName} với hồ sơ "${linkedUser.name}" (SĐT: ${extractedPhone})!\n• Mã Chat ID: ${chatId}\n• Từ nay thông báo lịch học trước 10 phút, điểm danh và phiếu học phí sẽ được gửi tự động về Zalo này.`
        : `✅ Hệ thống Tiếng Anh Cô Dung (timbk.io.vn) đã ghi nhận kết nối Zalo của ${displayName}!\n• Mã Chat ID: ${chatId}\n• Gợi ý: Nhắn kèm Số điện thoại đăng ký học (VD: 0912345678) để hệ thống tự động liên kết hồ sơ học sinh & gửi báo cáo ca học.`;

      await fetch(`https://bot-api.zaloplatforms.com/bot${effectiveToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText
        })
      });
    } catch {}
  }

  return {
    ok: true,
    captured_chat_id: chatId,
    display_name: displayName,
    phone: extractedPhone || null,
    linked_user: linkedUser ? { id: linkedUser.id, name: linkedUser.name, role: linkedUser.role } : null
  };
}

export async function syncZaloBotUpdates(db, token = DEFAULT_ZALO_BOT_TOKEN, maxPolls = 3) {
  const effectiveToken = String(token || DEFAULT_ZALO_BOT_TOKEN).trim();
  if (!isZaloBotPlatformToken(effectiveToken)) return [];

  const captured = [];
  try {
    // Check if an old external webhook (like grokbot) is still set; if so, remove it so timbk.io.vn owns the bot
    const whRes = await fetch(`https://bot-api.zaloplatforms.com/bot${effectiveToken}/getWebhookInfo`);
    const whData = await whRes.json().catch(() => ({}));
    if (whData?.result?.url && whData.result.url.includes('grokbot')) {
      await fetch(`https://bot-api.zaloplatforms.com/bot${effectiveToken}/deleteWebhook`, { method: 'POST' }).catch(() => {});
    }

    for (let i = 0; i < maxPolls; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1600);
      const updRes = await fetch(`https://bot-api.zaloplatforms.com/bot${effectiveToken}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({ timeout: 1 })
      }).catch(() => null);
      clearTimeout(timer);

      if (!updRes || !updRes.ok) break;
      const updData = await updRes.json().catch(() => ({}));
      if (!updData?.ok || !updData?.result) break;

      const items = Array.isArray(updData.result) ? updData.result : [updData.result];
      if (items.length === 0) break;

      for (const item of items) {
        const processed = await processIncomingZaloMessage(db, effectiveToken, item);
        if (processed?.captured_chat_id) {
          captured.push(processed);
        }
      }
    }
  } catch {}

  return captured;
}

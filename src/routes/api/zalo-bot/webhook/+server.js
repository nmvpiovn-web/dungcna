// src/routes/api/zalo-bot/webhook/+server.js
// Webhook receiver & status endpoint for Zalo Bot Platform (https://bot-api.zaloplatforms.com)
import { json } from '@sveltejs/kit';

export const prerender = false;

const DEFAULT_ZALO_BOT_TOKEN = '2267052943606876676:BohTEeIARkSRcUEqfZLDnvxEjSwPVyNSujkIEWeAYRXoCCljFJwYXhhkDbGIUVwd';

export async function GET({ platform }) {
  const db = platform?.env?.DB;
  let token = DEFAULT_ZALO_BOT_TOKEN;
  let subscribers = [];

  if (db) {
    try {
      const cfg = await db.prepare(`SELECT bot_token, chat_id, name, updated_at FROM bot_webhook_configs WHERE id = 'bot_primary' LIMIT 1`).first();
      if (cfg?.bot_token) token = cfg.bot_token;
      const subs = await db.prepare(`SELECT * FROM zalo_bot_subscribers ORDER BY updated_at DESC LIMIT 20`).all();
      subscribers = subs?.results || [];
    } catch {}
  }

  try {
    const meRes = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getMe`);
    const meData = await meRes.json().catch(() => ({}));
    return json({
      success: Boolean(meData?.ok),
      bot: meData?.result || null,
      webhook_endpoint: 'https://timbk.io.vn/api/zalo-bot/webhook',
      subscribers_count: subscribers.length,
      subscribers
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const msg = payload?.message || payload?.result?.message || payload?.data?.message || payload;
  const chatId = String(
    msg?.chat?.id ||
    msg?.from?.id ||
    payload?.sender?.id ||
    payload?.recipient?.id ||
    payload?.chat_id ||
    ''
  ).trim();

  const displayName = String(
    msg?.from?.display_name ||
    msg?.from?.name ||
    msg?.chat?.title ||
    payload?.sender?.name ||
    'Người dùng Zalo'
  ).trim();

  const text = String(msg?.text || payload?.text || '').trim();

  if (db && chatId) {
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS zalo_bot_subscribers (
          chat_id TEXT PRIMARY KEY,
          display_name TEXT,
          role_hint TEXT DEFAULT 'parent_or_teacher',
          last_message TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `).run();

      await db.prepare(`
        INSERT INTO zalo_bot_subscribers (chat_id, display_name, last_message, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET
          display_name = excluded.display_name,
          last_message = excluded.last_message,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(chatId, displayName, text).run();

      await db.prepare(`
        UPDATE bot_webhook_configs
        SET chat_id = CASE WHEN chat_id IS NULL OR chat_id = '' THEN ? ELSE chat_id END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'bot_primary';
      `).bind(chatId).run().catch(() => {});
    } catch {}
  }

  return json({
    ok: true,
    captured_chat_id: chatId || null,
    display_name: displayName
  });
}

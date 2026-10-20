// src/routes/api/zalo-bot/webhook/+server.js
// Direct Webhook Receiver & Real-Time Polling Gateway on https://timbk.io.vn (Zero Grokbot)
import { json } from '@sveltejs/kit';
import {
  DEFAULT_ZALO_BOT_TOKEN,
  TIMBK_WEBHOOK_ENDPOINT,
  ensureZaloSubscribersSchema,
  processIncomingZaloMessage,
  syncZaloBotUpdates
} from '$lib/server/zaloBotGateway.js';

export const prerender = false;

export async function GET({ platform }) {
  const db = platform?.env?.DB;
  let token = DEFAULT_ZALO_BOT_TOKEN;
  let subscribers = [];

  if (db) {
    try {
      await ensureZaloSubscribersSchema(db);
      const cfg = await db.prepare(`SELECT bot_token FROM bot_webhook_configs WHERE id = 'bot_primary' LIMIT 1`).first().catch(() => null);
      if (cfg?.bot_token) token = cfg.bot_token;

      // Ensure webhook_url in D1 points to timbk.io.vn (never grokbot)
      await db.prepare(`UPDATE bot_webhook_configs SET webhook_url = ? WHERE id = 'bot_primary' AND (webhook_url LIKE '%grokbot%' OR webhook_url = '')`)
        .bind(TIMBK_WEBHOOK_ENDPOINT)
        .run()
        .catch(() => {});
    } catch {}
  }

  // Pull any pending messages from Zalo Bot Platform queue & auto-reply from timbk.io.vn
  const newlyCaptured = await syncZaloBotUpdates(db, token, 3);

  if (db) {
    try {
      const subs = await db.prepare(`SELECT * FROM zalo_bot_subscribers ORDER BY updated_at DESC LIMIT 30`).all();
      subscribers = subs?.results || [];
    } catch {}
  }

  try {
    const meRes = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getMe`);
    const meData = await meRes.json().catch(() => ({}));
    return json({
      success: Boolean(meData?.ok),
      bot_connected: Boolean(meData?.ok),
      bot: meData?.result || null,
      webhook_endpoint: TIMBK_WEBHOOK_ENDPOINT,
      zalo_platform_webhook: {
        url: TIMBK_WEBHOOK_ENDPOINT,
        mode: 'timbk_direct_gateway'
      },
      newly_captured_count: newlyCaptured.length,
      subscribers_count: subscribers.length,
      subscribers
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  let token = DEFAULT_ZALO_BOT_TOKEN;
  if (db) {
    try {
      const cfg = await db.prepare(`SELECT bot_token FROM bot_webhook_configs WHERE id = 'bot_primary' LIMIT 1`).first().catch(() => null);
      if (cfg?.bot_token) token = cfg.bot_token;
    } catch {}
  }

  let payload = {};
  try {
    const rawText = await request.text();
    if (rawText && rawText.trim()) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        const params = new URLSearchParams(rawText);
        payload = Object.fromEntries(params.entries());
      }
    }
  } catch {}

  const result = await processIncomingZaloMessage(db, token, payload);
  return json({
    ok: true,
    webhook_endpoint: TIMBK_WEBHOOK_ENDPOINT,
    ...result
  });
}

import { json } from '@sveltejs/kit';
import { dispatchBotReport, logSnapshot } from '../../../lib/unifiedStore.js';
import { verifyServiceSecret } from '../../../lib/server/serviceAuth.js';
import { sendZaloRichPayload, DEFAULT_ZALO_BOT_TOKEN, SUPERADMIN_DEFAULT_CHAT_ID } from '../../../lib/server/cragLangflowEngine.js';

export const prerender = false;

export async function GET() {
  return json({
    status: 'online',
    service: 'TiengAnh Pro Central Bot Reporter Webhook API',
    version: '2026.2.0'
  });
}

export async function POST({ request, platform }) {
  try {
    const serviceAuth = verifyServiceSecret(request, platform, 'CENTRAL_WEBHOOK_SECRET');
    if (!serviceAuth.ok) return json({ success: false, error: serviceAuth.error }, { status: serviceAuth.status });
    const payload = await request.json();
    const eventType = typeof payload.event === 'string' ? payload.event.trim() : '';
    if (!/^[A-Z0-9_.:-]{3,80}$/.test(eventType)) {
      return json({ success: false, error: 'ValidationError: event không hợp lệ.' }, { status: 400 });
    }

    logSnapshot('WEBHOOK_INCOMING_EVENT', 'webhook', eventType, null, payload);

    const db = platform?.env?.DB;
    const dispatchResults = await dispatchBotReport(eventType, payload.data || payload);
    let zaloProactiveResult = null;

    if (db) {
      await db.prepare(`
        INSERT INTO system_events (id, event_type, actor_role, title, payload, created_at)
        VALUES (?, ?, 'system', ?, ?, CURRENT_TIMESTAMP)
      `).bind(`evt_wh_${Date.now()}`, eventType, `Central Webhook: ${eventType}`, JSON.stringify(payload.data || payload)).run().catch(() => {});

      if (payload.zalo_text) {
        zaloProactiveResult = await sendZaloRichPayload({
          botToken: DEFAULT_ZALO_BOT_TOKEN,
          chatId: payload.chat_id || SUPERADMIN_DEFAULT_CHAT_ID,
          text: String(payload.zalo_text)
        }).catch(() => null);
      }
    }

    return json({
      success: true,
      timestamp: new Date().toISOString(),
      event: eventType,
      message: 'Sự kiện đã được ghi nhận vào D1 và chuyển tiếp thành công đến bot!',
      dispatch_results: dispatchResults,
      zalo_proactive: zaloProactiveResult
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

import { json } from '@sveltejs/kit';
import { dispatchBotReport, logSnapshot, getAllWebhooks } from '$lib/unifiedStore';

export const prerender = false;

export async function GET() {
  const hooks = getAllWebhooks();
  return json({
    status: 'online',
    service: 'TiengAnh Pro Central Bot Reporter Webhook API',
    version: '2026.2.0',
    registered_webhooks: hooks.map(h => ({ id: h.id, name: h.name, is_active: h.is_active, last_status: h.last_status }))
  });
}

export async function POST({ request }) {
  try {
    const payload = await request.json();
    const eventType = payload.event || 'GENERIC_BOT_ALERT';

    logSnapshot('WEBHOOK_INCOMING_EVENT', 'webhook', eventType, null, payload);

    // Forward/dispatch to all active bot endpoints
    const dispatchResults = await dispatchBotReport(eventType, payload.data || payload);

    return json({
      success: true,
      timestamp: new Date().toISOString(),
      event: eventType,
      message: 'Sự kiện đã được ghi nhận và chuyển tiếp thành công đến bot!',
      dispatch_results: dispatchResults
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

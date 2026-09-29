import { json } from '@sveltejs/kit';
import { dispatchBotReport, logSnapshot } from '../../../lib/unifiedStore.js';
import { verifyServiceSecret } from '../../../lib/server/serviceAuth.js';

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

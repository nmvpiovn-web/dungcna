import { json } from '@sveltejs/kit';
import { verifyServerAuth, isManager } from '$lib/server/auth.js';
import { syncZaloBotUpdates, DEFAULT_ZALO_BOT_TOKEN } from '$lib/server/zaloBotGateway.js';

export const prerender = false;

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
}

function detectDeviceModel(userAgent = '', explicitModel = '') {
  if (explicitModel && typeof explicitModel === 'string' && explicitModel.trim()) {
    return explicitModel.trim().slice(0, 120);
  }
  const ua = String(userAgent || '');
  if (/R10|DOOGEE/i.test(ua)) return 'DOOGEE R10 Tablet';
  if (/TiengAnhCoDungApp/i.test(ua)) {
    const m = ua.match(/Android\s+[\d.]+;\s*([^)]+)\)/i);
    return m ? `Android APK (${m[1].trim()})` : 'Android APK';
  }
  if (/SM-T|SM-X|Tab|Pad/i.test(ua)) return 'Android Tablet';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s+[\d.]+;\s*([^)]+)\)/i);
    return m ? m[1].trim().slice(0, 80) : 'Android Device';
  }
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Macintosh/i.test(ua)) return 'Mac';
  return 'Web Browser';
}

function detectAppMode(userAgent = '', explicitMode = '', isAndroidApk = false) {
  if (isAndroidApk || /TiengAnhCoDungApp/i.test(userAgent)) return 'android_apk';
  if (explicitMode && typeof explicitMode === 'string') return explicitMode.slice(0, 40);
  if (/R10|DOOGEE/i.test(userAgent)) return 'r10_browser';
  return 'web';
}

export async function POST({ request, platform }) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {}

    const userAgent = request.headers.get('user-agent') || body.user_agent || '';
    const ipAddress = getClientIp(request);
    const isAndroidApk = Boolean(body.is_android_apk || /TiengAnhCoDungApp/i.test(userAgent));
    const deviceModel = detectDeviceModel(userAgent, body.device_model);
    const appMode = detectAppMode(userAgent, body.app_mode, isAndroidApk);
    const screenSize = String(body.screen_size || '').slice(0, 40);
    const currentPath = String(body.current_path || '/').slice(0, 200);

    // Optional auth verification (works both before login as Guest and after login)
    let authUser = null;
    let sessionId = null;
    try {
      const auth = await verifyServerAuth(request, platform);
      if (auth.authenticated && auth.user) {
        authUser = auth.user;
        sessionId = auth.tokenPayload?.sid || null;
      }
    } catch {}

    const rawDeviceId = String(body.device_id || sessionId || `${ipAddress}_${deviceModel}`).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120);

    if (platform?.env?.DB) {
      try {
        const bgPromise = syncZaloBotUpdates(platform.env.DB, DEFAULT_ZALO_BOT_TOKEN, 1);
        if (platform?.context?.waitUntil) platform.context.waitUntil(bgPromise);
      } catch {}
      try {
        await platform.env.DB.prepare(`
          INSERT INTO device_heartbeats (
            device_id, session_id, user_id, username, user_role,
            device_model, app_mode, user_agent, ip_address,
            screen_size, current_path, is_android_apk,
            first_seen_at, last_active_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(device_id) DO UPDATE SET
            session_id = COALESCE(excluded.session_id, device_heartbeats.session_id),
            user_id = COALESCE(excluded.user_id, device_heartbeats.user_id),
            username = COALESCE(excluded.username, device_heartbeats.username),
            user_role = COALESCE(excluded.user_role, device_heartbeats.user_role),
            device_model = excluded.device_model,
            app_mode = excluded.app_mode,
            user_agent = excluded.user_agent,
            ip_address = excluded.ip_address,
            screen_size = excluded.screen_size,
            current_path = excluded.current_path,
            is_android_apk = excluded.is_android_apk,
            last_active_at = CURRENT_TIMESTAMP
        `).bind(
          rawDeviceId,
          sessionId,
          authUser?.id || body.user_id || null,
          authUser?.username || body.username || 'guest',
          authUser?.role || body.user_role || 'guest',
          deviceModel,
          appMode,
          userAgent.slice(0, 500),
          ipAddress,
          screenSize,
          currentPath,
          isAndroidApk ? 1 : 0
        ).run();

        if (sessionId) {
          await platform.env.DB.prepare(`
            UPDATE auth_sessions
            SET last_active_at = CURRENT_TIMESTAMP,
                user_agent = ?,
                ip_address = ?,
                device_model = ?,
                app_mode = ?,
                current_path = ?
            WHERE id = ?
          `).bind(
            userAgent.slice(0, 500),
            ipAddress,
            deviceModel,
            appMode,
            currentPath,
            sessionId
          ).run();
        }
      } catch (dbErr) {
        console.warn('Device heartbeat D1 write warning:', dbErr?.message || dbErr);
      }
    }

    return json({
      success: true,
      device_id: rawDeviceId,
      device_model: deviceModel,
      app_mode: appMode,
      is_android_apk: isAndroidApk,
      authenticated: Boolean(authUser),
      user: authUser ? { id: authUser.id, username: authUser.username, name: authUser.name, role: authUser.role } : null,
      server_time: new Date().toISOString()
    });
  } catch (err) {
    return json({ success: false, error: err?.message || 'Heartbeat error' }, { status: 500 });
  }
}

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated || !isManager(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ Quản trị viên được xem danh sách thiết bị đang hoạt động.' }, { status: 403 });
  }
  if (!platform?.env?.DB) {
    return json({ success: true, devices: [], sessions: [] });
  }

  const [devicesRes, sessionsRes] = await Promise.all([
    platform.env.DB.prepare(`
      SELECT * FROM device_heartbeats
      ORDER BY last_active_at DESC
      LIMIT 30
    `).all(),
    platform.env.DB.prepare(`
      SELECT s.id, s.user_id, u.username, u.name, u.role,
             s.device_model, s.app_mode, s.ip_address, s.current_path,
             s.user_agent, s.created_at, s.last_active_at, s.revoked_at
      FROM auth_sessions s
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY COALESCE(s.last_active_at, s.created_at) DESC
      LIMIT 30
    `).all()
  ]);

  return json({
    success: true,
    devices: devicesRes?.results || [],
    sessions: sessionsRes?.results || []
  });
}

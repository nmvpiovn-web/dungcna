// src/routes/api/auth/token/+server.js
import { json } from '@sveltejs/kit';
import { getAllUsers } from '../../../../lib/unifiedStore.js';
import { createSignedToken, sanitizeUser, getAuthSecret, verifyPassword, hashPassword } from '../../../../lib/server/auth.js';
import { checkRateLimit } from '../../../../lib/server/rateLimit.js';

export const prerender = false;

// ---- Brute-force defense (D1-backed, shared across isolates) ----
// Module-scope Maps are per-isolate on Cloudflare Workers and NEVER trigger
// (live audit 2026-10-06: 60 bad logins -> 0x429). Use the shared `rate_limits`
// D1 table (migration 0015); in-memory is only a fallback when D1 is down.
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 50; // per ip+username
const LOGIN_MAX_ATTEMPTS_PER_IP = 300; // per ip across all usernames

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
}

async function checkLoginRateLimit(platform, ip, username) {
  // Kimi review #3: without any IP header every client would share one bucket and
  // an attacker could lock out other users' logins. Cloudflare production always
  // sets cf-connecting-ip, so only skip when the IP is genuinely unknown.
  if (!ip || ip === 'unknown') return true;
  const db = platform?.env?.DB || null;
  const userKey = `login:${ip}|${String(username || '').toLowerCase()}`;
  const ipKey = `login_ip:${ip}`;
  // Kimi review #2: an attacker rotating usernames must still hit the IP-wide bucket
  const [ipOk, userOk] = await Promise.all([
    checkRateLimit(db, { key: ipKey, limit: LOGIN_MAX_ATTEMPTS_PER_IP, windowMs: LOGIN_WINDOW_MS }),
    checkRateLimit(db, { key: userKey, limit: LOGIN_MAX_ATTEMPTS, windowMs: LOGIN_WINDOW_MS })
  ]);
  return ipOk && userOk;
}

// Dummy PBKDF2 hash — NOT a credential. Runs a real PBKDF2 verification when the
// username does not exist so "user not found" takes the same time as "wrong
// password" (anti user-enumeration via timing).
const DUMMY_PBKDF2_HASH = 'pbkdf2:100000:' + '0'.repeat(32) + ':' + '0'.repeat(64);

export async function POST({ request, platform, cookies }) {
  try {
    const secret = getAuthSecret(platform);
    if (!secret) {
      return json({
        success: false,
        error: 'Lỗi cấu hình hệ thống: AUTH_SECRET chưa được thiết lập trên server (Fail-Closed).'
      }, { status: 500 });
    }

    // EP-L2: malformed JSON body must be a 400, not a 500
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: 'JSON không hợp lệ' }, { status: 400 });
    }
    const { username, password } = body || {};

    if (!username || !password) {
      return json({ success: false, error: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 });
    }

    // Brute-force protection: too many attempts from this IP+username -> 429
    // (D1-backed so it works across Cloudflare isolates; async)
    if (!(await checkLoginRateLimit(platform, getClientIp(request), username))) {
      return json({
        success: false,
        error: 'TooManyRequests: Quá nhiều lần đăng nhập, vui lòng thử lại sau ít phút.'
      }, { status: 429, headers: { 'Retry-After': '600' } });
    }

    let user = null;

    // 1. Check Cloudflare D1 (Primary Production Source)
    if (platform?.env?.DB) {
      try {
        const d1User = await platform.env.DB.prepare(`
          SELECT * FROM users WHERE (username = ? OR email = ? OR phone = ?) LIMIT 1
        `).bind(username, username, username).first();

        if (!d1User) {
          // Anti-enumeration: burn the same PBKDF2 cost as a real password check
          await verifyPassword(password, DUMMY_PBKDF2_HASH);
          return json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 });
        }

        const isMatch = await verifyPassword(password, d1User.password);
        if (!isMatch) {
          return json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 });
        }

        user = d1User;

        // Transparent migration: Upgrade legacy plaintext password to PBKDF2
        if (user.password && !user.password.startsWith('pbkdf2:')) {
          try {
            const upgradedHash = await hashPassword(password);
            await platform.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(upgradedHash, user.id).run();
          } catch (migErr) {
            console.warn('Transparent password migration warning:', migErr);
          }
        }
      } catch (e) {
        console.error('D1 login error:', e);
        return json({ success: false, error: 'Lỗi máy chủ: Không thể xử lý đăng nhập lúc này, vui lòng thử lại sau.' }, { status: 500 });
      }
    } else if (platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true') {
      // 2. Fallback to local store ONLY when ENABLE_LOCAL_MOCK is explicitly configured (isolated dev/testing)
      const allUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
      const candidate = allUsers.find(u =>
        (u.username === username || u.email === username || u.phone === username)
      );
      // Anti-enumeration: equalize timing even when the account does not exist
      const candidateHash = candidate ? candidate.password : DUMMY_PBKDF2_HASH;
      if (!candidate || !(await verifyPassword(password, candidateHash))) {
        return json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 });
      }
      user = candidate;
    } else {
      return json({
        success: false,
        error: 'Lỗi cấu hình máy chủ: Thiếu binding cơ sở dữ liệu Cloudflare D1 (DB) trên môi trường production (Fail-Closed).'
      }, { status: 500 });
    }

    // Account status check
    if (user.status === 'locked' || user.status === 'disabled' || user.status === 'suspended') {
      return json({ success: false, error: 'Tài khoản của bạn đã bị khóa hoặc tạm ngưng.' }, { status: 403 });
    }

    const sid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    if (platform?.env?.DB) {
      try {
        const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
        await platform.env.DB.prepare(`
          INSERT INTO auth_sessions (id, user_id, created_at, expires_at, revoked_at)
          VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL)
        `).bind(sid, user.id, expiresAt).run();
      } catch (sessErr) {
        console.error('Could not record auth session in D1 (Fail-Closed):', sessErr);
        return json({
          success: false,
          error: 'Lỗi máy chủ: Không thể ghi nhận phiên đăng nhập bảo mật (Fail-Closed).'
        }, { status: 500 });
      }
    }

    const token = await createSignedToken(user, secret, 7 * 86400 * 1000, sid);
    const safeUser = sanitizeUser(user);

    // N1 (2026-09-30): the session cookie is set server-side with HttpOnly + Secure.
    // Client-side JS cannot set HttpOnly, so the old document.cookie writes in
    // unifiedStore.js have been removed — the token in localStorage remains as a
    // fallback for API Authorization headers (residual XSS-steal risk, out of scope).
    cookies.set('session_token', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 86400
    });

    return json({
      success: true,
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login handler error:', err);
    return json({ success: false, error: 'Lỗi máy chủ: Không thể xử lý đăng nhập lúc này.' }, { status: 500 });
  }
}

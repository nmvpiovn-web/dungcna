// src/routes/api/auth/token/+server.js
import { json } from '@sveltejs/kit';
import { getAllUsers } from '../../../../lib/unifiedStore.js';
import { createSignedToken, sanitizeUser, getAuthSecret, verifyPassword, hashPassword } from '../../../../lib/server/auth.js';

export const prerender = false;

export async function POST({ request, platform }) {
  try {
    const secret = getAuthSecret(platform);
    if (!secret) {
      return json({
        success: false,
        error: 'Lỗi cấu hình hệ thống: AUTH_SECRET chưa được thiết lập trên server (Fail-Closed).'
      }, { status: 500 });
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return json({ success: false, error: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 });
    }

    let user = null;

    // 1. Check Cloudflare D1 (Primary Production Source)
    if (platform?.env?.DB) {
      try {
        const d1User = await platform.env.DB.prepare(`
          SELECT * FROM users WHERE (username = ? OR email = ? OR phone = ?) LIMIT 1
        `).bind(username, username, username).first();

        if (!d1User) {
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
        return json({ success: false, error: 'Lỗi truy vấn cơ sở dữ liệu: ' + (e.message || String(e)) }, { status: 500 });
      }
    } else if (platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true') {
      // 2. Fallback to local store ONLY when ENABLE_LOCAL_MOCK is explicitly configured (isolated dev/testing)
      const allUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
      const candidate = allUsers.find(u =>
        (u.username === username || u.email === username || u.phone === username)
      );
      if (!candidate || !(await verifyPassword(password, candidate.password))) {
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

    return json({
      success: true,
      token,
      user: safeUser
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

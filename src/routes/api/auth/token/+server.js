// src/routes/api/auth/token/+server.js
import { json } from '@sveltejs/kit';
import { getAllUsers } from '../../../../lib/unifiedStore.js';
import { createSignedToken, sanitizeUser, getAuthSecret } from '../../../../lib/server/auth.js';

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
          SELECT * FROM users WHERE (username = ? OR email = ? OR phone = ?) AND password = ? LIMIT 1
        `).bind(username, username, username, password).first();

        if (!d1User) {
          return json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 });
        }
        user = d1User;
      } catch (e) {
        console.error('D1 login error:', e);
        return json({ success: false, error: 'Lỗi truy vấn cơ sở dữ liệu: ' + (e.message || String(e)) }, { status: 500 });
      }
    } else if (platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true') {
      // 2. Fallback to local store ONLY when ENABLE_LOCAL_MOCK is explicitly configured (isolated dev/testing)
      const allUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
      user = allUsers.find(u => 
        (u.username === username || u.email === username || u.phone === username) && 
        u.password === password
      );
      if (!user) {
        return json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, { status: 401 });
      }
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

    const token = await createSignedToken(user, secret);
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

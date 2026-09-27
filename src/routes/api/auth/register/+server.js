// src/routes/api/auth/register/+server.js
import { json } from '@sveltejs/kit';
import { getAllUsers, saveAllUsers } from '../../../../lib/unifiedStore.js';
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
    const { 
      usernameOrPhone, 
      name, 
      password, 
      role = 'student', 
      grade = 'Lớp 7', 
      target = '', 
      linkedStudentPhoneOrId = '' 
    } = body;

    if (!usernameOrPhone || !usernameOrPhone.trim()) {
      return json({ success: false, error: 'Vui lòng nhập Tên đăng nhập hoặc Số điện thoại!' }, { status: 400 });
    }
    if (!password || !password.trim()) {
      return json({ success: false, error: 'Vui lòng nhập Mật khẩu!' }, { status: 400 });
    }

    const cleanInput = usernameOrPhone.trim();
    const isPhone = /^[0-9+]{8,15}$/.test(cleanInput);
    const username = isPhone ? `user_${cleanInput}` : cleanInput.toLowerCase().replace(/[^a-z0-9_.]/gi, '');
    const phone = isPhone ? cleanInput : '';
    const cleanName = (name && name.trim()) ? name.trim() : (isPhone ? (role === 'parent' ? `Phụ huynh ${cleanInput}` : `Học viên ${cleanInput}`) : (role === 'parent' ? `Phụ huynh ${username}` : `Học viên ${username}`));
    const nowIso = new Date().toISOString();

    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username,
      phone: phone || '0900000000',
      email: `${username}@tienganhcodung.edu.vn`,
      name: cleanName,
      password: password.trim(),
      role: role || 'student',
      grade: grade || 'Lớp 7',
      avatar: role === 'parent' 
        ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'
        : (role === 'teacher' 
            ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' 
            : `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`),
      status: 'trial',
      approval_status: 'trial',
      metadata: JSON.stringify({
        grade: grade || 'Lớp 7',
        target: target || 'Chương trình GDPT 2026',
        phone: phone || '',
        is_trial: true,
        linked_student_id: linkedStudentPhoneOrId || ''
      }),
      created_at: nowIso,
      updated_at: nowIso
    };

    // 1. D1 Production Database Write
    if (platform?.env?.DB) {
      try {
        // Check conflict
        const existing = await platform.env.DB.prepare(`
          SELECT id, username FROM users WHERE username = ? OR (phone = ? AND phone != '') LIMIT 1
        `).bind(username, phone).first();

        if (existing) {
          return json({ success: false, error: 'Tên đăng nhập hoặc Số điện thoại này đã được sử dụng! Vui lòng chọn Đăng nhập.' }, { status: 409 });
        }

        // Insert new user
        await platform.env.DB.prepare(`
          INSERT INTO users (id, username, phone, email, name, role, avatar, status, metadata, grade, password, approval_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          newUser.id,
          newUser.username,
          newUser.phone,
          newUser.email,
          newUser.name,
          newUser.role,
          newUser.avatar,
          newUser.status,
          newUser.metadata,
          newUser.grade,
          newUser.password,
          newUser.approval_status,
          newUser.created_at,
          newUser.updated_at
        ).run();

        // If parent role with linked child, record in parent_student_links
        if (role === 'parent' && linkedStudentPhoneOrId) {
          try {
            const childUser = await platform.env.DB.prepare(`
              SELECT id FROM users WHERE id = ? OR username = ? OR phone = ? LIMIT 1
            `).bind(linkedStudentPhoneOrId, linkedStudentPhoneOrId, linkedStudentPhoneOrId).first();

            if (childUser) {
              await platform.env.DB.prepare(`
                INSERT OR IGNORE INTO parent_student_links (id, parent_user_id, student_user_id, created_at)
                VALUES (?, ?, ?, ?)
              `).bind(`link_${Date.now()}`, newUser.id, childUser.id, nowIso).run();
            }
          } catch (linkErr) {
            console.warn('Link child warning:', linkErr);
          }
        }
      } catch (d1Err) {
        console.error('D1 registration insert error:', d1Err);
        if (platform?.env?.ENABLE_LOCAL_MOCK !== 'true' && process.env.ENABLE_LOCAL_MOCK !== 'true') {
          return json({ success: false, error: 'Lỗi ghi nhận dữ liệu máy chủ: ' + (d1Err.message || String(d1Err)) }, { status: 500 });
        }
      }
    }

    // 2. Local store synchronization (for hybrid / dev fallback)
    const localUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
    if (!localUsers.find(u => u.username === username)) {
      localUsers.push(newUser);
      if (typeof saveAllUsers === 'function') {
        saveAllUsers(localUsers);
      }
    }

    // Mint signed token so registered user is immediately authenticated
    const token = await createSignedToken(newUser, secret);
    const safeUser = sanitizeUser(newUser);

    return json({
      success: true,
      token,
      user: safeUser,
      message: `Đăng ký thành công tài khoản [${safeUser.role.toUpperCase()}] cho ${safeUser.name}!`
    }, { status: 201 });

  } catch (err) {
    return json({ success: false, error: err.message || 'Lỗi xử lý đăng ký' }, { status: 500 });
  }
}

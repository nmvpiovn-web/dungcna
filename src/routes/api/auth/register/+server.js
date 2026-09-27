// src/routes/api/auth/register/+server.js
import { json } from '@sveltejs/kit';
import { getAllUsers, saveAllUsers } from '../../../../lib/unifiedStore.js';
import { createSignedToken, sanitizeUser, getAuthSecret, hashPassword } from '../../../../lib/server/auth.js';

export const prerender = false;

const ALLOWED_PUBLIC_ROLES = ['student', 'parent'];
const RESERVED_USERNAMES = [
  'admin', 'superadmin', 'msdung', 'codung', 'teacher', 'leader',
  'staff', 'system', 'root', 'codex', 'antigravity', 'moderator', 'timbk', 'hocsinh'
];

export async function POST({ request, platform }) {
  try {
    const secret = getAuthSecret(platform);
    if (!secret) {
      return json({ 
        success: false, 
        error: 'Lỗi cấu hình hệ thống: AUTH_SECRET chưa được thiết lập trên server (Fail-Closed).' 
      }, { status: 500 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON' }, { status: 400 });
    }

    const { 
      usernameOrPhone, 
      name, 
      password, 
      role = 'student', 
      grade = 'Lớp 7', 
      target = '', 
      linkedStudentPhoneOrId = '' 
    } = body;

    // 1. Role allowlist enforcement (P0-REG-01: Public registration cannot self-grant privileged roles)
    if (!role || typeof role !== 'string') {
      return json({ success: false, error: 'Thiếu thông tin vai trò người dùng (role).' }, { status: 400 });
    }
    const requestedRole = role.toLowerCase().trim();
    if (!ALLOWED_PUBLIC_ROLES.includes(requestedRole)) {
      return json({ 
        success: false, 
        error: 'Quyền đăng ký không hợp lệ. Đăng ký công khai chỉ áp dụng cho Học viên (student) hoặc Phụ huynh (parent). Không cho phép đăng ký quyền đặc quyền.' 
      }, { status: 400 });
    }
    const safeRole = requestedRole;

    // 2. Input validation
    if (!usernameOrPhone || typeof usernameOrPhone !== 'string' || !usernameOrPhone.trim()) {
      return json({ success: false, error: 'Vui lòng nhập Tên đăng nhập hoặc Số điện thoại!' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return json({ success: false, error: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.' }, { status: 400 });
    }

    const cleanInput = usernameOrPhone.trim();
    const isVnPhone = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/.test(cleanInput);
    let username = '';
    let phone = null;

    if (isVnPhone) {
      phone = cleanInput;
      username = `user_${cleanInput.replace(/[^0-9]/g, '')}`;
    } else {
      username = cleanInput.toLowerCase().replace(/[^a-z0-9_]/g, '');
    }

    // Validate normalized username
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return json({ 
        success: false, 
        error: 'Tên đăng nhập phải từ 3 đến 30 ký tự, chỉ chứa chữ cái thường (a-z), chữ số (0-9) hoặc gạch dưới (_).' 
      }, { status: 400 });
    }

    // Check reserved usernames (P0-REG-01)
    const lowerUser = username.toLowerCase();
    const isReserved = RESERVED_USERNAMES.some(reserved => 
      lowerUser === reserved || lowerUser.startsWith(reserved + '_') || lowerUser.startsWith(reserved + '.')
    );
    if (isReserved) {
      return json({ 
        success: false, 
        error: 'Tên đăng nhập này thuộc danh mục bảo lưu hệ thống. Vui lòng chọn tên đăng nhập khác.' 
      }, { status: 400 });
    }

    // Clean name
    const cleanName = (name && typeof name === 'string' && name.trim()) 
      ? name.trim() 
      : (safeRole === 'parent' ? `Phụ huynh ${username}` : `Học viên ${username}`);

    const nowIso = new Date().toISOString();

    // 3. Cryptographically hash password (P1-REG-03)
    const hashedPassword = await hashPassword(password.trim());

    const newUser = {
      id: `usr_${safeRole}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username,
      phone: phone || null,
      email: `${username}@${safeRole}.tienganhcodung.edu.vn`,
      name: cleanName,
      password: hashedPassword,
      role: safeRole,
      grade: grade || 'Lớp 7',
      avatar: safeRole === 'parent' 
        ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'
        : `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
      status: 'trial',
      approval_status: 'trial',
      metadata: JSON.stringify({
        grade: grade || 'Lớp 7',
        target: target || 'Chương trình GDPT 2026',
        phone: phone || null,
        is_trial: true,
        linked_student_id: linkedStudentPhoneOrId || ''
      }),
      created_at: nowIso,
      updated_at: nowIso
    };

    // 4. Fail-closed database requirement on production (P1-REG-03)
    if (!platform?.env?.DB) {
      const isMockAllowed = platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process?.env?.ENABLE_LOCAL_MOCK === 'true';
      if (!isMockAllowed) {
        return json({ 
          success: false, 
          error: 'Cơ sở dữ liệu Cloudflare D1 tạm thời không khả dụng (503 Service Unavailable). Không thể tạo tài khoản (Fail-Closed).' 
        }, { status: 503 });
      }
    }

    // 5. D1 Production Database Write
    if (platform?.env?.DB) {
      try {
        // Check uniqueness for username and phone
        const existing = await platform.env.DB.prepare(`
          SELECT id, username FROM users WHERE username = ? OR (? IS NOT NULL AND phone = ?) LIMIT 1
        `).bind(username, phone, phone).first();

        if (existing) {
          return json({ 
            success: false, 
            error: 'Tên đăng nhập hoặc Số điện thoại này đã được sử dụng! Vui lòng chọn Đăng nhập.' 
          }, { status: 409 });
        }

        // Insert new user with hashed password and trial status
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

        // 6. Parent-Student Link Verification (P1-REG-02: Default PENDING, must verify child role)
        if (safeRole === 'parent' && linkedStudentPhoneOrId && linkedStudentPhoneOrId.trim()) {
          try {
            const targetChildInput = linkedStudentPhoneOrId.trim();
            // Child must exist and MUST have role = 'student'
            const childUser = await platform.env.DB.prepare(`
              SELECT id, role FROM users WHERE (id = ? OR username = ? OR phone = ?) LIMIT 1
            `).bind(targetChildInput, targetChildInput, targetChildInput).first();

            if (childUser && childUser.role === 'student') {
              const linkId = `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              await platform.env.DB.prepare(`
                INSERT OR IGNORE INTO parent_student_links (id, parent_user_id, student_user_id, verification_status, created_at)
                VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
              `).bind(linkId, newUser.id, childUser.id).run();
            }
          } catch (linkErr) {
            console.warn('Parent student pending link warning:', linkErr);
          }
        }
      } catch (d1Err) {
        console.error('D1 registration insert error:', d1Err);
        return json({ 
          success: false, 
          error: 'Lỗi ghi nhận dữ liệu máy chủ D1: ' + (d1Err.message || String(d1Err)) 
        }, { status: 500 });
      }
    } else {
      // Local development mock fallback
      const localUsers = typeof getAllUsers === 'function' ? getAllUsers() : [];
      if (!localUsers.find(u => u.username === username)) {
        localUsers.push(newUser);
        if (typeof saveAllUsers === 'function') {
          saveAllUsers(localUsers);
        }
      }
    }

    // 7. Mint signed token with verified role and sanitized user
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

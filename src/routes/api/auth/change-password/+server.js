import { json } from '@sveltejs/kit';
import { verifyServerAuth, hashPassword, verifyPassword, isManager } from '../../../../lib/server/auth.js';

function parseSafeMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? { ...parsed } : {};
  } catch {
    return {};
  }
}

export async function POST({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: 'Vui lòng đăng nhập để thực hiện.' }, { status: 401 });
    }

    const db = platform?.env?.DB;
    if (!db) {
      return json({ success: false, error: 'Lỗi máy chủ: Không thể kết nối cơ sở dữ liệu.' }, { status: 500 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: 'JSON không hợp lệ' }, { status: 400 });
    }

    const { old_password, new_password, target_user_id, force_change_next_login } = body || {};

    if (!new_password || typeof new_password !== 'string') {
      return json({ success: false, error: 'Thiếu mật khẩu mới.' }, { status: 400 });
    }

    if (new_password.trim().length < 6) {
      return json({ success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' }, { status: 400 });
    }

    const isAdminReset = Boolean(target_user_id && target_user_id !== auth.user.id);
    if (isAdminReset) {
      if (!isManager(auth.user)) {
        return json({ success: false, error: 'Forbidden: Chỉ Quản trị viên / Leader mới được cấp lại mật khẩu cho tài khoản khác.' }, { status: 403 });
      }
      const targetUser = await db.prepare('SELECT id, username, role, metadata FROM users WHERE id = ? OR username = ? LIMIT 1')
        .bind(target_user_id, target_user_id)
        .first();
      if (!targetUser) {
        return json({ success: false, error: 'Không tìm thấy tài khoản người dùng cần đổi mật khẩu.' }, { status: 404 });
      }
      if (String(targetUser.role || '').toLowerCase() === 'superadmin' && String(auth.user.role || '').toLowerCase() !== 'superadmin') {
        return json({ success: false, error: 'Forbidden: Chỉ SuperAdmin mới có thể đặt lại mật khẩu cho SuperAdmin.' }, { status: 403 });
      }

      const newHashed = await hashPassword(new_password.trim());
      const meta = parseSafeMetadata(targetUser.metadata);
      if (force_change_next_login === true) {
        meta.must_change_password = true;
      } else {
        delete meta.must_change_password;
      }

      await db.prepare(`
        UPDATE users
        SET password = ?,
            metadata = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(newHashed, JSON.stringify(meta), targetUser.id).run();

      try {
        await db.prepare(`
          INSERT INTO audit_logs (id, actor_id, actor_role, action, details, created_at)
          VALUES (?, ?, ?, 'admin_reset_password', ?, CURRENT_TIMESTAMP)
        `).bind(
          `aud_pw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          auth.user.id,
          auth.user.role || '',
          JSON.stringify({ target_user_id: targetUser.id, target_username: targetUser.username })
        ).run();
      } catch {}

      return json({
        success: true,
        target_user_id: targetUser.id,
        message: `Đã đặt mật khẩu mới cho tài khoản @${targetUser.username || targetUser.id} thành công.`
      });
    }

    // Self password change flow
    const isSelfSuperAdminBypass = Boolean(!old_password && String(auth.user.role || '').toLowerCase() === 'superadmin' && body?.admin_self_override === true);
    if (!old_password && !isSelfSuperAdminBypass) {
      return json({ success: false, error: 'Thiếu mật khẩu cũ hoặc mật khẩu mới.' }, { status: 400 });
    }

    const user = await db.prepare('SELECT id, username, password, metadata FROM users WHERE id = ? OR username = ? LIMIT 1')
      .bind(auth.user.id, auth.user.id)
      .first();
    if (!user) {
      return json({ success: false, error: 'Không tìm thấy người dùng.' }, { status: 404 });
    }

    if (!isSelfSuperAdminBypass) {
      const isMatch = await verifyPassword(old_password, user.password);
      if (!isMatch) {
        return json({ success: false, error: 'Mật khẩu hiện tại không chính xác.' }, { status: 401 });
      }
    }

    const newHashed = await hashPassword(new_password.trim());
    const meta = parseSafeMetadata(user.metadata);
    delete meta.must_change_password;

    await db.prepare(`
      UPDATE users
      SET password = ?,
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newHashed, JSON.stringify(meta), user.id).run();

    try {
      await db.prepare(`
        INSERT INTO audit_logs (id, actor_id, actor_role, action, details, created_at)
        VALUES (?, ?, ?, 'self_change_password', ?, CURRENT_TIMESTAMP)
      `).bind(
        `aud_pw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        user.id,
        auth.user.role || '',
        JSON.stringify({ user_id: user.id })
      ).run();
    } catch {}

    return json({ success: true, message: 'Đổi mật khẩu thành công.' });
  } catch (err) {
    console.error('Change password error:', err);
    return json({ success: false, error: 'Lỗi máy chủ: Không thể xử lý yêu cầu.' }, { status: 500 });
  }
}

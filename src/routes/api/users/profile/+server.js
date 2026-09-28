// src/routes/api/users/profile/+server.js
import { json } from '@sveltejs/kit';
import { verifyServerAuth, sanitizeUser, isStaffUser } from '../../../../lib/server/auth.js';
import { updateUserProfile } from '../../../../lib/unifiedStore.js';

export const prerender = false;

// Forbidden fields that cannot be modified via self-profile endpoint (privilege escalation prevention)
const FORBIDDEN_FIELDS = [
  'role',
  'status',
  'approval_status',
  'stars',
  'stars_balance',
  'password',
  'password_hash',
  'salt',
  'is_verified',
  'id',
  'username',
  'class_id'
];

/**
 * GET /api/users/profile
 * Returns the authenticated user's current authoritative profile from D1.
 */
export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập để xem thông tin hồ sơ.'
    }, { status: auth.status || 401 });
  }

  const userId = auth.user.id;
  const db = platform?.env?.DB;

  if (db) {
    try {
      const row = await db.prepare(`
        SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
        FROM users WHERE id = ? LIMIT 1
      `).bind(userId).first();

      if (!row) {
        return json({ success: false, error: 'Không tìm thấy hồ sơ người dùng trong cơ sở dữ liệu.' }, { status: 404 });
      }

      return json({
        success: true,
        user: sanitizeUser(row),
        source: 'cloudflare_d1'
      });
    } catch (dbErr) {
      console.error('D1 fetch profile error:', dbErr);
      return json({
        success: false,
        error: `DatabaseError: Không thể truy vấn hồ sơ (${dbErr.message}).`
      }, { status: 500 });
    }
  }

  return json({
    success: true,
    user: sanitizeUser(auth.user),
    source: 'in_memory'
  });
}

/**
 * POST & PATCH /api/users/profile
 * Updates self-profile of the authenticated actor.
 * Strictly enforces field allowlisting and blocks privilege escalation.
 */
async function handleProfileUpdate({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập để cập nhật hồ sơ.'
    }, { status: auth.status || 401 });
  }

  const actor = auth.user;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ success: false, error: 'SchemaError: Payload phải là một JSON object.' }, { status: 400 });
  }

  // 1. Strict Privilege Escalation Protection
  for (const forbidden of FORBIDDEN_FIELDS) {
    if (forbidden in body && body[forbidden] !== undefined) {
      return json({
        success: false,
        error: `PrivilegeEscalationAttempt: Không được phép thay đổi trường đặc quyền "${forbidden}" qua hồ sơ cá nhân.`
      }, { status: 400 });
    }
  }

  // 2. Grade modification RBAC
  // Students and parents CANNOT modify grade directly; they must request class transfer.
  if ('grade' in body && body.grade !== undefined) {
    const isStaff = isStaffUser(actor);
    if (!isStaff) {
      return json({
        success: false,
        error: 'ForbiddenGradeChange: Học sinh và phụ huynh không thể tự ý sửa đổi khối lớp trực tiếp. Vui lòng gửi yêu cầu chuyển lớp tới giáo viên quản nhiệm.'
      }, { status: 403 });
    }
  }

  // 3. Validate allowlisted fields
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return json({ success: false, error: 'Họ và tên không được để trống.' }, { status: 400 });
    }
    if (body.name.trim().length > 100) {
      return json({ success: false, error: 'Họ và tên không được vượt quá 100 ký tự.' }, { status: 400 });
    }
  }

  if (body.phone !== undefined && body.phone !== null && typeof body.phone === 'string' && body.phone.length > 25) {
    return json({ success: false, error: 'Số điện thoại không được vượt quá 25 ký tự.' }, { status: 400 });
  }

  if (body.email !== undefined && body.email !== null && typeof body.email === 'string' && body.email.length > 100) {
    return json({ success: false, error: 'Địa chỉ email không được vượt quá 100 ký tự.' }, { status: 400 });
  }

  if (body.school !== undefined && body.school !== null && typeof body.school === 'string' && body.school.length > 150) {
    return json({ success: false, error: 'Tên trường học không được vượt quá 150 ký tự.' }, { status: 400 });
  }

  if (body.zalo_id !== undefined && body.zalo_id !== null && typeof body.zalo_id === 'string' && body.zalo_id.length > 50) {
    return json({ success: false, error: 'Zalo ID / Số Zalo không được vượt quá 50 ký tự.' }, { status: 400 });
  }

  if (body.target !== undefined && body.target !== null && typeof body.target === 'string' && body.target.length > 200) {
    return json({ success: false, error: 'Mục tiêu học tập không được vượt quá 200 ký tự.' }, { status: 400 });
  }

  const db = platform?.env?.DB;

  if (db) {
    try {
      // Fetch existing authoritative user record
      const current = await db.prepare(`
        SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
        FROM users WHERE id = ? LIMIT 1
      `).bind(actor.id).first();

      if (!current) {
        return json({ success: false, error: 'Không tìm thấy tài khoản người dùng trong cơ sở dữ liệu.' }, { status: 404 });
      }

      let meta = {};
      try {
        meta = typeof current.metadata === 'string' ? JSON.parse(current.metadata) : (current.metadata || {});
      } catch {
        meta = {};
      }

      // Merge allowlisted profile fields
      const newName = body.name !== undefined ? body.name.trim() : current.name;
      const newPhone = body.phone !== undefined ? (body.phone ? body.phone.trim() : '') : current.phone;
      const newEmail = body.email !== undefined ? (body.email ? body.email.trim() : '') : current.email;
      const newAvatar = body.avatar !== undefined ? body.avatar : current.avatar;

      if (body.school !== undefined) meta.school = body.school ? body.school.trim() : '';
      if (body.zalo_id !== undefined) {
        meta.zalo_id = body.zalo_id ? body.zalo_id.trim() : '';
        meta.zalo_phone = meta.zalo_id;
      }
      if (body.target !== undefined) meta.target = body.target ? body.target.trim() : '';

      // Staff role updating own grade
      let newGrade = current.grade;
      if (body.grade !== undefined && isStaffUser(actor)) {
        newGrade = body.grade ? body.grade.trim() : current.grade;
        meta.grade = newGrade;
      }

      const metaJson = JSON.stringify(meta);

      const updateRes = await db.prepare(`
        UPDATE users 
        SET name = ?, phone = ?, email = ?, avatar = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
      `).bind(newName, newPhone, newEmail, newAvatar, metaJson, actor.id).run();

      if (updateRes && updateRes.meta && typeof updateRes.meta.changes === 'number' && updateRes.meta.changes < 1) {
        throw new Error('D1 profile update affected 0 rows');
      }

      // Read back fresh updated record from database
      const freshUser = await db.prepare(`
        SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
        FROM users WHERE id = ? LIMIT 1
      `).bind(actor.id).first();

      // Sync local in-memory store if function is available
      try {
        updateUserProfile(actor.id, {
          name: newName,
          phone: newPhone,
          email: newEmail,
          avatar: newAvatar,
          school: meta.school,
          zalo_id: meta.zalo_id,
          target: meta.target
        }, actor);
      } catch {}

      return json({
        success: true,
        message: 'Cập nhật hồ sơ cá nhân thành công!',
        user: sanitizeUser(freshUser)
      });
    } catch (writeErr) {
      console.error('D1 self-profile write error:', writeErr);
      return json({
        success: false,
        error: `DatabaseError (Fail-Closed): Không thể lưu hồ sơ vào cơ sở dữ liệu (${writeErr.message}).`
      }, { status: 500 });
    }
  }

  // Fallback for non-D1 test / dev environment
  const localRes = updateUserProfile(actor.id, body, actor);
  if (!localRes.success) {
    return json({ success: false, error: localRes.error || 'Cập nhật hồ sơ thất bại.' }, { status: 400 });
  }

  return json({
    success: true,
    message: 'Cập nhật hồ sơ thành công!',
    user: sanitizeUser(localRes.user)
  });
}

export const POST = handleProfileUpdate;
export const PATCH = handleProfileUpdate;

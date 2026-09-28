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
 * Checks whether explicit local mock fallback is permitted.
 */
function isMockAllowed(platform) {
  return process.env.ALLOW_LOCAL_MOCK_FALLBACK === 'true' || platform?.env?.MOCK_D1 === 'true';
}

/**
 * Normalizes Vietnamese phone number according to standard auth registration contract.
 * Replaces leading '+84' or '84' with '0'.
 */
function normalizeVnPhone(raw) {
  if (!raw) return null;
  const clean = String(raw).trim();
  if (!clean) return null;
  const isVnPhone = /^(0|\+84)[35789][0-9]{8}$/.test(clean);
  if (!isVnPhone) return false;
  const digits = clean.replace(/[^0-9]/g, '');
  return digits.startsWith('84') ? '0' + digits.slice(2) : digits;
}

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

  if (!db) {
    if (!isMockAllowed(platform)) {
      return json({
        success: false,
        error: 'ServiceUnavailable: Cơ sở dữ liệu Cloudflare D1 không khả dụng hoặc chưa được cấu hình binding (fail-closed).'
      }, { status: 503 });
    }
    return json({
      success: true,
      user: sanitizeUser(auth.user),
      source: 'in_memory'
    });
  }

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

/**
 * POST & PATCH /api/users/profile
 * Updates self-profile of the authenticated actor.
 * Strictly enforces field allowlisting, types, phone normalization, concurrency CAS and blocks privilege escalation.
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
    if (body.grade !== null && typeof body.grade !== 'string') {
      return json({ success: false, error: 'InvalidType: Khối lớp phải là chuỗi ký tự (string).' }, { status: 400 });
    }
  }

  // 3. Schema 400 Strict Type Validation
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return json({ success: false, error: 'Họ và tên không được để trống.' }, { status: 400 });
    }
    if (body.name.trim().length > 100) {
      return json({ success: false, error: 'Họ và tên không được vượt quá 100 ký tự.' }, { status: 400 });
    }
  }

  let normalizedPhone = undefined; // undefined = untouched
  if (body.phone !== undefined) {
    if (body.phone === null || (typeof body.phone === 'string' && body.phone.trim() === '')) {
      normalizedPhone = null; // Empty stored as NULL in D1
    } else {
      if (typeof body.phone !== 'string') {
        return json({ success: false, error: 'InvalidType: Số điện thoại phải là chuỗi ký tự (string).' }, { status: 400 });
      }
      if (body.phone.length > 25) {
        return json({ success: false, error: 'Số điện thoại không được vượt quá 25 ký tự.' }, { status: 400 });
      }
      const norm = normalizeVnPhone(body.phone);
      if (norm === false) {
        return json({
          success: false,
          error: 'InvalidPhone: Số điện thoại không đúng định dạng di động Việt Nam hợp lệ (ví dụ: 0912345678 hoặc +84912345678).'
        }, { status: 400 });
      }
      normalizedPhone = norm;
    }
  }

  let normalizedEmail = undefined;
  if (body.email !== undefined) {
    if (body.email === null || (typeof body.email === 'string' && body.email.trim() === '')) {
      normalizedEmail = null;
    } else {
      if (typeof body.email !== 'string') {
        return json({ success: false, error: 'InvalidType: Địa chỉ email phải là chuỗi ký tự (string).' }, { status: 400 });
      }
      if (body.email.length > 100) {
        return json({ success: false, error: 'Địa chỉ email không được vượt quá 100 ký tự.' }, { status: 400 });
      }
      normalizedEmail = body.email.trim().toLowerCase();
    }
  }

  if (body.avatar !== undefined && body.avatar !== null) {
    if (typeof body.avatar !== 'string') {
      return json({ success: false, error: 'InvalidType: Ảnh đại diện phải là chuỗi ký tự (string).' }, { status: 400 });
    }
    if (body.avatar.length > 500000) {
      return json({ success: false, error: 'Dữ liệu ảnh đại diện quá lớn.' }, { status: 400 });
    }
  }

  if (body.school !== undefined && body.school !== null) {
    if (typeof body.school !== 'string') {
      return json({ success: false, error: 'InvalidType: Tên trường học phải là chuỗi ký tự (string).' }, { status: 400 });
    }
    if (body.school.length > 150) {
      return json({ success: false, error: 'Tên trường học không được vượt quá 150 ký tự.' }, { status: 400 });
    }
  }

  if (body.zalo_id !== undefined && body.zalo_id !== null) {
    if (typeof body.zalo_id !== 'string') {
      return json({ success: false, error: 'InvalidType: Zalo ID phải là chuỗi ký tự (string).' }, { status: 400 });
    }
    if (body.zalo_id.length > 50) {
      return json({ success: false, error: 'Zalo ID / Số Zalo không được vượt quá 50 ký tự.' }, { status: 400 });
    }
  }

  if (body.target !== undefined && body.target !== null) {
    if (typeof body.target !== 'string') {
      return json({ success: false, error: 'InvalidType: Mục tiêu học tập phải là chuỗi ký tự (string).' }, { status: 400 });
    }
    if (body.target.length > 200) {
      return json({ success: false, error: 'Mục tiêu học tập không được vượt quá 200 ký tự.' }, { status: 400 });
    }
  }

  const db = platform?.env?.DB;

  if (!db) {
    if (!isMockAllowed(platform)) {
      return json({
        success: false,
        error: 'ServiceUnavailable: Cơ sở dữ liệu Cloudflare D1 không khả dụng hoặc chưa được cấu hình binding (fail-closed).'
      }, { status: 503 });
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

  try {
    // Fetch existing authoritative user record
    const current = await db.prepare(`
      SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
      FROM users WHERE id = ? LIMIT 1
    `).bind(actor.id).first();

    if (!current) {
      return json({ success: false, error: 'Không tìm thấy tài khoản người dùng trong cơ sở dữ liệu.' }, { status: 404 });
    }

    // Concurrency CAS guard: check expected_updated_at if supplied
    if (body.expected_updated_at !== undefined && current.updated_at !== body.expected_updated_at) {
      return json({
        success: false,
        error: 'ConcurrencyConflict: Hồ sơ đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang và thử lại.'
      }, { status: 409 });
    }

    // Phone uniqueness pre-check against other users
    if (normalizedPhone) {
      const dupPhone = await db.prepare(`
        SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1
      `).bind(normalizedPhone, actor.id).first();

      if (dupPhone) {
        return json({
          success: false,
          error: 'DuplicatePhone: Số điện thoại này đã được sử dụng bởi một tài khoản khác.'
        }, { status: 409 });
      }
    }

    // Email uniqueness pre-check against other users
    if (normalizedEmail) {
      const dupEmail = await db.prepare(`
        SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1
      `).bind(normalizedEmail, actor.id).first();

      if (dupEmail) {
        return json({
          success: false,
          error: 'DuplicateEmail: Địa chỉ email này đã được sử dụng bởi một tài khoản khác.'
        }, { status: 409 });
      }
    }

    // Dynamic field update clauses: only update fields provided in request!
    const updateClauses = [];
    const updateParams = [];

    if (body.name !== undefined) {
      updateClauses.push('name = ?');
      updateParams.push(body.name.trim());
    }

    if (normalizedPhone !== undefined) {
      updateClauses.push('phone = ?');
      updateParams.push(normalizedPhone);
    }

    if (normalizedEmail !== undefined) {
      updateClauses.push('email = ?');
      updateParams.push(normalizedEmail);
    }

    if (body.avatar !== undefined) {
      updateClauses.push('avatar = ?');
      updateParams.push(body.avatar);
    }

    if (body.grade !== undefined && isStaffUser(actor)) {
      updateClauses.push('grade = ?');
      updateParams.push(body.grade ? body.grade.trim() : null);
    }

    // Metadata safe merge
    const hasMetaChanges = body.school !== undefined || body.zalo_id !== undefined || body.target !== undefined || (body.grade !== undefined && isStaffUser(actor));
    if (hasMetaChanges) {
      let meta = {};
      try {
        meta = typeof current.metadata === 'string' ? JSON.parse(current.metadata) : (current.metadata || {});
      } catch {
        meta = {};
      }

      if (body.school !== undefined) meta.school = body.school ? body.school.trim() : '';
      if (body.zalo_id !== undefined) {
        meta.zalo_id = body.zalo_id ? body.zalo_id.trim() : '';
        meta.zalo_phone = meta.zalo_id;
      }
      if (body.target !== undefined) meta.target = body.target ? body.target.trim() : '';
      if (body.grade !== undefined && isStaffUser(actor)) {
        meta.grade = body.grade ? body.grade.trim() : '';
      }

      updateClauses.push('metadata = ?');
      updateParams.push(JSON.stringify(meta));
    }

    if (updateClauses.length === 0) {
      return json({
        success: true,
        message: 'Không có thông tin nào cần cập nhật.',
        user: sanitizeUser(current)
      });
    }

    updateClauses.push('updated_at = CURRENT_TIMESTAMP');
    let updateSql = `UPDATE users SET ${updateClauses.join(', ')} WHERE id = ?`;
    updateParams.push(actor.id);

    if (body.expected_updated_at !== undefined) {
      updateSql += ' AND updated_at = ?';
      updateParams.push(body.expected_updated_at);
    }

    let updateRes;
    try {
      updateRes = await db.prepare(updateSql).bind(...updateParams).run();
    } catch (sqlErr) {
      const msg = sqlErr?.message || '';
      if (/UNIQUE constraint failed: users\.phone/i.test(msg)) {
        return json({
          success: false,
          error: 'DuplicatePhone: Số điện thoại này đã được sử dụng bởi một tài khoản khác.'
        }, { status: 409 });
      }
      if (/UNIQUE constraint failed: users\.email/i.test(msg)) {
        return json({
          success: false,
          error: 'DuplicateEmail: Địa chỉ email này đã được sử dụng bởi một tài khoản khác.'
        }, { status: 409 });
      }
      throw sqlErr;
    }

    if (updateRes && updateRes.meta && typeof updateRes.meta.changes === 'number' && updateRes.meta.changes < 1) {
      if (body.expected_updated_at !== undefined) {
        return json({
          success: false,
          error: 'ConcurrencyConflict: Hồ sơ đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang.'
        }, { status: 409 });
      }
      throw new Error('D1 profile update affected 0 rows');
    }

    // Read back fresh updated record from database
    const freshUser = await db.prepare(`
      SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at
      FROM users WHERE id = ? LIMIT 1
    `).bind(actor.id).first();

    // Sync local in-memory store if function is available
    try {
      let finalMeta = {};
      try {
        finalMeta = typeof freshUser.metadata === 'string' ? JSON.parse(freshUser.metadata) : (freshUser.metadata || {});
      } catch {}
      updateUserProfile(actor.id, {
        name: freshUser.name,
        phone: freshUser.phone,
        email: freshUser.email,
        avatar: freshUser.avatar,
        school: finalMeta.school,
        zalo_id: finalMeta.zalo_id,
        target: finalMeta.target
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

export const POST = handleProfileUpdate;
export const PATCH = handleProfileUpdate;

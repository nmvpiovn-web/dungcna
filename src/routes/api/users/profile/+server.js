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
 * Ensures the users table has the profile_version column for integer-based CAS.
 * Idempotent migration: runs ALTER TABLE ADD COLUMN only if missing.
 */
async function ensureProfileVersionColumn(db) {
  try {
    await db.prepare(`ALTER TABLE users ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 1`).run();
  } catch (alterErr) {
    // Only swallow "duplicate column name" — column already exists
    if (alterErr?.message && /duplicate column name/i.test(alterErr.message)) {
      // Column already exists — expected for subsequent requests
      return;
    }
    throw alterErr; // IO or other errors propagate
  }
}

/**
 * GET /api/users/profile
 * Returns the authenticated user's current authoritative profile from D1.
 * Includes profile_version for CAS concurrency on subsequent writes.
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
      profile_version: 1,
      source: 'in_memory'
    });
  }

  try {
    await ensureProfileVersionColumn(db);

    const row = await db.prepare(`
      SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at, profile_version
      FROM users WHERE id = ? LIMIT 1
    `).bind(userId).first();

    if (!row) {
      return json({ success: false, error: 'Không tìm thấy hồ sơ người dùng trong cơ sở dữ liệu.' }, { status: 404 });
    }

    return json({
      success: true,
      user: sanitizeUser(row),
      profile_version: row.profile_version || 1,
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
 * Uses integer profile_version CAS to prevent lost updates.
 * Metadata fields use json_set() for atomic per-path updates — independent fields never overwrite each other.
 * Strictly enforces field allowlisting, types, phone normalization and blocks privilege escalation.
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

  // Validate expected_version type if present
  if (body.expected_version !== undefined) {
    if (typeof body.expected_version !== 'number' || !Number.isInteger(body.expected_version) || body.expected_version < 1) {
      return json({ success: false, error: 'InvalidType: expected_version phải là số nguyên dương.' }, { status: 400 });
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
      user: sanitizeUser(localRes.user),
      profile_version: 1
    });
  }

  try {
    // Ensure profile_version column exists (idempotent migration)
    await ensureProfileVersionColumn(db);

    // Fetch existing authoritative user record including profile_version
    const current = await db.prepare(`
      SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at, profile_version
      FROM users WHERE id = ? LIMIT 1
    `).bind(actor.id).first();

    if (!current) {
      return json({ success: false, error: 'Không tìm thấy tài khoản người dùng trong cơ sở dữ liệu.' }, { status: 404 });
    }

    const currentVersion = current.profile_version || 1;

    // Integer CAS guard: reject if client's expected_version doesn't match current
    if (body.expected_version !== undefined && body.expected_version !== currentVersion) {
      return json({
        success: false,
        error: 'ConcurrencyConflict: Hồ sơ đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang và thử lại.',
        current_version: currentVersion
      }, { status: 409 });
    }

    // Legacy CAS guard: support expected_updated_at for backward compatibility
    if (body.expected_updated_at !== undefined && current.updated_at !== body.expected_updated_at) {
      return json({
        success: false,
        error: 'ConcurrencyConflict: Hồ sơ đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang và thử lại.',
        current_version: currentVersion
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

    // Merge only supplied JSON paths against the row at WRITE time using json_set().
    // json_set() operates on the row's current metadata atomically — independent fields
    // from concurrent requests are never overwritten because each request only sets its own paths.
    const metadataPaths = [];
    const metadataValues = [];
    function setMetadata(path, value) {
      metadataPaths.push('?, ?');
      metadataValues.push(path, value);
    }
    if (body.school !== undefined) setMetadata('$.school', body.school?.trim() || '');
    if (body.target !== undefined) setMetadata('$.target', body.target?.trim() || '');
    if (body.zalo_id !== undefined) {
      const zalo = body.zalo_id?.trim() || '';
      setMetadata('$.zalo_id', zalo);
      setMetadata('$.zalo_phone', zalo);
    }
    if (body.grade !== undefined && isStaffUser(actor)) {
      setMetadata('$.grade', body.grade?.trim() || '');
    }
    if (metadataPaths.length) {
      updateClauses.push(`metadata = json_set(COALESCE(NULLIF(metadata, ''), '{}'), ${metadataPaths.join(', ')})`);
      updateParams.push(...metadataValues);
    }

    if (updateClauses.length === 0) {
      return json({
        success: true,
        message: 'Không có thông tin nào cần cập nhật.',
        user: sanitizeUser(current),
        profile_version: currentVersion
      });
    }

    // Always increment profile_version and update timestamp
    const newVersion = currentVersion + 1;
    updateClauses.push('profile_version = ?');
    updateParams.push(newVersion);
    updateClauses.push('updated_at = CURRENT_TIMESTAMP');

    // Build UPDATE with version guard in WHERE clause
    // This is the atomic CAS: if another request incremented version between our SELECT and UPDATE,
    // this UPDATE will affect 0 rows and we return 409.
    let updateSql = `UPDATE users SET ${updateClauses.join(', ')} WHERE id = ? AND profile_version = ?`;
    updateParams.push(actor.id, currentVersion);

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

    // If 0 rows affected, another request changed the version between our SELECT and UPDATE
    if (updateRes && updateRes.meta && typeof updateRes.meta.changes === 'number' && updateRes.meta.changes < 1) {
      // Re-read current version to return to the client for retry
      const recheck = await db.prepare('SELECT profile_version FROM users WHERE id = ?').bind(actor.id).first();
      return json({
        success: false,
        error: 'ConcurrencyConflict: Hồ sơ đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang và thử lại.',
        current_version: recheck?.profile_version || currentVersion
      }, { status: 409 });
    }

    // Read back fresh updated record from database
    const freshUser = await db.prepare(`
      SELECT id, username, phone, email, name, role, avatar, status, metadata, created_at, updated_at, profile_version
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
      user: sanitizeUser(freshUser),
      profile_version: freshUser.profile_version || newVersion
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

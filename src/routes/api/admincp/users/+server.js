// /api/admincp/users — Trung tâm quản lý tài khoản & đồng bộ nghiệp vụ đa vai trò (Cloudflare D1)
// GET: danh sách users (?q= tìm tên/username/phone, ?role= lọc role) kèm metadata, grade, stars_balance, teacher_profile.
// POST: create_user | update_user | update_role | toggle_status | approve_user | reset_password | adjust_stars | link_parent_student | delete_user
import { json } from '@sveltejs/kit';
import { verifyServerAuth, hashPassword, isManager, SUPERADMIN_EMAILS, SUPERADMIN_USERNAMES } from '../../../../lib/server/auth.js';

export const prerender = false;

const ASSIGNABLE_ROLES = ['student', 'parent', 'teacher', 'leader', 'admin'];
const MAX_LIMIT = 500;

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

function resolveEffectiveRole(row) {
  const meta = parseSafeMetadata(row?.metadata);
  if (meta.app_role && ASSIGNABLE_ROLES.includes(String(meta.app_role).toLowerCase())) {
    return String(meta.app_role).toLowerCase();
  }
  return String(row?.role || 'student').toLowerCase();
}

function mapRoleForDbCheckConstraint(role) {
  const r = String(role || 'student').toLowerCase();
  if (r === 'admin') return 'superadmin';
  if (r === 'leader') return 'teacher';
  return r;
}

async function requireManager(request, platform) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return { error: json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 }) };
  }
  if (!isManager(auth.user)) {
    return { error: json({ success: false, error: 'Forbidden: Chỉ SuperAdmin / Admin / Leader mới được quản lý tài khoản' }, { status: 403 }) };
  }
  return { user: auth.user };
}

function canActorManageTarget(actor, targetRole) {
  const myRole = String(actor?.role || '').toLowerCase();
  const tRole = String(targetRole || '').toLowerCase();
  if (myRole === 'superadmin') return true;
  if (tRole === 'superadmin') return false;
  if (myRole === 'admin') return tRole !== 'admin';
  if (myRole === 'leader') return !['admin', 'superadmin'].includes(tRole);
  return false;
}

function sanitizeRow(r, starsMap = new Map(), teacherMap = new Map(), parentLinksMap = new Map()) {
  const meta = parseSafeMetadata(r.metadata);
  const effectiveRole = resolveEffectiveRole(r);
  const grade = meta.grade || r.grade || '';
  const classId = meta.class_id || '';
  const enrolledGrades = Array.isArray(meta.enrolled_grades)
    ? meta.enrolled_grades
    : (grade ? [grade] : []);
  return {
    id: r.id,
    username: r.username,
    name: r.name || r.username,
    phone: r.phone || '',
    email: r.email || '',
    role: effectiveRole,
    status: r.status || 'active',
    approval_status: r.approval_status || 'approved',
    avatar: r.avatar || '',
    metadata: typeof r.metadata === 'string' ? r.metadata : JSON.stringify(meta),
    grade,
    class_id: classId,
    enrolled_grades: enrolledGrades,
    school: meta.school || '',
    parent_name: meta.parent_name || '',
    parent_phone: meta.parent_phone || '',
    must_change_password: Boolean(meta.must_change_password),
    stars_balance: starsMap.has(r.id) ? starsMap.get(r.id) : (Number(meta.stars_balance) || 0),
    teacher_profile: teacherMap.get(r.id) || null,
    linked_children: parentLinksMap.get(r.id) || [],
    created_at: r.created_at
  };
}

async function ensureAuxTables(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_profiles (
        teacher_id TEXT PRIMARY KEY,
        id TEXT,
        user_id TEXT,
        teacher_name TEXT NOT NULL,
        username TEXT NOT NULL,
        role_type TEXT NOT NULL,
        role_title TEXT NOT NULL,
        salary_type TEXT NOT NULL,
        base_salary_vnd REAL DEFAULT 0,
        rate_per_session_vnd REAL DEFAULT 0,
        total_sessions_taught INTEGER DEFAULT 0,
        leader_rating REAL DEFAULT 5.0,
        leader_appraisal TEXT,
        bonuses TEXT,
        private_reminders TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const extraCols = [
      'ALTER TABLE teacher_profiles ADD COLUMN id TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN teacher_id TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN user_id TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN teacher_name TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN username TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN role_type TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN role_title TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN salary_type TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN base_salary_vnd REAL DEFAULT 0;',
      'ALTER TABLE teacher_profiles ADD COLUMN rate_per_session_vnd REAL DEFAULT 0;',
      'ALTER TABLE teacher_profiles ADD COLUMN total_sessions_taught INTEGER DEFAULT 0;',
      'ALTER TABLE teacher_profiles ADD COLUMN leader_rating REAL DEFAULT 5.0;',
      'ALTER TABLE teacher_profiles ADD COLUMN leader_appraisal TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN bonuses TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN private_reminders TEXT;',
      'ALTER TABLE teacher_profiles ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;'
    ];
    for (const sql of extraCols) {
      try { await db.prepare(sql).run(); } catch {}
    }
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS student_stars (
        student_id TEXT PRIMARY KEY,
        stars_balance INTEGER DEFAULT 0,
        total_earned_stars INTEGER DEFAULT 0,
        stars_redeemed INTEGER DEFAULT 0,
        star_debt INTEGER DEFAULT 0,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {}
}

async function upsertTeacherProfileForUser(db, userObj, extra = {}) {
  try {
    await ensureAuxTables(db);
    let existing = await db.prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ? LIMIT 1')
      .bind(userObj.id)
      .first()
      .catch(() => null);

    if (!existing) {
      existing = await db.prepare('SELECT * FROM teacher_profiles WHERE user_id = ? LIMIT 1')
        .bind(userObj.id)
        .first()
        .catch(() => null);
    }

    const roleType = extra.role_type || extra.tier || existing?.role_type || 'lead';
    const roleTitle = extra.role_title || extra.specialization || existing?.role_title || 'Giáo viên Tiếng Anh';
    const salaryType = extra.salary_type || existing?.salary_type || 'per_session';
    const baseSalary = extra.base_salary_vnd !== undefined ? Number(extra.base_salary_vnd) : (Number(existing?.base_salary_vnd) || 0);
    const rateRaw = extra.rate_per_session_vnd !== undefined ? extra.rate_per_session_vnd : extra.hourly_rate_vnd;
    const ratePerSession = rateRaw !== undefined ? Number(rateRaw) : (Number(existing?.rate_per_session_vnd) || 300000);

    if (existing) {
      await db.prepare(`
        UPDATE teacher_profiles
        SET teacher_name = ?, username = ?, role_type = ?, role_title = ?, salary_type = ?,
            base_salary_vnd = ?, rate_per_session_vnd = ?, updated_at = CURRENT_TIMESTAMP
        WHERE teacher_id = ?
      `).bind(
        userObj.name || userObj.username,
        userObj.username,
        roleType,
        roleTitle,
        salaryType,
        baseSalary,
        ratePerSession,
        userObj.id
      ).run();
    } else {
      try {
        await db.prepare(`
          INSERT INTO teacher_profiles (
            teacher_id, teacher_name, username, role_type, role_title,
            salary_type, base_salary_vnd, rate_per_session_vnd, total_sessions_taught,
            leader_rating, leader_appraisal, bonuses, private_reminders
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 5.0, '', '[]', '[]')
        `).bind(
          userObj.id,
          userObj.name || userObj.username,
          userObj.username,
          roleType,
          roleTitle,
          salaryType,
          baseSalary,
          ratePerSession
        ).run();
      } catch {
        await db.prepare(`
          INSERT INTO teacher_profiles (
            id, teacher_id, user_id, teacher_name, username, role_type, role_title,
            salary_type, base_salary_vnd, rate_per_session_vnd, total_sessions_taught,
            leader_rating, leader_appraisal, bonuses, private_reminders
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5.0, '', '[]', '[]')
        `).bind(
          userObj.id,
          userObj.id,
          userObj.id,
          userObj.name || userObj.username,
          userObj.username,
          roleType,
          roleTitle,
          salaryType,
          baseSalary,
          ratePerSession
        ).run();
      }
    }
  } catch (err) {
    console.warn('[upsertTeacherProfileForUser] Non-fatal error:', err?.message);
  }
}

export async function GET({ request, url, platform }) {
  const gate = await requireManager(request, platform);
  if (gate.error) return gate.error;

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable: Không thể tải danh sách khi thiếu kết nối D1' }, { status: 503 });
  }

  const q = String(url.searchParams.get('q') || '').trim();
  const role = String(url.searchParams.get('role') || 'all').toLowerCase();
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || '250', 10) || 250));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  try {
    let rows = [];
    const params = [];
    let whereSql = ' WHERE 1=1';
    if (q) {
      whereSql += ` AND (LOWER(name) LIKE ? OR LOWER(username) LIKE ? OR LOWER(COALESCE(phone, '')) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ?)`;
      const like = `%${q.toLowerCase()}%`;
      params.push(like, like, like, like);
    }
    const orderLimitSql = ` ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`;

    try {
      const sql = `SELECT id, username, name, phone, email, role, status, approval_status, avatar, metadata, created_at FROM users${whereSql}${orderLimitSql}`;
      const res = await db.prepare(sql).bind(...params, limit, offset).all();
      rows = res?.results || [];
    } catch {
      const sqlFallback = `SELECT id, username, name, phone, email, role, status, metadata, created_at FROM users${whereSql}${orderLimitSql}`;
      const res = await db.prepare(sqlFallback).bind(...params, limit, offset).all();
      rows = res?.results || [];
    }

    const starsMap = new Map();
    const teacherMap = new Map();
    const parentLinksMap = new Map();

    try {
      const starRes = await db.prepare('SELECT student_id, stars_balance FROM student_stars').all();
      for (const s of (starRes?.results || [])) {
        starsMap.set(s.student_id, Number(s.stars_balance) || 0);
      }
    } catch {}

    try {
      const profRes = await db.prepare('SELECT teacher_id, role_type, role_title, salary_type, base_salary_vnd, rate_per_session_vnd, leader_rating FROM teacher_profiles').all();
      for (const p of (profRes?.results || [])) {
        teacherMap.set(p.teacher_id, p);
      }
    } catch {}

    try {
      const linkRes = await db.prepare(`
        SELECT psl.id as link_id, psl.parent_user_id, psl.student_user_id, psl.verification_status,
               u.name as student_name, u.username as student_username
        FROM parent_student_links psl
        LEFT JOIN users u ON u.id = psl.student_user_id
      `).all();
      for (const l of (linkRes?.results || [])) {
        const arr = parentLinksMap.get(l.parent_user_id) || [];
        arr.push(l);
        parentLinksMap.set(l.parent_user_id, arr);
      }
    } catch {}

    let users = rows.map(r => sanitizeRow(r, starsMap, teacherMap, parentLinksMap));
    if (role !== 'all') {
      users = users.filter(u => String(u.role || '').toLowerCase() === role);
    }

    return json({
      success: true,
      users,
      total: users.length,
      source: 'cloudflare_d1'
    });
  } catch (err) {
    console.error('[api/admincp/users] GET error:', err);
    return json({ success: false, error: `DatabaseError: Không thể tải danh sách tài khoản (${err.message})` }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const gate = await requireManager(request, platform);
  if (gate.error) return gate.error;
  const me = gate.user;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON' }, { status: 400 });
  }

  const action = String(body.action || '').trim();
  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable: Không thể cập nhật khi thiếu kết nối D1' }, { status: 503 });
  }

  try {
    // 1. CREATE USER (All Roles: student, teacher, parent, leader, admin)
    if (action === 'create_user') {
      const name = String(body.name || '').trim();
      const rawUsername = String(body.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      const username = rawUsername || `user_${Date.now().toString(36)}`;
      const password = String(body.password || '').trim();
      const newRole = String(body.role || 'student').trim().toLowerCase();
      const phone = String(body.phone || '').trim() || null;
      const rawEmail = String(body.email || '').trim().toLowerCase();

      if (!name) {
        return json({ success: false, error: 'ValidationError: Vui lòng nhập họ và tên.' }, { status: 400 });
      }
      if (username.length < 3) {
        return json({ success: false, error: 'ValidationError: Username phải có ít nhất 3 ký tự (a-z, 0-9, _).' }, { status: 400 });
      }
      if (password.length < 6) {
        return json({ success: false, error: 'ValidationError: Mật khẩu khởi tạo phải có ít nhất 6 ký tự.' }, { status: 400 });
      }
      if (!ASSIGNABLE_ROLES.includes(newRole)) {
        return json({ success: false, error: `InvalidRole: Vai trò phải thuộc: ${ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 });
      }
      if (!canActorManageTarget(me, newRole)) {
        return json({ success: false, error: `Forbidden: Bạn không đủ thẩm quyền tạo tài khoản vai trò ${newRole}.` }, { status: 403 });
      }

      const dup = await db.prepare('SELECT id, username FROM users WHERE LOWER(username) = ? LIMIT 1').bind(username).first();
      if (dup) {
        return json({ success: false, error: `ConflictError: Username @${username} đã tồn tại trong hệ thống.` }, { status: 409 });
      }

      // Ensure email is always non-null and unique for D1 NOT NULL UNIQUE constraint
      let email = rawEmail || `${username}@timbk.io.vn`;
      const dupEmail = await db.prepare('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1').bind(email).first().catch(() => null);
      if (dupEmail) {
        if (rawEmail) {
          return json({ success: false, error: `ConflictError: Email ${rawEmail} đã được sử dụng bởi tài khoản khác.` }, { status: 409 });
        }
        email = `${username}.${Date.now().toString(36)}@timbk.io.vn`;
      }

      const id = `usr_${newRole}_${crypto.randomUUID()}`;
      const passwordHash = await hashPassword(password);
      const grade = String(body.grade || (newRole === 'student' ? 'Lớp 7' : '')).trim();
      const classId = String(body.class_id || '').trim();
      const metadata = {
        grade,
        class_id: classId,
        enrolled_grades: grade ? [grade] : [],
        school: String(body.school || '').trim(),
        parent_name: String(body.parent_name || '').trim(),
        parent_phone: String(body.parent_phone || '').trim(),
        parent_zalo_id: String(body.parent_zalo_id || '').trim(),
        title: String(body.role_title || body.title || '').trim(),
        certs: String(body.certs || '').trim()
      };
      if (['leader', 'admin'].includes(newRole)) {
        metadata.app_role = newRole;
      }
      if (body.must_change_password === true) {
        metadata.must_change_password = true;
      }

      const status = body.status === 'trial' ? 'trial' : 'active';
      const approvalStatus = body.status === 'trial' ? 'trial' : (newRole === 'student' ? 'official' : 'approved');

      // Try inserting with newRole first; if D1 has legacy CHECK(role IN ('superadmin','teacher','student','parent')), fallback to mapped DB role
      let inserted = false;
      for (const candidateRole of [newRole, mapRoleForDbCheckConstraint(newRole)]) {
        if (inserted) break;
        try {
          await db.prepare(`
            INSERT INTO users (id, username, phone, password, email, name, role, avatar, status, approval_status, metadata, profile_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).bind(
            id, username, phone, passwordHash, email, name, candidateRole,
            body.avatar || '', status, approvalStatus, JSON.stringify(metadata)
          ).run();
          inserted = true;
        } catch {
          try {
            await db.prepare(`
              INSERT INTO users (id, username, phone, password, email, name, role, avatar, status, metadata, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).bind(
              id, username, phone, passwordHash, email, name, candidateRole,
              body.avatar || '', status, JSON.stringify(metadata)
            ).run();
            inserted = true;
          } catch {}
        }
      }

      if (!inserted) {
        return json({ success: false, error: 'DatabaseError: Không thể khởi tạo bản ghi tài khoản vào bảng users D1' }, { status: 500 });
      }

      // Cross-table synchronization
      await ensureAuxTables(db);
      if (newRole === 'student') {
        const initStars = Number.isFinite(Number(body.initial_stars)) ? Math.max(0, Math.floor(Number(body.initial_stars))) : 500;
        try {
          await db.prepare(`
            INSERT OR IGNORE INTO student_stars (student_id, stars_balance, total_earned_stars, stars_redeemed, star_debt)
            VALUES (?, ?, ?, 0, 0)
          `).bind(id, initStars, initStars).run();
        } catch {}
      } else if (newRole === 'teacher' || newRole === 'leader') {
        await upsertTeacherProfileForUser(db, { id, username, name }, {
          role_type: newRole === 'leader' ? 'lead' : (body.role_type || body.tier || 'lead'),
          role_title: body.role_title || body.specialization || body.title || (newRole === 'leader' ? 'Quản lý Chuyên môn (Leader)' : 'Giáo viên Tiếng Anh'),
          salary_type: body.salary_type || 'per_session',
          base_salary_vnd: body.base_salary_vnd ?? 0,
          rate_per_session_vnd: body.rate_per_session_vnd ?? body.hourly_rate_vnd ?? 300000
        });
      } else if (newRole === 'parent' && (body.student_id || body.linked_student_id)) {
        const linkedStuKey = body.student_id || body.linked_student_id;
        try {
          await db.prepare(`
            CREATE TABLE IF NOT EXISTS parent_student_links (
              id TEXT PRIMARY KEY,
              parent_user_id TEXT NOT NULL,
              student_user_id TEXT NOT NULL,
              verification_status TEXT DEFAULT 'verified',
              verified_at TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `).run();
          const targetStu = await db.prepare("SELECT id FROM users WHERE (id = ? OR username = ?) AND role = 'student' LIMIT 1")
            .bind(linkedStuKey, linkedStuKey).first();
          if (targetStu) {
            await db.prepare(`
              INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status, verified_at, created_at)
              VALUES (?, ?, ?, 'verified', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).bind(`link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, id, targetStu.id).run();
          }
        } catch {}
      }

      const createdRow = {
        id, username, name, phone, email, role: newRole, status, approval_status: approvalStatus, metadata: JSON.stringify(metadata), created_at: new Date().toISOString()
      };
      return json({
        success: true,
        message: `Đã tạo tài khoản @${username} (${newRole}) thành công trên Cloudflare D1.`,
        user: sanitizeRow(createdRow)
      }, { status: 201 });
    }

    // 1B. DIRECT UNLINK BY link_id OR (parent_user_id + student_user_id)
    if (action === 'unlink_parent_student' && (body.link_id || (!body.user_id && body.parent_user_id))) {
      await ensureAuxTables(db);
      const linkId = String(body.link_id || '').trim();
      const parentId = String(body.parent_user_id || body.user_id || '').trim();
      const studentId = String(body.student_user_id || body.student_id || '').trim();
      if (linkId) {
        await db.prepare('DELETE FROM parent_student_links WHERE id = ?').bind(linkId).run();
        return json({
          success: true,
          message: `Đã xóa/gỡ liên kết phụ huynh - học sinh (${linkId}) thành công!`
        });
      }
      if (parentId && studentId) {
        await db.prepare('DELETE FROM parent_student_links WHERE parent_user_id = ? AND student_user_id = ?').bind(parentId, studentId).run();
        return json({
          success: true,
          message: 'Đã gỡ liên kết phụ huynh - học sinh thành công!'
        });
      }
      return json({ success: false, error: 'Thiếu link_id hoặc cặp (parent_user_id, student_id) để xóa liên kết.' }, { status: 400 });
    }

    // All remaining actions require user_id
    const userId = String(body.user_id || body.userId || body.target_user_id || body.parent_user_id || body.id || '').trim();
    if (!userId) {
      return json({ success: false, error: 'MissingUserId: Thiếu mã tài khoản (user_id)' }, { status: 400 });
    }

    let target = null;
    try {
      target = await db.prepare(
        `SELECT id, username, name, phone, email, role, status, approval_status, avatar, metadata, created_at FROM users WHERE id = ? OR username = ? LIMIT 1;`
      ).bind(userId, userId).first();
    } catch {
      target = await db.prepare(
        `SELECT id, username, name, phone, email, role, status, avatar, metadata, created_at FROM users WHERE id = ? OR username = ? LIMIT 1;`
      ).bind(userId, userId).first();
    }

    if (!target) {
      return json({ success: false, error: 'UserNotFound: Không tìm thấy tài khoản trong D1' }, { status: 404 });
    }

    const targetId = target.id;
    const targetEffectiveRole = resolveEffectiveRole(target);

    // 2. UPDATE ROLE
    if (action === 'update_role') {
      const newRole = String(body.role || '').toLowerCase();
      if (!ASSIGNABLE_ROLES.includes(newRole)) {
        return json({ success: false, error: `InvalidRole: Role phải là một trong: ${ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 });
      }
      if (newRole === 'admin' && String(me.role || '').toLowerCase() !== 'superadmin') {
        return json({ success: false, error: 'Forbidden: Chỉ superadmin mới được gán role admin' }, { status: 403 });
      }
      if (targetId === me.id) {
        return json({ success: false, error: 'SelfRoleChange: Không được tự đổi role của chính mình' }, { status: 403 });
      }
      if (!canActorManageTarget(me, targetEffectiveRole) || !canActorManageTarget(me, newRole)) {
        return json({ success: false, error: 'Forbidden: Không đủ thẩm quyền thay đổi vai trò của tài khoản này' }, { status: 403 });
      }

      const approvalStatus = newRole === 'student' ? 'official' : 'approved';
      const meta = parseSafeMetadata(target.metadata);
      if (['leader', 'admin'].includes(newRole)) {
        meta.app_role = newRole;
      } else {
        delete meta.app_role;
      }

      let updated = false;
      for (const candidateRole of [newRole, mapRoleForDbCheckConstraint(newRole)]) {
        if (updated) break;
        try {
          await db.prepare(`UPDATE users SET role = ?, approval_status = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`)
            .bind(candidateRole, approvalStatus, JSON.stringify(meta), targetId).run();
          updated = true;
        } catch {
          try {
            await db.prepare(`UPDATE users SET role = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`)
              .bind(candidateRole, JSON.stringify(meta), targetId).run();
            updated = true;
          } catch {}
        }
      }

      // Cross-table sync when promoted to teacher or student
      if (newRole === 'teacher' || newRole === 'leader') {
        await upsertTeacherProfileForUser(db, target, body);
      } else if (newRole === 'student') {
        await ensureAuxTables(db);
        try {
          await db.prepare(`INSERT OR IGNORE INTO student_stars (student_id, stars_balance, total_earned_stars, stars_redeemed, star_debt) VALUES (?, 500, 500, 0, 0)`).bind(targetId).run();
        } catch {}
      }

      return json({
        success: true,
        message: `Đã đổi role @${target.username} thành ${newRole} và đồng bộ hồ sơ D1.`,
        user: { ...sanitizeRow({ ...target, metadata: JSON.stringify(meta) }), role: newRole, approval_status: approvalStatus }
      });
    }

    // 3. TOGGLE STATUS (Lock / Unlock)
    if (action === 'toggle_status') {
      if (targetId === me.id) {
        return json({ success: false, error: 'SelfLock: Không được tự khóa tài khoản của chính mình' }, { status: 403 });
      }
      if (!canActorManageTarget(me, targetEffectiveRole)) {
        return json({ success: false, error: 'Forbidden: Bạn không có quyền khóa/mở tài khoản cấp cao hơn' }, { status: 403 });
      }
      const requestedStatus = body.status && ['active', 'locked'].includes(body.status)
        ? body.status
        : ((target.status || 'active') === 'locked' ? 'active' : 'locked');
      await db.prepare(`UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`)
        .bind(requestedStatus, targetId).run();

      if (requestedStatus === 'locked') {
        try {
          await db.prepare(`UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL`).bind(targetId).run();
        } catch {}
      }

      return json({
        success: true,
        message: requestedStatus === 'locked' ? `Đã khóa tài khoản @${target.username}.` : `Đã mở khóa tài khoản @${target.username}.`,
        user: { ...sanitizeRow(target), status: requestedStatus }
      });
    }

    // 4. RESET PASSWORD (Admin/Manager sets a new password for any managed user)
    if (action === 'reset_password') {
      if (targetId !== me.id && !canActorManageTarget(me, targetEffectiveRole)) {
        return json({ success: false, error: 'Forbidden: Không đủ quyền đặt lại mật khẩu cho tài khoản này' }, { status: 403 });
      }
      const newPassword = String(body.new_password || body.newPassword || body.password || '').trim();
      if (newPassword.length < 6) {
        return json({ success: false, error: 'ValidationError: Mật khẩu mới phải có ít nhất 6 ký tự.' }, { status: 400 });
      }
      const hashed = await hashPassword(newPassword);
      const meta = parseSafeMetadata(target.metadata);
      if (body.force_change_next_login === true || body.mustChangePassword === true) {
        meta.must_change_password = true;
      } else {
        delete meta.must_change_password;
      }

      await db.prepare(`
        UPDATE users
        SET password = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(hashed, JSON.stringify(meta), targetId).run();

      return json({
        success: true,
        message: `Đã đặt lại mật khẩu mới cho @${target.username} thành công!`,
        user: sanitizeRow({ ...target, metadata: JSON.stringify(meta) })
      });
    }

    // 5. UPDATE USER PROFILE / GRADE / CLASS / TEACHER SALARY
    if (action === 'update_user') {
      if (targetId !== me.id && !canActorManageTarget(me, targetEffectiveRole)) {
        return json({ success: false, error: 'Forbidden: Không đủ quyền chỉnh sửa tài khoản này' }, { status: 403 });
      }
      const nextName = body.name !== undefined ? String(body.name).trim() : target.name;
      const nextPhone = body.phone !== undefined ? (String(body.phone).trim() || null) : target.phone;
      const nextEmail = (body.email !== undefined && String(body.email).trim())
        ? String(body.email).trim()
        : (target.email || `${target.username}@timbk.io.vn`);
      const nextStatus = body.status !== undefined ? String(body.status).trim() : (target.status || 'active');
      const nextApproval = body.approval_status !== undefined ? String(body.approval_status).trim() : (target.approval_status || 'approved');

      const meta = parseSafeMetadata(target.metadata);
      if (body.grade !== undefined) {
        const g = String(body.grade || '').trim();
        meta.grade = g;
        const enrolled = Array.isArray(meta.enrolled_grades) ? meta.enrolled_grades : [];
        if (g && !enrolled.includes(g)) meta.enrolled_grades = [...enrolled, g];
      }
      if (body.class_id !== undefined) meta.class_id = String(body.class_id || '').trim();
      if (Array.isArray(body.enrolled_grades)) meta.enrolled_grades = [...new Set(body.enrolled_grades.filter(Boolean))];
      if (body.school !== undefined) meta.school = String(body.school || '').trim();
      if (body.parent_name !== undefined) meta.parent_name = String(body.parent_name || '').trim();
      if (body.parent_phone !== undefined) meta.parent_phone = String(body.parent_phone || '').trim();

      try {
        await db.prepare(`
          UPDATE users
          SET name = ?, phone = ?, email = ?, status = ?, approval_status = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(nextName, nextPhone, nextEmail, nextStatus, nextApproval, JSON.stringify(meta), targetId).run();
      } catch {
        await db.prepare(`
          UPDATE users
          SET name = ?, phone = ?, email = ?, status = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(nextName, nextPhone, nextEmail, nextStatus, JSON.stringify(meta), targetId).run();
      }

      if (targetEffectiveRole === 'teacher' || targetEffectiveRole === 'leader') {
        await upsertTeacherProfileForUser(db, { ...target, name: nextName }, body);
      }

      return json({
        success: true,
        message: `Đã cập nhật hồ sơ @${target.username} trên Cloudflare D1.`,
        user: sanitizeRow({
          ...target,
          name: nextName,
          phone: nextPhone,
          email: nextEmail,
          status: nextStatus,
          approval_status: nextApproval,
          metadata: JSON.stringify(meta)
        })
      });
    }

    // 6. APPROVE TRIAL USER TO OFFICIAL
    if (action === 'approve_user') {
      const meta = parseSafeMetadata(target.metadata);
      meta.is_trial = false;
      meta.approved_at = new Date().toISOString();
      meta.approved_by = me.username || me.id;
      const nextApproval = targetEffectiveRole === 'student' ? 'official' : 'approved';

      try {
        await db.prepare(`
          UPDATE users SET status = 'active', approval_status = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(nextApproval, JSON.stringify(meta), targetId).run();
      } catch {
        await db.prepare(`
          UPDATE users SET status = 'active', metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(JSON.stringify(meta), targetId).run();
      }

      return json({
        success: true,
        message: `Đã phê duyệt chính thức cho tài khoản @${target.username}!`,
        user: sanitizeRow({ ...target, status: 'active', approval_status: nextApproval, metadata: JSON.stringify(meta) })
      });
    }

    // 7. ADJUST STUDENT STARS IN D1
    if (action === 'adjust_stars') {
      const delta = Math.trunc(Number(body.delta_stars ?? body.delta ?? 0));
      const reason = String(body.reason || 'Điều chỉnh sao từ AdminCP').trim();
      if (!Number.isFinite(delta) || delta === 0) {
        return json({ success: false, error: 'ValidationError: Số sao điều chỉnh phải khác 0.' }, { status: 400 });
      }
      await ensureAuxTables(db);
      const curRow = await db.prepare('SELECT stars_balance, total_earned_stars FROM student_stars WHERE student_id = ? LIMIT 1')
        .bind(targetId).first();
      const curBal = curRow ? (Number(curRow.stars_balance) || 0) : 0;
      const curEarned = curRow ? (Number(curRow.total_earned_stars) || 0) : 0;
      const nextBal = Math.max(0, curBal + delta);
      const nextEarned = delta > 0 ? curEarned + delta : curEarned;

      if (curRow) {
        await db.prepare(`
          UPDATE student_stars SET stars_balance = ?, total_earned_stars = ?, last_updated = CURRENT_TIMESTAMP WHERE student_id = ?
        `).bind(nextBal, nextEarned, targetId).run();
      } else {
        await db.prepare(`
          INSERT INTO student_stars (student_id, stars_balance, total_earned_stars, stars_redeemed, star_debt)
          VALUES (?, ?, ?, 0, 0)
        `).bind(targetId, nextBal, Math.max(0, delta)).run();
      }

      try {
        await db.prepare(`
          INSERT INTO student_star_ledger (id, student_id, delta_stars, amount, balance_after, action_type, reason, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          `stl_adm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          targetId,
          delta,
          delta,
          nextBal,
          delta > 0 ? 'reward' : 'penalty',
          reason,
          reason
        ).run();
      } catch {}

      return json({
        success: true,
        message: `${delta > 0 ? 'Đã cộng +' : 'Đã trừ '}${Math.abs(delta)} sao cho @${target.username} (Số dư mới: ${nextBal} ⭐).`,
        stars_balance: nextBal
      });
    }

    // 8. LINK PARENT TO STUDENT (Verified)
    if (action === 'link_parent_student') {
      const studentIdOrUsername = String(body.student_id || '').trim();
      if (!studentIdOrUsername) {
        return json({ success: false, error: 'Thiếu mã học sinh hoặc username học sinh cần liên kết.' }, { status: 400 });
      }
      const stu = await db.prepare("SELECT id, name, username FROM users WHERE (id = ? OR LOWER(username) = LOWER(?)) AND role = 'student' LIMIT 1")
        .bind(studentIdOrUsername, studentIdOrUsername).first();
      if (!stu) {
        return json({ success: false, error: 'Không tìm thấy học sinh với mã/username này.' }, { status: 404 });
      }
      const existingLink = await db.prepare('SELECT id FROM parent_student_links WHERE parent_user_id = ? AND student_user_id = ? LIMIT 1')
        .bind(targetId, stu.id).first();
      if (existingLink) {
        await db.prepare("UPDATE parent_student_links SET verification_status = 'verified', verified_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(existingLink.id).run();
      } else {
        await db.prepare(`
          INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status, verified_at, created_at)
          VALUES (?, ?, ?, 'verified', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(`link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, targetId, stu.id).run();
      }
      return json({
        success: true,
        message: `Đã liên kết và xác minh phụ huynh @${target.username} với học sinh ${stu.name} (@${stu.username}).`
      });
    }

    // 8B. UNLINK PARENT FROM STUDENT (Xóa con / Gỡ liên kết)
    if (action === 'unlink_parent_student') {
      await ensureAuxTables(db);
      const linkId = String(body.link_id || '').trim();
      const studentIdOrUsername = String(body.student_id || body.student_user_id || '').trim();

      if (linkId) {
        await db.prepare('DELETE FROM parent_student_links WHERE id = ? AND parent_user_id = ?')
          .bind(linkId, targetId).run();
        return json({
          success: true,
          message: `Đã gỡ liên kết học sinh khỏi phụ huynh @${target.username}.`
        });
      }

      if (!studentIdOrUsername) {
        return json({ success: false, error: 'Thiếu mã học sinh (student_id) hoặc link_id cần gỡ liên kết.' }, { status: 400 });
      }

      const stu = await db.prepare("SELECT id, name, username FROM users WHERE (id = ? OR LOWER(username) = LOWER(?)) LIMIT 1")
        .bind(studentIdOrUsername, studentIdOrUsername).first();
      const resolvedStudentId = stu ? stu.id : studentIdOrUsername;

      await db.prepare('DELETE FROM parent_student_links WHERE parent_user_id = ? AND (student_user_id = ? OR id = ?)')
        .bind(targetId, resolvedStudentId, studentIdOrUsername).run();

      return json({
        success: true,
        message: `Đã gỡ liên kết học sinh ${stu ? `${stu.name} (@${stu.username})` : resolvedStudentId} khỏi phụ huynh @${target.username}.`
      });
    }

    // 9. DELETE USER
    if (action === 'delete_user') {
      if (targetId === me.id) {
        return json({ success: false, error: 'SelfDelete: Không được tự xóa tài khoản của chính mình' }, { status: 403 });
      }
      if (
        String(targetEffectiveRole || '').toLowerCase() === 'superadmin' ||
        SUPERADMIN_USERNAMES.includes(String(target.username || '').toLowerCase()) ||
        SUPERADMIN_EMAILS.includes(String(target.email || '').toLowerCase())
      ) {
        return json({ success: false, error: 'Forbidden: Không thể xóa tài khoản SuperAdmin gốc' }, { status: 403 });
      }
      if (!canActorManageTarget(me, targetEffectiveRole)) {
        return json({ success: false, error: 'Forbidden: Bạn không có quyền xóa tài khoản này' }, { status: 403 });
      }

      try { await db.prepare('DELETE FROM teacher_profiles WHERE teacher_id = ? OR user_id = ?').bind(targetId, targetId).run(); } catch {}
      try { await db.prepare('DELETE FROM student_stars WHERE student_id = ?').bind(targetId).run(); } catch {}
      try { await db.prepare('DELETE FROM parent_student_links WHERE parent_user_id = ? OR student_user_id = ?').bind(targetId, targetId).run(); } catch {}
      try { await db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(targetId).run(); } catch {}
      await db.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();

      return json({
        success: true,
        message: `Đã xóa tài khoản @${target.username} khỏi hệ thống.`
      });
    }

    return json({
      success: false,
      error: `InvalidAction: action '${action}' không hợp lệ`
    }, { status: 400 });
  } catch (err) {
    console.error('[api/admincp/users] POST error:', err);
    return json({ success: false, error: `DatabaseError: Không thể cập nhật tài khoản (${err.message})` }, { status: 500 });
  }
}

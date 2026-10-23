import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '../../../../lib/server/auth.js';
import {
  getAllTeacherProfiles,
  getTeacherProfile,
  updateTeacherRoleAndSalary,
  addTeacherAppraisalAndRating,
  addTeacherBonus,
  addTeacherPrivateReminder,
  acknowledgeTeacherReminder
} from '../../../../lib/unifiedStore.js';

export const prerender = false;

// Non-production local mock cache
let localMockCache = null;

async function runAtomicBatch(db, statements) {
  if (typeof db.batch === 'function') return db.batch(statements);
  const results = [];
  for (const statement of statements) results.push(await statement.run());
  return results;
}

function getLocalMockCache() {
  if (!localMockCache || localMockCache.length === 0) {
    localMockCache = getAllTeacherProfiles();
  }
  return localMockCache;
}

function parseD1Profile(row) {
  if (!row) return null;
  return {
    ...row,
    bonuses: typeof row.bonuses === 'string' ? JSON.parse(row.bonuses || '[]') : (row.bonuses || []),
    private_reminders: typeof row.private_reminders === 'string' ? JSON.parse(row.private_reminders || '[]') : (row.private_reminders || [])
  };
}

let tableEnsured = false;
async function ensureTeacherProfilesTable(db) {
  if (!db || tableEnsured) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS teacher_profiles (
      id TEXT PRIMARY KEY,
      teacher_id TEXT,
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

  // Check if table has records, if not seed initial profiles
  const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM teacher_profiles').first();
  if (!countRow || countRow.cnt === 0) {
    const initial = getAllTeacherProfiles();
    for (const p of initial) {
      await db.prepare(`
        INSERT OR REPLACE INTO teacher_profiles (
          id, teacher_id, user_id, teacher_name, username, role_type, role_title,
          salary_type, base_salary_vnd, rate_per_session_vnd, total_sessions_taught,
          leader_rating, leader_appraisal, bonuses, private_reminders
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        p.teacher_id, p.teacher_id, p.teacher_id, p.teacher_name, p.username, p.role_type, p.role_title,
        p.salary_type, p.base_salary_vnd || 0, p.rate_per_session_vnd || 0, p.total_sessions_taught || 0,
        p.leader_rating || 5.0, p.leader_appraisal || '',
        JSON.stringify(p.bonuses || []), JSON.stringify(p.private_reminders || [])
      ).run();
    }
  }
  tableEnsured = true;
}

export async function GET({ url, request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: 'Unauthorized: Yêu cầu đăng nhập tài khoản hợp lệ' }, { status: 401 });
    }
    if (!isStaffUser(auth.user)) {
      return json({ success: false, error: 'Forbidden: Yêu cầu quyền Quản trị hoặc Giáo viên' }, { status: 403 });
    }

    const hasManagerPrivileges = isManager(auth.user);
    const requestedTeacherId = url.searchParams.get('teacher_id');

    if (!hasManagerPrivileges) {
      if (requestedTeacherId && requestedTeacherId !== auth.user.id) {
        return json({
          success: false,
          error: 'Forbidden: Giáo viên chỉ có quyền xem hồ sơ của chính mình'
        }, { status: 403 });
      }
    }

    const targetTeacherId = hasManagerPrivileges ? requestedTeacherId : auth.user.id;

    if (platform?.env?.DB) {
      await ensureTeacherProfilesTable(platform.env.DB);
      try {
        if (targetTeacherId) {
          const row = await platform.env.DB.prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ?').bind(targetTeacherId).first();
          if (!row) {
            return json({ success: false, error: 'Không tìm thấy hồ sơ giáo viên' }, { status: 404 });
          }
          return json({ success: true, profile: parseD1Profile(row), source: 'cloudflare_d1' });
        } else {
          const res = await platform.env.DB.prepare('SELECT * FROM teacher_profiles ORDER BY role_type ASC').all();
          const profiles = (res?.results || []).map(r => {
            const p = parseD1Profile(r);
            return { ...p, hourly_rate_vnd: Number(p.rate_per_session_vnd || p.hourly_rate_vnd || 0) };
          });
          return json({ success: true, total: profiles.length, profiles, teachers: profiles, source: 'cloudflare_d1' });
        }
      } catch (d1Err) {
        console.error('D1 teacher query error:', d1Err);
        return json({ success: false, error: 'Lỗi truy vấn cơ sở dữ liệu Cloudflare D1: ' + d1Err.message }, { status: 500 });
      }
    }

    const isMock = Boolean(import.meta.env?.DEV || platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true');
    if (!isMock) {
      return json({
        success: false,
        error: 'Lỗi cấu hình: Thiếu binding Cloudflare D1 (DB) trên môi trường production (Fail-Closed).'
      }, { status: 500 });
    }

    const mockProfiles = getLocalMockCache();
    if (targetTeacherId) {
      const profile = mockProfiles.find(p => p.teacher_id === targetTeacherId);
      if (!profile) return json({ success: false, error: 'Không tìm thấy hồ sơ' }, { status: 404 });
      return json({ success: true, profile, source: 'local_dev_mock' });
    }

    return json({ success: true, total: mockProfiles.length, profiles: mockProfiles, source: 'local_dev_mock' });
  } catch (err) {
    return json({ success: false, persisted: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: 'Unauthorized: Yêu cầu đăng nhập tài khoản hợp lệ' }, { status: 401 });
    }
    if (!isStaffUser(auth.user)) {
      return json({ success: false, error: 'Forbidden: Yêu cầu quyền Quản trị hoặc Giáo viên' }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action;
    const teacherId = String(body.teacher_id || body.id || '').trim();

    const hasManagerPrivileges = isManager(auth.user);

    // Manager-only actions
    const MANAGER_ONLY_ACTIONS = [
      'create_profile',
      'delete_profile',
      'update_role_salary',
      'add_appraisal',
      'add_bonus',
      'delete_bonus',
      'send_private_reminder',
      'delete_reminder'
    ];
    if (MANAGER_ONLY_ACTIONS.includes(action) && !hasManagerPrivileges) {
      return json({
        success: false,
        error: 'Forbidden: Giáo viên không có quyền điều chỉnh chức danh, mức lương, đánh giá hoặc khen thưởng.'
      }, { status: 403 });
    }

    if (action === 'acknowledge_reminder' && !hasManagerPrivileges && teacherId !== auth.user.id) {
      return json({
        success: false,
        error: 'Forbidden: Bạn chỉ có thể xác nhận nhắc nhở gửi cho chính mình'
      }, { status: 403 });
    }

    if (action !== 'create_profile' && !teacherId) {
      return json({ success: false, error: 'Thiếu teacher_id' }, { status: 400 });
    }

    if (platform?.env?.DB) {
      await ensureTeacherProfilesTable(platform.env.DB);

      if (action === 'create_profile') {
        const tName = String(body.teacher_name || body.name || '').trim();
        const tUsername = String(body.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '') || `gv_${Date.now().toString(36)}`;
        if (!tName) {
          return json({ success: false, error: 'Vui lòng nhập họ tên giáo viên (teacher_name)' }, { status: 400 });
        }
        const newTeacherId = teacherId || `usr_teacher_${tUsername}_${Date.now().toString(36).slice(-4)}`;
        const roleType = String(body.role_type || 'lead').trim();
        const roleTitle = String(body.role_title || 'Giáo viên Tiếng Anh').trim();
        const salaryType = String(body.salary_type || 'per_session').trim();
        const baseSalary = Math.max(0, Math.trunc(Number(body.base_salary_vnd) || 0));
        const ratePerSession = Math.max(0, Math.trunc(Number(body.rate_per_session_vnd) || 300000));

        await platform.env.DB.prepare(`
          INSERT OR REPLACE INTO teacher_profiles (
            id, teacher_id, user_id, teacher_name, username, role_type, role_title,
            salary_type, base_salary_vnd, rate_per_session_vnd, total_sessions_taught,
            leader_rating, leader_appraisal, bonuses, private_reminders, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5.0, '', '[]', '[]', CURRENT_TIMESTAMP)
        `).bind(
          newTeacherId, newTeacherId, newTeacherId, tName, tUsername, roleType, roleTitle,
          salaryType, baseSalary, ratePerSession
        ).run();

        const row = await platform.env.DB.prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ?').bind(newTeacherId).first();
        return json({
          success: true,
          persisted: true,
          profile: parseD1Profile(row),
          message: `✅ Đã thêm hồ sơ giáo viên ${tName} (@${tUsername}) vào Cloudflare D1!`
        });
      }

      if (action === 'delete_profile') {
        await platform.env.DB.prepare('DELETE FROM teacher_profiles WHERE teacher_id = ? OR id = ?').bind(teacherId, teacherId).run();
        return json({
          success: true,
          persisted: true,
          teacher_id: teacherId,
          message: `🗑️ Đã xóa hồ sơ giáo viên (${teacherId}) khỏi Cloudflare D1!`
        });
      }

      if (action === 'update_role_salary') {
        const baseSalary = Number(body.base_salary_vnd);
        const ratePerSession = Number(body.rate_per_session_vnd);
        if (!Number.isSafeInteger(baseSalary) || baseSalary < 0 || !Number.isSafeInteger(ratePerSession) || ratePerSession < 0) {
          return json({ success: false, persisted: false, error: 'Mức lương và đơn giá ca phải là số nguyên VNĐ không âm' }, { status: 400 });
        }
        const roleType = body.role_type || 'lead';
        const roleTitle = body.role_title || 'Giáo viên';
        const salaryType = body.salary_type || 'per_session';
        const leaderRating = Number(body.leader_rating) || 5.0;

        try {
          const before = await platform.env.DB.prepare('SELECT base_salary_vnd, rate_per_session_vnd, role_type, role_title, salary_type FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first().catch(() => null);
          if (!before) {
            return json({ success: false, persisted: false, error: 'Không tìm thấy hồ sơ giáo viên thật để cập nhật' }, { status: 404 });
          }
          const sql = `
            UPDATE teacher_profiles SET
              role_type = ?, role_title = ?, salary_type = ?,
              base_salary_vnd = ?, rate_per_session_vnd = ?, leader_rating = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE teacher_id = ?;
          `;
          const updateStatement = platform.env.DB.prepare(sql).bind(
            roleType, roleTitle, salaryType, baseSalary, ratePerSession, leaderRating, teacherId
          );
          const auditStatement = platform.env.DB.prepare(`INSERT INTO audit_logs (id, actor_id, actor_role, action, details, created_at) VALUES (?, ?, ?, 'update_role_salary', ?, CURRENT_TIMESTAMP)`)
            .bind(`audit_${crypto.randomUUID()}`, auth.user.id, auth.user.role || '', JSON.stringify({
                teacher_id: teacherId,
                before: before || null,
                after: { base_salary_vnd: baseSalary, rate_per_session_vnd: ratePerSession, role_type: roleType, role_title: roleTitle, salary_type: salaryType }
              }));
          await runAtomicBatch(platform.env.DB, [updateStatement, auditStatement]);

          const row = await platform.env.DB.prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first();
          if (!row) {
            return json({ success: false, persisted: false, error: 'Không tìm thấy bản ghi sau khi lưu' }, { status: 500 });
          }

          return json({
            success: true,
            persisted: true,
            profile: parseD1Profile(row),
            source: 'cloudflare_d1'
          });
        } catch (d1Err) {
          console.error('D1 teacher update error (FAIL-CLOSED):', d1Err);
          return json({
            success: false,
            persisted: false,
            error: 'Lỗi ghi cơ sở dữ liệu Cloudflare D1: ' + d1Err.message
          }, { status: 500 });
        }
      }

      if (action === 'add_appraisal') {
        const appraisal = body.appraisal || '';
        const rating = Number(body.rating) || 5.0;
        try {
          await platform.env.DB.prepare(`
            UPDATE teacher_profiles
            SET leader_appraisal = ?, leader_rating = ?, updated_at = CURRENT_TIMESTAMP
            WHERE teacher_id = ?
          `).bind(appraisal, rating, teacherId).run();

          const row = await platform.env.DB.prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first();
          return json({ success: true, persisted: true, profile: parseD1Profile(row), source: 'cloudflare_d1' });
        } catch (d1Err) {
          return json({ success: false, persisted: false, error: 'Lỗi D1: ' + d1Err.message }, { status: 500 });
        }
      }

      if (action === 'add_bonus') {
        const amountVnd = Number(body.amount_vnd);
        if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0 || amountVnd > 1000000000) {
          return json({ success: false, persisted: false, error: 'Tiền thưởng phải là số nguyên dương, tối đa 1.000.000.000đ' }, { status: 400 });
        }
        const newBonus = {
          id: `bon_${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          amount_vnd: amountVnd,
          reason: body.reason || 'Khen thưởng chuyên môn xuất sắc',
          awarded_by: auth.user.name || 'Ms. Dung (Leader)'
        };
        try {
          const row = await platform.env.DB.prepare('SELECT bonuses FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first();
          if (!row) {
            return json({ success: false, persisted: false, error: 'Không tìm thấy hồ sơ giáo viên thật để thưởng' }, { status: 404 });
          }
          const currentBonuses = row && row.bonuses ? JSON.parse(row.bonuses) : [];
          currentBonuses.unshift(newBonus);
          const updateStatement = platform.env.DB.prepare('UPDATE teacher_profiles SET bonuses = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?')
            .bind(JSON.stringify(currentBonuses), teacherId);
          const auditStatement = platform.env.DB.prepare(`INSERT INTO audit_logs (id, actor_id, actor_role, action, details, created_at) VALUES (?, ?, ?, 'add_bonus', ?, CURRENT_TIMESTAMP)`)
            .bind(`audit_${crypto.randomUUID()}`, auth.user.id, auth.user.role || '', JSON.stringify({ teacher_id: teacherId, bonus: newBonus }));
          await runAtomicBatch(platform.env.DB, [updateStatement, auditStatement]);
          return json({ success: true, persisted: true, bonus: newBonus, source: 'cloudflare_d1' });
        } catch (d1Err) {
          return json({ success: false, persisted: false, error: 'Lỗi D1: ' + d1Err.message }, { status: 500 });
        }
      }

      if (action === 'delete_bonus') {
        const bonusId = String(body.bonus_id || '').trim();
        const row = await platform.env.DB.prepare('SELECT bonuses FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first();
        if (row && row.bonuses) {
          const list = JSON.parse(row.bonuses || '[]').filter(b => b.id !== bonusId);
          await platform.env.DB.prepare('UPDATE teacher_profiles SET bonuses = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?')
            .bind(JSON.stringify(list), teacherId).run();
        }
        return json({ success: true, persisted: true, message: '🗑️ Đã xóa khoản thưởng khỏi hồ sơ giáo viên!' });
      }

      if (action === 'send_private_reminder') {
        const newReminder = {
          id: `rem_${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          content: body.content || '',
          urgency: body.urgency || 'medium',
          status: 'pending',
          sent_by: auth.user.name || 'Ms. Dung (Leader)'
        };
        try {
          const row = await platform.env.DB.prepare('SELECT private_reminders FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first();
          const currentReminders = row && row.private_reminders ? JSON.parse(row.private_reminders) : [];
          currentReminders.unshift(newReminder);
          await platform.env.DB.prepare('UPDATE teacher_profiles SET private_reminders = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?')
            .bind(JSON.stringify(currentReminders), teacherId).run();
          return json({ success: true, persisted: true, reminder: newReminder, source: 'cloudflare_d1' });
        } catch (d1Err) {
          return json({ success: false, persisted: false, error: 'Lỗi D1: ' + d1Err.message }, { status: 500 });
        }
      }

      if (action === 'delete_reminder') {
        const remId = String(body.reminder_id || '').trim();
        const row = await platform.env.DB.prepare('SELECT private_reminders FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first();
        if (row && row.private_reminders) {
          const list = JSON.parse(row.private_reminders || '[]').filter(r => r.id !== remId);
          await platform.env.DB.prepare('UPDATE teacher_profiles SET private_reminders = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?')
            .bind(JSON.stringify(list), teacherId).run();
        }
        return json({ success: true, persisted: true, message: '🗑️ Đã xóa nhắc nhở riêng khỏi hồ sơ giáo viên!' });
      }

      if (action === 'acknowledge_reminder') {
        try {
          const row = await platform.env.DB.prepare('SELECT private_reminders FROM teacher_profiles WHERE teacher_id = ?').bind(teacherId).first();
          if (row && row.private_reminders) {
            const list = JSON.parse(row.private_reminders);
            const item = list.find(r => r.id === body.reminder_id);
            if (item) item.status = 'acknowledged';
            await platform.env.DB.prepare('UPDATE teacher_profiles SET private_reminders = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?')
              .bind(JSON.stringify(list), teacherId).run();
          }
          return json({ success: true, persisted: true, message: 'Đã xác nhận đã đọc nhắc nhở' });
        } catch (d1Err) {
          return json({ success: false, persisted: false, error: 'Lỗi D1: ' + d1Err.message }, { status: 500 });
        }
      }
    }

    const isMock = Boolean(import.meta.env?.DEV || platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process.env.ENABLE_LOCAL_MOCK === 'true');
    if (!isMock) {
      return json({
        success: false,
        persisted: false,
        error: 'Lỗi cấu hình hệ thống: Thiếu binding Cloudflare D1 (DB) trên môi trường production (Fail-Closed).'
      }, { status: 500 });
    }

    if (action === 'update_role_salary') {
      const mockProfiles = getLocalMockCache();
      const idx = mockProfiles.findIndex(p => p.teacher_id === teacherId);
      const updates = {
        role_type: body.role_type || 'lead',
        role_title: body.role_title || 'Giáo viên',
        base_salary_vnd: Number(body.base_salary_vnd) || 0,
        rate_per_session_vnd: Number(body.rate_per_session_vnd) || 0,
        salary_type: body.salary_type || 'per_session',
        leader_rating: Number(body.leader_rating) || 5.0,
        updated_at: new Date().toISOString()
      };
      if (idx >= 0) mockProfiles[idx] = { ...mockProfiles[idx], ...updates };
      updateTeacherRoleAndSalary(teacherId, updates);
      return json({ success: true, persisted: false, profile: idx >= 0 ? mockProfiles[idx] : null, source: 'local_dev_mock' });
    }

    return json({ success: false, error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err) {
    return json({ success: false, persisted: false, error: err.message }, { status: 500 });
  }
}

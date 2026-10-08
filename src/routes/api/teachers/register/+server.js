import { json } from '@sveltejs/kit';
import { verifyServerAuth, isManager } from '../../../../lib/server/auth.js';

export const prerender = false;

const VN_PHONE_RE = /^0(3|5|7|8|9)\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Extra columns beyond the legacy teacher_profiles schema (guarded ALTERs).
const EXTRA_COLUMNS = [
  'phone TEXT',
  'email TEXT',
  'specialty TEXT',
  'experience_years INTEGER DEFAULT 0',
  'address TEXT',
  'notes TEXT'
];

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
  for (const col of EXTRA_COLUMNS) {
    try {
      await db.prepare(`ALTER TABLE teacher_profiles ADD COLUMN ${col}`).run();
    } catch {}
  }
  tableEnsured = true;
}

function makeUsername(body, phone) {
  const base = (body.email && body.email.includes('@')
    ? body.email.split('@')[0]
    : 'gv' + phone.slice(-6)
  ).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return base || 'gv' + phone.slice(-6);
}

export async function POST({ request, platform }) {
  try {
    // 1. Authenticate + manager-only (registering teachers is a management action)
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: 'Unauthorized: Yêu cầu đăng nhập tài khoản hợp lệ' }, { status: 401 });
    }
    if (!isManager(auth.user)) {
      return json({ success: false, error: 'Forbidden: Chỉ Ban điều hành (Leader/Admin) mới được đăng ký giáo viên mới' }, { status: 403 });
    }

    const body = await request.json();

    // 2. Server-side validation (mirrors TeacherRegisterModal client validation)
    const teacherName = String(body.teacher_name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    const specialty = String(body.specialty || 'Khác').slice(0, 120);
    const address = String(body.address || '').slice(0, 300);
    const notes = String(body.notes || '').slice(0, 1000);
    const salaryType = body.salary_type === 'monthly' ? 'monthly' : 'per_session';
    const roleType = String(body.role_type || 'vietnamese').slice(0, 40);
    const roleTitle = String(body.role_title || 'Giáo viên').slice(0, 120) || 'Giáo viên';

    if (teacherName.length < 3) {
      return json({ success: false, error: 'Họ tên giáo viên quá ngắn (tối thiểu 3 ký tự)' }, { status: 400 });
    }
    if (!VN_PHONE_RE.test(phone)) {
      return json({ success: false, error: 'Số điện thoại chưa đúng — cần 10 số, bắt đầu 03/05/07/08/09' }, { status: 400 });
    }
    if (email && !EMAIL_RE.test(email)) {
      return json({ success: false, error: 'Email chưa đúng định dạng' }, { status: 400 });
    }

    const salaryRaw = Number(body.base_salary_vnd);
    if (!Number.isSafeInteger(salaryRaw) || salaryRaw <= 0) {
      return json({ success: false, error: 'Lương khởi điểm phải là số nguyên VNĐ lớn hơn 0' }, { status: 400 });
    }

    let experienceYears = body.experience_years === null || body.experience_years === undefined || body.experience_years === ''
      ? 0
      : Number(body.experience_years);
    if (!Number.isFinite(experienceYears) || experienceYears < 0 || experienceYears > 60) {
      return json({ success: false, error: 'Số năm kinh nghiệm không hợp lệ (0–60)' }, { status: 400 });
    }
    experienceYears = Math.floor(experienceYears);

    // 3. Fail-closed without D1 (no silent local persistence for staff records)
    if (!platform?.env?.DB) {
      return json({ success: false, error: 'DatabaseUnavailable: Đăng ký giáo viên yêu cầu cơ sở dữ liệu Cloudflare D1' }, { status: 503 });
    }

    const db = platform.env.DB;
    await ensureTeacherProfilesTable(db);

    // 4. Duplicate guard: same phone or username
    const dup = await db.prepare(
      'SELECT id FROM teacher_profiles WHERE phone = ? LIMIT 1'
    ).bind(phone).first();
    if (dup) {
      return json({ success: false, error: `Số điện thoại ${phone} đã tồn tại trong hồ sơ giáo viên` }, { status: 409 });
    }

    const id = `tch_${crypto.randomUUID()}`;
    const username = makeUsername(body, phone);
    const baseSalary = salaryType === 'monthly' ? salaryRaw : 0;
    const ratePerSession = salaryType === 'per_session' ? salaryRaw : 0;

    await db.prepare(`
      INSERT INTO teacher_profiles (
        id, teacher_id, user_id, teacher_name, username, role_type, role_title,
        salary_type, base_salary_vnd, rate_per_session_vnd, total_sessions_taught,
        leader_rating, leader_appraisal, bonuses, private_reminders,
        phone, email, specialty, experience_years, address, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5.0, '', '[]', '[]', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      id, id, null, teacherName, username, roleType, roleTitle,
      salaryType, baseSalary, ratePerSession,
      phone, email, specialty, experienceYears, address, notes
    ).run();

    const row = await db.prepare('SELECT * FROM teacher_profiles WHERE id = ?').bind(id).first();
    if (!row) {
      return json({ success: false, error: 'Không đọc được bản ghi sau khi lưu' }, { status: 500 });
    }

    return json({
      success: true,
      persisted: true,
      message: `Đã đăng ký giáo viên "${teacherName}" (@${username})`,
      profile: {
        id: row.id,
        teacher_id: row.teacher_id,
        teacher_name: row.teacher_name,
        username: row.username,
        phone: row.phone,
        email: row.email,
        specialty: row.specialty,
        experience_years: row.experience_years,
        role_type: row.role_type,
        role_title: row.role_title,
        salary_type: row.salary_type,
        base_salary_vnd: row.base_salary_vnd,
        rate_per_session_vnd: row.rate_per_session_vnd
      },
      source: 'cloudflare_d1'
    });
  } catch (err) {
    console.error('POST /api/teachers/register error (FAIL-CLOSED):', err);
    return json({ success: false, error: 'Lỗi máy chủ: ' + err.message }, { status: 500 });
  }
}

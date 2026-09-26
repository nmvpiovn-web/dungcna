import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, SUPERADMIN_USERNAMES } from '../../../../lib/server/auth.js';
import { calculateTeacherMonthlyPayroll } from '../../../../lib/server/payrollEngine.js';

export const prerender = false;

function isManager(user) {
  if (!user) return false;
  return user.role === 'superadmin' || user.role === 'leader' || user.role === 'admin' || SUPERADMIN_USERNAMES.includes(user.username);
}

function getPreviousBillingCycle(cycle) {
  const [yearStr, monthStr] = cycle.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function ensurePayrollSchema(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_payrolls (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        gross_amount INTEGER NOT NULL DEFAULT 0,
        net_amount INTEGER NOT NULL DEFAULT 0,
        disbursed_advances_deducted INTEGER NOT NULL DEFAULT 0,
        prior_debt_deducted INTEGER NOT NULL DEFAULT 0,
        carried_over_debt INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        calculation_json TEXT,
        approved_by TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();
  } catch (err) {
    console.warn('ensurePayrollSchema notice:', err.message);
  }
}

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Quyền truy cập chỉ dành cho giáo viên và ban quản lý' }, { status: 403 });
  }

  const manager = isManager(auth.user);
  let targetTeacherId = url.searchParams.get('teacher_id') || auth.user.id;
  const billingCycle = url.searchParams.get('billing_cycle') || '2026-09';

  // Privacy isolation: Non-managers can ONLY see their own payroll
  if (!manager && targetTeacherId !== auth.user.id) {
    targetTeacherId = auth.user.id;
  }

  const db = platform?.env?.DB;

  try {
    if (db) {
      await ensurePayrollSchema(db);
    }

    // 1. Fetch previous cycle record to get carried-over debt balance
    const prevCycle = getPreviousBillingCycle(billingCycle);
    let previousDebtBalance = 0;

    if (db) {
      const prevRecord = await db.prepare(`
        SELECT carried_over_debt FROM teacher_payrolls
        WHERE teacher_id = ? AND billing_cycle = ?
        LIMIT 1
      `).bind(targetTeacherId, prevCycle).first();

      if (prevRecord && prevRecord.carried_over_debt) {
        previousDebtBalance = Number(prevRecord.carried_over_debt);
      }
    }

    // 2. Fetch existing payroll record for current cycle
    let existingRecord = null;
    if (db) {
      existingRecord = await db.prepare(`
        SELECT * FROM teacher_payrolls
        WHERE teacher_id = ? AND billing_cycle = ?
        LIMIT 1
      `).bind(targetTeacherId, billingCycle).first();
    }

    // 3. Fetch completed sessions for this teacher and cycle
    let sessions = [];
    if (db) {
      const sessRes = await db.prepare(`
        SELECT * FROM class_sessions
        WHERE (teacher_id = ? OR teacher_id LIKE ?)
        ORDER BY session_date ASC
      `).bind(targetTeacherId, `%${targetTeacherId}%`).all();
      sessions = sessRes.results || [];
    }

    // 4. Fetch salary advances for this teacher and cycle
    let advances = [];
    if (db) {
      const advRes = await db.prepare(`
        SELECT * FROM teacher_salary_advances
        WHERE teacher_id = ?
      `).bind(targetTeacherId).all();
      advances = advRes.results || [];
    }

    // 5. Run calculation engine
    const payroll = calculateTeacherMonthlyPayroll({
      teacherId: targetTeacherId,
      billingCycle,
      sessions,
      advances,
      previousDebtBalance,
      existingPeriod: existingRecord
    });

    return json({
      success: true,
      payroll,
      is_manager: manager,
      existing_record: existingRecord
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const manager = isManager(auth.user);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON' }, { status: 400 });
  }

  const action = body.action || 'calculate'; // 'calculate' | 'lock' | 'approve' | 'disburse'
  const teacherId = body.teacher_id || auth.user.id;
  const billingCycle = body.billing_cycle || '2026-09';

  // State-modifying actions ('lock', 'approve', 'disburse') strictly require Leader / Manager role
  if (['lock', 'approve', 'disburse'].includes(action) && !manager) {
    return json({ success: false, error: 'Forbidden: Chỉ Ban Quản Lý (Leader/Admin) mới có quyền khóa sổ hoặc duyệt bảng lương' }, { status: 403 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable: Cần kết nối D1 để lưu bảng lương' }, { status: 500 });
  }

  try {
    await ensurePayrollSchema(db);

    // Check existing record status for write-time lock protection
    const existing = await db.prepare(`
      SELECT * FROM teacher_payrolls
      WHERE teacher_id = ? AND billing_cycle = ?
      LIMIT 1
    `).bind(teacherId, billingCycle).first();

    if (existing && ['locked', 'closed', 'paid'].includes(existing.status) && action !== 'calculate') {
      return json({
        success: false,
        error: `ConflictError: Kỳ lương ${billingCycle} của giáo viên ${teacherId} đã ở trạng thái '${existing.status}', không thể sửa đổi.`
      }, { status: 409 });
    }

    // Look up previous debt
    const prevCycle = getPreviousBillingCycle(billingCycle);
    const prevRecord = await db.prepare(`
      SELECT carried_over_debt FROM teacher_payrolls
      WHERE teacher_id = ? AND billing_cycle = ?
      LIMIT 1
    `).bind(teacherId, prevCycle).first();
    const previousDebtBalance = prevRecord?.carried_over_debt ? Number(prevRecord.carried_over_debt) : 0;

    // Fetch sessions & advances
    const sessRes = await db.prepare(`
      SELECT * FROM class_sessions WHERE teacher_id = ? OR teacher_id LIKE ?
    `).bind(teacherId, `%${teacherId}%`).all();

    const advRes = await db.prepare(`
      SELECT * FROM teacher_salary_advances WHERE teacher_id = ?
    `).bind(teacherId).all();

    const calculated = calculateTeacherMonthlyPayroll({
      teacherId,
      billingCycle,
      sessions: sessRes.results || [],
      advances: advRes.results || [],
      previousDebtBalance,
      existingPeriod: existing
    });

    const targetStatus = action === 'lock' ? 'locked' : (action === 'approve' ? 'approved' : (action === 'disburse' ? 'paid' : (existing?.status || 'draft')));
    const recordId = existing?.id || `pr_${teacherId}_${billingCycle.replace('-', '')}`;

    // Write / upsert into teacher_payrolls
    await db.prepare(`
      INSERT INTO teacher_payrolls (
        id, teacher_id, billing_cycle, gross_amount, net_amount,
        disbursed_advances_deducted, prior_debt_deducted, carried_over_debt,
        status, calculation_json, approved_by, approved_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        gross_amount = excluded.gross_amount,
        net_amount = excluded.net_amount,
        disbursed_advances_deducted = excluded.disbursed_advances_deducted,
        prior_debt_deducted = excluded.prior_debt_deducted,
        carried_over_debt = excluded.carried_over_debt,
        status = excluded.status,
        calculation_json = excluded.calculation_json,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        updated_at = CURRENT_TIMESTAMP;
    `).bind(
      recordId,
      teacherId,
      billingCycle,
      calculated.summary.gross_income,
      calculated.summary.net_pay,
      calculated.summary.disbursed_advances_deducted,
      calculated.summary.prior_debt_deducted,
      calculated.summary.carried_over_debt,
      targetStatus,
      JSON.stringify(calculated),
      manager ? auth.user.id : null
    ).run();

    return json({
      success: true,
      message: `Đã ${action === 'lock' ? 'khóa sổ' : (action === 'approve' ? 'phê duyệt' : 'tính')} bảng lương thành công!`,
      status: targetStatus,
      payroll: calculated
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

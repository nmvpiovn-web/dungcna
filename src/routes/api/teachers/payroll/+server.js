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

    // Locked period defense on GET: If cycle is already locked/closed/paid, return locked snapshot directly (never recompute)
    if (existingRecord && ['locked', 'closed', 'paid'].includes(existingRecord.status)) {
      let snapshot = null;
      if (existingRecord.calculation_json) {
        try {
          snapshot = JSON.parse(existingRecord.calculation_json);
        } catch {}
      }
      if (!snapshot) {
        snapshot = {
          teacher_id: targetTeacherId,
          billing_cycle: billingCycle,
          status: existingRecord.status,
          is_locked: true,
          rate_mode: 'per_session',
          base_rate: 300000,
          payable_sessions: [],
          deducted_advances: [],
          summary: {
            total_sessions: 0,
            total_hours: 0,
            gross_income: Number(existingRecord.gross_amount || 0),
            disbursed_advances_deducted: Number(existingRecord.disbursed_advances_deducted || 0),
            prior_debt_deducted: Number(existingRecord.prior_debt_deducted || 0),
            carried_over_debt: Number(existingRecord.carried_over_debt || 0),
            net_pay: Number(existingRecord.net_amount || 0)
          }
        };
      }
      return json({
        success: true,
        payroll: snapshot,
        is_manager: manager,
        existing_record: existingRecord,
        is_locked: true
      });
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

    // 5. Run calculation engine for draft/unlocked period
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

  const db = platform?.env?.DB;
  if (db) {
    await ensurePayrollSchema(db);
  }

  // RBAC GATE: Non-staff users (students, parents, guests) are strictly blocked from payroll modifications
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Quyền truy cập quản lý lương chỉ dành riêng cho nhân sự sư phạm' }, { status: 403 });
  }

  const manager = isManager(auth.user);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON' }, { status: 400 });
  }

  // ACTION ALLOWLIST
  const ALLOWED_ACTIONS = ['preview', 'calculate', 'save_draft', 'approve', 'lock', 'disburse'];
  const action = body.action || 'preview';
  if (!ALLOWED_ACTIONS.includes(action)) {
    return json({ success: false, error: `InvalidAction: Thao tác '${action}' không nằm trong danh mục hợp lệ` }, { status: 400 });
  }

  // TEACHER OWNERSHIP SCOPING: Non-managers can ONLY preview or calculate their own payroll
  let teacherId = body.teacher_id || auth.user.id;
  if (!manager) {
    if (body.teacher_id && body.teacher_id !== auth.user.id) {
      return json({ success: false, error: 'Forbidden: Giáo viên không có quyền thao tác trên bảng lương của giáo viên khác' }, { status: 403 });
    }
    teacherId = auth.user.id;
  }

  const billingCycle = body.billing_cycle || '2026-09';

  // Administrative lifecycle actions strictly require Leader / Manager role
  if (['approve', 'lock', 'disburse'].includes(action) && !manager) {
    return json({ success: false, error: 'Forbidden: Chỉ Ban Quản Lý (Leader/Admin) mới có quyền khóa sổ hoặc duyệt chi bảng lương' }, { status: 403 });
  }

  if (!db && action !== 'preview') {
    return json({ success: false, error: 'DatabaseUnavailable: Cần kết nối D1 để lưu bảng lương' }, { status: 500 });
  }

  try {
    if (db) {
      await ensurePayrollSchema(db);
    }

    // Check existing record status for write-time lock protection & state machine
    let existing = null;
    if (db) {
      existing = await db.prepare(`
        SELECT * FROM teacher_payrolls
        WHERE teacher_id = ? AND billing_cycle = ?
        LIMIT 1
      `).bind(teacherId, billingCycle).first();
    }

    // STATE MACHINE VALIDATIONS:
    // 1. Fully paid or closed periods are strictly terminal and cannot be modified or disbursed
    if (existing && ['paid', 'closed'].includes(existing.status)) {
      return json({
        success: false,
        error: `ConflictError: Kỳ lương ${billingCycle} của giáo viên ${teacherId} đã ở trạng thái '${existing.status}' (hoàn tất chi trả/đã đóng sổ), không thể thực chi hay sửa đổi.`
      }, { status: 409 });
    }

    // 2. Locked period handling: Only legitimate transition is locked -> paid via disburse
    if (existing && existing.status === 'locked') {
      if (action === 'disburse') {
        const disburseRes = await db.prepare(`
          UPDATE teacher_payrolls
          SET status = 'paid', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'locked'
        `).bind(existing.id).run();

        if (disburseRes.meta?.changes === 0) {
          return json({
            success: false,
            error: `ConflictError: Kỳ lương ${billingCycle} không còn ở trạng thái 'locked', không thể giải ngân.`
          }, { status: 409 });
        }

        return json({
          success: true,
          message: `Đã xác nhận thực chi trả thành công cho kỳ lương ${billingCycle}!`,
          status: 'paid'
        });
      } else {
        return json({
          success: false,
          error: `ConflictError: Kỳ lương ${billingCycle} của giáo viên ${teacherId} đã ở trạng thái 'locked', không thể sửa đổi.`
        }, { status: 409 });
      }
    }

    // 3. Disbursement pre-condition: Must be approved or locked before disbursement
    if (action === 'disburse' && (!existing || existing.status === 'draft')) {
      return json({
        success: false,
        error: `PreconditionError: Bảng lương phải được phê duyệt ('approved') hoặc khóa sổ ('locked') trước khi xác nhận thực chi ('paid').`
      }, { status: 400 });
    }

    // Look up previous debt
    const prevCycle = getPreviousBillingCycle(billingCycle);
    let previousDebtBalance = 0;
    if (db) {
      const prevRecord = await db.prepare(`
        SELECT carried_over_debt FROM teacher_payrolls
        WHERE teacher_id = ? AND billing_cycle = ?
        LIMIT 1
      `).bind(teacherId, prevCycle).first();
      previousDebtBalance = prevRecord?.carried_over_debt ? Number(prevRecord.carried_over_debt) : 0;
    }

    // Fetch sessions & advances
    let sessions = [];
    let advances = [];
    if (db) {
      const sessRes = await db.prepare(`
        SELECT * FROM class_sessions WHERE teacher_id = ? OR teacher_id LIKE ?
      `).bind(teacherId, `%${teacherId}%`).all();
      sessions = sessRes.results || [];

      const advRes = await db.prepare(`
        SELECT * FROM teacher_salary_advances WHERE teacher_id = ?
      `).bind(teacherId).all();
      advances = advRes.results || [];
    }

    const calculated = calculateTeacherMonthlyPayroll({
      teacherId,
      billingCycle,
      sessions,
      advances,
      previousDebtBalance,
      existingPeriod: existing
    });

    // If pure preview, return calculated data with zero persistence
    if (action === 'preview') {
      return json({
        success: true,
        payroll: calculated,
        is_preview: true
      });
    }

    const targetStatus = action === 'lock' ? 'locked' : (action === 'approve' ? 'approved' : (action === 'disburse' ? 'paid' : 'draft'));
    const recordId = existing?.id || `pr_${teacherId}_${billingCycle.replace('-', '')}`;

    if (existing) {
      // WRITE-TIME SQL CONCURRENCY GUARD: UPDATE only if status is NOT already locked/closed/paid
      const updateRes = await db.prepare(`
        UPDATE teacher_payrolls
        SET gross_amount = ?,
            net_amount = ?,
            disbursed_advances_deducted = ?,
            prior_debt_deducted = ?,
            carried_over_debt = ?,
            status = ?,
            calculation_json = ?,
            approved_by = ?,
            approved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status NOT IN ('locked', 'closed', 'paid');
      `).bind(
        calculated.summary.gross_income,
        calculated.summary.net_pay,
        calculated.summary.disbursed_advances_deducted,
        calculated.summary.prior_debt_deducted,
        calculated.summary.carried_over_debt,
        targetStatus,
        JSON.stringify(calculated),
        manager ? auth.user.id : null,
        recordId
      ).run();

      if (updateRes.meta?.changes === 0) {
        return json({
          success: false,
          error: `ConflictError: Kỳ lương ${billingCycle} đã bị khóa sổ bởi phiên quản trị khác, không thể ghi đè.`
        }, { status: 409 });
      }
    } else {
      // INSERT new record
      await db.prepare(`
        INSERT INTO teacher_payrolls (
          id, teacher_id, billing_cycle, gross_amount, net_amount,
          disbursed_advances_deducted, prior_debt_deducted, carried_over_debt,
          status, calculation_json, approved_by, approved_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
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
    }

    return json({
      success: true,
      message: `Đã ${action === 'lock' ? 'khóa sổ' : (action === 'approve' ? 'phê duyệt' : 'lưu')} bảng lương thành công!`,
      status: targetStatus,
      payroll: calculated
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

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
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS finance_ledger (
        id TEXT PRIMARY KEY,
        voucher_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        teacher_id TEXT,
        actor_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT DEFAULT 'bank_transfer',
        billing_cycle TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        voucher_number TEXT,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // Locked & Approved period defense on GET: If cycle is already locked/closed/paid/approved, return snapshot directly (never recompute)
    if (existingRecord && ['locked', 'closed', 'paid', 'approved'].includes(existingRecord.status)) {
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
          is_locked: ['locked', 'closed', 'paid'].includes(existingRecord.status),
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
      // CRITICAL FIX FOR P2 AUDIT DEFECT: Ensure snapshot payload status matches existing_record.status!
      snapshot.status = existingRecord.status;
      snapshot.is_locked = ['locked', 'closed', 'paid'].includes(existingRecord.status);
      snapshot.is_approved = ['approved', 'locked', 'closed', 'paid'].includes(existingRecord.status);
      snapshot.approved_by = existingRecord.approved_by || snapshot.approved_by;
      snapshot.approved_at = existingRecord.approved_at || snapshot.approved_at;

      return json({
        success: true,
        payroll: snapshot,
        is_manager: manager,
        existing_record: existingRecord,
        is_locked: ['locked', 'closed', 'paid'].includes(existingRecord.status),
        is_approved: ['approved', 'locked', 'closed', 'paid'].includes(existingRecord.status)
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

    // IDEMPOTENCY CHECK FOR DISBURSE:
    // If client retries a disburse with the same idempotency key (e.g. after network timeout),
    // immediately return the existing voucher IF AND ONLY IF payroll is actually paid.
    const idempotencyKey = action === 'disburse'
      ? (body.idempotency_key || request.headers.get('idempotency-key') || (existing ? `disburse_${existing.id}_${billingCycle}` : null))
      : null;

    if (action === 'disburse' && idempotencyKey && db) {
      const priorVoucher = await db.prepare(`
        SELECT * FROM finance_ledger WHERE idempotency_key = ? LIMIT 1;
      `).bind(idempotencyKey).first();

      if (priorVoucher) {
        // STRICT IDEMPOTENCY INVARIANT:
        // A voucher represents a completed disbursement ONLY IF the underlying payroll
        // record is confirmed in terminal 'paid' state and matches this payroll record!
        if (existing && existing.status === 'paid' && priorVoucher.reference_id === existing.id) {
          return json({
            success: true,
            message: `Kỳ lương ${billingCycle} đã được chi trả trước đó (Idempotent Replay).`,
            status: 'paid',
            disbursed_net_amount: priorVoucher.amount,
            voucher: priorVoucher
          });
        } else {
          // Orphan voucher cleanup: The prior voucher was written in an aborted transaction that never completed payroll update!
          try {
            await db.prepare(`DELETE FROM finance_ledger WHERE id = ?;`).bind(priorVoucher.id).run();
          } catch {}
        }
      }
    }

    // STATE MACHINE VALIDATIONS:
    // 0. Optimistic Concurrency Guard: Validate caller's expected status if provided
    if (existing && body.expected_status && existing.status !== body.expected_status) {
      return json({
        success: false,
        error: `ConflictError: Trạng thái kỳ lương ${billingCycle} đã bị thay đổi (hiện tại: '${existing.status}', mong đợi: '${body.expected_status}'). Vui lòng làm mới dữ liệu trước khi thực hiện.`
      }, { status: 409 });
    }

    // 1. Fully paid or closed periods are strictly terminal and cannot be modified or disbursed
    if (existing && ['paid', 'closed'].includes(existing.status)) {
      return json({
        success: false,
        error: `ConflictError: Kỳ lương ${billingCycle} của giáo viên ${teacherId} đã ở trạng thái '${existing.status}' (hoàn tất chi trả/đã đóng sổ), không thể thực chi hay sửa đổi.`
      }, { status: 409 });
    }

    // 2. Locked & Approved periods handling (Immutable financial snapshots):
    // Once approved or locked, monetary amounts (gross, net, calculations) are immutable.
    // Legitimate state transitions:
    // - approved -> locked (via 'lock')
    // - approved -> paid (via 'disburse')
    // - locked -> paid (via 'disburse')
    // All other actions (calculate, save_draft, preview) are strictly rejected with 409 Conflict.
    if (existing && ['locked', 'approved'].includes(existing.status)) {
      if (!manager) {
        return json({
          success: false,
          error: `Forbidden: Bảng lương ${billingCycle} đã được phê duyệt/khóa sổ (${existing.approved_by || 'Leader'}). Giáo viên không có quyền can thiệp.`
        }, { status: 403 });
      }

      if (action === 'disburse') {
        const effectiveIdemKey = idempotencyKey || `disburse_${existing.id}_${billingCycle}`;
        const voucherId = `vch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const voucherNumber = `PC-${billingCycle.replace('-', '')}-${teacherId.slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`;

        // ATOMIC DISBURSEMENT TRANSACTION:
        // Ensure BOTH finance_ledger insertion and teacher_payrolls status update commit together.
        // If updating payroll fails (trigger, constraint, error) or yields 0 changes:
        // IMMEDIATELY rollback the voucher from finance_ledger and fail closed!
        let disburseSql = `
          UPDATE teacher_payrolls
          SET status = 'paid', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('locked', 'approved')
        `;
        const disburseParams = [existing.id];
        if (body.expected_status) {
          disburseSql += ` AND status = ?;`;
          disburseParams.push(body.expected_status);
        } else {
          disburseSql += `;`;
        }

        const insertLedgerSql = `
          INSERT INTO finance_ledger (
            id, voucher_type, reference_id, teacher_id, actor_id,
            amount, payment_method, billing_cycle, idempotency_key, voucher_number, status
          ) VALUES (?, 'PAYROLL_DISBURSEMENT', ?, ?, ?, ?, ?, ?, ?, ?, 'completed');
        `;
        const ledgerParams = [
          voucherId,
          existing.id,
          teacherId,
          auth.user.id,
          existing.net_amount,
          body.payment_method || 'bank_transfer',
          billingCycle,
          effectiveIdemKey,
          voucherNumber
        ];

        let voucherInserted = false;
        try {
          if (typeof db.batch === 'function') {
            const batchRes = await db.batch([
              db.prepare(insertLedgerSql).bind(...ledgerParams),
              db.prepare(disburseSql).bind(...disburseParams)
            ]);
            if (!batchRes || batchRes[1]?.meta?.changes === 0) {
              try { await db.prepare(`DELETE FROM finance_ledger WHERE id = ?;`).bind(voucherId).run(); } catch {}
              return json({
                success: false,
                error: `ConflictError: Kỳ lương ${billingCycle} không còn ở trạng thái 'locked' hoặc 'approved', không thể giải ngân.`
              }, { status: 409 });
            }
          } else {
            await db.prepare(insertLedgerSql).bind(...ledgerParams).run();
            voucherInserted = true;

            const disburseRes = await db.prepare(disburseSql).bind(...disburseParams).run();
            if (disburseRes.meta?.changes === 0) {
              try { await db.prepare(`DELETE FROM finance_ledger WHERE id = ?;`).bind(voucherId).run(); } catch {}
              return json({
                success: false,
                error: `ConflictError: Kỳ lương ${billingCycle} không còn ở trạng thái 'locked' hoặc 'approved', không thể giải ngân.`
              }, { status: 409 });
            }
          }
        } catch (txnErr) {
          // ATOMIC ROLLBACK: Purge the voucher if downstream update failed or aborted
          if (voucherInserted) {
            try {
              await db.prepare(`DELETE FROM finance_ledger WHERE id = ?;`).bind(voucherId).run();
            } catch {}
          }
          return json({
            success: false,
            error: `DisbursementTransactionError: Quá trình giải ngân thất bại (${txnErr.message})`
          }, { status: 500 });
        }

        return json({
          success: true,
          message: `Đã xác nhận thực chi trả thành công số tiền đã duyệt cho kỳ lương ${billingCycle}!`,
          status: 'paid',
          disbursed_net_amount: existing.net_amount,
          voucher: {
            voucher_id: voucherId,
            voucher_number: voucherNumber,
            actor_id: auth.user.id,
            amount: existing.net_amount,
            disbursed_at: new Date().toISOString(),
            idempotency_key: idempotencyKey
          }
        });
      } else if (action === 'lock') {
        const lockRes = await db.prepare(`
          UPDATE teacher_payrolls
          SET status = 'locked', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('locked', 'approved');
        `).bind(existing.id).run();

        if (lockRes.meta?.changes === 0) {
          return json({
            success: false,
            error: `ConflictError: Kỳ lương ${billingCycle} không còn ở trạng thái 'approved' hoặc 'locked', không thể khóa sổ.`
          }, { status: 409 });
        }

        return json({
          success: true,
          message: `Đã khóa sổ kỳ lương ${billingCycle} thành công!`,
          status: 'locked'
        });
      } else {
        return json({
          success: false,
          error: `ConflictError: Kỳ lương ${billingCycle} của giáo viên ${teacherId} đã ở trạng thái '${existing.status}'. Số tiền đã phê duyệt là bất biến, không thể tính lại hay ghi đè.`
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

    calculated.status = targetStatus;
    if (targetStatus === 'approved' || targetStatus === 'locked') {
      calculated.approved_by = manager ? auth.user.id : null;
      calculated.approved_at = new Date().toISOString();
    }

    if (existing) {
      // WRITE-TIME SQL CONCURRENCY GUARD:
      // Managers can update non-locked/non-closed/non-paid records.
      // Regular teachers can strictly ONLY update records that are still in 'draft' status.
      const allowedStatusClause = manager
        ? "status NOT IN ('locked', 'closed', 'paid')"
        : "status = 'draft'";

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
        WHERE id = ? AND ${allowedStatusClause};
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
          error: `ConflictError: Kỳ lương ${billingCycle} đã bị thay đổi trạng thái bởi phiên quản trị khác hoặc không ở trạng thái được phép sửa đổi.`
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

import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../lib/server/auth.js';
import { calculateTeacherMonthlyPayroll } from '../../../../lib/server/payrollEngine.js';

export const prerender = false;

function isManager(user) {
  if (!user) return false;
  return user.role === 'superadmin' || user.role === 'leader' || user.role === 'admin';
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

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensurePayrollSchema(db) {
  if (!db) return;
  await db.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_payrolls (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        month_label TEXT DEFAULT '',
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
        description TEXT,
        metadata_json TEXT DEFAULT '{}',
        adjustment_version INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();
    // Auto-migrate columns for teacher_payrolls if missing
    const payrollCols = [
      'month_label TEXT DEFAULT \'\'',
      'billing_cycle TEXT',
      'gross_amount INTEGER DEFAULT 0',
      'net_amount INTEGER DEFAULT 0',
      'disbursed_advances_deducted INTEGER DEFAULT 0',
      'prior_debt_deducted INTEGER DEFAULT 0',
      'carried_over_debt INTEGER DEFAULT 0',
      'status TEXT DEFAULT \'draft\'',
      'calculation_json TEXT',
      'approved_by TEXT',
      'approved_at DATETIME',
      'updated_at DATETIME'
    ];
  for (const col of payrollCols) {
    try {
      await db.prepare(`ALTER TABLE teacher_payrolls ADD COLUMN ${col};`).run();
    } catch (err) {
      if (!/duplicate column name/i.test(err?.message || '')) {
        throw err;
      }
    }
  }

  // Migrate: add description, metadata_json, and adjustment_version columns if missing
  try {
    await db.prepare(`ALTER TABLE finance_ledger ADD COLUMN description TEXT;`).run();
  } catch (err) {
    if (!/duplicate column name/i.test(err?.message || '')) {
      throw err;
    }
  }
  try {
    await db.prepare(`ALTER TABLE finance_ledger ADD COLUMN metadata_json TEXT;`).run();
  } catch (err) {
    if (!/duplicate column name/i.test(err?.message || '')) {
      throw err;
    }
  }
  try {
    await db.prepare(`ALTER TABLE finance_ledger ADD COLUMN adjustment_version INTEGER;`).run();
  } catch (err) {
    if (!/duplicate column name/i.test(err?.message || '')) {
      throw err;
    }
  }

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_payroll_version ON finance_ledger(reference_id, adjustment_version) WHERE voucher_type = 'PAYROLL_ADJUSTMENT' AND adjustment_version IS NOT NULL;`).run();
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
      try {
        const sessRes = await db.prepare(`
          SELECT * FROM class_sessions
          WHERE (teacher_id = ? OR teacher_id LIKE ?)
          ORDER BY session_date ASC
        `).bind(targetTeacherId, `%${targetTeacherId}%`).all();
        sessions = sessRes?.results || [];
      } catch {
        sessions = [];
      }
    }

    // 4. Fetch salary advances for this teacher and cycle
    let advances = [];
    if (db) {
      try {
        const advRes = await db.prepare(`
          SELECT * FROM teacher_salary_advances
          WHERE teacher_id = ?
        `).bind(targetTeacherId).all();
        advances = advRes?.results || [];
      } catch {
        advances = [];
      }
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
    try {
      await ensurePayrollSchema(db);
    } catch (schemaErr) {
      console.error('Payroll schema initialization failed:', schemaErr);
      return json({
        success: false,
        error: `DatabaseError: Khởi tạo bảng lương thất bại (${schemaErr.message})`
      }, { status: 500 });
    }
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
  const ALLOWED_ACTIONS = ['preview', 'calculate', 'save_draft', 'approve', 'lock', 'disburse', 'adjust', 'create_adjustment'];
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
  if (['approve', 'lock', 'disburse', 'adjust', 'create_adjustment'].includes(action) && !manager) {
    return json({ success: false, error: 'Forbidden: Chỉ Ban Quản Lý (Leader/Admin) mới có quyền khóa sổ, duyệt chi hoặc điều chỉnh bảng lương' }, { status: 403 });
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
        if (existing && existing.status === 'paid' && priorVoucher.reference_id === existing.id && priorVoucher.voucher_type === 'PAYROLL_DISBURSEMENT') {
          return json({
            success: true,
            message: `Kỳ lương ${billingCycle} đã được chi trả trước đó (Idempotent Replay).`,
            status: 'paid',
            disbursed_net_amount: priorVoucher.amount,
            voucher: priorVoucher
          });
        } else {
          return json({ success: false, error: 'IdempotencyConflict: Khóa giao dịch đã thuộc chứng từ khác hoặc trạng thái không khớp. Không tự động xóa chứng từ.' }, { status: 409 });
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

    // 1. Paid or closed periods: only 'create_adjustment' is allowed (differential voucher)
    if (action === 'create_adjustment') {
      if (!existing || !['paid', 'closed'].includes(existing.status)) {
        return json({
          success: false,
          error: `ConflictError: Chỉ có thể tạo chứng từ điều chỉnh chênh lệch cho bảng lương đã chi trả ('paid') hoặc đã đóng sổ ('closed'). Bảng lương hiện tại ${existing ? `đang ở trạng thái '${existing.status}'` : 'chưa tồn tại'}.`
        }, { status: existing ? 409 : 400 });
      }

      if (typeof db.batch !== 'function') {
        return json({
          success: false,
          error: 'PayrollTransactionError: Hệ thống cơ sở dữ liệu yêu cầu hỗ trợ giao dịch nguyên tử (db.batch) để tạo chứng từ điều chỉnh.'
        }, { status: 500 });
      }

      // Strict validation of adjustment_amount: Safe integer VND, reject boolean, object, array, NaN, Infinity, decimal, zero
      const rawAmount = body.adjustment_amount;
      let adjAmount;
      if (typeof rawAmount === 'boolean' || rawAmount === null || typeof rawAmount === 'object' || Array.isArray(rawAmount)) {
        return json({
          success: false,
          error: 'Số tiền điều chỉnh (adjustment_amount) không hợp lệ (từ chối kiểu boolean, object, array, null).'
        }, { status: 400 });
      }
      if (typeof rawAmount === 'number') {
        if (!Number.isFinite(rawAmount) || !Number.isSafeInteger(rawAmount)) {
          return json({
            success: false,
            error: 'Số tiền điều chỉnh (adjustment_amount) phải là số nguyên an toàn (safe integer VND), từ chối số thập phân, NaN hoặc Infinity.'
          }, { status: 400 });
        }
        adjAmount = rawAmount;
      } else if (typeof rawAmount === 'string' && /^-?\d+$/.test(rawAmount.trim())) {
        const parsed = Number(rawAmount.trim());
        if (!Number.isSafeInteger(parsed)) {
          return json({
            success: false,
            error: 'Số tiền điều chỉnh (adjustment_amount) vượt quá giới hạn số nguyên an toàn.'
          }, { status: 400 });
        }
        adjAmount = parsed;
      } else {
        return json({
          success: false,
          error: 'Số tiền điều chỉnh (adjustment_amount) không hợp lệ (phải là số nguyên VND).'
        }, { status: 400 });
      }

      if (adjAmount === 0) {
        return json({
          success: false,
          error: 'Số tiền điều chỉnh (adjustment_amount) phải khác 0.'
        }, { status: 400 });
      }

      // Strict validation of adjustment_reason
      if (typeof body.adjustment_reason !== 'string' || body.adjustment_reason.trim().length < 5) {
        return json({
          success: false,
          error: 'Lý do điều chỉnh (adjustment_reason) bắt buộc và phải có ít nhất 5 ký tự sau khi cắt khoảng trắng.'
        }, { status: 400 });
      }
      const trimmedReason = body.adjustment_reason.trim();

      // Strict validation of effective_date
      let effectiveDate = body.effective_date;
      if (effectiveDate) {
        if (typeof effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate.trim()) || isNaN(Date.parse(effectiveDate.trim()))) {
          return json({
            success: false,
            error: 'Ngày hiệu lực (effective_date) không hợp lệ (định dạng chuẩn YYYY-MM-DD).'
          }, { status: 400 });
        }
        effectiveDate = effectiveDate.trim();
      } else {
        effectiveDate = new Date().toISOString().split('T')[0];
      }

      // Deterministic payload hash for idempotency tracking
      const payloadObj = {
        reference_id: existing.id,
        teacher_id: teacherId,
        billing_cycle: billingCycle,
        adjustment_amount: adjAmount,
        adjustment_reason: trimmedReason,
        effective_date: effectiveDate
      };
      const payloadHash = await sha256Hex(JSON.stringify(payloadObj));
      const clientKey = body.idempotency_key || body.operation_id;
      const effectiveIdemKey = clientKey || `adj_${existing.id}_${payloadHash.slice(0, 16)}`;

      // Idempotency check: if key already exists, replay or conflict
      if (clientKey) {
        try {
          const priorLedger = await db.prepare(`
            SELECT * FROM finance_ledger WHERE idempotency_key = ? LIMIT 1
          `).bind(clientKey).first();

          if (priorLedger) {
            let priorMeta = {};
            try { priorMeta = JSON.parse(priorLedger.metadata_json || '{}'); } catch {}
            // Strict payload match: must match reference_id, amount, AND payload_hash
            const isMatching = (
              priorLedger.reference_id === existing.id &&
              priorLedger.amount === adjAmount &&
              Boolean(priorMeta.payload_hash && priorMeta.payload_hash === payloadHash)
            );

            if (isMatching) {
              return json({
                success: true,
                message: `Chứng từ điều chỉnh cho kỳ lương ${billingCycle} đã được tạo trước đó (idempotent replay). Bảng lương gốc (${existing.net_amount} VNĐ) là bất biến và chứng từ này chưa được chi trả.`,
                idempotent_replay: true,
                adjustment: {
                  voucher_id: priorLedger.id,
                  voucher_number: priorLedger.voucher_number,
                  version: priorMeta.version || priorLedger.adjustment_version || 1,
                  adjustment_amount: priorLedger.amount,
                  original_net_amount: existing.net_amount,
                  reason: priorMeta.adjustment_reason || '',
                  effective_date: priorMeta.effective_date || '',
                  actor: priorLedger.actor_id,
                  status: priorLedger.status || 'pending_approval',
                  disbursed: false,
                  original_payroll_id: existing.id,
                  original_payroll_status: existing.status,
                  payload_hash: priorMeta.payload_hash
                }
              });
            } else {
              return json({
                success: false,
                error: `ConflictError: Idempotency key '${clientKey}' đã được sử dụng cho một giao dịch khác hoặc với nội dung điều chỉnh khác.`
              }, { status: 409 });
            }
          }
        } catch (chkErr) {
          console.warn('Idempotency check warning:', chkErr);
        }
      }

      // ATOMIC VERSION ALLOCATION WITH RETRY LOOP UNDER CONCURRENCY:
      let adjVersion = null;
      let adjVoucherId = null;
      let adjVoucherNumber = null;
      let insertSuccess = false;
      const maxAttempts = 5;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const countRes = await db.prepare(`
          SELECT COALESCE(MAX(adjustment_version), (SELECT COUNT(*) FROM finance_ledger WHERE reference_id = ? AND voucher_type = 'PAYROLL_ADJUSTMENT')) as cnt
          FROM finance_ledger
          WHERE reference_id = ? AND voucher_type = 'PAYROLL_ADJUSTMENT'
        `).bind(existing.id, existing.id).first();
        const candidateVersion = (Number(countRes?.cnt) || 0) + 1;

        const candidateVoucherId = body.voucher_id || `adj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const candidateVoucherNumber = `DC-${billingCycle.replace('-', '')}-${teacherId.slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`;
        const description = `[Điều chỉnh v${candidateVersion} - Chờ duyệt] ${trimmedReason} | Người tạo: ${auth.user.username || auth.user.id} | Ngày hiệu lực: ${effectiveDate} | Bảng lương gốc: ${existing.net_amount} VNĐ`;

        const metadata = {
          version: candidateVersion,
          payload_hash: payloadHash,
          original_net_amount: existing.net_amount,
          original_gross_amount: existing.gross_amount,
          effective_date: effectiveDate,
          adjustment_reason: trimmedReason,
          scope: 'pending_approval'
        };

        const insertAdjSql = `
          INSERT INTO finance_ledger (
            id, voucher_type, reference_id, teacher_id, actor_id,
            amount, payment_method, billing_cycle, idempotency_key, voucher_number,
            status, description, metadata_json, adjustment_version, created_at
          )
          SELECT ?, 'PAYROLL_ADJUSTMENT', id, teacher_id, ?, ?, ?, billing_cycle, ?, ?, 'pending_approval', ?, ?, ?, CURRENT_TIMESTAMP
          FROM teacher_payrolls
          WHERE id = ? AND status IN ('paid', 'closed');
        `;

        try {
          const batchRes = await db.batch([
            db.prepare(insertAdjSql).bind(
              candidateVoucherId,
              auth.user.id,
              adjAmount,
              body.payment_method || 'bank_transfer',
              effectiveIdemKey,
              candidateVoucherNumber,
              description,
              JSON.stringify(metadata),
              candidateVersion,
              existing.id
            )
          ]);

          if (batchRes?.[0]?.meta?.changes === 0) {
            return json({
              success: false,
              error: `ConflictError: Kỳ lương ${billingCycle} không còn ở trạng thái 'paid' hoặc 'closed' (có thể đã bị thay đổi bởi phiên quản trị khác).`
            }, { status: 409 });
          }

          adjVersion = candidateVersion;
          adjVoucherId = candidateVoucherId;
          adjVoucherNumber = candidateVoucherNumber;
          insertSuccess = true;
          break;
        } catch (insertErr) {
          // Version collision on concurrent requests:
          if (insertErr.message?.includes('UNIQUE') && (insertErr.message?.includes('idx_finance_ledger_payroll_version') || insertErr.message?.includes('adjustment_version'))) {
            // Another worker grabbed this candidateVersion, retry loop with incremented version
            continue;
          }

          // Same-key concurrency:
          if (insertErr.message?.includes('UNIQUE') && insertErr.message?.includes('idempotency_key')) {
            const winner = await db.prepare(`SELECT * FROM finance_ledger WHERE idempotency_key = ? LIMIT 1`).bind(effectiveIdemKey).first();
            if (winner) {
              let winMeta = {};
              try { winMeta = JSON.parse(winner.metadata_json || '{}'); } catch {}
              if (winMeta.payload_hash === payloadHash && winner.amount === adjAmount) {
                return json({
                  success: true,
                  message: `Chứng từ điều chỉnh cho kỳ lương ${billingCycle} đã được tạo trước đó (idempotent replay). Bảng lương gốc (${existing.net_amount} VNĐ) là bất biến và chứng từ này chưa được chi trả.`,
                  idempotent_replay: true,
                  adjustment: {
                    voucher_id: winner.id,
                    voucher_number: winner.voucher_number,
                    version: winMeta.version || winner.adjustment_version || 1,
                    adjustment_amount: winner.amount,
                    original_net_amount: existing.net_amount,
                    reason: winMeta.adjustment_reason || '',
                    effective_date: winMeta.effective_date || '',
                    actor: winner.actor_id,
                    status: winner.status || 'pending_approval',
                    disbursed: false,
                    original_payroll_id: existing.id,
                    original_payroll_status: existing.status,
                    payload_hash: winMeta.payload_hash
                  }
                });
              }
            }
            return json({
              success: false,
              error: `ConflictError: Thao tác điều chỉnh đang được xử lý đồng thời bởi phiên khác (Idempotency conflict).`
            }, { status: 409 });
          }

          return json({
            success: false,
            error: `PayrollTransactionError: Quá trình tạo chứng từ điều chỉnh thất bại (${insertErr.message})`
          }, { status: 500 });
        }
      }

      if (!insertSuccess) {
        return json({
          success: false,
          error: 'ConflictError: Cấp phát version điều chỉnh vượt quá số lần thử lại do tranh chấp đồng thời cao. Vui lòng thử lại.'
        }, { status: 409 });
      }

      return json({
        success: true,
        message: `Đã tạo chứng từ điều chỉnh v${adjVersion} (chờ phê duyệt) cho kỳ lương ${billingCycle}. Bảng lương gốc (${existing.net_amount} VNĐ) là bất biến và chứng từ này chưa được chi trả.`,
        adjustment: {
          voucher_id: adjVoucherId,
          voucher_number: adjVoucherNumber,
          version: adjVersion,
          adjustment_amount: adjAmount,
          original_net_amount: existing.net_amount,
          reason: trimmedReason,
          effective_date: effectiveDate,
          actor: auth.user.id,
          status: 'pending_approval',
          disbursed: false,
          original_payroll_id: existing.id,
          original_payroll_status: existing.status,
          payload_hash: payloadHash
        }
      });
    }

    if (existing && ['paid', 'closed'].includes(existing.status)) {
      return json({
        success: false,
        error: `ConflictError: Kỳ lương ${billingCycle} của giáo viên ${teacherId} đã ở trạng thái '${existing.status}' (hoàn tất chi trả/đã đóng sổ). Sử dụng action 'create_adjustment' để tạo chứng từ điều chỉnh chênh lệch.`
      }, { status: 409 });
    }

    // 2. Locked & Approved periods handling (Immutable financial snapshots):
    if (action === 'adjust') {
      if (!existing) {
        return json({
          success: false,
          error: `Bảng lương kỳ ${billingCycle} của giáo viên ${teacherId} chưa tồn tại.`
        }, { status: 400 });
      }

      if (!manager) {
        return json({
          success: false,
          error: `Forbidden: Bảng lương ${billingCycle} đã được phê duyệt/khóa sổ (${existing.approved_by || 'Leader'}). Giáo viên không có quyền can thiệp.`
        }, { status: 403 });
      }

      const clientKey = body.idempotency_key || body.operation_id;

      // Check if db.batch is supported
      if (typeof db.batch !== 'function') {
        return json({
          success: false,
          error: 'PayrollTransactionError: Hệ thống cơ sở dữ liệu yêu cầu hỗ trợ giao dịch nguyên tử (db.batch) để mở lại kỳ lương.'
        }, { status: 500 });
      }

      // Check idempotency replay even if payroll is already in 'draft'
      if (clientKey) {
        try {
          const priorLedger = await db.prepare(`
            SELECT * FROM finance_ledger WHERE idempotency_key = ? LIMIT 1
          `).bind(clientKey).first();

          if (priorLedger) {
            if (priorLedger.voucher_type === 'PAYROLL_REOPEN_AUDIT' && priorLedger.reference_id === existing.id) {
              let priorSnapshot = null;
              try { priorSnapshot = JSON.parse(priorLedger.metadata_json || '{}'); } catch {}
              const savedReason = priorSnapshot?.adjustment_reason || '';
              // Verify reason strictly matches
              if (body.adjustment_reason && savedReason && savedReason !== body.adjustment_reason.trim()) {
                return json({
                  success: false,
                  error: `ConflictError: Idempotency key '${clientKey}' đã được sử dụng với lý do mở lại khác (đã lưu: '${savedReason}', yêu cầu mới: '${body.adjustment_reason.trim()}').`
                }, { status: 409 });
              }
              return json({
                success: true,
                message: `Kỳ lương ${billingCycle} đã được mở lại về trạng thái 'draft' (kết quả thực thi trước đó - idempotent replay).`,
                status: 'draft',
                idempotent_replay: true,
                audit: {
                  snapshot_id: priorLedger.id,
                  voucher_number: priorLedger.voucher_number,
                  reason: savedReason || priorLedger.description,
                  actor: priorLedger.actor_id,
                  snapshot: priorSnapshot
                }
              });
            } else {
              return json({
                success: false,
                error: `ConflictError: Idempotency key '${clientKey}' đã được sử dụng cho một giao dịch khác.`
              }, { status: 409 });
            }
          }
        } catch (chkErr) {
          console.warn('Idempotency check warning:', chkErr);
        }
      }

      if (!['locked', 'approved'].includes(existing.status)) {
        return json({
          success: false,
          error: `ConflictError: Chỉ có thể mở lại bảng lương đã phê duyệt ('approved') hoặc đã khóa ('locked'). Bảng lương hiện tại đang ở trạng thái '${existing.status}'.`
        }, { status: 409 });
      }

      if (!body.adjustment_reason || typeof body.adjustment_reason !== 'string' || body.adjustment_reason.trim().length < 5) {
        return json({
          success: false,
          error: 'Thiếu lý do điều chỉnh (adjustment_reason) hợp lệ khi mở lại bảng lương đã duyệt (tối thiểu 5 ký tự).'
        }, { status: 400 });
      }
      const trimmedReason = body.adjustment_reason.trim();

      const effectiveIdemKey = clientKey || `reopen_${existing.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const snapshotId = `snap_${existing.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const prevCalcJson = existing.calculation_json || '{}';
      let prevCalc;
      try { prevCalc = JSON.parse(prevCalcJson); } catch { prevCalc = {}; }

      const fullSnapshot = {
        snapshot_id: snapshotId,
        payroll_id: existing.id,
        teacher_id: teacherId,
        billing_cycle: billingCycle,
        month_label: existing.month_label || billingCycle,
        previous_status: existing.status,
        gross_amount: existing.gross_amount,
        net_amount: existing.net_amount,
        disbursed_advances_deducted: existing.disbursed_advances_deducted,
        prior_debt_deducted: existing.prior_debt_deducted,
        carried_over_debt: existing.carried_over_debt,
        approved_by: existing.approved_by,
        approved_at: existing.approved_at,
        calculation_snapshot: prevCalc,
        adjustment_reason: trimmedReason,
        actor: auth.user.id,
        reopened_at: new Date().toISOString()
      };
      const fullSnapshotJson = JSON.stringify(fullSnapshot);

      const auditVoucherNumber = `RO-${billingCycle.replace('-', '')}-${teacherId.slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const auditDescription = `[Mở lại] Lý do: ${trimmedReason} | Trạng thái cũ: ${existing.status} | Người duyệt cũ: ${existing.approved_by || 'N/A'} | Số tiền duyệt: ${existing.net_amount} VNĐ | Snapshot: ${snapshotId}`;

      // ATOMIC BATCH TRANSACTION: Conditional INSERT + CAS UPDATE
      let insertAuditSql = `
        INSERT INTO finance_ledger (
          id, voucher_type, reference_id, teacher_id, actor_id,
          amount, payment_method, billing_cycle, idempotency_key, voucher_number, status, description, metadata_json, created_at
        )
        SELECT ?, 'PAYROLL_REOPEN_AUDIT', id, teacher_id, ?, net_amount, 'internal', billing_cycle, ?, ?, 'completed', ?, ?, CURRENT_TIMESTAMP
        FROM teacher_payrolls
        WHERE id = ? AND status IN ('locked', 'approved')
      `;
      const auditParams = [
        snapshotId,
        auth.user.id,
        effectiveIdemKey,
        auditVoucherNumber,
        auditDescription,
        fullSnapshotJson,
        existing.id
      ];
      if (body.expected_status) {
        insertAuditSql += ` AND status = ?;`;
        auditParams.push(body.expected_status);
      } else {
        insertAuditSql += `;`;
      }

      let reopenSql = `
        UPDATE teacher_payrolls
        SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('locked', 'approved')
      `;
      const reopenParams = [existing.id];
      if (body.expected_status) {
        reopenSql += ` AND status = ?;`;
        reopenParams.push(body.expected_status);
      } else {
        reopenSql += `;`;
      }

      try {
        const batchRes = await db.batch([
          db.prepare(insertAuditSql).bind(...auditParams),
          db.prepare(reopenSql).bind(...reopenParams)
        ]);

        const insertChanges = batchRes?.[0]?.meta?.changes ?? 0;
        const updateChanges = batchRes?.[1]?.meta?.changes ?? 0;

        if (updateChanges === 0 || insertChanges === 0) {
          return json({
            success: false,
            error: `ConflictError: Kỳ lương ${billingCycle} không còn ở trạng thái 'locked' hoặc 'approved' (có thể đã bị mở lại hoặc thanh toán bởi phiên quản trị khác).`
          }, { status: 409 });
        }
      } catch (txnErr) {
        return json({
          success: false,
          error: `PayrollTransactionError: Quá trình mở lại bảng lương thất bại (${txnErr.message})`
        }, { status: 500 });
      }

      return json({
        success: true,
        message: `Đã mở lại kỳ lương ${billingCycle} về trạng thái 'draft' để điều chỉnh. Cần phê duyệt lại sau khi hoàn tất.`,
        status: 'draft',
        audit: {
          snapshot_id: snapshotId,
          voucher_number: auditVoucherNumber,
          previous_status: existing.status,
          previous_net_amount: existing.net_amount,
          previous_approved_by: existing.approved_by,
          reason: trimmedReason,
          actor: auth.user.id,
          snapshot: fullSnapshot
        }
      });
    }

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

        // P1-01: ATOMIC DISBURSEMENT TRANSACTION
        // Cloudflare D1 requires db.batch for atomic transactions.
        // If db.batch is missing, fail-closed with HTTP 500 (DisbursementTransactionError).
        if (typeof db.batch !== 'function') {
          return json({
            success: false,
            error: 'DisbursementTransactionError: Hệ thống cơ sở dữ liệu yêu cầu hỗ trợ giao dịch nguyên tử (db.batch) để giải ngân.'
          }, { status: 500 });
        }

        // Conditional INSERT: Only insert voucher if teacher_payrolls record is still in ('locked', 'approved')
        let insertLedgerSql = `
          INSERT INTO finance_ledger (
            id, voucher_type, reference_id, teacher_id, actor_id,
            amount, payment_method, billing_cycle, idempotency_key, voucher_number, status
          )
          SELECT ?, 'PAYROLL_DISBURSEMENT', id, teacher_id, ?, net_amount, ?, billing_cycle, ?, ?, 'completed'
          FROM teacher_payrolls
          WHERE id = ? AND status IN ('locked', 'approved')
        `;
        const ledgerParams = [
          voucherId,
          auth.user.id,
          body.payment_method || 'bank_transfer',
          effectiveIdemKey,
          voucherNumber,
          existing.id
        ];
        if (body.expected_status) {
          insertLedgerSql += ` AND status = ?;`;
          ledgerParams.push(body.expected_status);
        } else {
          insertLedgerSql += `;`;
        }

        // CAS UPDATE: Update status to 'paid' only if status is still ('locked', 'approved')
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

        try {
          const batchRes = await db.batch([
            db.prepare(insertLedgerSql).bind(...ledgerParams),
            db.prepare(disburseSql).bind(...disburseParams)
          ]);

          if (!batchRes || batchRes[1]?.meta?.changes === 0) {
            // CAS update matched 0 rows -> conditional insert also inserted 0 rows! Zero orphan voucher.
            return json({
              success: false,
              error: `ConflictError: Kỳ lương ${billingCycle} không còn ở trạng thái 'locked' hoặc 'approved', không thể giải ngân.`
            }, { status: 409 });
          }
        } catch (txnErr) {
          // D1 batch rolled back both statements automatically upon trigger/constraint/IO error.
          // Zero rows in finance_ledger, status in teacher_payrolls remains unchanged.
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
      try {
        const sessRes = await db.prepare(`
          SELECT * FROM class_sessions WHERE teacher_id = ? OR teacher_id LIKE ?
        `).bind(teacherId, `%${teacherId}%`).all();
        sessions = sessRes?.results || [];
      } catch {
        sessions = [];
      }

      try {
        const advRes = await db.prepare(`
          SELECT * FROM teacher_salary_advances WHERE teacher_id = ?
        `).bind(teacherId).all();
        advances = advRes?.results || [];
      } catch {
        advances = [];
      }
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
        SET month_label = ?,
            billing_cycle = ?,
            gross_amount = ?,
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
        billingCycle,
        billingCycle,
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
          id, teacher_id, month_label, billing_cycle, gross_amount, net_amount,
          disbursed_advances_deducted, prior_debt_deducted, carried_over_debt,
          status, calculation_json, approved_by, approved_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `).bind(
        recordId,
        teacherId,
        billingCycle,
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

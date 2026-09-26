/**
 * PAYROLL ENGINE - CORE CALCULATION & TIMESHEET RECONCILIATION
 * Requirements per Codex Audit Master Plan:
 * 1. Rate model: Base hourly rate, session duration, role multipliers (main, sub, co-teach)
 * 2. Timesheet calculation: Hours taught, substitute coverage, co-teaching allocations
 * 3. Salary advance deduction integration
 * 4. Locked period protection (cannot alter locked payroll records)
 * 5. Deterministic currency rounding (VND integer rounding, zero float leaks)
 * 6. Audit trail generation
 */

export const DEFAULT_RATE_MODEL = {
  base_hourly_rate: 200000, // 200,000 VND / hour
  role_multipliers: {
    main_teacher: 1.0,
    substitute: 1.1,         // 10% premium for on-call substitute teaching
    co_teacher: 0.6,         // 60% for teaching assistant / co-teacher
    tutoring: 1.25           // 125% for intensive 1-on-1 tutoring
  },
  standard_session_minutes: 90
};

/**
 * Calculates pay for a single session based on rate model and role
 */
export function calculateSessionPay(session, rateModel = DEFAULT_RATE_MODEL) {
  const durationMinutes = session.duration_minutes || rateModel.standard_session_minutes;
  const hours = durationMinutes / 60;
  const role = session.role || 'main_teacher';
  const multiplier = rateModel.role_multipliers[role] ?? 1.0;

  // Base calculation with exact VND integer rounding
  const rawPay = hours * rateModel.base_hourly_rate * multiplier;
  return Math.round(rawPay);
}

/**
 * Runs the complete payroll calculation for a teacher in a billing cycle
 * @param {Object} params
 * @param {string} params.teacherId
 * @param {string} params.billingCycle (e.g. "2026-09")
 * @param {Array} params.sessions - Completed teaching sessions
 * @param {Array} params.advances - Disbursed salary advances
 * @param {Object} params.existingPeriod - Existing payroll period record (if any)
 * @param {Object} params.customRateModel - Optional custom rate overrides
 */
export function calculateTeacherMonthlyPayroll({
  teacherId,
  billingCycle,
  sessions = [],
  advances = [],
  existingPeriod = null,
  customRateModel = null
}) {
  // 1. Locked Period Protection: Cannot recalculate if period is locked
  if (existingPeriod && existingPeriod.status === 'locked') {
    throw new Error(`LockedPayrollPeriodError: Kỳ lương ${billingCycle} đã bị khóa sổ (Locked), không được phép tính lại.`);
  }

  const rateModel = { ...DEFAULT_RATE_MODEL, ...(customRateModel || {}) };

  let mainSessionsCount = 0;
  let substituteSessionsCount = 0;
  let coTeachSessionsCount = 0;
  let grossTeachingPay = 0;

  const sessionDetails = [];

  for (const s of sessions) {
    if (s.status === 'cancelled' || s.status === 'unexcused_absent') {
      continue; // Unexcused absence does not receive pay
    }

    const pay = calculateSessionPay(s, rateModel);
    grossTeachingPay += pay;

    if (s.role === 'substitute') {
      substituteSessionsCount++;
    } else if (s.role === 'co_teacher') {
      coTeachSessionsCount++;
    } else {
      mainSessionsCount++;
    }

    sessionDetails.push({
      session_id: s.id,
      session_date: s.session_date,
      role: s.role || 'main_teacher',
      duration_minutes: s.duration_minutes || rateModel.standard_session_minutes,
      calculated_pay: pay
    });
  }

  // 2. Calculate Total Advance Deductions
  let totalAdvanceDeductions = 0;
  const advanceDetails = [];

  for (const adv of advances) {
    if (adv.status === 'approved' || adv.status === 'disbursed') {
      totalAdvanceDeductions += Math.round(Number(adv.amount || 0));
      advanceDetails.push({
        advance_id: adv.id,
        amount: Math.round(Number(adv.amount || 0)),
        disbursed_date: adv.disbursed_date || null
      });
    }
  }

  // 3. Net Pay Calculation (Prevent negative net pay)
  const netPay = Math.max(0, grossTeachingPay - totalAdvanceDeductions);

  return {
    teacher_id: teacherId,
    billing_cycle: billingCycle,
    status: existingPeriod?.status || 'draft',
    summary: {
      total_sessions: sessions.length,
      payable_sessions: sessionDetails.length,
      main_sessions: mainSessionsCount,
      substitute_sessions: substituteSessionsCount,
      co_teach_sessions: coTeachSessionsCount,
      gross_pay: grossTeachingPay,
      total_advances_deducted: totalAdvanceDeductions,
      net_pay: netPay,
      currency: 'VND'
    },
    session_details: sessionDetails,
    advance_details: advanceDetails,
    audit_trail: {
      calculated_at: new Date().toISOString(),
      base_hourly_rate: rateModel.base_hourly_rate,
      rounding_method: 'Math.round(VND)'
    }
  };
}

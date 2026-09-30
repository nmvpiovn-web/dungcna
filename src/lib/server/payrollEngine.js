/**
 * PAYROLL ENGINE - CORE CALCULATION & TIMESHEET RECONCILIATION
 * Requirements per Codex Audit Master Plan:
 * 1. Rate model: Base hourly rate, session duration, role multipliers (main, sub, co-teach)
 * 2. Timesheet calculation: Hours taught, substitute coverage, co-teaching allocations
 * 3. Salary advance deduction integration: Only deduct DISBURSED advances for this teacher/cycle
 * 4. Carried-over debt policy: NO Math.max(0) masking. Explicitly track carried-over debt to next cycle
 * 5. Locked period protection: Cannot alter locked payroll records
 * 6. Deterministic currency rounding: VND integer rounding, zero float leaks
 * 7. Audit trail generation
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
 * Calculates pay for a single completed session based on rate model and role
 */
export function calculateSessionPay(session, rateModel = DEFAULT_RATE_MODEL) {
  // Only completed/confirmed sessions are payable
  if (session.status !== 'completed' && session.status !== 'confirmed') {
    return 0;
  }

  const durationMinutes = session.duration_minutes || rateModel.standard_session_minutes;
  const hours = durationMinutes / 60;
  const role = session.role || 'main_teacher';
  const multiplier = rateModel.role_multipliers[role] ?? 1.0;

  // Base calculation with exact VND integer rounding
  const rawPay = hours * rateModel.base_hourly_rate * multiplier;
  return Math.round(rawPay);
}

/**
 * Builds a payroll engine rate model from a teacher_profiles salary config.
 * P0 FIX (2026-10-01): salary set via /api/teachers/staff (update_role_salary)
 * was persisted but never read — the engine always used DEFAULT_RATE_MODEL.
 * Maps the profile's salary_type to the engine's mode system:
 *   per_session            -> { mode: 'per_session', rate_per_session }
 *   monthly*               -> { mode: 'fixed_monthly', fixed_monthly_base }
 *   anything else / empty  -> null (fall back to default hourly model)
 * Returns null when no usable salary config exists so callers keep old behavior.
 */
export function buildRateModelFromProfile(profile) {
  if (!profile) return null;
  const salaryType = String(profile.salary_type || '').trim();
  const baseSalary = Math.round(Number(profile.base_salary_vnd) || 0);
  const ratePerSession = Math.round(Number(profile.rate_per_session_vnd) || 0);

  if (salaryType === 'per_session' && ratePerSession > 0) {
    return { mode: 'per_session', rate_per_session: ratePerSession };
  }
  if ((salaryType === 'monthly' || salaryType === 'monthly_lead' || salaryType === 'monthly_with_allowance') && baseSalary > 0) {
    return { mode: 'fixed_monthly', fixed_monthly_base: baseSalary };
  }
  return null;
}

/**
 * Runs the complete payroll calculation for a teacher in a billing cycle
 * @param {Object} params
 * @param {string} params.teacherId
 * @param {string} params.billingCycle (e.g. "2026-09")
 * @param {Array} params.sessions - Completed teaching sessions
 * @param {Array} params.advances - Salary advances (only 'disbursed' are deducted)
 * @param {number} params.previousDebtBalance - Unrecovered debt carried over from prior cycle
 * @param {number} params.bonusAmount - Performance or special bonus
 * @param {number} params.penaltyAmount - Discipline or unexcused absence penalty
 * @param {Object} params.existingPeriod - Existing payroll period record (if any)
 * @param {Object} params.customRateModel - Optional custom rate overrides
 */
export function calculateTeacherMonthlyPayroll({
  teacherId,
  billingCycle,
  sessions = [],
  advances = [],
  previousDebtBalance = 0,
  bonusAmount = 0,
  penaltyAmount = 0,
  existingPeriod = null,
  customRateModel = null
}) {
  // 1. Locked / Closed / Paid Period Protection: Cannot recalculate finalized cycles
  if (existingPeriod && ['locked', 'closed', 'paid'].includes(existingPeriod.status)) {
    throw new Error(`LockedPayrollPeriodError: Kỳ lương ${billingCycle} có trạng thái '${existingPeriod.status}', không được phép tính lại.`);
  }

  const rateModel = { ...DEFAULT_RATE_MODEL, ...(customRateModel || {}) };
  const mode = rateModel.mode || 'hourly'; // 'hourly' | 'per_session' | 'fixed_monthly' | 'hybrid'

  let mainSessionsCount = 0;
  let substituteSessionsCount = 0;
  let coTeachSessionsCount = 0;
  let grossTeachingPay = 0;

  const sessionDetails = [];

  for (const s of sessions) {
    // Strictly filter: only sessions belonging to this teacher
    if (s.teacher_id && s.teacher_id !== teacherId) {
      continue;
    }
    // Strictly filter: only sessions in this billing cycle (if date available)
    if (s.session_date && billingCycle && !s.session_date.startsWith(billingCycle)) {
      continue;
    }
    // Strictly filter: only completed or confirmed sessions are payable
    if (s.status !== 'completed' && s.status !== 'confirmed') {
      continue;
    }

    let pay = 0;
    if (mode === 'per_session') {
      const baseSessionRate = rateModel.rate_per_session || 300000;
      const role = s.role || 'main_teacher';
      const mult = rateModel.role_multipliers?.[role] ?? 1.0;
      pay = Math.round(baseSessionRate * mult);
    } else if (mode === 'fixed_monthly') {
      // In purely fixed monthly, individual sessions are logged for attendance but pay is base salary
      pay = 0;
    } else {
      // Standard hourly or hybrid calculation
      pay = calculateSessionPay(s, rateModel);
    }

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

  // Handle fixed monthly base component if configured in rateModel
  if (mode === 'fixed_monthly' || mode === 'hybrid') {
    grossTeachingPay += Math.round(Number(rateModel.fixed_monthly_base || 0));
  }

  // 2. Gross Total = Teaching Pay + Bonuses - Penalties
  const sanitizedBonus = Math.round(Math.max(0, Number(bonusAmount || 0)));
  const sanitizedPenalty = Math.round(Math.max(0, Number(penaltyAmount || 0)));
  const totalGrossIncome = Math.round(grossTeachingPay + sanitizedBonus - sanitizedPenalty);

  // 3. Advances: Strictly deduct DISBURSED advances matching teacher & cycle
  let totalDisbursedAdvances = 0;
  const advanceDetails = [];

  for (const adv of advances) {
    // Strictly filter: only advances belonging to this teacher
    if (adv.teacher_id && adv.teacher_id !== teacherId) {
      continue;
    }
    // Strictly filter: only advances belonging to this billing cycle
    if (adv.billing_cycle && adv.billing_cycle !== billingCycle) {
      continue;
    }
    // Only deduct if actually disbursed to the teacher
    if (adv.status === 'disbursed') {
      // P0 FIX (2026-10-01): D1 column is amount_vnd (migration 0004), not amount.
      // Reading adv.amount always yielded undefined -> 0, so advances were never deducted.
      const advAmount = Math.round(Number(adv.amount_vnd ?? adv.amount ?? 0));
      totalDisbursedAdvances += advAmount;
      advanceDetails.push({
        advance_id: adv.id,
        amount: advAmount,
        disbursed_date: adv.disbursed_date || null
      });
    }
  }

  // 4. Carried-over Debt Reconciliation (NO Math.max(0) masking!)
  const sanitizedPriorDebt = Math.round(Math.max(0, Number(previousDebtBalance || 0)));
  const totalObligationsToDeduct = totalDisbursedAdvances + sanitizedPriorDebt;

  let netPay = 0;
  let actualDeductionsApplied = 0;
  let carriedOverDebtToNextCycle = 0;

  if (totalGrossIncome >= totalObligationsToDeduct) {
    // Full recovery: earnings exceed deductions
    netPay = totalGrossIncome - totalObligationsToDeduct;
    actualDeductionsApplied = totalObligationsToDeduct;
    carriedOverDebtToNextCycle = 0;
  } else {
    // Partial recovery / Negative balance:
    // Net cash payout cannot be negative (cannot demand teacher pay back cash on payroll day),
    // so netPay is 0, and unrecovered balance is carried forward as debt to next month.
    netPay = 0;
    actualDeductionsApplied = totalGrossIncome;
    carriedOverDebtToNextCycle = totalObligationsToDeduct - totalGrossIncome;
  }

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
      teaching_pay: grossTeachingPay,
      bonus_amount: sanitizedBonus,
      penalty_amount: sanitizedPenalty,
      gross_income: totalGrossIncome,
      disbursed_advances_deducted: totalDisbursedAdvances,
      prior_debt_deducted: sanitizedPriorDebt,
      total_deductions_applied: actualDeductionsApplied,
      carried_over_debt: carriedOverDebtToNextCycle,
      net_pay: netPay,
      currency: 'VND'
    },
    session_details: sessionDetails,
    advance_details: advanceDetails,
    audit_trail: {
      calculated_at: new Date().toISOString(),
      base_hourly_rate: rateModel.base_hourly_rate,
      rounding_method: 'Math.round(VND)',
      debt_policy: 'carried_over_to_next_billing_cycle'
    }
  };
}

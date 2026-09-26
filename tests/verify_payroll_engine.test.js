import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSessionPay,
  calculateTeacherMonthlyPayroll,
  DEFAULT_RATE_MODEL
} from '../src/lib/server/payrollEngine.js';

describe('TEACHER PAYROLL ENGINE & TIMESHEET RECONCILIATION AUDIT SUITE', () => {
  test('PAY-01: Session pay calculation respects role multipliers and session duration', () => {
    // 90 mins main teacher: 1.5h * 200,000 * 1.0 = 300,000
    const mainPay = calculateSessionPay({ duration_minutes: 90, role: 'main_teacher', status: 'completed' });
    assert.strictEqual(mainPay, 300000);

    // 90 mins substitute teacher: 1.5h * 200,000 * 1.1 = 330,000
    const subPay = calculateSessionPay({ duration_minutes: 90, role: 'substitute', status: 'completed' });
    assert.strictEqual(subPay, 330000);

    // 90 mins co-teacher: 1.5h * 200,000 * 0.6 = 180,000
    const coTeachPay = calculateSessionPay({ duration_minutes: 90, role: 'co_teacher', status: 'completed' });
    assert.strictEqual(coTeachPay, 180000);

    // 60 mins tutoring: 1.0h * 200,000 * 1.25 = 250,000
    const tutoringPay = calculateSessionPay({ duration_minutes: 60, role: 'tutoring', status: 'completed' });
    assert.strictEqual(tutoringPay, 250000);

    // Non-completed session must return 0
    const pendingPay = calculateSessionPay({ duration_minutes: 90, role: 'main_teacher', status: 'scheduled' });
    assert.strictEqual(pendingPay, 0);
  });

  test('PAY-02: Full monthly payroll aggregates gross pay, filters unexcused absences, and deducts disbursed advances', () => {
    const sessions = [
      // 3 main sessions: 3 * 300,000 = 900,000
      { id: 's1', session_date: '2026-09-02', role: 'main_teacher', duration_minutes: 90, status: 'completed' },
      { id: 's2', session_date: '2026-09-05', role: 'main_teacher', duration_minutes: 90, status: 'completed' },
      { id: 's3', session_date: '2026-09-09', role: 'main_teacher', duration_minutes: 90, status: 'completed' },
      // 1 substitute session: 330,000
      { id: 's4', session_date: '2026-09-12', role: 'substitute', duration_minutes: 90, status: 'completed' },
      // 1 co-teacher session: 180,000
      { id: 's5', session_date: '2026-09-16', role: 'co_teacher', duration_minutes: 90, status: 'completed' },
      // 1 unexcused absence: 0 pay
      { id: 's6', session_date: '2026-09-19', role: 'main_teacher', duration_minutes: 90, status: 'unexcused_absent' }
    ];

    const advances = [
      // 1 disbursed advance: 500,000 (must be deducted)
      { id: 'adv_1', amount: 500000, status: 'disbursed', disbursed_date: '2026-09-10' },
      // 1 approved but NOT yet disbursed advance (must NOT be deducted)
      { id: 'adv_2', amount: 200000, status: 'approved' },
      // 1 rejected advance (must NOT be deducted)
      { id: 'adv_3', amount: 1000000, status: 'rejected' }
    ];

    const result = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions,
      advances,
      bonusAmount: 100000
    });

    // Teaching Pay: 900,000 + 330,000 + 180,000 = 1,410,000
    // Gross Income: 1,410,000 + 100,000 (bonus) = 1,510,000
    assert.strictEqual(result.summary.teaching_pay, 1410000);
    assert.strictEqual(result.summary.bonus_amount, 100000);
    assert.strictEqual(result.summary.gross_income, 1510000);
    assert.strictEqual(result.summary.total_sessions, 6);
    assert.strictEqual(result.summary.payable_sessions, 5);

    // Only disbursed advance deducted: 500,000
    assert.strictEqual(result.summary.disbursed_advances_deducted, 500000);
    assert.strictEqual(result.summary.carried_over_debt, 0);

    // Net pay: 1,510,000 - 500,000 = 1,010,000
    assert.strictEqual(result.summary.net_pay, 1010000);
    assert.strictEqual(result.summary.currency, 'VND');
  });

  test('PAY-03: Locked period guard strictly blocks recalculation', () => {
    assert.throws(() => {
      calculateTeacherMonthlyPayroll({
        teacherId: 'usr_teacher_lan',
        billingCycle: '2026-08',
        sessions: [{ id: 's1', role: 'main_teacher', duration_minutes: 90, status: 'completed' }],
        existingPeriod: { status: 'locked' }
      });
    }, /LockedPayrollPeriodError/);
  });

  test('PAY-04: Deterministic VND integer rounding (Zero fractional decimals)', () => {
    // Session with 47 minutes (odd fraction of hour)
    const oddPay = calculateSessionPay({ duration_minutes: 47, role: 'main_teacher', status: 'completed' });
    assert.ok(Number.isInteger(oddPay), 'Calculated pay must be an integer');

    const result = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions: [
        { id: 's1', duration_minutes: 47, role: 'main_teacher', status: 'completed' },
        { id: 's2', duration_minutes: 83, role: 'substitute', status: 'completed' }
      ],
      advances: [{ id: 'adv_odd', amount: 333333.33, status: 'disbursed' }]
    });

    assert.ok(Number.isInteger(result.summary.gross_income), 'Gross income must be strictly integer');
    assert.ok(Number.isInteger(result.summary.disbursed_advances_deducted), 'Advances must be strictly integer');
    assert.ok(Number.isInteger(result.summary.net_pay), 'Net pay must be strictly integer');
  });

  test('PAY-05: Carried-over Debt Policy: When advance exceeds gross, net pay is 0 and debt carries over', () => {
    // Teacher only worked 1 session (300,000 VND), but had a disbursed advance of 1,000,000 VND
    const month1 = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions: [
        { id: 's1', duration_minutes: 90, role: 'main_teacher', status: 'completed' }
      ],
      advances: [
        { id: 'adv_big', amount: 1000000, status: 'disbursed' }
      ]
    });

    assert.strictEqual(month1.summary.gross_income, 300000);
    assert.strictEqual(month1.summary.disbursed_advances_deducted, 1000000);
    assert.strictEqual(month1.summary.total_deductions_applied, 300000, 'Only 300k could be recovered this month');
    assert.strictEqual(month1.summary.net_pay, 0, 'Net cash cannot be negative');
    assert.strictEqual(month1.summary.carried_over_debt, 700000, 'Unrecovered 700,000 VND must be carried over to next cycle');

    // Month 2: Teacher works 4 sessions (1,200,000 VND) with previousDebtBalance = 700,000 VND
    const month2 = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-10',
      sessions: [
        { id: 's2_1', duration_minutes: 90, role: 'main_teacher', status: 'completed' },
        { id: 's2_2', duration_minutes: 90, role: 'main_teacher', status: 'completed' },
        { id: 's2_3', duration_minutes: 90, role: 'main_teacher', status: 'completed' },
        { id: 's2_4', duration_minutes: 90, role: 'main_teacher', status: 'completed' }
      ],
      advances: [],
      previousDebtBalance: month1.summary.carried_over_debt // 700,000
    });

    assert.strictEqual(month2.summary.gross_income, 1200000);
    assert.strictEqual(month2.summary.prior_debt_deducted, 700000);
    assert.strictEqual(month2.summary.total_deductions_applied, 700000);
    assert.strictEqual(month2.summary.carried_over_debt, 0, 'Prior debt fully cleared');
    assert.strictEqual(month2.summary.net_pay, 500000, 'Net pay: 1,200,000 - 700,000 = 500,000');
  });
});

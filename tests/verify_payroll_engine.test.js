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
    const mainPay = calculateSessionPay({ duration_minutes: 90, role: 'main_teacher' });
    assert.strictEqual(mainPay, 300000);

    // 90 mins substitute teacher: 1.5h * 200,000 * 1.1 = 330,000
    const subPay = calculateSessionPay({ duration_minutes: 90, role: 'substitute' });
    assert.strictEqual(subPay, 330000);

    // 90 mins co-teacher: 1.5h * 200,000 * 0.6 = 180,000
    const coTeachPay = calculateSessionPay({ duration_minutes: 90, role: 'co_teacher' });
    assert.strictEqual(coTeachPay, 180000);

    // 60 mins tutoring: 1.0h * 200,000 * 1.25 = 250,000
    const tutoringPay = calculateSessionPay({ duration_minutes: 60, role: 'tutoring' });
    assert.strictEqual(tutoringPay, 250000);
  });

  test('PAY-02: Full monthly payroll aggregates gross pay, filters unexcused absences, and deducts advances', () => {
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
      // 1 approved advance: 500,000
      { id: 'adv_1', amount: 500000, status: 'approved', disbursed_date: '2026-09-10' },
      // 1 rejected advance (must NOT be deducted)
      { id: 'adv_2', amount: 1000000, status: 'rejected' }
    ];

    const result = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions,
      advances
    });

    // Gross: 900,000 + 330,000 + 180,000 = 1,410,000
    assert.strictEqual(result.summary.gross_pay, 1410000);
    assert.strictEqual(result.summary.total_sessions, 6);
    assert.strictEqual(result.summary.payable_sessions, 5);
    assert.strictEqual(result.summary.substitute_sessions, 1);
    assert.strictEqual(result.summary.co_teach_sessions, 1);

    // Advances deducted: 500,000
    assert.strictEqual(result.summary.total_advances_deducted, 500000);

    // Net pay: 1,410,000 - 500,000 = 910,000
    assert.strictEqual(result.summary.net_pay, 910000);
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
    const oddPay = calculateSessionPay({ duration_minutes: 47, role: 'main_teacher' });
    assert.ok(Number.isInteger(oddPay), 'Calculated pay must be an integer');

    const result = calculateTeacherMonthlyPayroll({
      teacherId: 'usr_teacher_lan',
      billingCycle: '2026-09',
      sessions: [
        { id: 's1', duration_minutes: 47, role: 'main_teacher', status: 'completed' },
        { id: 's2', duration_minutes: 83, role: 'substitute', status: 'completed' }
      ],
      advances: [{ id: 'adv_odd', amount: 333333.33, status: 'approved' }]
    });

    assert.ok(Number.isInteger(result.summary.gross_pay), 'Gross pay must be strictly integer');
    assert.ok(Number.isInteger(result.summary.total_advances_deducted), 'Advances must be strictly integer');
    assert.ok(Number.isInteger(result.summary.net_pay), 'Net pay must be strictly integer');
  });
});

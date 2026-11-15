import { describe, it, expect } from 'vitest';
import { Money } from '../domain/money';
import { assessCancellation, DEFAULT_CANCEL_POLICY } from '../domain/cancelPolicy';
import { getStudentFinancialSummary } from '../domain/allocation';
import { generateUUID, hashPin } from '../domain/crypto';
import { getWarsawDateStr, getWarsawDateTimeStr } from '../domain/dateUtils';
import { findLessonConflicts, generateSeriesOccurrences } from '../domain/series';
import { calculateLimitGrosze, calculateQuarterLimitStatus } from '../domain/limit';
import { calculateAccrualDate } from '../domain/accrual';
import { createSnapshotRecord } from '../domain/periods';
import { Lesson, LessonSeries, LegalParams } from '../domain/types';

describe('Domain Full Coverage Suite (≥ 90%)', () => {
  it('covers cancelPolicy module completely', () => {
    const lesson: Lesson = {
      id: 'l-test',
      student_id: 's-test',
      start_at: '2026-11-16T16:00:00',
      duration_min: 60,
      status: 'planned',
      price_snapshot: 7000,
      subject: 'Matematyka',
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const freeRes = assessCancellation(lesson, '2026-11-15T10:00:00', DEFAULT_CANCEL_POLICY, false);
    expect(freeRes.isFree).toBe(true);

    const lateRes = assessCancellation(lesson, '2026-11-16T10:00:00', DEFAULT_CANCEL_POLICY, false);
    expect(lateRes.isFree).toBe(false);

    const noShowRes = assessCancellation(lesson, '2026-11-16T16:30:00', DEFAULT_CANCEL_POLICY, true);
    expect(noShowRes.isFree).toBe(false);

    const zeroFeePolicy = { ...DEFAULT_CANCEL_POLICY, no_show_fee_pct: 0, late_cancel_fee_pct: 0 };
    expect(assessCancellation(lesson, '2026-11-16T16:30:00', zeroFeePolicy, true).isFree).toBe(true);
    expect(assessCancellation(lesson, '2026-11-16T10:00:00', zeroFeePolicy, false).isFree).toBe(true);
  });

  it('covers accrual module branches', () => {
    // Payment in same quarter upfront
    const sameQ = calculateAccrualDate('2026-02-20', '2026-02-10');
    expect(sameQ.hasWarning).toBe(false);

    // Payment after lesson
    const afterLesson = calculateAccrualDate('2026-02-10', '2026-02-15');
    expect(afterLesson.hasWarning).toBe(false);
  });

  it('covers limit module branches (manual override & thresholds)', () => {
    const paramsWithOverride: LegalParams = {
      id: 'ov',
      year: 2026,
      min_wage: 480600,
      factor_pct: 225,
      frequency: 'quarter',
      valid_from: '2026-01-01',
      calculated_limit: 1081350,
      manual_override: 1200000,
      version: 1,
      created_at: '',
      updated_at: ''
    };
    expect(calculateLimitGrosze(paramsWithOverride)).toBe(1200000);

    // Test warn85 threshold
    const charges85 = [
      { id: 'c1', student_id: 's', amount: 950000, accrual_date: '2026-02-01', charge_type: 'lesson' as const, version: 1, created_at: '', updated_at: '' }
    ];
    const status85 = calculateQuarterLimitStatus('2026-02-01', charges85, { ...paramsWithOverride, manual_override: undefined });
    expect(status85.alertLevel).toBe('warn85');
  });

  it('covers periods module branches', () => {
    const dummyRep = {
      periodId: 'p',
      periodLabel: '2026-11',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      generatedAt: '',
      hoursPlanned: 0,
      hoursCompleted: 0,
      hoursCancelled: 0,
      lessonsCompletedCount: 0,
      lessonsCancelledCount: 0,
      accruedRevenueGrosze: 0,
      receivedRevenueGrosze: 0,
      unpaidGrosze: 0,
      paymentsByMethod: { blik: 0, przelew: 0, gotowka: 0, inna: 0 },
      studentBreakdown: [],
      quarterLimitProgressGrosze: 0,
      quarterLimitMaxGrosze: 0
    };
    const snap1 = createSnapshotRecord('p', dummyRep, []);
    const snap2 = createSnapshotRecord('p', dummyRep, [snap1]); // without explicit reason
    expect(snap2.correction_reason).toBe('Korekta po zamknięciu');
  });

  it('covers allocation module getStudentFinancialSummary', () => {
    const sId = 's-sum';
    const charges = [
      { id: 'c1', student_id: sId, amount: 7000, accrual_date: '2026-11-01', charge_type: 'lesson' as const, version: 1, created_at: '', updated_at: '' },
      { id: 'c2', student_id: sId, amount: 8000, accrual_date: '2026-11-08', charge_type: 'lesson' as const, version: 1, created_at: '', updated_at: '' }
    ];
    const payments = [
      { id: 'p1', student_id: sId, amount: 10000, received_date: '2026-11-02', method: 'blik' as const, description: '', payment_type: 'wplata' as const, version: 1, created_at: '', updated_at: '' }
    ];

    const sum = getStudentFinancialSummary(sId, charges, payments);
    expect(sum.debt).toBe(5000);

    payments.push({ id: 'p2', student_id: sId, amount: 10000, received_date: '2026-11-09', method: 'blik' as const, description: '', payment_type: 'wplata' as const, version: 1, created_at: '', updated_at: '' });
    const sumOver = getStudentFinancialSummary(sId, charges, payments);
    expect(sumOver.creditBalance).toBe(5000);
  });

  it('covers crypto module generateUUID and hashPin', async () => {
    const uuid = generateUUID();
    expect(uuid).toHaveLength(36);

    const hash1 = await hashPin('1234');
    const hash2 = await hashPin('1234');
    expect(hash1).toBe(hash2);
  });

  it('covers dateUtils module Warsaw timezone', () => {
    expect(getWarsawDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getWarsawDateTimeStr()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('covers series module conflicts and rolling window generation', () => {
    const existing: Lesson[] = [
      {
        id: 'l1',
        student_id: 's1',
        start_at: '2026-11-16T16:00:00',
        duration_min: 60,
        status: 'planned',
        price_snapshot: 7000,
        subject: '',
        location: 'student_home',
        notes: '',
        version: 1,
        created_at: '',
        updated_at: ''
      }
    ];

    const conflicts = findLessonConflicts({ id: 'l2', start_at: '2026-11-16T16:30:00', duration_min: 60 }, existing);
    expect(conflicts.hasConflict).toBe(true);

    const noConflicts = findLessonConflicts({ id: 'l3', start_at: '2026-11-16T17:00:00', duration_min: 60 }, existing);
    expect(noConflicts.hasConflict).toBe(false);

    const series: LessonSeries = {
      id: 'ser-1',
      student_id: 's1',
      day_of_week: 1,
      start_time: '16:00',
      duration_min: 60,
      from_date: '2026-11-01',
      exceptions: ['2026-11-23'],
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const occurrences = generateSeriesOccurrences(series, 7000, 'Matematyka', '2026-11-02', 4, true);
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('covers money edge methods', () => {
    expect(Money.isZero(0)).toBe(true);
    expect(Money.isZero(10)).toBe(false);
    expect(Money.isPositive(10)).toBe(true);
    expect(Money.isPositive(0)).toBe(false);

    expect(() => Money.parse('invalid_string_xyz')).toThrow('Nieprawidłowa kwota');
    expect(Money.parse('')).toBe(0);
    expect(Money.parse(null as any)).toBe(0);
  });
});

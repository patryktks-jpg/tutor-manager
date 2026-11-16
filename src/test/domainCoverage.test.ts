import { describe, it, expect } from 'vitest';
import { Money } from '../domain/money';
import { assessCancellation, DEFAULT_CANCEL_POLICY } from '../domain/cancelPolicy';
import { getStudentFinancialSummary } from '../domain/allocation';
import { generateUUID, hashPin } from '../domain/crypto';
import { getWarsawDateStr, getWarsawDateTimeStr, getWarsawWeekRange } from '../domain/dateUtils';
import { findLessonConflicts, generateSeriesOccurrences } from '../domain/series';
import { buildCompleteAndPayPayload } from '../domain/lessonOps';
import { calculateLimitGrosze, calculateQuarterLimitStatus } from '../domain/limit';
import { calculateAccrualDate } from '../domain/accrual';
import { createSnapshotRecord } from '../domain/periods';
import { Lesson, LessonSeries, LegalParams, Student } from '../domain/types';
import { formatStudentBirthday } from '../components/views/StudentsView';

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

  it('covers getWarsawWeekRange without UTC midnight day shift (PUNKT 1 FIX)', () => {
    // 2026-11-16 is a Monday
    const mondayRes = getWarsawWeekRange('2026-11-16');
    expect(mondayRes.mondayStr).toBe('2026-11-16');
    expect(mondayRes.sundayStr).toBe('2026-11-22');
    expect(mondayRes.days).toHaveLength(7);
    expect(mondayRes.days[0]).toBe('2026-11-16');
    expect(mondayRes.days[6]).toBe('2026-11-22');

    // 2026-11-22 is Sunday -> still the same Monday-Sunday week
    const sundayRes = getWarsawWeekRange('2026-11-22');
    expect(sundayRes.mondayStr).toBe('2026-11-16');
    expect(sundayRes.sundayStr).toBe('2026-11-22');

    // Month boundary: 2026-10-31 is Saturday
    const octEndRes = getWarsawWeekRange('2026-10-31');
    expect(octEndRes.mondayStr).toBe('2026-10-26');
    expect(octEndRes.sundayStr).toBe('2026-11-01');
  });

  it('guarantees complete-and-pay atomic invariants via buildCompleteAndPayPayload', () => {
    const lesson: Lesson = {
      id: 'l-atomic-1',
      student_id: 's-atomic',
      start_at: '2026-11-16T17:00:00',
      duration_min: 60,
      status: 'planned',
      price_snapshot: 7000,
      subject: 'Matematyka',
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: '2026-11-16T10:00:00',
      updated_at: '2026-11-16T10:00:00'
    };

    const dateToday = '2026-11-16';

    // 1. Initial complete and pay from planned state
    const payload1 = buildCompleteAndPayPayload(lesson, [], [], [], dateToday, '2026/001', 'blik');

    expect(payload1.isAlreadyPaid).toBe(false);
    expect(payload1.updatedLesson.status).toBe('completed');
    expect(payload1.updatedLesson.version).toBe(2);

    expect(payload1.newCharge).not.toBeNull();
    expect(payload1.newCharge!.amount).toBe(7000);
    expect(payload1.newCharge!.accrual_date).toBe('2026-11-16');
    expect(payload1.newCharge!.lesson_id).toBe(lesson.id);

    expect(payload1.newPayment).not.toBeNull();
    expect(payload1.newPayment!.amount).toBe(7000);
    expect(payload1.newPayment!.method).toBe('blik');
    expect(payload1.newPayment!.student_id).toBe('s-atomic');

    expect(payload1.newAllocation).not.toBeNull();
    expect(payload1.newAllocation!.payment_id).toBe(payload1.newPayment!.id);
    expect(payload1.newAllocation!.charge_id).toBe(payload1.newCharge!.id);
    expect(payload1.newAllocation!.amount).toBe(7000);

    expect(payload1.newIncomeEntry).not.toBeNull();
    expect(payload1.newIncomeEntry!.status).toBe('paid');
    expect(payload1.newIncomeEntry!.amount_received).toBe(7000);
    expect(payload1.newIncomeEntry!.amount_due).toBe(7000);
    expect(payload1.newIncomeEntry!.lesson_id).toBe(lesson.id);
    expect(payload1.newIncomeEntry!.number).toBe('2026/001');

    // 2. Strict idempotency test: calling on already completed AND paid lesson
    const existingCharges = [payload1.newCharge!];
    const existingAllocations = [payload1.newAllocation!];
    const existingIncomes = [payload1.newIncomeEntry!];

    const payload2 = buildCompleteAndPayPayload(
      payload1.updatedLesson,
      existingCharges,
      existingAllocations,
      existingIncomes,
      dateToday,
      '2026/002',
      'blik'
    );

    // Strict idempotency: isAlreadyPaid === true, and produces NO new payment, NO new charge, NO new allocation!
    expect(payload2.isAlreadyPaid).toBe(true);
    expect(payload2.newCharge).toBeNull();
    expect(payload2.newPayment).toBeNull();
    expect(payload2.newAllocation).toBeNull();
    expect(payload2.newIncomeEntry).toBeNull();

    // 3. Two lessons for the SAME student on the SAME day
    const lesson2: Lesson = {
      id: 'l-atomic-2',
      student_id: 's-atomic',
      start_at: '2026-11-16T19:00:00',
      duration_min: 60,
      status: 'planned',
      price_snapshot: 8000,
      subject: 'Fizyka',
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: '2026-11-16T10:00:00',
      updated_at: '2026-11-16T10:00:00'
    };

    const payloadSameDay = buildCompleteAndPayPayload(
      lesson2,
      existingCharges,
      existingAllocations,
      existingIncomes,
      dateToday,
      '2026/002',
      'blik'
    );

    // Distinct charge, distinct allocation, distinct income entry with lesson_id
    expect(payloadSameDay.isAlreadyPaid).toBe(false);
    expect(payloadSameDay.newCharge).not.toBeNull();
    expect(payloadSameDay.newCharge!.amount).toBe(8000);
    expect(payloadSameDay.newCharge!.lesson_id).toBe(lesson2.id);

    expect(payloadSameDay.newIncomeEntry).not.toBeNull();
    expect(payloadSameDay.newIncomeEntry!.lesson_id).toBe(lesson2.id);
    expect(payloadSameDay.newIncomeEntry!.amount_due).toBe(8000);
    expect(payloadSameDay.newIncomeEntry!.number).toBe('2026/002');

    // 4. Test when existing income entry exists as unpaid and gets updated to paid
    const unpaidIncome = {
      id: generateUUID(),
      number: '2026/003',
      service_date: '2026-11-16',
      accrual_date: '2026-11-16',
      student_id: 's-atomic',
      lesson_id: 'l-atomic-3',
      service_type: 'Chemia',
      amount_due: 7500,
      amount_received: 0,
      method: 'blik' as const,
      status: 'unpaid' as const,
      version: 1,
      created_at: '2026-11-16T10:00:00',
      updated_at: '2026-11-16T10:00:00'
    };

    const lesson3: Lesson = {
      id: 'l-atomic-3',
      student_id: 's-atomic',
      start_at: '2026-11-16T20:00:00',
      duration_min: 60,
      status: 'completed',
      price_snapshot: 7500,
      subject: 'Chemia',
      location: 'student_home',
      notes: '',
      version: 2,
      created_at: '2026-11-16T10:00:00',
      updated_at: '2026-11-16T10:00:00'
    };

    const payloadUpdate = buildCompleteAndPayPayload(
      lesson3,
      [],
      [],
      [unpaidIncome],
      dateToday,
      '2026/004',
      'przelew'
    );

    expect(payloadUpdate.newIncomeEntry).toBeNull();
    expect(payloadUpdate.updatedIncomeEntry).not.toBeNull();
    expect(payloadUpdate.updatedIncomeEntry!.status).toBe('paid');
    expect(payloadUpdate.updatedIncomeEntry!.amount_received).toBe(7500);
    expect(payloadUpdate.updatedIncomeEntry!.method).toBe('przelew');
    expect(payloadUpdate.updatedIncomeEntry!.version).toBe(2);
  });

  it('correctly formats student birthday and supports day/month fields', () => {
    expect(formatStudentBirthday(15, 5)).toBe('15 maja');
    expect(formatStudentBirthday(1, 1)).toBe('1 stycznia');
    expect(formatStudentBirthday(31, 12)).toBe('31 grudnia');
    expect(formatStudentBirthday(undefined, 5)).toBe('');
    expect(formatStudentBirthday(15, undefined)).toBe('');

    const studentWithBirthday: Student = {
      id: 's-bday',
      first_name: 'Tomasz',
      last_name: 'Kot',
      phone: '123456789',
      grade_level: 'Klasa 8',
      subject: 'Matematyka',
      default_rate: 8000,
      default_duration_min: 60,
      preferred_slots: '',
      start_date: '2026-01-01',
      status: 'active',
      notes: '',
      birth_day: 15,
      birth_month: 5,
      version: 1,
      created_at: '',
      updated_at: ''
    };

    expect(studentWithBirthday.birth_day).toBe(15);
    expect(studentWithBirthday.birth_month).toBe(5);
  });

  it('ensures buildCompleteAndPayPayload reuses existing charge and avoids double charge', () => {
    const lesson: Lesson = {
      id: 'l-existing-charge',
      student_id: 's-1',
      start_at: '2026-11-16T16:00:00',
      duration_min: 60,
      status: 'planned',
      price_snapshot: 16000,
      subject: 'Matematyka',
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const existingCharge = {
      id: 'c-existing',
      student_id: 's-1',
      lesson_id: 'l-existing-charge',
      amount: 16000,
      accrual_date: '2026-11-16',
      charge_type: 'lesson' as const,
      description: 'Lekcja',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const payload = buildCompleteAndPayPayload(
      lesson,
      [existingCharge],
      [],
      [],
      '2026-11-16',
      '2026/005',
      'blik'
    );

    // MUST reuse existing charge and NOT create a new charge!
    expect(payload.newCharge).toBeNull();
    expect(payload.targetChargeId).toBe('c-existing');
    expect(payload.newPayment).not.toBeNull();
    expect(payload.newAllocation).not.toBeNull();
    expect(payload.newAllocation!.charge_id).toBe('c-existing');
  });
});

import { describe, it, expect } from 'vitest';
import { Lesson, Charge, Payment, PaymentAllocation, IncomeEntry } from '../domain/types';
import { buildCompleteAndPayPayload, buildLessonStatusChangePayload } from '../domain/lessonOps';
import { getChargesBalance } from '../domain/allocation';

describe('Lesson Status Transitions & Financial Invariants', () => {
  const sampleLesson: Lesson = {
    id: 'lesson-1',
    student_id: 'student-1',
    start_at: '2026-11-20T16:00:00',
    duration_min: 60,
    status: 'planned',
    price_snapshot: 7000,
    subject: 'Matematyka',
    location: 'student_home',
    notes: '',
    version: 1,
    created_at: '2026-11-19T10:00:00Z',
    updated_at: '2026-11-19T10:00:00Z'
  };

  it('buildCompleteAndPayPayload is strictly idempotent when lesson was cancelled/planned but charge was already paid', () => {
    const existingCharge: Charge = {
      id: 'charge-1',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-11-19T10:00:00Z',
      updated_at: '2026-11-19T10:00:00Z'
    };

    const existingAllocation: PaymentAllocation = {
      id: 'alloc-1',
      payment_id: 'pmt-1',
      charge_id: 'charge-1',
      amount: 7000,
      version: 1,
      created_at: '2026-11-19T10:00:00Z',
      updated_at: '2026-11-19T10:00:00Z'
    };

    // Lesson is currently 'cancelled_student'
    const cancelledLesson: Lesson = { ...sampleLesson, status: 'cancelled_student', version: 2 };

    const payload = buildCompleteAndPayPayload(
      cancelledLesson,
      [existingCharge],
      [existingAllocation],
      [],
      '2026-11-20',
      '2026/001',
      'blik',
      '2026-11-20T12:00:00Z'
    );

    expect(payload.isAlreadyPaid).toBe(true);
    expect(payload.newPayment).toBeNull();
    expect(payload.newAllocation).toBeNull();
    expect(payload.newCharge).toBeNull();
    expect(payload.updatedLesson.status).toBe('completed');
    expect(payload.updatedLesson.version).toBe(3);
  });

  it('restoring a cancelled lesson to planned stornos any unpaid cancellation fee', () => {
    const cancelCharge: Charge = {
      id: 'charge-cancel-1',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'paid_cancellation',
      description: 'Późne odwołanie',
      version: 1,
      created_at: '2026-11-19T10:00:00Z',
      updated_at: '2026-11-19T10:00:00Z'
    };

    const incomeEntry: IncomeEntry = {
      id: 'income-1',
      charge_id: 'charge-cancel-1',
      number: '2026/005',
      service_date: '2026-11-20',
      accrual_date: '2026-11-20',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      service_type: 'Opłata za późne odwołanie',
      amount_due: 7000,
      amount_received: 0,
      method: 'blik',
      status: 'unpaid',
      version: 1,
      created_at: '2026-11-19T10:00:00Z',
      updated_at: '2026-11-19T10:00:00Z'
    };

    const cancelledLesson: Lesson = { ...sampleLesson, status: 'cancelled_student', version: 2 };

    const result = buildLessonStatusChangePayload(
      cancelledLesson,
      'planned',
      [cancelCharge],
      [], // no allocations (unpaid)
      [incomeEntry],
      { nowIso: '2026-11-20T12:00:00Z' }
    );

    expect(result.updatedLesson.status).toBe('planned');
    expect(result.stornoCharges).toHaveLength(1);
    expect(result.stornoCharges[0].amount).toBe(-7000);
    expect(result.stornoCharges[0].reverses_charge_id).toBe('charge-cancel-1');
    expect(result.stornoCharges[0].charge_type).toBe('paid_cancellation');

    expect(result.updatedIncomeEntries).toHaveLength(1);
    expect(result.updatedIncomeEntries[0].amount_due).toBe(0);
    expect(result.updatedIncomeEntries[0].status).toBe('paid');
  });

  it('reverting a completed lesson to planned stornos unpaid lesson charge', () => {
    const lessonCharge: Charge = {
      id: 'charge-lesson-1',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'lesson',
      description: 'Lekcja: Matematyka',
      version: 1,
      created_at: '2026-11-20T16:00:00Z',
      updated_at: '2026-11-20T16:00:00Z'
    };

    const incomeEntry: IncomeEntry = {
      id: 'income-lesson-1',
      charge_id: 'charge-lesson-1',
      number: '2026/006',
      service_date: '2026-11-20',
      accrual_date: '2026-11-20',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      service_type: 'Lekcja matematyki',
      amount_due: 7000,
      amount_received: 0,
      method: 'blik',
      status: 'unpaid',
      version: 1,
      created_at: '2026-11-20T16:00:00Z',
      updated_at: '2026-11-20T16:00:00Z'
    };

    const completedLesson: Lesson = { ...sampleLesson, status: 'completed', version: 2 };

    const result = buildLessonStatusChangePayload(
      completedLesson,
      'planned',
      [lessonCharge],
      [],
      [incomeEntry],
      { nowIso: '2026-11-20T17:00:00Z' }
    );

    expect(result.updatedLesson.status).toBe('planned');
    expect(result.stornoCharges).toHaveLength(1);
    expect(result.stornoCharges[0].amount).toBe(-7000);
    expect(result.stornoCharges[0].reverses_charge_id).toBe('charge-lesson-1');
    expect(result.stornoCharges[0].charge_type).toBe('lesson');

    expect(result.updatedIncomeEntries[0].amount_due).toBe(0);
  });

  it('repeated cancellation does not create duplicate cancellation charges', () => {
    const existingCancelCharge: Charge = {
      id: 'charge-cancel-1',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'paid_cancellation',
      description: 'Późne odwołanie',
      version: 1,
      created_at: '2026-11-19T10:00:00Z',
      updated_at: '2026-11-19T10:00:00Z'
    };

    const lesson: Lesson = { ...sampleLesson, status: 'cancelled_student', version: 2 };

    const result = buildLessonStatusChangePayload(
      lesson,
      'cancelled_student',
      [existingCancelCharge],
      [],
      [],
      { nowIso: '2026-11-20T12:00:00Z' }
    );

    // Should NOT create another cancellation charge
    expect(result.newCancellationCharge).toBeNull();
    expect(result.newCancellationIncomeEntry).toBeNull();
  });

  it('getChargesBalance handles stornos and filters orphan allocations correctly', () => {
    const originalCharge: Charge = {
      id: 'ch-orig',
      student_id: 'student-1',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'paid_cancellation',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const stornoCharge: Charge = {
      id: 'ch-storno',
      student_id: 'student-1',
      amount: -7000,
      reverses_charge_id: 'ch-orig',
      accrual_date: '2026-11-20',
      charge_type: 'paid_cancellation',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const realCharge: Charge = {
      id: 'ch-real',
      student_id: 'student-1',
      amount: 5000,
      accrual_date: '2026-11-20',
      charge_type: 'lesson',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const validPayment: Payment = {
      id: 'pmt-valid',
      student_id: 'student-1',
      amount: 5000,
      received_date: '2026-11-20',
      method: 'blik',
      description: '',
      payment_type: 'wplata',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const validAlloc: PaymentAllocation = {
      id: 'alloc-valid',
      payment_id: 'pmt-valid',
      charge_id: 'ch-real',
      amount: 5000,
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const orphanAlloc: PaymentAllocation = {
      id: 'alloc-ghost',
      payment_id: 'pmt-nonexistent',
      charge_id: 'ch-real',
      amount: 5000,
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const balanceMap = getChargesBalance(
      [originalCharge, stornoCharge, realCharge],
      [validAlloc, orphanAlloc],
      [validPayment]
    );

    // Storned charge balance is 0
    expect(balanceMap.get('ch-orig')?.remainingAmount).toBe(0);
    expect(balanceMap.get('ch-orig')?.status).toBe('paid');

    // Storno charge balance is 0
    expect(balanceMap.get('ch-storno')?.remainingAmount).toBe(0);
    expect(balanceMap.get('ch-storno')?.status).toBe('paid');

    // Real charge allocated 5000 from valid payment; orphan alloc was ignored!
    expect(balanceMap.get('ch-real')?.allocatedAmount).toBe(5000);
    expect(balanceMap.get('ch-real')?.remainingAmount).toBe(0);
    expect(balanceMap.get('ch-real')?.status).toBe('paid');
  });
});

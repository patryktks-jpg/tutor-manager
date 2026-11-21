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

  it('cancelling a lesson (cancelled_student or cancelled_tutor) NEVER creates a fee even < 24h or after start time, and stornos unpaid charges preserving accrual_date', () => {
    const unpaidCancelFee: Charge = {
      id: 'ch-old-cancel',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'paid_cancellation',
      description: 'Stara opłata',
      version: 1,
      created_at: '2026-11-20T21:00:00Z',
      updated_at: '2026-11-20T21:00:00Z'
    };

    const unpaidIncome: IncomeEntry = {
      id: 'inc-old-cancel',
      charge_id: 'ch-old-cancel',
      number: '2026/018',
      service_date: '2026-11-20',
      accrual_date: '2026-11-20',
      student_id: 'student-1',
      lesson_id: 'lesson-1',
      service_type: 'Opłata za późne odwołanie lekcji',
      amount_due: 7000,
      amount_received: 0,
      method: 'blik',
      status: 'unpaid',
      version: 1,
      created_at: '2026-11-20T21:00:00Z',
      updated_at: '2026-11-20T21:00:00Z'
    };

    // Planned lesson from 2026-11-20T16:00:00 cancelled the next day (after start time!)
    const byStudent = buildLessonStatusChangePayload(
      sampleLesson,
      'cancelled_student',
      [],
      [],
      [],
      { nowIso: '2026-11-21T10:00:00Z', nextIncomeNumber: '2026/020' }
    );
    expect(byStudent.updatedLesson.status).toBe('cancelled_student');
    expect(byStudent.newCancellationCharge).toBeNull();
    expect(byStudent.newCancellationIncomeEntry).toBeNull();

    const byTutor = buildLessonStatusChangePayload(
      sampleLesson,
      'cancelled_tutor',
      [unpaidCancelFee],
      [],
      [unpaidIncome],
      { nowIso: '2026-11-21T10:00:00Z', nextIncomeNumber: '2026/020' }
    );
    expect(byTutor.updatedLesson.status).toBe('cancelled_tutor');
    expect(byTutor.newCancellationCharge).toBeNull();
    expect(byTutor.newCancellationIncomeEntry).toBeNull();
    expect(byTutor.stornoCharges).toHaveLength(1);
    expect(byTutor.stornoCharges[0].amount).toBe(-7000);
    // accrual_date must match original charge date so quarterly sums net to 0
    expect(byTutor.stornoCharges[0].accrual_date).toBe('2026-11-20');
    expect(byTutor.stornoCharges[0].reverses_charge_id).toBe('ch-old-cancel');
    expect(byTutor.updatedIncomeEntries[0].amount_due).toBe(0);
    expect(byTutor.updatedIncomeEntries[0].status).toBe('paid');
  });

  it('explicit no_show creates a paid_cancellation charge', () => {
    const result = buildLessonStatusChangePayload(
      sampleLesson,
      'no_show',
      [],
      [],
      [],
      { note: 'Nieobecność ucznia', nowIso: '2026-11-20T16:30:00Z', nextIncomeNumber: '2026/021' }
    );

    expect(result.updatedLesson.status).toBe('no_show');
    expect(result.newCancellationCharge).not.toBeNull();
    expect(result.newCancellationCharge!.charge_type).toBe('paid_cancellation');
    expect(result.newCancellationCharge!.amount).toBe(7000);
    expect(result.newCancellationIncomeEntry).not.toBeNull();
    expect(result.newCancellationIncomeEntry!.amount_due).toBe(7000);
  });

  it('getChargesBalance with lessons ignores unpaid debt for cancelled or planned lessons', () => {
    const cancelledLesson: Lesson = { ...sampleLesson, id: 'l-canc', status: 'cancelled_student' };
    const noShowLesson: Lesson = { ...sampleLesson, id: 'l-noshow', status: 'no_show' };

    const orphanCancelCharge: Charge = {
      id: 'ch-canc-unpaid',
      student_id: 'student-1',
      lesson_id: 'l-canc',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'paid_cancellation',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const noShowCharge: Charge = {
      id: 'ch-noshow-unpaid',
      student_id: 'student-1',
      lesson_id: 'l-noshow',
      amount: 7000,
      accrual_date: '2026-11-20',
      charge_type: 'paid_cancellation',
      version: 1,
      created_at: '',
      updated_at: ''
    };

    const balanceMap = getChargesBalance(
      [orphanCancelCharge, noShowCharge],
      [],
      [],
      [cancelledLesson, noShowLesson]
    );

    expect(balanceMap.get('ch-canc-unpaid')?.remainingAmount).toBe(0);
    expect(balanceMap.get('ch-canc-unpaid')?.status).toBe('paid');
    expect(balanceMap.get('ch-noshow-unpaid')?.remainingAmount).toBe(7000);
    expect(balanceMap.get('ch-noshow-unpaid')?.status).toBe('unpaid');
  });

  it('completed -> cancelled_student -> completed cycle stornos old charge and allows fresh charge creation', () => {
    const initialPayPayload = buildCompleteAndPayPayload(
      sampleLesson,
      [],
      [],
      [],
      '2026-11-20',
      '2026/001',
      'blik',
      '2026-11-20T17:00:00Z'
    );

    // Simulate unpaid completion charge instead of paid
    const unpaidLessonCharge: Charge = {
      ...initialPayPayload.newCharge!,
      id: 'ch-unpaid-1'
    };
    const unpaidIncome: IncomeEntry = {
      ...initialPayPayload.newIncomeEntry!,
      id: 'inc-1',
      charge_id: 'ch-unpaid-1',
      amount_received: 0,
      status: 'unpaid',
      received_date: undefined
    };

    // Cancel completed lesson -> stornos unpaid charge and zeroes income entry
    const cancelPayload = buildLessonStatusChangePayload(
      { ...sampleLesson, status: 'completed', version: 2 },
      'cancelled_student',
      [unpaidLessonCharge],
      [],
      [unpaidIncome],
      { nowIso: '2026-11-20T18:00:00Z' }
    );
    expect(cancelPayload.stornoCharges).toHaveLength(1);
    expect(cancelPayload.stornoCharges[0].reverses_charge_id).toBe('ch-unpaid-1');
    expect(cancelPayload.updatedIncomeEntries[0].amount_due).toBe(0);

    // Re-complete & pay after cancellation -> must create NEW active charge (ignoring storned one) and restore amount_due
    const allChargesAfterCancel = [unpaidLessonCharge, ...cancelPayload.stornoCharges];
    const recompletePayload = buildCompleteAndPayPayload(
      cancelPayload.updatedLesson,
      allChargesAfterCancel,
      [],
      cancelPayload.updatedIncomeEntries,
      '2026-11-20',
      '2026/002',
      'gotowka',
      '2026-11-20T19:00:00Z'
    );

    expect(recompletePayload.isAlreadyPaid).toBe(false);
    expect(recompletePayload.newCharge).not.toBeNull();
    expect(recompletePayload.newCharge!.id).not.toBe('ch-unpaid-1');
    expect(recompletePayload.targetChargeId).toBe(recompletePayload.newCharge!.id);
    expect(recompletePayload.newPayment).not.toBeNull();
    expect(recompletePayload.newAllocation!.charge_id).toBe(recompletePayload.newCharge!.id);
    expect(recompletePayload.updatedIncomeEntry!.amount_due).toBe(7000);
    expect(recompletePayload.updatedIncomeEntry!.amount_received).toBe(7000);
    expect(recompletePayload.updatedIncomeEntry!.status).toBe('paid');
  });
});

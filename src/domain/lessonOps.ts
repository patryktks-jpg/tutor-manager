import { Lesson, Charge, Payment, PaymentAllocation, IncomeEntry, PaymentMethod, UUID } from './types';
import { generateUUID } from './crypto';

export interface CompleteAndPayPayload {
  updatedLesson: Lesson;
  newCharge: Charge | null;
  targetChargeId: UUID;
  newPayment: Payment;
  newAllocation: PaymentAllocation;
  newIncomeEntry: IncomeEntry | null;
  updatedIncomeEntry: IncomeEntry | null;
}

/**
 * Pure domain function to build complete and pay entities.
 * Guarantees:
 * 1. Exactly 1 charge per lesson (uses existing if already created, otherwise creates 1 new).
 * 2. Exactly 1 payment with specified method.
 * 3. Exactly 1 allocation linking payment directly to targetChargeId.
 * 4. Distinct income entry per lesson using lesson_id (supports multiple lessons per day for same student).
 * 5. Deterministic, testable and free of UI/closure race conditions.
 */
export function buildCompleteAndPayPayload(
  lesson: Lesson,
  existingCharges: Charge[],
  existingIncomeEntries: IncomeEntry[],
  todayStr: string,
  nextIncomeNumber: string,
  method: PaymentMethod = 'blik',
  nowIso: string = new Date().toISOString()
): CompleteAndPayPayload {
  const lessonDate = lesson.start_at.slice(0, 10);

  // 1. Updated Lesson
  const updatedLesson: Lesson = {
    ...lesson,
    status: 'completed',
    version: lesson.status === 'completed' ? lesson.version : lesson.version + 1,
    updated_at: nowIso
  };

  // 2. Charge: use existing or create new
  const existingCharge = existingCharges.find(c => c.lesson_id === lesson.id && c.amount > 0);
  let newCharge: Charge | null = null;
  let targetChargeId: UUID;

  if (existingCharge) {
    targetChargeId = existingCharge.id;
  } else {
    newCharge = {
      id: generateUUID(),
      student_id: lesson.student_id,
      lesson_id: lesson.id,
      amount: lesson.price_snapshot,
      accrual_date: lessonDate,
      charge_type: 'lesson',
      description: `Lekcja: ${lesson.subject}`,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };
    targetChargeId = newCharge.id;
  }

  // 3. Payment
  const newPayment: Payment = {
    id: generateUUID(),
    student_id: lesson.student_id,
    amount: lesson.price_snapshot,
    received_date: todayStr,
    method,
    description: `Płatność ${method.toUpperCase()} za lekcję z ${lessonDate}`,
    payment_type: 'wplata',
    version: 1,
    created_at: nowIso,
    updated_at: nowIso
  };

  // 4. Payment Allocation strictly linked to target charge
  const newAllocation: PaymentAllocation = {
    id: generateUUID(),
    payment_id: newPayment.id,
    charge_id: targetChargeId,
    amount: lesson.price_snapshot,
    version: 1,
    created_at: nowIso,
    updated_at: nowIso
  };

  // 5. Income Entry: find by lesson_id first to support multiple lessons per day
  const existingIncome = existingIncomeEntries.find(
    e => (e.lesson_id && e.lesson_id === lesson.id) ||
         (!e.lesson_id && e.service_date === lessonDate && e.student_id === lesson.student_id)
  );

  let newIncomeEntry: IncomeEntry | null = null;
  let updatedIncomeEntry: IncomeEntry | null = null;

  if (!existingIncome) {
    newIncomeEntry = {
      id: generateUUID(),
      number: nextIncomeNumber,
      service_date: lessonDate,
      accrual_date: lessonDate,
      student_id: lesson.student_id,
      lesson_id: lesson.id,
      service_type: lesson.subject || 'Lekcja matematyki',
      amount_due: lesson.price_snapshot,
      amount_received: lesson.price_snapshot,
      received_date: todayStr,
      method,
      status: 'paid',
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };
  } else {
    updatedIncomeEntry = {
      ...existingIncome,
      lesson_id: lesson.id,
      received_date: todayStr,
      amount_received: lesson.price_snapshot,
      method,
      status: 'paid',
      version: existingIncome.version + 1,
      updated_at: nowIso
    };
  }

  return {
    updatedLesson,
    newCharge,
    targetChargeId,
    newPayment,
    newAllocation,
    newIncomeEntry,
    updatedIncomeEntry
  };
}

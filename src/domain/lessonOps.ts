import { Lesson, Charge, Payment, PaymentAllocation, IncomeEntry, PaymentMethod, UUID } from './types';
import { generateUUID } from './crypto';

export interface CompleteAndPayPayload {
  isAlreadyPaid: boolean;
  updatedLesson: Lesson;
  newCharge: Charge | null;
  targetChargeId: UUID;
  newPayment: Payment | null;
  newAllocation: PaymentAllocation | null;
  newIncomeEntry: IncomeEntry | null;
  updatedIncomeEntry: IncomeEntry | null;
}

/**
 * Pure domain function to build complete and pay entities.
 * Guarantees:
 * 1. Strict idempotency: if lesson is already completed and fully paid, returns isAlreadyPaid: true
 *    and produces NO new payment, NO new charge, NO new allocation ("nic do zrobienia").
 * 2. Exactly 1 charge per lesson (uses existing if already created, otherwise creates 1 new).
 * 3. Exactly 1 payment with specified method.
 * 4. Exactly 1 allocation linking payment directly to targetChargeId.
 * 5. Distinct income entry per lesson using lesson_id (supports multiple lessons per day for same student).
 * 6. Deterministic, testable and free of UI/closure race conditions.
 */
export function buildCompleteAndPayPayload(
  lesson: Lesson,
  existingCharges: Charge[],
  existingAllocations: PaymentAllocation[],
  existingIncomeEntries: IncomeEntry[],
  todayStr: string,
  nextIncomeNumber: string,
  method: PaymentMethod = 'blik',
  nowIso: string = new Date().toISOString()
): CompleteAndPayPayload {
  const lessonDate = lesson.start_at.slice(0, 10);
  const existingCharge = existingCharges.find(c => c.lesson_id === lesson.id && c.amount > 0);

  // 1. Check if already fully paid (idempotency guarantee)
  if (existingCharge) {
    const totalAllocated = existingAllocations
      .filter(a => a.charge_id === existingCharge.id)
      .reduce((sum, a) => sum + a.amount, 0);

    if (totalAllocated >= existingCharge.amount && lesson.status === 'completed') {
      // Należność jest już w pełni opłacona – nic do zrobienia!
      return {
        isAlreadyPaid: true,
        updatedLesson: lesson,
        newCharge: null,
        targetChargeId: existingCharge.id,
        newPayment: null,
        newAllocation: null,
        newIncomeEntry: null,
        updatedIncomeEntry: null
      };
    }
  }

  // 2. Updated Lesson
  const updatedLesson: Lesson = {
    ...lesson,
    status: 'completed',
    version: lesson.status === 'completed' ? lesson.version : lesson.version + 1,
    updated_at: nowIso
  };

  // 3. Charge: use existing or create new
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

  // 4. Payment
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

  // 5. Payment Allocation strictly linked to target charge
  const newAllocation: PaymentAllocation = {
    id: generateUUID(),
    payment_id: newPayment.id,
    charge_id: targetChargeId,
    amount: lesson.price_snapshot,
    version: 1,
    created_at: nowIso,
    updated_at: nowIso
  };

  // 6. Income Entry: find by lesson_id first to support multiple lessons per day
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
    isAlreadyPaid: false,
    updatedLesson,
    newCharge,
    targetChargeId,
    newPayment,
    newAllocation,
    newIncomeEntry,
    updatedIncomeEntry
  };
}

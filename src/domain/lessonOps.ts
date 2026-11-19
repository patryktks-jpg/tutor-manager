import { Lesson, Charge, Payment, PaymentAllocation, IncomeEntry, PaymentMethod, UUID, LessonStatus } from './types';
import { generateUUID } from './crypto';
import { deriveIncomeEntry } from './income';
import { assessCancellation, DEFAULT_CANCEL_POLICY } from './cancelPolicy';

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

    if (totalAllocated >= existingCharge.amount) {
      // Należność jest już w pełni opłacona – nie twórz nowej płatności ani alokacji!
      const updatedLesson: Lesson = {
        ...lesson,
        status: 'completed',
        version: lesson.status === 'completed' ? lesson.version : lesson.version + 1,
        updated_at: nowIso
      };
      return {
        isAlreadyPaid: true,
        updatedLesson,
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
      charge_id: targetChargeId,
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
      charge_id: targetChargeId,
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

export interface LessonStatusChangePayload {
  updatedLesson: Lesson;
  stornoCharges: Charge[];
  updatedIncomeEntries: IncomeEntry[];
  newCancellationCharge: Charge | null;
  newCancellationIncomeEntry: IncomeEntry | null;
}

/**
 * Pure domain function to handle lesson status transitions:
 * 1. Restoring a lesson to 'planned' (un-cancelling or un-completing):
 *    - Stornos any unpaid cancellation fee charges and zeroes out their income entry.
 *    - If reverting from 'completed', stornos any unpaid lesson charge and zeroes out its income entry.
 * 2. Changing to cancelled / no_show:
 *    - If previously 'completed', stornos any unpaid lesson charge.
 *    - If cancelled_student or no_show, assesses cancellation fee only if no active charge exists yet.
 * 3. Immutable financial history: never mutates or deletes existing financial records; uses storno entries with negative amounts.
 */
export function buildLessonStatusChangePayload(
  lesson: Lesson,
  targetStatus: LessonStatus,
  existingCharges: Charge[],
  existingAllocations: PaymentAllocation[],
  existingIncomeEntries: IncomeEntry[],
  options?: {
    note?: string;
    nowIso?: string;
    nextIncomeNumber?: string;
  }
): LessonStatusChangePayload {
  const nowIso = options?.nowIso || new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);
  const note = options?.note;

  const updatedLesson: Lesson = {
    ...lesson,
    status: targetStatus,
    notes: note ? `${lesson.notes ? lesson.notes + '\n' : ''}${note}` : lesson.notes,
    version: lesson.version + 1,
    updated_at: nowIso
  };

  const stornoCharges: Charge[] = [];
  const updatedIncomeEntries: IncomeEntry[] = [];
  let newCancellationCharge: Charge | null = null;
  let newCancellationIncomeEntry: IncomeEntry | null = null;

  // 1. If transitioning to 'planned':
  if (targetStatus === 'planned') {
    // A. Revert/storno any unpaid cancellation fees for this lesson
    const cancelCharges = existingCharges.filter(
      c => c.lesson_id === lesson.id &&
           c.charge_type === 'paid_cancellation' &&
           c.amount > 0 &&
           !existingCharges.some(sc => sc.reverses_charge_id === c.id)
    );
    for (const cc of cancelCharges) {
      const allocated = existingAllocations
        .filter(a => a.charge_id === cc.id)
        .reduce((sum, a) => sum + a.amount, 0);
      if (allocated === 0) {
        // Create storno charge
        const storno: Charge = {
          id: generateUUID(),
          student_id: cc.student_id,
          lesson_id: lesson.id,
          amount: -cc.amount,
          accrual_date: todayStr,
          charge_type: 'paid_cancellation',
          reverses_charge_id: cc.id,
          description: `Storno: ${cc.description || 'Opłata za odwołanie'}`,
          version: 1,
          created_at: nowIso,
          updated_at: nowIso
        };
        stornoCharges.push(storno);

        // Cancel income entry
        const inc = existingIncomeEntries.find(e => e.charge_id === cc.id);
        if (inc) {
          updatedIncomeEntries.push({
            ...inc,
            amount_due: 0,
            status: 'paid',
            version: inc.version + 1,
            updated_at: nowIso
          });
        }
      }
    }

    // B. If reverting from 'completed', storno any unpaid regular lesson charge
    if (lesson.status === 'completed') {
      const lessonCharges = existingCharges.filter(
        c => c.lesson_id === lesson.id &&
             c.charge_type === 'lesson' &&
             c.amount > 0 &&
             !existingCharges.some(sc => sc.reverses_charge_id === c.id)
      );
      for (const lc of lessonCharges) {
        const allocated = existingAllocations
          .filter(a => a.charge_id === lc.id)
          .reduce((sum, a) => sum + a.amount, 0);
        if (allocated === 0) {
          const storno: Charge = {
            id: generateUUID(),
            student_id: lc.student_id,
            lesson_id: lesson.id,
            amount: -lc.amount,
            accrual_date: todayStr,
            charge_type: 'lesson',
            reverses_charge_id: lc.id,
            description: `Storno lekcji: ${lc.description || ''}`,
            version: 1,
            created_at: nowIso,
            updated_at: nowIso
          };
          stornoCharges.push(storno);

          const inc = existingIncomeEntries.find(e => e.charge_id === lc.id || e.lesson_id === lesson.id);
          if (inc) {
            updatedIncomeEntries.push({
              ...inc,
              amount_due: 0,
              status: 'paid',
              version: inc.version + 1,
              updated_at: nowIso
            });
          }
        }
      }
    }
  }

  // 2. If transitioning to cancelled / no_show:
  if (targetStatus === 'cancelled_student' || targetStatus === 'cancelled_tutor' || targetStatus === 'no_show') {
    // If previously completed, storno unpaid lesson charge
    if (lesson.status === 'completed') {
      const lessonCharges = existingCharges.filter(
        c => c.lesson_id === lesson.id &&
             c.charge_type === 'lesson' &&
             c.amount > 0 &&
             !existingCharges.some(sc => sc.reverses_charge_id === c.id)
      );
      for (const lc of lessonCharges) {
        const allocated = existingAllocations
          .filter(a => a.charge_id === lc.id)
          .reduce((sum, a) => sum + a.amount, 0);
        if (allocated === 0) {
          const storno: Charge = {
            id: generateUUID(),
            student_id: lc.student_id,
            lesson_id: lesson.id,
            amount: -lc.amount,
            accrual_date: todayStr,
            charge_type: 'lesson',
            reverses_charge_id: lc.id,
            description: `Storno odwołanej lekcji: ${lc.description || ''}`,
            version: 1,
            created_at: nowIso,
            updated_at: nowIso
          };
          stornoCharges.push(storno);

          const inc = existingIncomeEntries.find(e => e.charge_id === lc.id || e.lesson_id === lesson.id);
          if (inc) {
            updatedIncomeEntries.push({
              ...inc,
              amount_due: 0,
              status: 'paid',
              version: inc.version + 1,
              updated_at: nowIso
            });
          }
        }
      }
    }

    // Cancellation fee assessment
    if (targetStatus === 'cancelled_student' || targetStatus === 'no_show') {
      const hasActiveCancelCharge = existingCharges.some(
        c => c.lesson_id === lesson.id &&
             c.charge_type === 'paid_cancellation' &&
             c.amount > 0 &&
             !existingCharges.some(sc => sc.reverses_charge_id === c.id)
      );
      if (!hasActiveCancelCharge) {
        const assessment = assessCancellation(lesson, nowIso, DEFAULT_CANCEL_POLICY, targetStatus === 'no_show');
        if (!assessment.isFree && assessment.feeGrosze > 0) {
          newCancellationCharge = {
            id: generateUUID(),
            student_id: lesson.student_id,
            lesson_id: lesson.id,
            amount: assessment.feeGrosze,
            accrual_date: lesson.start_at.slice(0, 10),
            charge_type: 'paid_cancellation',
            description: assessment.reason,
            version: 1,
            created_at: nowIso,
            updated_at: nowIso
          };

          const formattedNum = options?.nextIncomeNumber || '2026/999';
          newCancellationIncomeEntry = deriveIncomeEntry({
            charge: newCancellationCharge,
            allocations: [],
            payments: [],
            existingEntry: null,
            number: formattedNum,
            nowIso
          });
        }
      }
    }
  }

  return {
    updatedLesson,
    stornoCharges,
    updatedIncomeEntries,
    newCancellationCharge,
    newCancellationIncomeEntry
  };
}

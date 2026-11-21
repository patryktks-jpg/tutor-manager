import { Charge, Lesson, Payment, PaymentAllocation, UUID } from './types';
import { Money } from './money';

export interface ChargeBalance {
  charge: Charge;
  allocatedAmount: number;
  remainingAmount: number;
  status: 'unpaid' | 'partial' | 'paid';
}

export interface ProposedAllocation {
  chargeId: UUID;
  amount: number;
}

export interface StudentFinancialSummary {
  studentId: UUID;
  totalCharges: number;
  totalPayments: number;
  debt: number;              // positive if owes money
  creditBalance: number;     // positive if has overpayment
  unpaidChargesCount: number;
}

/**
 * Calculates current balance and payment status for all charges of a student.
 */
export function getChargesBalance(
  charges: Charge[],
  allocations: PaymentAllocation[],
  payments?: Payment[],
  lessons?: Lesson[]
): Map<UUID, ChargeBalance> {
  const map = new Map<UUID, ChargeBalance>();
  const stornedChargeIds = new Set<UUID>();

  for (const c of charges) {
    const isStorno = c.amount <= 0 || !!c.reverses_charge_id;
    map.set(c.id, {
      charge: c,
      allocatedAmount: 0,
      remainingAmount: isStorno ? 0 : c.amount,
      status: isStorno ? 'paid' : 'unpaid'
    });
  }

  // Handle storno reversals: both the storno and the reversed charge have remainingAmount = 0
  for (const c of charges) {
    if (c.reverses_charge_id) {
      stornedChargeIds.add(c.reverses_charge_id);
      const reversed = map.get(c.reverses_charge_id);
      if (reversed) {
        reversed.remainingAmount = 0;
        reversed.status = 'paid';
      }
    }
  }

  const validPaymentIds = payments ? new Set(payments.map(p => p.id)) : null;

  for (const alloc of allocations) {
    if (validPaymentIds && !validPaymentIds.has(alloc.payment_id)) {
      // Ignore orphaned allocations whose payment does not exist
      continue;
    }
    const item = map.get(alloc.charge_id);
    if (item && item.charge.amount > 0 && !item.charge.reverses_charge_id && !stornedChargeIds.has(item.charge.id)) {
      item.allocatedAmount += alloc.amount;
      item.remainingAmount = Math.max(0, item.charge.amount - item.allocatedAmount);
      if (item.remainingAmount <= 0) {
        item.status = 'paid';
      } else {
        item.status = 'partial';
      }
    }
  }

  // Ensure cancelled or planned lessons with 0 allocated payments never produce unpaid debt
  if (lessons && lessons.length > 0) {
    const inactiveLessonIds = new Set(
      lessons
        .filter(l => l.status === 'cancelled_student' || l.status === 'cancelled_tutor' || l.status === 'planned')
        .map(l => l.id)
    );
    for (const item of map.values()) {
      if (item.charge.lesson_id && inactiveLessonIds.has(item.charge.lesson_id) && item.allocatedAmount === 0) {
        item.remainingAmount = 0;
        item.status = 'paid';
      }
    }
  }

  return map;
}

/**
 * Proposes FIFO allocation for a payment amount across unpaid charges.
 */
export function proposeFifoAllocation(
  paymentAmount: number,
  studentCharges: Charge[],
  existingAllocations: PaymentAllocation[]
): {
  allocations: ProposedAllocation[];
  allocatedTotal: number;
  creditOverpayment: number;
} {
  Money.assertInteger(paymentAmount);

  const balanceMap = getChargesBalance(studentCharges, existingAllocations);

  // Filter charges with positive remainder, sorted by accrual_date ascending (FIFO - oldest first)
  const openCharges = Array.from(balanceMap.values())
    .filter(b => b.remainingAmount > 0 && b.charge.amount > 0)
    .sort((a, b) => a.charge.accrual_date.localeCompare(b.charge.accrual_date) || a.charge.created_at.localeCompare(b.charge.created_at));

  const result: ProposedAllocation[] = [];
  let remainingPayment = paymentAmount;

  for (const item of openCharges) {
    if (remainingPayment <= 0) break;

    const toAllocate = Math.min(remainingPayment, item.remainingAmount);
    result.push({
      chargeId: item.charge.id,
      amount: toAllocate
    });

    remainingPayment -= toAllocate;
  }

  return {
    allocations: result,
    allocatedTotal: paymentAmount - remainingPayment,
    creditOverpayment: remainingPayment
  };
}

/**
 * Computes overall student financial summary: debt or credit balance.
 */
export function getStudentFinancialSummary(
  studentId: UUID,
  charges: Charge[],
  payments: Payment[]
): StudentFinancialSummary {
  const studentCharges = charges.filter(c => c.student_id === studentId);
  const studentPayments = payments.filter(p => p.student_id === studentId);

  const totalCharges = studentCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalPayments = studentPayments.reduce((sum, p) => {
    return p.payment_type === 'wplata' ? sum + p.amount : sum - p.amount;
  }, 0);

  const diff = totalCharges - totalPayments;
  const debt = diff > 0 ? diff : 0;
  const creditBalance = diff < 0 ? Math.abs(diff) : 0;

  return {
    studentId,
    totalCharges,
    totalPayments,
    debt,
    creditBalance,
    unpaidChargesCount: 0 // can be enriched by caller
  };
}

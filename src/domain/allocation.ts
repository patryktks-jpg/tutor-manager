import { Charge, Payment, PaymentAllocation, UUID } from './types';
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
  allocations: PaymentAllocation[]
): Map<UUID, ChargeBalance> {
  const map = new Map<UUID, ChargeBalance>();

  for (const c of charges) {
    map.set(c.id, {
      charge: c,
      allocatedAmount: 0,
      remainingAmount: c.amount,
      status: 'unpaid'
    });
  }

  for (const alloc of allocations) {
    const item = map.get(alloc.charge_id);
    if (item) {
      item.allocatedAmount += alloc.amount;
      item.remainingAmount = item.charge.amount - item.allocatedAmount;
      if (item.remainingAmount <= 0) {
        item.status = 'paid';
      } else {
        item.status = 'partial';
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

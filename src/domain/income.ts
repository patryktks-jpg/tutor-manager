import { Charge, Payment, PaymentAllocation, IncomeEntry, PaymentMethod } from './types';
import { generateUUID } from './crypto';

export interface DeriveIncomeParams {
  charge: Charge;
  allocations: PaymentAllocation[];
  payments: Payment[];
  existingEntry?: IncomeEntry | null;
  number?: string;
  nowIso?: string;
}

/**
 * Derives and updates an IncomeEntry based strictly on a Charge and its PaymentAllocations (A4).
 * 
 * Invariants:
 * 1. 1 charge = 1 income entry (charge_id link).
 * 2. amount_received, received_date, and status are derived dynamically from allocations.
 * 3. Status is 'paid' (when received >= due), 'partial' (when received > 0 but < due), or 'unpaid'.
 * 4. received_date is the date of the latest payment contributing to the allocation.
 * 5. Method reflects the latest payment method used.
 * 6. Supports late cancellation fees ('paid_cancellation') as valid income entries.
 */
export function deriveIncomeEntry(params: DeriveIncomeParams): IncomeEntry {
  const { charge, allocations, payments, existingEntry, number, nowIso = new Date().toISOString() } = params;

  // Find all allocations specifically linked to this charge
  const chargeAllocs = allocations.filter(a => a.charge_id === charge.id);
  const totalReceived = chargeAllocs.reduce((sum, a) => sum + a.amount, 0);

  // Find corresponding payments
  const matchedPayments: Payment[] = [];
  for (const alloc of chargeAllocs) {
    const p = payments.find(pay => pay.id === alloc.payment_id);
    if (p) matchedPayments.push(p);
  }

  // Sort by received_date ascending to find latest payment
  matchedPayments.sort((a, b) => a.received_date.localeCompare(b.received_date));
  const latestPayment = matchedPayments.length > 0 ? matchedPayments[matchedPayments.length - 1] : null;

  let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
  if (totalReceived >= charge.amount) {
    status = 'paid';
  } else if (totalReceived > 0) {
    status = 'partial';
  }

  const serviceDate = charge.accrual_date;
  const receivedDate = latestPayment ? latestPayment.received_date : undefined;
  const method: PaymentMethod = latestPayment ? latestPayment.method : (existingEntry?.method || 'blik');
  const serviceType = charge.charge_type === 'paid_cancellation'
    ? 'Opłata za późne odwołanie lekcji'
    : (charge.description || 'Lekcja matematyki');

  if (existingEntry) {
    return {
      ...existingEntry,
      charge_id: charge.id,
      lesson_id: charge.lesson_id,
      service_date: serviceDate,
      accrual_date: serviceDate,
      received_date: receivedDate,
      amount_due: charge.amount,
      amount_received: totalReceived,
      method,
      status,
      service_type: serviceType,
      version: existingEntry.version + 1,
      updated_at: nowIso
    };
  }

  return {
    id: generateUUID(),
    charge_id: charge.id,
    lesson_id: charge.lesson_id,
    number: number || '2026/001',
    service_date: serviceDate,
    accrual_date: serviceDate,
    received_date: receivedDate,
    student_id: charge.student_id,
    service_type: serviceType,
    amount_due: charge.amount,
    amount_received: totalReceived,
    method,
    status,
    version: 1,
    created_at: nowIso,
    updated_at: nowIso
  };
}

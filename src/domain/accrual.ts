import { getQuarterForDate } from './limit';

export interface AccrualCalculationResult {
  accrual_date: string;
  hasWarning: boolean;
  warningMessage?: string;
}

/**
 * Determines charge accrual_date according to Chapter 4.2 of specification:
 * Client decision: accrual_date is the date of service performance (lesson date),
 * not the payment date.
 * If paid in advance in a different quarter, return warning for accountant check.
 */
export function calculateAccrualDate(
  lessonDate: string,
  paymentDate?: string
): AccrualCalculationResult {
  const serviceDate = lessonDate.slice(0, 10);

  if (!paymentDate) {
    return {
      accrual_date: serviceDate,
      hasWarning: false
    };
  }

  const pDate = paymentDate.slice(0, 10);
  const lessonQuarter = getQuarterForDate(serviceDate);
  const paymentQuarter = getQuarterForDate(pDate);

  // Check if paid in advance across quarter boundary
  const isUpfrontDifferentQuarter =
    pDate < serviceDate &&
    (lessonQuarter.year !== paymentQuarter.year || lessonQuarter.quarter !== paymentQuarter.quarter);

  if (isUpfrontDifferentQuarter) {
    return {
      accrual_date: serviceDate,
      hasWarning: true,
      warningMessage: 'Wpłata z góry z innego kwartału. Do potwierdzenia z księgowym (art. 14 ust. 1c ustawy o PIT).'
    };
  }

  return {
    accrual_date: serviceDate,
    hasWarning: false
  };
}

import { Charge, Lesson, Payment, PaymentAllocation, Period, ReportSnapshot, Student, UUID, LegalParams } from './types';
import { getChargesBalance } from './allocation';
import { calculateQuarterLimitStatus } from './limit';

export interface MonthlyReportData {
  periodId: UUID;
  periodLabel: string; // e.g. "2026-11"
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  hoursPlanned: number;
  hoursCompleted: number;
  hoursCancelled: number;
  lessonsCompletedCount: number;
  lessonsCancelledCount: number;
  accruedRevenueGrosze: number; // przychód należny w miesiącu
  receivedRevenueGrosze: number; // przychód otrzymany w miesiącu (PIT)
  unpaidGrosze: number; // nieopłacone należności z tego miesiąca
  paymentsByMethod: {
    blik: number;
    przelew: number;
    gotowka: number;
    inna: number;
  };
  studentBreakdown: Array<{
    studentId: UUID;
    studentName: string;
    completedHours: number;
    accruedGrosze: number;
    receivedGrosze: number;
    unpaidGrosze: number;
  }>;
  quarterLimitProgressGrosze: number;
  quarterLimitMaxGrosze: number;
}

export function buildMonthlyReport(
  period: Period,
  lessons: Lesson[],
  charges: Charge[],
  payments: Payment[],
  allocations: PaymentAllocation[],
  students: Student[],
  legalParamsList: LegalParams[]
): MonthlyReportData {
  const from = period.date_from;
  const to = period.date_to;

  const periodLessons = lessons.filter(l => {
    const d = l.start_at.slice(0, 10);
    return d >= from && d <= to;
  });

  const periodCharges = charges.filter(c => c.accrual_date >= from && c.accrual_date <= to);
  const periodPayments = payments.filter(p => p.received_date >= from && p.received_date <= to);

  let minutesPlanned = 0;
  let minutesCompleted = 0;
  let minutesCancelled = 0;
  let lessonsCompletedCount = 0;
  let lessonsCancelledCount = 0;

  for (const l of periodLessons) {
    minutesPlanned += l.duration_min;
    if (l.status === 'completed') {
      minutesCompleted += l.duration_min;
      lessonsCompletedCount++;
    } else if (l.status === 'cancelled_student' || l.status === 'cancelled_tutor' || l.status === 'no_show') {
      minutesCancelled += l.duration_min;
      lessonsCancelledCount++;
    }
  }

  const accruedRevenueGrosze = periodCharges.reduce((sum, c) => sum + c.amount, 0);
  const receivedRevenueGrosze = periodPayments.reduce((sum, p) => p.payment_type === 'wplata' ? sum + p.amount : sum - p.amount, 0);

  // Exact unpaid calculation: sum of remaining unpaid balances of charges accrued in this period
  const balanceMap = getChargesBalance(charges, allocations);
  let unpaidGrosze = 0;
  for (const c of periodCharges) {
    const b = balanceMap.get(c.id);
    if (b && b.remainingAmount > 0) {
      unpaidGrosze += b.remainingAmount;
    }
  }

  const paymentsByMethod = {
    blik: 0,
    przelew: 0,
    gotowka: 0,
    inna: 0
  };

  for (const p of periodPayments) {
    if (p.payment_type === 'wplata') {
      paymentsByMethod[p.method] = (paymentsByMethod[p.method] || 0) + p.amount;
    }
  }

  // Breakdown per student
  const studentBreakdown = students.map(s => {
    const sCharges = periodCharges.filter(c => c.student_id === s.id);
    const sPayments = periodPayments.filter(p => p.student_id === s.id);
    const sLessons = periodLessons.filter(l => l.student_id === s.id && l.status === 'completed');

    const sMinutes = sLessons.reduce((sum, l) => sum + l.duration_min, 0);
    const sAccrued = sCharges.reduce((sum, c) => sum + c.amount, 0);
    const sReceived = sPayments.reduce((sum, p) => p.payment_type === 'wplata' ? sum + p.amount : sum - p.amount, 0);

    let sUnpaid = 0;
    for (const c of sCharges) {
      const b = balanceMap.get(c.id);
      if (b && b.remainingAmount > 0) {
        sUnpaid += b.remainingAmount;
      }
    }

    return {
      studentId: s.id,
      studentName: `${s.first_name} ${s.last_name}`,
      completedHours: Math.round((sMinutes / 60) * 10) / 10,
      accruedGrosze: sAccrued,
      receivedGrosze: sReceived,
      unpaidGrosze: sUnpaid
    };
  }).filter(b => b.completedHours > 0 || b.accruedGrosze > 0 || b.receivedGrosze > 0);

  // Calculate quarter limit for the QUARTER OF THIS REPORT PERIOD, not today's quarter!
  const periodYear = Number(from.slice(0, 4));
  const legalParam = legalParamsList.find(lp => lp.year === periodYear) || legalParamsList[0] || {
    id: 'default',
    year: periodYear,
    min_wage: 480600,
    factor_pct: 225,
    frequency: 'quarter' as const,
    valid_from: `${periodYear}-01-01`,
    calculated_limit: 1081350,
    version: 1,
    created_at: '',
    updated_at: ''
  };

  const quarterLimitStatus = calculateQuarterLimitStatus(from, charges, legalParam, []);

  return {
    periodId: period.id,
    periodLabel: from.slice(0, 7),
    dateFrom: from,
    dateTo: to,
    generatedAt: new Date().toISOString(),
    hoursPlanned: Math.round((minutesPlanned / 60) * 10) / 10,
    hoursCompleted: Math.round((minutesCompleted / 60) * 10) / 10,
    hoursCancelled: Math.round((minutesCancelled / 60) * 10) / 10,
    lessonsCompletedCount,
    lessonsCancelledCount,
    accruedRevenueGrosze,
    receivedRevenueGrosze,
    unpaidGrosze,
    paymentsByMethod,
    studentBreakdown,
    quarterLimitProgressGrosze: quarterLimitStatus.usedGrosze,
    quarterLimitMaxGrosze: quarterLimitStatus.limitGrosze
  };
}

/**
 * Creates or updates snapshot with incremented version number
 */
export function createSnapshotRecord(
  periodId: UUID,
  data: MonthlyReportData,
  currentSnapshots: ReportSnapshot[],
  reason?: string
): ReportSnapshot {
  const existingForPeriod = currentSnapshots.filter(s => s.period_id === periodId);
  const nextVersion = existingForPeriod.length + 1;
  const jsonStr = JSON.stringify(data);

  // Compute a simple deterministic hash
  let hashVal = 0;
  for (let i = 0; i < jsonStr.length; i++) {
    hashVal = (hashVal << 5) - hashVal + jsonStr.charCodeAt(i);
    hashVal |= 0;
  }
  const hashHex = `sha256-sim-${Math.abs(hashVal).toString(16)}`;

  return {
    id: `snap-${periodId}-v${nextVersion}`,
    period_id: periodId,
    version_num: nextVersion,
    data_json: jsonStr,
    hash: hashHex,
    correction_reason: nextVersion > 1 ? (reason || 'Korekta po zamknięciu') : undefined,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

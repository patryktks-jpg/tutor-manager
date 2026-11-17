import { Charge, LegalParams, Lesson } from './types';
import { Money } from './money';

export interface QuarterPeriod {
  quarter: number; // 1, 2, 3, 4
  year: number;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
}

export interface LimitStatus {
  quarter: QuarterPeriod;
  limitGrosze: number;
  usedGrosze: number;
  remainingGrosze: number;
  usedPercentage: number;
  forecastGrosze: number;
  forecastPercentage: number;
  forecastExceededOn?: string; // yyyy-MM-dd: predicted date when planned lessons will exceed limit
  isExceeded: boolean;
  exceededOn?: string; // yyyy-MM-dd
  ceidgDeadline?: string; // yyyy-MM-dd (exceededOn + 7 days)
  daysLeftToCeidg?: number;
  alertLevel: 'normal' | 'warn70' | 'warn85' | 'warn95' | 'critical';
}

export function getQuarterForDate(dateStr: string): QuarterPeriod {
  // dateStr is expected to be yyyy-MM-dd or ISO
  const d = new Date(dateStr.slice(0, 10));
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;

  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;

  const start = new Date(year, startMonth, 1);
  const end = new Date(year, endMonth + 1, 0); // last day of month

  const format = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  return {
    quarter,
    year,
    startDate: format(start),
    endDate: format(end)
  };
}

export function calculateLimitGrosze(params: LegalParams): number {
  if (params.manual_override !== undefined && params.manual_override !== null) {
    return params.manual_override;
  }
  return Money.multiplyPercent(params.min_wage, params.factor_pct);
}

/**
 * Calculates +7 calendar days from a given yyyy-MM-dd date
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Calculates current quarter limit status, chronological progression, and exceedance day if any.
 */
export function calculateQuarterLimitStatus(
  targetDate: string,
  charges: Charge[],
  legalParams: LegalParams,
  upcomingLessons: Lesson[] = [],
  thresholds: number[] = [70, 85, 95, 100]
): LimitStatus {
  const quarter = getQuarterForDate(targetDate);
  const limitGrosze = calculateLimitGrosze(legalParams);

  // Filter charges with accrual_date in this quarter
  const quarterCharges = charges
    .filter(c => c.accrual_date >= quarter.startDate && c.accrual_date <= quarter.endDate)
    // sort chronologically to detect exact exceedance day
    .sort((a, b) => a.accrual_date.localeCompare(b.accrual_date) || a.created_at.localeCompare(b.created_at));

  let runningSum = 0;
  let exceededOn: string | undefined = undefined;

  for (const c of quarterCharges) {
    runningSum += c.amount;
    // Exactly equal to limit is NOT exceeded (rule 9.3)
    if (runningSum > limitGrosze && !exceededOn) {
      exceededOn = c.accrual_date;
    }
  }

  const usedGrosze = runningSum;
  const remainingGrosze = limitGrosze - usedGrosze;
  const usedPercentage = limitGrosze > 0 ? (usedGrosze / limitGrosze) * 100 : 0;

  // Forecast: add planned and scheduled lessons in the remainder of the quarter (B3)
  const targetDay = targetDate.slice(0, 10);
  const futureQuarterLessons = upcomingLessons
    .filter(l => {
      const lDate = l.start_at.slice(0, 10);
      return (l.status === 'planned' || l.status === 'needs_confirmation') &&
             lDate >= targetDay &&
             lDate <= quarter.endDate;
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  const plannedAdditionalGrosze = futureQuarterLessons.reduce((sum, l) => sum + l.price_snapshot, 0);
  const forecastGrosze = usedGrosze + plannedAdditionalGrosze;
  const forecastPercentage = limitGrosze > 0 ? (forecastGrosze / limitGrosze) * 100 : 0;

  let forecastExceededOn: string | undefined = undefined;
  if (forecastGrosze > limitGrosze) {
    let fSum = usedGrosze;
    for (const fl of futureQuarterLessons) {
      fSum += fl.price_snapshot;
      if (fSum > limitGrosze) {
        forecastExceededOn = fl.start_at.slice(0, 10);
        break;
      }
    }
  }

  const isExceeded = usedGrosze > limitGrosze;
  let ceidgDeadline: string | undefined = undefined;
  let daysLeftToCeidg: number | undefined = undefined;

  if (isExceeded && exceededOn) {
    ceidgDeadline = addDays(exceededOn, 7);
    const msDiff = new Date(ceidgDeadline).getTime() - new Date(targetDay).getTime();
    daysLeftToCeidg = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
  }

  // Determine alert level
  let alertLevel: LimitStatus['alertLevel'] = 'normal';
  if (isExceeded || usedPercentage >= (thresholds[3] ?? 100)) {
    alertLevel = 'critical';
  } else if (usedPercentage >= (thresholds[2] ?? 95)) {
    alertLevel = 'warn95';
  } else if (usedPercentage >= (thresholds[1] ?? 85)) {
    alertLevel = 'warn85';
  } else if (usedPercentage >= (thresholds[0] ?? 70)) {
    alertLevel = 'warn70';
  }

  return {
    quarter,
    limitGrosze,
    usedGrosze,
    remainingGrosze,
    usedPercentage: Math.round(usedPercentage * 10) / 10,
    forecastGrosze,
    forecastPercentage: Math.round(forecastPercentage * 10) / 10,
    forecastExceededOn,
    isExceeded,
    exceededOn,
    ceidgDeadline,
    daysLeftToCeidg,
    alertLevel
  };
}

/**
 * Simulator: predicts limit percentage after an action (e.g. adding a lesson or package).
 */
export function simulateChargeImpact(
  currentStatus: LimitStatus,
  addedGrosze: number
): {
  newUsedGrosze: number;
  newPercentage: number;
  willExceed: boolean;
  excessGrosze: number;
} {
  const newUsedGrosze = currentStatus.usedGrosze + addedGrosze;
  const newPercentage = currentStatus.limitGrosze > 0 ? (newUsedGrosze / currentStatus.limitGrosze) * 100 : 0;
  const willExceed = newUsedGrosze > currentStatus.limitGrosze;
  const excessGrosze = willExceed ? newUsedGrosze - currentStatus.limitGrosze : 0;

  return {
    newUsedGrosze,
    newPercentage: Math.round(newPercentage * 10) / 10,
    willExceed,
    excessGrosze
  };
}

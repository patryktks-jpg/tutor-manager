import { CancelPolicy, Lesson } from './types';
import { Money } from './money';

export const DEFAULT_CANCEL_POLICY: CancelPolicy = {
  id: 'policy-default',
  name: 'Standardowa (24h bezpłatnie, 100% po terminie)',
  free_cancel_hours: 24,
  late_cancel_fee_pct: 100,
  no_show_fee_pct: 100
};

export interface CancellationAssessment {
  isFree: boolean;
  hoursNotice: number;
  feePercentage: number;
  feeGrosze: number;
  reason: string;
}

/**
 * Assesses whether a lesson cancellation or no-show warrants a charge.
 */
export function assessCancellation(
  lesson: Lesson,
  cancellationTime: string, // ISO string
  policy: CancelPolicy = DEFAULT_CANCEL_POLICY,
  isNoShow = false
): CancellationAssessment {
  const lessonStartMs = new Date(lesson.start_at).getTime();
  const cancelMs = new Date(cancellationTime).getTime();

  const hoursNotice = (lessonStartMs - cancelMs) / (1000 * 60 * 60);

  if (isNoShow) {
    const feeGrosze = Money.multiplyPercent(lesson.price_snapshot, policy.no_show_fee_pct);
    return {
      isFree: policy.no_show_fee_pct === 0,
      hoursNotice: 0,
      feePercentage: policy.no_show_fee_pct,
      feeGrosze,
      reason: `Nieobecność bez uprzedzenia (${policy.no_show_fee_pct}%)`
    };
  }

  if (hoursNotice >= policy.free_cancel_hours) {
    return {
      isFree: true,
      hoursNotice: Math.round(hoursNotice * 10) / 10,
      feePercentage: 0,
      feeGrosze: 0,
      reason: `Odwołanie z wyprzedzeniem (${Math.round(hoursNotice)}h przed terminem ≥ ${policy.free_cancel_hours}h limitu)`
    };
  }

  // Late cancellation
  const feeGrosze = Money.multiplyPercent(lesson.price_snapshot, policy.late_cancel_fee_pct);
  return {
    isFree: policy.late_cancel_fee_pct === 0,
    hoursNotice: Math.round(hoursNotice * 10) / 10,
    feePercentage: policy.late_cancel_fee_pct,
    feeGrosze,
    reason: `Późne odwołanie (${Math.round(hoursNotice)}h przed lekcją < ${policy.free_cancel_hours}h: ${policy.late_cancel_fee_pct}% stawki)`
  };
}

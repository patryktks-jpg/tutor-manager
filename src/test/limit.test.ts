import { describe, it, expect } from 'vitest';
import { calculateQuarterLimitStatus, calculateLimitGrosze, getQuarterForDate, addDays, simulateChargeImpact } from '../domain/limit';
import { LegalParams, Charge } from '../domain/types';

describe('Limit Module - 2026 Quarterly Limit & Thresholds', () => {
  const params2026: LegalParams = {
    id: 'legal-2026',
    year: 2026,
    min_wage: 480600, // 4 806 zł
    factor_pct: 225,
    frequency: 'quarter',
    valid_from: '2026-01-01',
    calculated_limit: 1081350, // 10 813,50 zł
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  };

  it('correctly calculates 2026 quarterly limit as 10 813,50 zł (1 081 350 groszy)', () => {
    const limit = calculateLimitGrosze(params2026);
    expect(limit).toBe(1081350);
  });

  it('determines quarter start and end dates', () => {
    const q1 = getQuarterForDate('2026-02-15');
    expect(q1.quarter).toBe(1);
    expect(q1.startDate).toBe('2026-01-01');
    expect(q1.endDate).toBe('2026-03-31');

    const q4 = getQuarterForDate('2026-11-15');
    expect(q4.quarter).toBe(4);
    expect(q4.startDate).toBe('2026-10-01');
    expect(q4.endDate).toBe('2026-12-31');
  });

  it('calculates CEIDG deadline (+7 days) crossing month/quarter boundary', () => {
    expect(addDays('2026-03-31', 7)).toBe('2026-04-07');
    expect(addDays('2026-11-15', 7)).toBe('2026-11-22');
  });

  it('triggers alert thresholds accurately (70%, 85%, 95%, 100%)', () => {
    const charges: Charge[] = [
      {
        id: 'c1',
        student_id: 's1',
        amount: 800000, // ~74% of 10 813.50 zł
        accrual_date: '2026-02-01',
        charge_type: 'lesson',
        version: 1,
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z'
      }
    ];

    const status74 = calculateQuarterLimitStatus('2026-02-15', charges, params2026);
    expect(status74.alertLevel).toBe('warn70');
    expect(status74.isExceeded).toBe(false);

    // Add more to reach 96%
    charges.push({
      id: 'c2',
      student_id: 's1',
      amount: 240000, // Total = 1 040 000 (96.1%)
      accrual_date: '2026-02-10',
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-02-10T10:00:00Z',
      updated_at: '2026-02-10T10:00:00Z'
    });

    const status96 = calculateQuarterLimitStatus('2026-02-15', charges, params2026);
    expect(status96.alertLevel).toBe('warn95');
    expect(status96.isExceeded).toBe(false);
  });

  it('simulates proposed charge impact', () => {
    const charges: Charge[] = [
      {
        id: 'c1',
        student_id: 's1',
        amount: 1000000,
        accrual_date: '2026-02-01',
        charge_type: 'lesson',
        version: 1,
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z'
      }
    ];
    const status = calculateQuarterLimitStatus('2026-02-01', charges, params2026);
    const sim = simulateChargeImpact(status, 100000); // 1 000 000 + 100 000 = 1 100 000 > 1 081 350

    expect(sim.willExceed).toBe(true);
    expect(sim.excessGrosze).toBe(18650); // 186.50 zł over limit
  });
});

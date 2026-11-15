import { describe, it, expect } from 'vitest';
import { Money } from '../domain/money';

describe('Money Module - Integer Grosze Arithmetic', () => {
  it('formats grosze to Polish currency string', () => {
    expect(Money.format(7000)).toBe('70,00 zł');
    expect(Money.format(0)).toBe('0,00 zł');
    expect(Money.format(50)).toBe('0,50 zł');
    expect(Money.format(1081350)).toBe('10 813,50 zł');
    expect(Money.format(-2500)).toBe('-25,00 zł');
  });

  it('parses diverse Polish input formats safely to integer grosze', () => {
    expect(Money.parse('70')).toBe(7000);
    expect(Money.parse('70,00')).toBe(7000);
    expect(Money.parse('70,50 zł')).toBe(7050);
    expect(Money.parse('10 813,50 zł')).toBe(1081350);
    expect(Money.parse(70)).toBe(7000);
    expect(Money.parse('0')).toBe(0);
  });

  it('performs addition and subtraction without floating-point inaccuracies', () => {
    const a = 10000; // 100 zł
    const b = 5050;  // 50.50 zł
    expect(Money.add(a, b)).toBe(15050);
    expect(Money.subtract(a, b)).toBe(4950);
  });

  it('multiplies by percentage factors cleanly with rounding', () => {
    // 225% of 4 806.00 zł (480600 groszy)
    const minWageGrosze = 480600;
    const factorPct = 225;
    expect(Money.multiplyPercent(minWageGrosze, factorPct)).toBe(1081350);

    // 50% cancellation fee on 70.00 zł
    expect(Money.multiplyPercent(7000, 50)).toBe(3500);

    // 33% on 100.00 zł -> 33.00 zł
    expect(Money.multiplyPercent(10000, 33)).toBe(3300);
  });

  it('rejects non-integer grosze inputs', () => {
    expect(() => Money.assertInteger(70.5)).toThrow(TypeError);
    expect(() => Money.format(70.5)).toThrow(TypeError);
  });
});

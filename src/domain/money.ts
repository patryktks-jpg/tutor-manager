/**
 * Money module - Strict integer grosze operations.
 * NO float numbers are ever used for monetary state.
 * 1 PLN = 100 groszy.
 */

export class Money {
  /**
   * Asserts that a value is a valid integer representing grosze.
   */
  public static assertInteger(grosze: number): void {
    if (!Number.isSafeInteger(grosze)) {
      throw new TypeError(`Expected integer grosze, got ${grosze}`);
    }
  }

  /**
   * Format grosze to Polish currency string: e.g. 7000 -> "70,00 zł", 1081350 -> "10 813,50 zł"
   */
  public static format(grosze: number, showCurrency = true): string {
    Money.assertInteger(grosze);
    const sign = grosze < 0 ? '-' : '';
    const abs = Math.abs(grosze);
    const zloty = Math.floor(abs / 100);
    const gr = abs % 100;

    // Polish thousand grouping with space: 10 813
    const formattedZloty = zloty.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const formattedGr = gr.toString().padStart(2, '0');
    const result = `${sign}${formattedZloty},${formattedGr}`;
    return showCurrency ? `${result} zł` : result;
  }

  /**
   * Parse user input like "70", "70,50", "70.50", " 1 200,50 zł " to integer grosze.
   */
  public static parse(input: string | number): number {
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new Error('Invalid number');
      // If passing already rounded number
      return Math.round(input * 100);
    }

    if (!input || typeof input !== 'string') return 0;

    const cleaned = input
      .trim()
      .replace(/zł/gi, '')
      .replace(/\s+/g, '')
      .replace(',', '.');

    if (!cleaned) return 0;

    const num = Number(cleaned);
    if (Number.isNaN(num)) {
      throw new Error(`Nieprawidłowa kwota: "${input}"`);
    }

    return Math.round(num * 100);
  }

  public static add(a: number, b: number): number {
    Money.assertInteger(a);
    Money.assertInteger(b);
    return a + b;
  }

  public static subtract(a: number, b: number): number {
    Money.assertInteger(a);
    Money.assertInteger(b);
    return a - b;
  }

  /**
   * Multiplies grosze by an integer or percentage factor (e.g. 225% factor, or 50% cancellation fee).
   * Result is rounded strictly using Math.round to integer grosze.
   */
  public static multiplyPercent(grosze: number, percent: number): number {
    Money.assertInteger(grosze);
    return Math.round((grosze * percent) / 100);
  }

  public static isZero(grosze: number): boolean {
    return grosze === 0;
  }

  public static isPositive(grosze: number): boolean {
    return grosze > 0;
  }
}

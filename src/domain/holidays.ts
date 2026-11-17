/**
 * Polish public holidays calculation (B4).
 * Uses anonymous Gregorian algorithm (Meeus/Jones/Butcher) for Easter and movable feasts.
 */

export interface Holiday {
  date: string; // yyyy-MM-dd
  name: string;
}

/**
 * Calculates Easter Sunday for a given year using Meeus/Jones/Butcher Gregorian algorithm.
 */
export function getEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToDate(year: number, month: number, day: number, daysToAdd: number): string {
  const dt = new Date(year, month - 1, day);
  dt.setDate(dt.getDate() + daysToAdd);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Returns all statutory public holidays in Poland for a given year.
 */
export function getPolishHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [
    { date: formatDate(year, 1, 1), name: 'Nowy Rok' },
    { date: formatDate(year, 1, 6), name: 'Święto Trzech Króli' },
    { date: formatDate(year, 5, 1), name: 'Święto Pracy' },
    { date: formatDate(year, 5, 3), name: 'Święto Konstytucji 3 Maja' },
    { date: formatDate(year, 8, 15), name: 'Wniebowzięcie NMP' },
    { date: formatDate(year, 11, 1), name: 'Wszystkich Świętych' },
    { date: formatDate(year, 11, 11), name: 'Narodowe Święto Niepodległości' },
    { date: formatDate(year, 12, 25), name: 'Boże Narodzenie (dzień 1)' },
    { date: formatDate(year, 12, 26), name: 'Boże Narodzenie (dzień 2)' }
  ];

  // Movable holidays
  const easter = getEasterSunday(year);
  const easterSundayStr = formatDate(year, easter.month, easter.day);
  const easterMondayStr = addDaysToDate(year, easter.month, easter.day, 1);
  const pentecostStr = addDaysToDate(year, easter.month, easter.day, 49); // Zielone Świątki (+49)
  const corpusChristiStr = addDaysToDate(year, easter.month, easter.day, 60); // Boże Ciało (+60)

  holidays.push(
    { date: easterSundayStr, name: 'Wielkanoc' },
    { date: easterMondayStr, name: 'Poniedziałek Wielkanocny' },
    { date: pentecostStr, name: 'Zielone Świątki' },
    { date: corpusChristiStr, name: 'Boże Ciało' }
  );

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Checks if a given date string (yyyy-MM-dd) is a statutory public holiday in Poland.
 */
export function checkPolishHoliday(dateStr: string): { isHoliday: boolean; name?: string } {
  const yyyyMmDd = dateStr.slice(0, 10);
  const year = Number(yyyyMmDd.slice(0, 4));
  if (isNaN(year)) return { isHoliday: false };

  const holidays = getPolishHolidays(year);
  const found = holidays.find(h => h.date === yyyyMmDd);

  if (found) {
    return { isHoliday: true, name: found.name };
  }
  return { isHoliday: false };
}

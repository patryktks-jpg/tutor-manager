/**
 * Date and Time utilities for Europe/Warsaw timezone.
 * NEVER use toISOString().slice(0,10) because between midnight and 01:00/02:00 AM
 * UTC date is still yesterday!
 */

export function getWarsawDateStr(d: Date = new Date()): string {
  // 'sv-SE' locale formats as 'YYYY-MM-DD'
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function getWarsawDateTimeStr(d: Date = new Date()): string {
  // Returns 'YYYY-MM-DDTHH:mm:ss' in Europe/Warsaw
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`;
}

/**
 * Calculates Monday-to-Sunday week range for any given YYYY-MM-DD date.
 * Anchored at local noon (12:00) so timezone / DST switches never shift the day.
 */
export function getWarsawWeekRange(dateStr: string): { mondayStr: string; sundayStr: string; days: string[] } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  const day = dateObj.getDay(); // 0 is Sunday, 1 is Monday, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(dateObj);
  monday.setDate(dateObj.getDate() + diffToMonday);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    days.push(getWarsawDateStr(cur));
  }

  return {
    mondayStr: days[0],
    sundayStr: days[6],
    days
  };
}

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

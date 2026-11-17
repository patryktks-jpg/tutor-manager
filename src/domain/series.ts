import { Lesson, LessonSeries } from './types';
import { checkPolishHoliday } from './holidays';

/**
 * Common Polish public holidays for 2026/2027
 */
export const POLISH_HOLIDAYS_2026 = [
  '2026-01-01', // Nowy Rok
  '2026-01-06', // Trzech Króli
  '2026-04-05', // Wielkanoc
  '2026-04-06', // Poniedziałek Wielkanocny
  '2026-05-01', // Święto Pracy
  '2026-05-03', // Święto Konstytucji 3 Maja
  '2026-06-04', // Boże Ciało
  '2026-08-15', // Wniebowzięcie NMP
  '2026-11-01', // Wszystkich Świętych
  '2026-11-11', // Święto Niepodległości
  '2026-12-25', // Boże Narodzenie
  '2026-12-26'  // Drugi dzień Bożego Narodzenia
];

export interface ConflictResult {
  hasConflict: boolean;
  conflictingLessonIds: string[];
}

/**
 * Checks if two lessons overlap in time.
 */
export function checkLessonOverlap(aStart: string, aDurationMin: number, bStart: string, bDurationMin: number): boolean {
  const aStartTime = new Date(aStart).getTime();
  const aEndTime = aStartTime + aDurationMin * 60 * 1000;

  const bStartTime = new Date(bStart).getTime();
  const bEndTime = bStartTime + bDurationMin * 60 * 1000;

  return Math.max(aStartTime, bStartTime) < Math.min(aEndTime, bEndTime);
}

/**
 * Finds all overlapping conflicts for a given lesson among existing lessons.
 */
export function findLessonConflicts(
  target: { id?: string; start_at: string; duration_min: number },
  existingLessons: Lesson[]
): ConflictResult {
  const conflicts: string[] = [];

  for (const l of existingLessons) {
    if (l.id === target.id) continue;
    if (l.status === 'cancelled_student' || l.status === 'cancelled_tutor') continue;

    if (checkLessonOverlap(target.start_at, target.duration_min, l.start_at, l.duration_min)) {
      conflicts.push(l.id);
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflictingLessonIds: conflicts
  };
}

/**
 * Generates rolling 8-week occurrences for a lesson series starting from a reference date.
 */
export function generateSeriesOccurrences(
  series: LessonSeries,
  studentDefaultPrice: number,
  subject: string,
  startDate: string, // yyyy-MM-dd
  weeksCount = 8,
  skipHolidays = true
): Lesson[] {
  const occurrences: Lesson[] = [];
  const start = new Date(startDate);

  for (let w = 0; w < weeksCount; w++) {
    const cur = new Date(start);
    cur.setDate(cur.getDate() + w * 7);

    // Find the next matching day_of_week
    const curDay = cur.getDay(); // 0 is Sun
    const dayDiff = (series.day_of_week - curDay + 7) % 7;
    cur.setDate(cur.getDate() + dayDiff);

    const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;

    if (series.exceptions && series.exceptions.includes(dateStr)) continue;
    if (skipHolidays && (checkPolishHoliday(dateStr).isHoliday || POLISH_HOLIDAYS_2026.includes(dateStr))) continue;
    if (series.to_date && dateStr > series.to_date) break;
    if (dateStr < series.from_date) continue;

    const [hours, minutes] = series.start_time.split(':').map(Number);
    const startIso = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    occurrences.push({
      id: `lesson-${series.id}-${dateStr}`,
      student_id: series.student_id,
      series_id: series.id,
      start_at: startIso,
      duration_min: series.duration_min,
      status: 'planned',
      price_snapshot: studentDefaultPrice,
      subject,
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  return occurrences;
}

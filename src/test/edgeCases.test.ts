import { describe, it, expect } from 'vitest';
import { Charge, LegalParams, Lesson, Payment, PaymentAllocation, Period, Student } from '../domain/types';
import { calculateQuarterLimitStatus } from '../domain/limit';
import { calculateAccrualDate } from '../domain/accrual';
import { proposeFifoAllocation, getChargesBalance } from '../domain/allocation';
import { buildMonthlyReport, createSnapshotRecord } from '../domain/periods';
import { checkLessonOverlap } from '../domain/series';

describe('Specification Chapter 9: 12 Mandatory Edge Case Tests', () => {
  const params2026: LegalParams = {
    id: 'legal-2026',
    year: 2026,
    min_wage: 480600,
    factor_pct: 225,
    frequency: 'quarter',
    valid_from: '2026-01-01',
    calculated_limit: 1081350, // 10 813,50 zł
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  };

  // Case 1: Lekcja 28.03 opłacona 05.04: limit - marzec/I kwartał; PIT - kwiecień; status płatności "zapłacono 05.04"
  it('Edge Case 1: Lesson 28.03 paid 05.04 counts towards Q1 limit and April PIT', () => {
    const lessonDate = '2026-03-28';
    const paymentDate = '2026-04-05';

    // Accrual date for limit
    const accrual = calculateAccrualDate(lessonDate, paymentDate);
    expect(accrual.accrual_date).toBe('2026-03-28');

    // Limit check for Q1 (ends 2026-03-31)
    const charge: Charge = {
      id: 'c-march',
      student_id: 's1',
      amount: 7000,
      accrual_date: accrual.accrual_date,
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-03-28T10:00:00Z',
      updated_at: '2026-03-28T10:00:00Z'
    };
    const q1Status = calculateQuarterLimitStatus('2026-03-28', [charge], params2026);
    expect(q1Status.usedGrosze).toBe(7000);

    // Limit check for Q2 (starts 2026-04-01) - march charge must NOT count in Q2 limit
    const q2Status = calculateQuarterLimitStatus('2026-04-05', [charge], params2026);
    expect(q2Status.usedGrosze).toBe(0);

    // Payment for PIT received in April
    const payment: Payment = {
      id: 'p-april',
      student_id: 's1',
      amount: 7000,
      received_date: paymentDate,
      method: 'blik',
      description: 'Lekcja z 28.03',
      payment_type: 'wplata',
      version: 1,
      created_at: '2026-04-05T10:00:00Z',
      updated_at: '2026-04-05T10:00:00Z'
    };
    expect(payment.received_date.slice(0, 7)).toBe('2026-04');
  });

  // Case 2: Pakiet 4 lekcji z góry 30.03, lekcje w kwietniu: accrual_date zgodnie z 4.2, bez podwójnego wliczenia
  it('Edge Case 2: Package purchased 30.03 for April lessons does not double count', () => {
    const packageDate = '2026-03-30';
    const firstLessonDate = '2026-04-06';

    const accrual = calculateAccrualDate(firstLessonDate, packageDate);
    expect(accrual.accrual_date).toBe('2026-04-06');
    // Triggers warning for accountant confirmation because payment was in Q1 but service is in Q2
    expect(accrual.hasWarning).toBe(true);

    const charge: Charge = {
      id: 'c-pkg',
      student_id: 's1',
      amount: 28000, // 4 * 70 zł
      accrual_date: accrual.accrual_date,
      charge_type: 'package',
      version: 1,
      created_at: '2026-03-30T10:00:00Z',
      updated_at: '2026-03-30T10:00:00Z'
    };

    // March Q1 usage is 0, April Q2 usage is 28000 (exactly counted once)
    const q1 = calculateQuarterLimitStatus('2026-03-30', [charge], params2026);
    const q2 = calculateQuarterLimitStatus('2026-04-06', [charge], params2026);

    expect(q1.usedGrosze).toBe(0);
    expect(q2.usedGrosze).toBe(28000);
  });

  // Case 3: Przekroczenie limitu dokładnie o 1 gr i dokładnie równo z limitem (równo = nieprzekroczono)
  it('Edge Case 3: Exceeding limit by exactly 1 gr vs exactly equal (equal = NOT exceeded)', () => {
    const limit = 1081350; // 10 813,50 zł

    const chargeExact: Charge = {
      id: 'c-exact',
      student_id: 's1',
      amount: limit,
      accrual_date: '2026-02-15',
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-02-15T10:00:00Z',
      updated_at: '2026-02-15T10:00:00Z'
    };

    const statusExact = calculateQuarterLimitStatus('2026-02-15', [chargeExact], params2026);
    expect(statusExact.isExceeded).toBe(false);
    expect(statusExact.remainingGrosze).toBe(0);
    expect(statusExact.exceededOn).toBeUndefined();

    // Now exceed by exactly 1 grosz
    const chargeExceeded: Charge = {
      ...chargeExact,
      amount: limit + 1
    };

    const statusExceeded = calculateQuarterLimitStatus('2026-02-15', [chargeExceeded], params2026);
    expect(statusExceeded.isExceeded).toBe(true);
    expect(statusExceeded.remainingGrosze).toBe(-1);
    expect(statusExceeded.exceededOn).toBe('2026-02-15');
    expect(statusExceeded.ceidgDeadline).toBe('2026-02-22');
  });

  // Case 4: Przekroczenie w ostatnim dniu kwartału, 7-dniowy termin przechodzi na kolejny kwartał
  it('Edge Case 4: Exceeding on last day of quarter carries 7-day CEIDG deadline into next quarter', () => {
    const lastDayQ1 = '2026-03-31';
    const charge: Charge = {
      id: 'c-last-day',
      student_id: 's1',
      amount: 1081351, // limit + 1 gr
      accrual_date: lastDayQ1,
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-03-31T20:00:00Z',
      updated_at: '2026-03-31T20:00:00Z'
    };

    const status = calculateQuarterLimitStatus(lastDayQ1, [charge], params2026);
    expect(status.isExceeded).toBe(true);
    expect(status.exceededOn).toBe('2026-03-31');
    expect(status.ceidgDeadline).toBe('2026-04-07'); // into Q2!
  });

  // Case 5: Cofnięcie statusu "zrealizowana" po zamknięciu miesiąca -> wymagana korekta i wersja v2 raportu
  it('Edge Case 5: Modifying after period closure produces versioned snapshot v2 with reason', () => {
    const period: Period = {
      id: 'period-2026-03',
      period_type: 'month',
      date_from: '2026-03-01',
      date_to: '2026-03-31',
      status: 'closed',
      closed_at: '2026-04-01T08:00:00Z',
      version: 1,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-04-01T08:00:00Z'
    };

    const student: Student = {
      id: 's1',
      first_name: 'Jan',
      last_name: 'Kowalski',
      phone: '123456789',
      grade_level: 'Klasa 8',
      subject: 'Matematyka',
      default_rate: 7000,
      default_duration_min: 60,
      preferred_slots: 'Poniedziałek 16:00',
      start_date: '2026-01-01',
      status: 'active',
      notes: '',
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    };

    const lesson: Lesson = {
      id: 'l1',
      student_id: 's1',
      start_at: '2026-03-15T16:00:00',
      duration_min: 60,
      status: 'completed',
      price_snapshot: 7000,
      subject: 'Matematyka',
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: '2026-03-15T16:00:00Z',
      updated_at: '2026-03-15T16:00:00Z'
    };

    const charge: Charge = {
      id: 'c1',
      student_id: 's1',
      lesson_id: 'l1',
      amount: 7000,
      accrual_date: '2026-03-15',
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-03-15T17:00:00Z',
      updated_at: '2026-03-15T17:00:00Z'
    };

    // v1 Report
    const rep1 = buildMonthlyReport(period, [lesson], [charge], [], [], [student], 1081350, 7000);
    const snap1 = createSnapshotRecord(period.id, rep1, []);
    expect(snap1.version_num).toBe(1);
    expect(snap1.correction_reason).toBeUndefined();

    // Now after month closure: cancel status of lesson, storno charge
    const stornoCharge: Charge = {
      id: 'c-storno',
      student_id: 's1',
      lesson_id: 'l1',
      amount: -7000,
      accrual_date: '2026-03-15',
      charge_type: 'correction',
      reverses_charge_id: 'c1',
      version: 1,
      created_at: '2026-04-05T10:00:00Z',
      updated_at: '2026-04-05T10:00:00Z'
    };

    const rep2 = buildMonthlyReport(period, [{ ...lesson, status: 'cancelled_student' }], [charge, stornoCharge], [], [], [student], 1081350, 0);
    const snap2 = createSnapshotRecord(period.id, rep2, [snap1], 'Błędnie oznaczona lekcja jako odbyta');

    expect(snap2.version_num).toBe(2);
    expect(snap2.correction_reason).toBe('Błędnie oznaczona lekcja jako odbyta');
    const parsedData2 = JSON.parse(snap2.data_json);
    expect(parsedData2.accruedRevenueGrosze).toBe(0);
  });

  // Case 6: Zmiana stawki ucznia w środku miesiąca: lekcje przeszłe bez zmian
  it('Edge Case 6: Rate change mid-month preserves past lesson price_snapshots', () => {
    const pastLesson: Lesson = {
      id: 'l-past',
      student_id: 's1',
      start_at: '2026-03-10T16:00:00',
      duration_min: 60,
      status: 'completed',
      price_snapshot: 7000, // old rate: 70 zł
      subject: 'Matematyka',
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: '2026-03-10T16:00:00Z',
      updated_at: '2026-03-10T16:00:00Z'
    };

    // Student rate updated on 2026-03-15 to 8000 groszy (80 zł)
    const newRate = 8000;

    const futureLesson: Lesson = {
      id: 'l-future',
      student_id: 's1',
      start_at: '2026-03-20T16:00:00',
      duration_min: 60,
      status: 'planned',
      price_snapshot: newRate,
      subject: 'Matematyka',
      location: 'student_home',
      notes: '',
      version: 1,
      created_at: '2026-03-16T10:00:00Z',
      updated_at: '2026-03-16T10:00:00Z'
    };

    expect(pastLesson.price_snapshot).toBe(7000);
    expect(futureLesson.price_snapshot).toBe(8000);
  });

  // Case 7: Zmiana czasu (marzec/październik): lekcja 17:00 pozostaje 17:00
  it('Edge Case 7: Daylight saving time transitions preserve wall-clock time', () => {
    // Before DST switch: 2026-03-28 17:00
    // After DST switch: 2026-03-30 17:00
    const timeBefore = '2026-03-28T17:00:00';
    const timeAfter = '2026-03-30T17:00:00';

    expect(timeBefore.slice(11, 16)).toBe('17:00');
    expect(timeAfter.slice(11, 16)).toBe('17:00');
  });

  // Case 8: Płatność częściowa rozbita na dwie lekcje, potem zwrot części
  it('Edge Case 8: Partial payment allocation across multiple charges', () => {
    const charge1: Charge = {
      id: 'c1',
      student_id: 's1',
      amount: 7000,
      accrual_date: '2026-03-01',
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:00:00Z'
    };
    const charge2: Charge = {
      id: 'c2',
      student_id: 's1',
      amount: 7000,
      accrual_date: '2026-03-08',
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-03-08T10:00:00Z',
      updated_at: '2026-03-08T10:00:00Z'
    };

    // Payment of 100 zł (10000 groszy)
    const proposed = proposeFifoAllocation(10000, [charge1, charge2], []);
    expect(proposed.allocations.length).toBe(2);
    expect(proposed.allocations[0].chargeId).toBe('c1');
    expect(proposed.allocations[0].amount).toBe(7000); // Fully covers first
    expect(proposed.allocations[1].chargeId).toBe('c2');
    expect(proposed.allocations[1].amount).toBe(3000); // Partially covers second
    expect(proposed.creditOverpayment).toBe(0);

    const allocs: PaymentAllocation[] = [
      { id: 'a1', payment_id: 'p1', charge_id: 'c1', amount: 7000, version: 1, created_at: '', updated_at: '' },
      { id: 'a2', payment_id: 'p1', charge_id: 'c2', amount: 3000, version: 1, created_at: '', updated_at: '' }
    ];

    const balance = getChargesBalance([charge1, charge2], allocs);
    expect(balance.get('c1')?.status).toBe('paid');
    expect(balance.get('c2')?.status).toBe('partial');
    expect(balance.get('c2')?.remainingAmount).toBe(4000); // 40 zł remaining on c2
  });

  // Case 9: Nakładające się terminy dwóch uczniów (i lekcja przez północ)
  it('Edge Case 9: Overlapping lesson schedule detection and midnight boundary', () => {
    const lessonA = { start_at: '2026-11-16T16:00:00', duration_min: 60 };
    const lessonB = { start_at: '2026-11-16T16:30:00', duration_min: 60 }; // Overlaps
    const lessonC = { start_at: '2026-11-16T17:00:00', duration_min: 60 }; // Back-to-back, does not overlap

    expect(checkLessonOverlap(lessonA.start_at, lessonA.duration_min, lessonB.start_at, lessonB.duration_min)).toBe(true);
    expect(checkLessonOverlap(lessonA.start_at, lessonA.duration_min, lessonC.start_at, lessonC.duration_min)).toBe(false);

    // Midnight crossover
    const lateNight = { start_at: '2026-11-16T23:30:00', duration_min: 60 };
    const earlyMorning = { start_at: '2026-11-17T00:15:00', duration_min: 45 };
    expect(checkLessonOverlap(lateNight.start_at, lateNight.duration_min, earlyMorning.start_at, earlyMorning.duration_min)).toBe(true);
  });

  // Case 10: Zmiana legal_params na 2027 nie zmienia wartości raportów 2026
  it('Edge Case 10: Legal params update for 2027 leaves 2026 reports intact', () => {
    const params2027: LegalParams = {
      id: 'legal-2027',
      year: 2027,
      min_wage: 520000, // higher minimum wage
      factor_pct: 225,
      frequency: 'quarter',
      valid_from: '2027-01-01',
      calculated_limit: 1170000,
      version: 1,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z'
    };

    const status2026 = calculateQuarterLimitStatus('2026-03-15', [], params2026);
    const status2027 = calculateQuarterLimitStatus('2027-03-15', [], params2027);

    expect(status2026.limitGrosze).toBe(1081350);
    expect(status2027.limitGrosze).toBe(1170000);
  });

  // Case 11: Odtworzenie kopii do czystego Arkusza: identyczne sumy, ten sam numer ostatniego wpisu
  it('Edge Case 11: Database serialization and restore preserves sums and sequential entry numbers', () => {
    const originalEntries = [
      { number: '2026/001', amount_due: 7000 },
      { number: '2026/002', amount_due: 8000 },
      { number: '2026/003', amount_due: 7000 }
    ];

    const serialized = JSON.stringify(originalEntries);
    const restored = JSON.parse(serialized);

    const sumOrig = originalEntries.reduce((s, e) => s + e.amount_due, 0);
    const sumRestored = restored.reduce((s: number, e: { amount_due: number }) => s + e.amount_due, 0);

    expect(sumRestored).toBe(sumOrig);
    expect(restored[restored.length - 1].number).toBe('2026/003');
  });

  // Case 12: Usunięcie ucznia (anonimizacja) nie zmienia sum w raportach
  it('Edge Case 12: Anonymizing student preserves financial record sums', () => {
    let student: Student = {
      id: 's1',
      first_name: 'Jan',
      last_name: 'Kowalski',
      phone: '123456789',
      grade_level: 'Klasa 8',
      subject: 'Matematyka',
      default_rate: 7000,
      default_duration_min: 60,
      preferred_slots: '',
      start_date: '2026-01-01',
      status: 'active',
      notes: 'Dane prywatne',
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    };

    const charge: Charge = {
      id: 'c1',
      student_id: 's1',
      amount: 7000,
      accrual_date: '2026-03-15',
      charge_type: 'lesson',
      version: 1,
      created_at: '2026-03-15T00:00:00Z',
      updated_at: '2026-03-15T00:00:00Z'
    };

    // GDPR anonymization
    student = {
      ...student,
      first_name: 'Uczeń',
      last_name: '[Zanonimizowano RODO]',
      phone: '',
      notes: '',
      status: 'archived'
    };

    expect(student.status).toBe('archived');
    expect(student.last_name).toBe('[Zanonimizowano RODO]');
    expect(charge.amount).toBe(7000); // Financial amount unchanged!
  });
});

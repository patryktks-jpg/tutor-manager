import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Student,
  Guardian,
  RateHistory,
  LessonSeries,
  Lesson,
  LessonEvent,
  Charge,
  Payment,
  PaymentAllocation,
  Package,
  IncomeEntry,
  LegalParams,
  Period,
  ReportSnapshot,
  AuditLog,
  Settings,
  OfflineOperation,
  UUID,
  PaymentMethod
} from '../domain/types';
import { generateUUID, hashPin } from '../domain/crypto';
import { IDBManager } from '../db/idb';
import { syncWithGas, testGasConnection, SyncResult } from '../db/sync';
import { calculateQuarterLimitStatus, LimitStatus } from '../domain/limit';
import { proposeFifoAllocation } from '../domain/allocation';
import { assessCancellation, DEFAULT_CANCEL_POLICY } from '../domain/cancelPolicy';
import { buildMonthlyReport, createSnapshotRecord } from '../domain/periods';

interface AppContextValue {
  isReady: boolean;
  isLocked: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lockApp: () => void;
  setAppPin: (pin: string) => Promise<void>;

  // Domain data
  students: Student[];
  guardians: Guardian[];
  rateHistory: RateHistory[];
  lessonSeries: LessonSeries[];
  lessons: Lesson[];
  charges: Charge[];
  payments: Payment[];
  paymentAllocations: PaymentAllocation[];
  packages: Package[];
  incomeEntries: IncomeEntry[];
  legalParams: LegalParams[];
  periods: Period[];
  reportSnapshots: ReportSnapshot[];
  auditLogs: AuditLog[];
  settings: Settings;
  offlineQueue: OfflineOperation[];

  // Dynamic computed properties
  todayStr: string;
  activeLegalParam: LegalParams;
  limitStatus: LimitStatus;
  unconfirmedLessons: Lesson[];
  offlineQueueCount: number;

  // Domain Operations
  markLessonCompleted: (lessonId: UUID) => Promise<void>;
  recordLessonPayment: (lessonId: UUID, method?: PaymentMethod) => Promise<void>;
  updateLessonStatus: (lessonId: UUID, status: Lesson['status'], note?: string) => Promise<void>;
  rescheduleLesson: (lessonId: UUID, newStartIso: string) => Promise<void>;
  createLesson: (lessonData: Partial<Lesson>) => Promise<Lesson>;
  createStudent: (student: Partial<Student>, guardian?: Partial<Guardian>) => Promise<Student>;
  updateStudent: (student: Student) => Promise<void>;
  anonymizeStudent: (studentId: UUID) => Promise<void>;
  recordPayment: (payment: Partial<Payment>, autoAllocate?: boolean) => Promise<Payment>;
  closePeriod: (periodId: UUID) => Promise<void>;
  reopenPeriodCorrection: (periodId: UUID, reason: string) => Promise<void>;
  updateLegalParams: (params: LegalParams) => Promise<void>;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  acceptLegalDeclaration: () => Promise<void>;

  // Sync & Data management
  syncStatus: { isSyncing: boolean; message: string; lastResult?: SyncResult };
  syncNow: () => Promise<SyncResult>;
  testConnection: (url: string, token: string) => Promise<{ success: boolean; message: string }>;
  exportBackup: () => Promise<string>;
  restoreBackup: (jsonStr: string) => Promise<void>;
  clearUserData: () => Promise<void>;
  loadDemoData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Dynamic date state that refreshes when app gains focus or periodically
  const [todayStr, setTodayStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [rateHistory, setRateHistory] = useState<RateHistory[]>([]);
  const [lessonSeries, setLessonSeries] = useState<LessonSeries[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [, setLessonEvents] = useState<LessonEvent[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentAllocations, setPaymentAllocations] = useState<PaymentAllocation[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
  const [legalParams, setLegalParams] = useState<LegalParams[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [reportSnapshots, setReportSnapshots] = useState<ReportSnapshot[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<Settings>({} as Settings);
  const [offlineQueue, setOfflineQueue] = useState<OfflineOperation[]>([]);

  const [syncStatus, setSyncStatus] = useState<{ isSyncing: boolean; message: string; lastResult?: SyncResult }>({
    isSyncing: false,
    message: ''
  });

  // Keep today's date fresh even when iPhone Safari wakes from background
  useEffect(() => {
    const updateDate = () => {
      const d = new Date();
      const current = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setTodayStr(current);
    };

    window.addEventListener('visibilitychange', updateDate);
    window.addEventListener('focus', updateDate);
    const interval = setInterval(updateDate, 60000); // check every minute

    return () => {
      window.removeEventListener('visibilitychange', updateDate);
      window.removeEventListener('focus', updateDate);
      clearInterval(interval);
    };
  }, []);

  const refreshFromIDB = useCallback(async () => {
    const data = await IDBManager.loadInitialState();
    setStudents(data.students);
    setGuardians(data.guardians);
    setRateHistory(data.rate_history);
    setLessonSeries(data.lesson_series);
    setLessons(data.lessons);
    setLessonEvents(data.lesson_events);
    setCharges(data.charges);
    setPayments(data.payments);
    setPaymentAllocations(data.payment_allocations);
    setPackages(data.packages);
    setIncomeEntries(data.income_entries);
    setLegalParams(data.legal_params);
    setPeriods(data.periods);
    setReportSnapshots(data.report_snapshots);
    setAuditLogs(data.audit_logs);
    setSettings(data.settings);
    setOfflineQueue(data.offline_queue);

    if (data.settings.pin_enabled && data.settings.pin_hash) {
      setIsLocked(true);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    refreshFromIDB();
  }, [refreshFromIDB]);

  // Inactivity auto-lock
  useEffect(() => {
    if (!settings.pin_enabled || !settings.auto_lock_min || isLocked) return;

    let timeoutId: number;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setIsLocked(true);
      }, settings.auto_lock_min * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    for (const evt of events) {
      window.addEventListener(evt, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      window.clearTimeout(timeoutId);
      for (const evt of events) {
        window.removeEventListener(evt, resetTimer);
      }
    };
  }, [settings.pin_enabled, settings.auto_lock_min, isLocked]);

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!settings.pin_hash) {
      setIsLocked(false);
      return true;
    }
    const enteredHash = await hashPin(pin);
    if (settings.pin_hash === enteredHash || settings.pin_hash === pin) {
      setIsLocked(false);
      return true;
    }
    return false;
  }, [settings.pin_hash]);

  const setAppPin = useCallback(async (pin: string) => {
    const hashed = await hashPin(pin);
    await updateSettings({ pin_hash: hashed, pin_enabled: true });
  }, []);

  const lockApp = useCallback(() => {
    if (settings.pin_enabled) setIsLocked(true);
  }, [settings.pin_enabled]);

  const commitChange = useCallback(async (table: string, action: 'insert' | 'update' | 'delete', record: any) => {
    if (action === 'delete') {
      await IDBManager.delete(table, record.id || record);
    } else {
      await IDBManager.put(table, record);
    }
    await IDBManager.queueOperation(table, action, record);
    const db = await IDBManager.getDB();
    const q = await IDBManager.getAll<OfflineOperation>(db, 'offline_queue');
    setOfflineQueue(q);
  }, []);

  // Helper to assert whether a date falls in a closed period
  const assertNotClosedPeriod = useCallback((dateStr: string) => {
    const d = dateStr.slice(0, 10);
    for (const p of periods) {
      if (p.status === 'closed' && d >= p.date_from && d <= p.date_to) {
        throw new Error(`Data ${d} należy do zamkniętego okresu (${p.date_from} do ${p.date_to}). Zmiana jest zablokowana.`);
      }
    }
  }, [periods]);

  // Dynamic selection of legal params for the current year (Point 3 fix)
  const currentYear = useMemo(() => Number(todayStr.slice(0, 4)), [todayStr]);
  const activeLegalParam = useMemo(() => {
    return legalParams.find(p => p.year === currentYear) || legalParams[0] || {
      id: 'default',
      year: currentYear,
      min_wage: 480600,
      factor_pct: 225,
      frequency: 'quarter',
      valid_from: `${currentYear}-01-01`,
      calculated_limit: 1081350,
      version: 1,
      created_at: '',
      updated_at: ''
    };
  }, [legalParams, currentYear]);

  const limitStatus = useMemo(() => {
    return calculateQuarterLimitStatus(
      todayStr,
      charges,
      activeLegalParam,
      lessons,
      settings.warning_thresholds || [70, 85, 95, 100]
    );
  }, [todayStr, charges, activeLegalParam, lessons, settings.warning_thresholds]);

  const unconfirmedLessons = useMemo(() => {
    return lessons.filter(l => {
      const isPast = l.start_at.slice(0, 10) < todayStr;
      return l.status === 'needs_confirmation' || (isPast && l.status === 'planned');
    });
  }, [lessons, todayStr]);

  /**
   * Generates next strictly sequential income number RRRR/NNN (Point 4 fix)
   */
  const getNextIncomeNumber = useCallback((year: number) => {
    const prefix = `${year}/`;
    const numbers = incomeEntries
      .filter(e => e.number.startsWith(prefix))
      .map(e => parseInt(e.number.split('/')[1], 10))
      .filter(n => !isNaN(n));

    const nextVal = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
    return `${year}/${String(nextVal).padStart(3, '0')}`;
  }, [incomeEntries]);

  /**
   * POINT 1 & 2 FIX:
   * Marking a lesson as 'completed' (from start swipe, calendar, or modal)
   * GUARANTEES that a Charge and an IncomeEntry (unpaid) are created!
   * Payment is NOT automatically recorded unless explicitly requested.
   */
  const markLessonCompleted = useCallback(async (lessonId: UUID) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    assertNotClosedPeriod(lesson.start_at);

    const nowIso = new Date().toISOString();
    const lessonDate = lesson.start_at.slice(0, 10);

    // 1. Update lesson status
    const updatedLesson: Lesson = {
      ...lesson,
      status: 'completed',
      version: lesson.version + 1,
      updated_at: nowIso
    };
    await commitChange('lessons', 'update', updatedLesson);
    setLessons(prev => prev.map(l => l.id === lessonId ? updatedLesson : l));

    // 2. Create Charge if not already existing
    const existingCharge = charges.find(c => c.lesson_id === lesson.id && c.amount > 0);

    if (!existingCharge) {
      const newCharge: Charge = {
        id: generateUUID(),
        student_id: lesson.student_id,
        lesson_id: lesson.id,
        amount: lesson.price_snapshot,
        accrual_date: lessonDate,
        charge_type: 'lesson',
        description: `Lekcja: ${lesson.subject}`,
        version: 1,
        created_at: nowIso,
        updated_at: nowIso
      };
      await commitChange('charges', 'insert', newCharge);
      setCharges(prev => [...prev, newCharge]);
    }

    // 3. Create IncomeEntry as 'unpaid' if not existing
    const existingIncome = incomeEntries.find(e => e.service_date === lessonDate && e.student_id === lesson.student_id);
    if (!existingIncome) {
      const year = Number(lessonDate.slice(0, 4));
      const formattedNum = getNextIncomeNumber(year);

      const newIncome: IncomeEntry = {
        id: generateUUID(),
        number: formattedNum,
        service_date: lessonDate,
        accrual_date: lessonDate,
        student_id: lesson.student_id,
        service_type: lesson.subject || 'Lekcja matematyki',
        amount_due: lesson.price_snapshot,
        amount_received: 0,
        method: 'blik',
        status: 'unpaid',
        version: 1,
        created_at: nowIso,
        updated_at: nowIso
      };
      await commitChange('income_entries', 'insert', newIncome);
      setIncomeEntries(prev => [...prev, newIncome]);
    }
  }, [lessons, charges, incomeEntries, assertNotClosedPeriod, commitChange, getNextIncomeNumber]);

  /**
   * POINT 2 FIX:
   * Recording payment for a completed lesson as a clear, separate action.
   */
  const recordLessonPayment = useCallback(async (lessonId: UUID, method: PaymentMethod = 'blik') => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    const nowIso = new Date().toISOString();
    const dateToday = todayStr;
    const lessonDate = lesson.start_at.slice(0, 10);

    // Ensure lesson is completed and charge exists
    if (lesson.status !== 'completed') {
      await markLessonCompleted(lessonId);
    }

    const targetCharge = charges.find(c => c.lesson_id === lesson.id && c.amount > 0);

    // Create Payment
    const newPayment: Payment = {
      id: generateUUID(),
      student_id: lesson.student_id,
      amount: lesson.price_snapshot,
      received_date: dateToday,
      method,
      description: `Płatność ${method.toUpperCase()} za lekcję z ${lessonDate}`,
      payment_type: 'wplata',
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };
    await commitChange('payments', 'insert', newPayment);
    setPayments(prev => [...prev, newPayment]);

    // Create Allocation
    if (targetCharge) {
      const newAlloc: PaymentAllocation = {
        id: generateUUID(),
        payment_id: newPayment.id,
        charge_id: targetCharge.id,
        amount: lesson.price_snapshot,
        version: 1,
        created_at: nowIso,
        updated_at: nowIso
      };
      await commitChange('payment_allocations', 'insert', newAlloc);
      setPaymentAllocations(prev => [...prev, newAlloc]);
    }

    // Update income entry
    const entry = incomeEntries.find(e => e.service_date === lessonDate && e.student_id === lesson.student_id);
    if (entry) {
      const updatedEntry: IncomeEntry = {
        ...entry,
        received_date: dateToday,
        amount_received: lesson.price_snapshot,
        method,
        status: 'paid',
        version: entry.version + 1,
        updated_at: nowIso
      };
      await commitChange('income_entries', 'update', updatedEntry);
      setIncomeEntries(prev => prev.map(e => e.id === entry.id ? updatedEntry : e));
    }
  }, [lessons, charges, incomeEntries, todayStr, markLessonCompleted, commitChange]);

  const updateLessonStatus = useCallback(async (lessonId: UUID, status: Lesson['status'], note?: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    assertNotClosedPeriod(lesson.start_at);

    if (status === 'completed') {
      await markLessonCompleted(lessonId);
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedLesson: Lesson = {
      ...lesson,
      status,
      notes: note ? `${lesson.notes ? lesson.notes + '\n' : ''}${note}` : lesson.notes,
      version: lesson.version + 1,
      updated_at: nowIso
    };

    await commitChange('lessons', 'update', updatedLesson);
    setLessons(prev => prev.map(l => l.id === lessonId ? updatedLesson : l));

    // Handle cancellation fee if applicable
    if (status === 'cancelled_student' || status === 'no_show') {
      const assessment = assessCancellation(lesson, nowIso, DEFAULT_CANCEL_POLICY, status === 'no_show');
      if (!assessment.isFree && assessment.feeGrosze > 0) {
        const cancelCharge: Charge = {
          id: generateUUID(),
          student_id: lesson.student_id,
          lesson_id: lesson.id,
          amount: assessment.feeGrosze,
          accrual_date: lesson.start_at.slice(0, 10),
          charge_type: 'paid_cancellation',
          description: assessment.reason,
          version: 1,
          created_at: nowIso,
          updated_at: nowIso
        };
        await commitChange('charges', 'insert', cancelCharge);
        setCharges(prev => [...prev, cancelCharge]);
      }
    }
  }, [lessons, markLessonCompleted, assertNotClosedPeriod, commitChange]);

  const rescheduleLesson = useCallback(async (lessonId: UUID, newStartIso: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    assertNotClosedPeriod(lesson.start_at);
    assertNotClosedPeriod(newStartIso);

    const nowIso = new Date().toISOString();
    const updatedLesson: Lesson = {
      ...lesson,
      start_at: newStartIso,
      moved_from_lesson_id: lesson.moved_from_lesson_id || lesson.id,
      version: lesson.version + 1,
      updated_at: nowIso
    };

    const event: LessonEvent = {
      id: generateUUID(),
      lesson_id: lesson.id,
      event_type: 'rescheduled',
      old_val: lesson.start_at,
      new_val: newStartIso,
      timestamp: nowIso,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };

    await commitChange('lessons', 'update', updatedLesson);
    await commitChange('lesson_events', 'insert', event);

    setLessons(prev => prev.map(l => l.id === lessonId ? updatedLesson : l));
    setLessonEvents(prev => [...prev, event]);
  }, [lessons, assertNotClosedPeriod, commitChange]);

  const createLesson = useCallback(async (lessonData: Partial<Lesson>): Promise<Lesson> => {
    const startAt = lessonData.start_at || `${todayStr}T16:00:00`;
    assertNotClosedPeriod(startAt);

    const student = students.find(s => s.id === lessonData.student_id);
    const nowIso = new Date().toISOString();
    const newLesson: Lesson = {
      id: generateUUID(),
      student_id: lessonData.student_id || '',
      series_id: lessonData.series_id,
      start_at: startAt,
      duration_min: lessonData.duration_min || student?.default_duration_min || 60,
      status: lessonData.status || 'planned',
      price_snapshot: lessonData.price_snapshot ?? (student?.default_rate || 7000),
      subject: lessonData.subject || student?.subject || 'Matematyka',
      location: lessonData.location || 'student_home',
      notes: lessonData.notes || '',
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };

    await commitChange('lessons', 'insert', newLesson);
    setLessons(prev => [...prev, newLesson]);

    if (newLesson.status === 'completed') {
      await markLessonCompleted(newLesson.id);
    }

    return newLesson;
  }, [students, todayStr, assertNotClosedPeriod, markLessonCompleted, commitChange]);

  const createStudent = useCallback(async (studentData: Partial<Student>, guardianData?: Partial<Guardian>): Promise<Student> => {
    const nowIso = new Date().toISOString();
    const studentId = generateUUID();
    const newStudent: Student = {
      id: studentId,
      first_name: studentData.first_name || '',
      last_name: studentData.last_name || '',
      phone: studentData.phone || '',
      email: studentData.email,
      grade_level: studentData.grade_level || 'Klasa 8',
      subject: studentData.subject || 'Matematyka',
      default_rate: studentData.default_rate || 7000,
      default_duration_min: studentData.default_duration_min || 60,
      preferred_slots: studentData.preferred_slots || '',
      start_date: studentData.start_date || todayStr,
      status: 'active',
      notes: studentData.notes || '',
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };

    await commitChange('students', 'insert', newStudent);
    setStudents(prev => [...prev, newStudent]);

    const rh: RateHistory = {
      id: generateUUID(),
      student_id: studentId,
      rate: newStudent.default_rate,
      valid_from: newStudent.start_date,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };
    await commitChange('rate_history', 'insert', rh);
    setRateHistory(prev => [...prev, rh]);

    if (guardianData && guardianData.full_name) {
      const newGuardian: Guardian = {
        id: generateUUID(),
        student_id: studentId,
        full_name: guardianData.full_name,
        phone: guardianData.phone || '',
        email: guardianData.email,
        role: guardianData.role || 'Rodzic',
        is_payer: guardianData.is_payer ?? true,
        version: 1,
        created_at: nowIso,
        updated_at: nowIso
      };
      await commitChange('guardians', 'insert', newGuardian);
      setGuardians(prev => [...prev, newGuardian]);
    }

    return newStudent;
  }, [todayStr, commitChange]);

  const updateStudent = useCallback(async (student: Student) => {
    const nowIso = new Date().toISOString();
    const updated = { ...student, version: student.version + 1, updated_at: nowIso };
    await commitChange('students', 'update', updated);
    setStudents(prev => prev.map(s => s.id === student.id ? updated : s));
  }, [commitChange]);

  const anonymizeStudent = useCallback(async (studentId: UUID) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const nowIso = new Date().toISOString();
    const anonymized: Student = {
      ...student,
      first_name: 'Uczeń',
      last_name: `[Anonimizacja ${studentId.slice(-4)}]`,
      phone: '',
      email: undefined,
      notes: 'Dane osobowe zanonimizowane zgodnie z art. 17 RODO.',
      status: 'archived',
      version: student.version + 1,
      updated_at: nowIso
    };

    await commitChange('students', 'update', anonymized);
    setStudents(prev => prev.map(s => s.id === studentId ? anonymized : s));

    const studentGuardians = guardians.filter(g => g.student_id === studentId);
    for (const g of studentGuardians) {
      await commitChange('guardians', 'delete', g);
    }
    setGuardians(prev => prev.filter(g => g.student_id !== studentId));
  }, [students, guardians, commitChange]);

  const recordPayment = useCallback(async (paymentData: Partial<Payment>, autoAllocate = true): Promise<Payment> => {
    const receivedDate = paymentData.received_date || todayStr;
    assertNotClosedPeriod(receivedDate);

    const nowIso = new Date().toISOString();
    const newPayment: Payment = {
      id: generateUUID(),
      student_id: paymentData.student_id || '',
      amount: paymentData.amount || 0,
      received_date: receivedDate,
      method: paymentData.method || 'blik',
      description: paymentData.description || 'Wpłata',
      payment_type: paymentData.payment_type || 'wplata',
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };

    await commitChange('payments', 'insert', newPayment);
    setPayments(prev => [...prev, newPayment]);

    if (autoAllocate && newPayment.student_id) {
      const studentCharges = charges.filter(c => c.student_id === newPayment.student_id);
      const studentAllocs = paymentAllocations.filter(a => {
        const c = charges.find(ch => ch.id === a.charge_id);
        return c?.student_id === newPayment.student_id;
      });

      const proposed = proposeFifoAllocation(newPayment.amount, studentCharges, studentAllocs);
      for (const item of proposed.allocations) {
        const alloc: PaymentAllocation = {
          id: generateUUID(),
          payment_id: newPayment.id,
          charge_id: item.chargeId,
          amount: item.amount,
          version: 1,
          created_at: nowIso,
          updated_at: nowIso
        };
        await commitChange('payment_allocations', 'insert', alloc);
        setPaymentAllocations(prev => [...prev, alloc]);
      }
    }

    return newPayment;
  }, [todayStr, assertNotClosedPeriod, charges, paymentAllocations, commitChange]);

  const closePeriod = useCallback(async (periodId: UUID) => {
    if (offlineQueue.length > 0) {
      throw new Error('Zamknięcie okresu jest zablokowane: kolejka offline zawiera oczekujące zmiany. Połącz się z siecią i zsynchronizuj dane.');
    }

    const period = periods.find(p => p.id === periodId);
    if (!period) return;

    const nowIso = new Date().toISOString();
    const updatedPeriod: Period = {
      ...period,
      status: 'closed',
      closed_at: nowIso,
      version: period.version + 1,
      updated_at: nowIso
    };

    const reportData = buildMonthlyReport(
      period,
      lessons,
      charges,
      payments,
      paymentAllocations,
      students,
      legalParams
    );

    const snapshot = createSnapshotRecord(period.id, reportData, reportSnapshots);

    await commitChange('periods', 'update', updatedPeriod);
    await commitChange('report_snapshots', 'insert', snapshot);

    setPeriods(prev => prev.map(p => p.id === periodId ? updatedPeriod : p));
    setReportSnapshots(prev => [...prev, snapshot]);
  }, [offlineQueue.length, periods, lessons, charges, payments, paymentAllocations, students, legalParams, reportSnapshots, commitChange]);

  const reopenPeriodCorrection = useCallback(async (periodId: UUID, reason: string) => {
    const period = periods.find(p => p.id === periodId);
    if (!period) return;

    const reportData = buildMonthlyReport(
      period,
      lessons,
      charges,
      payments,
      paymentAllocations,
      students,
      legalParams
    );

    const newSnapshot = createSnapshotRecord(period.id, reportData, reportSnapshots, reason);
    await commitChange('report_snapshots', 'insert', newSnapshot);
    setReportSnapshots(prev => [...prev, newSnapshot]);
  }, [periods, lessons, charges, payments, paymentAllocations, students, legalParams, reportSnapshots, commitChange]);

  const updateLegalParams = useCallback(async (params: LegalParams) => {
    const nowIso = new Date().toISOString();
    const updated = { ...params, version: params.version + 1, updated_at: nowIso };
    await commitChange('legal_params', 'update', updated);
    setLegalParams(prev => prev.map(p => p.id === params.id ? updated : p));
  }, [commitChange]);

  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const nowIso = new Date().toISOString();
    const updated: Settings = {
      ...settings,
      ...newSettings,
      version: (settings.version || 1) + 1,
      updated_at: nowIso
    };
    await commitChange('settings', 'update', updated);
    setSettings(updated);
  }, [settings, commitChange]);

  const acceptLegalDeclaration = useCallback(async () => {
    const nowIso = new Date().toISOString();
    await updateSettings({ legal_declaration_accepted_at: nowIso });
  }, [updateSettings]);

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    setSyncStatus({ isSyncing: true, message: 'Synchronizacja w toku...' });
    try {
      const res = await syncWithGas(settings, (msg) => {
        setSyncStatus(s => ({ ...s, message: msg }));
      });
      setSyncStatus({ isSyncing: false, message: res.message, lastResult: res });
      await refreshFromIDB();
      return res;
    } catch (err: any) {
      const errRes: SyncResult = {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        message: 'Błąd synchronizacji',
        error: err.message
      };
      setSyncStatus({ isSyncing: false, message: err.message, lastResult: errRes });
      return errRes;
    }
  }, [settings, refreshFromIDB]);

  const testConnection = useCallback(async (url: string, token: string) => {
    return await testGasConnection(url, token);
  }, []);

  const exportBackup = useCallback(async () => {
    return await IDBManager.exportBackupJSON();
  }, []);

  const restoreBackup = useCallback(async (jsonStr: string) => {
    await IDBManager.restoreFromJSON(jsonStr);
    await refreshFromIDB();
  }, [refreshFromIDB]);

  const clearUserData = useCallback(async () => {
    await IDBManager.clearAllUserData();
    await refreshFromIDB();
  }, [refreshFromIDB]);

  const loadDemoData = useCallback(async () => {
    const db = await IDBManager.getDB();
    await IDBManager.clearAllUserData();
    await IDBManager.seedDemoData(db);
    await refreshFromIDB();
  }, [refreshFromIDB]);

  const value = useMemo(() => ({
    isReady,
    isLocked,
    unlockWithPin,
    lockApp,
    setAppPin,
    students,
    guardians,
    rateHistory,
    lessonSeries,
    lessons,
    charges,
    payments,
    paymentAllocations,
    packages,
    incomeEntries,
    legalParams,
    periods,
    reportSnapshots,
    auditLogs,
    settings,
    offlineQueue,
    todayStr,
    activeLegalParam,
    limitStatus,
    unconfirmedLessons,
    offlineQueueCount: offlineQueue.length,
    markLessonCompleted,
    recordLessonPayment,
    updateLessonStatus,
    rescheduleLesson,
    createLesson,
    createStudent,
    updateStudent,
    anonymizeStudent,
    recordPayment,
    closePeriod,
    reopenPeriodCorrection,
    updateLegalParams,
    updateSettings,
    acceptLegalDeclaration,
    syncStatus,
    syncNow,
    testConnection,
    exportBackup,
    restoreBackup,
    clearUserData,
    loadDemoData
  }), [
    isReady,
    isLocked,
    unlockWithPin,
    lockApp,
    setAppPin,
    students,
    guardians,
    rateHistory,
    lessonSeries,
    lessons,
    charges,
    payments,
    paymentAllocations,
    packages,
    incomeEntries,
    legalParams,
    periods,
    reportSnapshots,
    auditLogs,
    settings,
    offlineQueue,
    todayStr,
    activeLegalParam,
    limitStatus,
    unconfirmedLessons,
    markLessonCompleted,
    recordLessonPayment,
    updateLessonStatus,
    rescheduleLesson,
    createLesson,
    createStudent,
    updateStudent,
    anonymizeStudent,
    recordPayment,
    closePeriod,
    reopenPeriodCorrection,
    updateLegalParams,
    updateSettings,
    acceptLegalDeclaration,
    syncStatus,
    syncNow,
    testConnection,
    exportBackup,
    restoreBackup,
    clearUserData,
    loadDemoData
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

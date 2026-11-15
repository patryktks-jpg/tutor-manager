import {
  Student,
  Guardian,
  RateHistory,
  LessonSeries,
  Lesson,
  Charge,
  Payment,
  PaymentAllocation,
  IncomeEntry,
  LegalParams,
  Period,
  Settings,
  CancelPolicy
} from '../domain/types';

export const INITIAL_LEGAL_PARAMS_2026: LegalParams = {
  id: 'legal-2026',
  year: 2026,
  min_wage: 480600, // 4 806 zł
  factor_pct: 225,
  frequency: 'quarter',
  valid_from: '2026-01-01',
  calculated_limit: 1081350, // 10 813,50 zł
  note: 'Limit kwartalny 2026: 225% minimalnego wynagrodzenia (4 806 zł)',
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
};

export const INITIAL_SETTINGS: Settings = {
  id: 'settings-default',
  tutor_name: 'Marek Wiśniewski',
  default_rate: 7000, // 70 zł
  default_duration_min: 60,
  default_payment_method: 'blik',
  work_hours_start: '08:00',
  work_hours_end: '21:00',
  work_days: [1, 2, 3, 4, 5, 6],
  breaks_min: 15,
  pin_hash: '1234', // default test PIN
  pin_enabled: false,
  biometrics_enabled: false,
  auto_lock_min: 5,
  legal_declaration_accepted_at: '2026-01-01T10:00:00Z',
  warning_thresholds: [70, 85, 95, 100],
  gas_web_app_url: '',
  gas_secret_token: '',
  last_sync_at: undefined,
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
};

export const INITIAL_CANCEL_POLICY: CancelPolicy = {
  id: 'pol-standard',
  name: 'Standardowa (24h bezpłatnie, 100% po terminie)',
  free_cancel_hours: 24,
  late_cancel_fee_pct: 100,
  no_show_fee_pct: 100
};

export const INITIAL_STUDENTS: Student[] = [
  {
    id: 's-1',
    first_name: 'Zofia',
    last_name: 'Kowalska',
    phone: '+48 601 234 567',
    email: 'zofia.kowalska@example.com',
    grade_level: 'Klasa 8 (Egzamin ósmoklasisty)',
    subject: 'Matematyka',
    default_rate: 7000, // 70.00 zł
    default_duration_min: 60,
    preferred_slots: 'Poniedziałek 16:00',
    start_date: '2026-09-01',
    status: 'active',
    notes: 'Przygotowanie do egzaminu, powtórka z geometrii i równań.',
    version: 1,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 's-2',
    first_name: 'Michał',
    last_name: 'Nowak',
    phone: '+48 502 987 654',
    email: 'michal.nowak@example.com',
    grade_level: 'Liceum 4 (Matura rozszerzona)',
    subject: 'Matematyka',
    default_rate: 8000, // 80.00 zł
    default_duration_min: 60,
    preferred_slots: 'Wtorek 17:00, Czwartek 17:00',
    start_date: '2026-09-05',
    status: 'active',
    notes: 'Rachunek różniczkowy, prawdopodobieństwo, arkusze CKE.',
    version: 1,
    created_at: '2026-09-05T10:00:00Z',
    updated_at: '2026-09-05T10:00:00Z'
  },
  {
    id: 's-3',
    first_name: 'Adam',
    last_name: 'Wiśniewski',
    phone: '+48 733 112 233',
    email: 'adam.w@example.com',
    grade_level: 'Klasa 7 SP',
    subject: 'Matematyka',
    default_rate: 7000,
    default_duration_min: 60,
    preferred_slots: 'Środa 16:30',
    start_date: '2026-10-01',
    status: 'active',
    notes: 'Potrzebuje pomocy z ułamkami i algebrą.',
    version: 1,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z'
  },
  {
    id: 's-4',
    first_name: 'Aleksandra',
    last_name: 'Lewandowska',
    phone: '+48 699 445 566',
    email: 'ola.lewandowska@example.com',
    grade_level: 'Liceum 2',
    subject: 'Matematyka',
    default_rate: 7500, // 75.00 zł
    default_duration_min: 60,
    preferred_slots: 'Piątek 15:30',
    start_date: '2026-09-10',
    status: 'active',
    notes: 'Funkcja kwadratowa, trygonometria.',
    version: 1,
    created_at: '2026-09-10T10:00:00Z',
    updated_at: '2026-09-10T10:00:00Z'
  }
];

export const INITIAL_GUARDIANS: Guardian[] = [
  {
    id: 'g-1',
    student_id: 's-1',
    full_name: 'Anna Kowalska (Mama)',
    phone: '+48 601 234 500',
    email: 'anna.kowalska@example.com',
    role: 'Mama',
    is_payer: true,
    version: 1,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'g-2',
    student_id: 's-2',
    full_name: 'Piotr Nowak (Tata)',
    phone: '+48 502 987 600',
    email: 'piotr.nowak@example.com',
    role: 'Tata',
    is_payer: true,
    version: 1,
    created_at: '2026-09-05T10:00:00Z',
    updated_at: '2026-09-05T10:00:00Z'
  },
  {
    id: 'g-3',
    student_id: 's-3',
    full_name: 'Katarzyna Wiśniewska (Mama)',
    phone: '+48 733 112 200',
    email: 'katarzyna.w@example.com',
    role: 'Mama',
    is_payer: true,
    version: 1,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z'
  }
];

export const INITIAL_RATE_HISTORY: RateHistory[] = [
  { id: 'rh-1', student_id: 's-1', rate: 7000, valid_from: '2026-09-01', version: 1, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
  { id: 'rh-2', student_id: 's-2', rate: 8000, valid_from: '2026-09-05', version: 1, created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-05T10:00:00Z' },
  { id: 'rh-3', student_id: 's-3', rate: 7000, valid_from: '2026-10-01', version: 1, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
  { id: 'rh-4', student_id: 's-4', rate: 7500, valid_from: '2026-09-10', version: 1, created_at: '2026-09-10T10:00:00Z', updated_at: '2026-09-10T10:00:00Z' }
];

export const INITIAL_SERIES: LessonSeries[] = [
  {
    id: 'ser-1',
    student_id: 's-1',
    day_of_week: 1, // Poniedziałek
    start_time: '16:00',
    duration_min: 60,
    from_date: '2026-10-01',
    to_date: '2026-12-31',
    exceptions: [],
    version: 1,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z'
  },
  {
    id: 'ser-2',
    student_id: 's-2',
    day_of_week: 2, // Wtorek
    start_time: '17:00',
    duration_min: 60,
    from_date: '2026-10-01',
    to_date: '2026-12-31',
    exceptions: [],
    version: 1,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z'
  }
];

// Sample lessons for today (2026-11-16 / 2026-11-15) and recent weeks
export const INITIAL_LESSONS: Lesson[] = [
  // Today's lessons
  {
    id: 'les-today-1',
    student_id: 's-1',
    series_id: 'ser-1',
    start_at: '2026-11-16T16:00:00',
    duration_min: 60,
    status: 'planned',
    price_snapshot: 7000,
    subject: 'Matematyka - Funkcje liniowe',
    location: 'online',
    notes: 'Zadania ze zbioru str. 45-48',
    version: 1,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z'
  },
  {
    id: 'les-today-2',
    student_id: 's-2',
    series_id: 'ser-2',
    start_at: '2026-11-16T17:30:00',
    duration_min: 60,
    status: 'planned',
    price_snapshot: 8000,
    subject: 'Matematyka - Pochodne i ekstrema',
    location: 'tutor_home',
    notes: 'Arkusze maturalne',
    version: 1,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z'
  },
  // Needs confirmation banner lesson (yesterday's lesson left unconfirmed)
  {
    id: 'les-unconfirmed',
    student_id: 's-3',
    start_at: '2026-11-14T15:00:00',
    duration_min: 60,
    status: 'needs_confirmation',
    price_snapshot: 7000,
    subject: 'Matematyka - Ułamki zwykłe',
    location: 'online',
    notes: 'Wymaga potwierdzenia po lekcji',
    version: 1,
    created_at: '2026-11-07T10:00:00Z',
    updated_at: '2026-11-07T10:00:00Z'
  },
  // Past lessons in Q4
  {
    id: 'les-past-1',
    student_id: 's-1',
    start_at: '2026-11-09T16:00:00',
    duration_min: 60,
    status: 'completed',
    price_snapshot: 7000,
    subject: 'Matematyka',
    location: 'online',
    notes: 'Zrealizowana',
    version: 1,
    created_at: '2026-11-09T17:00:00Z',
    updated_at: '2026-11-09T17:00:00Z'
  },
  {
    id: 'les-past-2',
    student_id: 's-2',
    start_at: '2026-11-10T17:00:00',
    duration_min: 60,
    status: 'completed',
    price_snapshot: 8000,
    subject: 'Matematyka',
    location: 'tutor_home',
    notes: 'Zrealizowana',
    version: 1,
    created_at: '2026-11-10T18:00:00Z',
    updated_at: '2026-11-10T18:00:00Z'
  },
  {
    id: 'les-past-3',
    student_id: 's-4',
    start_at: '2026-11-06T15:30:00',
    duration_min: 60,
    status: 'completed',
    price_snapshot: 7500,
    subject: 'Matematyka',
    location: 'student_home',
    notes: 'Zrealizowana',
    version: 1,
    created_at: '2026-11-06T16:30:00Z',
    updated_at: '2026-11-06T16:30:00Z'
  }
];

export const INITIAL_CHARGES: Charge[] = [
  {
    id: 'ch-1',
    student_id: 's-1',
    lesson_id: 'les-past-1',
    amount: 7000,
    accrual_date: '2026-11-09',
    charge_type: 'lesson',
    version: 1,
    created_at: '2026-11-09T17:00:00Z',
    updated_at: '2026-11-09T17:00:00Z'
  },
  {
    id: 'ch-2',
    student_id: 's-2',
    lesson_id: 'les-past-2',
    amount: 8000,
    accrual_date: '2026-11-10',
    charge_type: 'lesson',
    version: 1,
    created_at: '2026-11-10T18:00:00Z',
    updated_at: '2026-11-10T18:00:00Z'
  },
  {
    id: 'ch-3',
    student_id: 's-4',
    lesson_id: 'les-past-3',
    amount: 7500,
    accrual_date: '2026-11-06',
    charge_type: 'lesson',
    version: 1,
    created_at: '2026-11-06T16:30:00Z',
    updated_at: '2026-11-06T16:30:00Z'
  },
  // October Q4 charges representing realistic progress towards quarterly limit (~7 500 zł)
  {
    id: 'ch-oct-bulk',
    student_id: 's-1',
    amount: 720000, // 7 200 zł in October
    accrual_date: '2026-10-25',
    charge_type: 'lesson',
    description: 'Lekcje zrealizowane w październiku (zbiorcze)',
    version: 1,
    created_at: '2026-10-31T20:00:00Z',
    updated_at: '2026-10-31T20:00:00Z'
  }
];

export const INITIAL_PAYMENTS: Payment[] = [
  {
    id: 'pay-1',
    student_id: 's-1',
    amount: 7000,
    received_date: '2026-11-09',
    method: 'blik',
    description: 'BLIK od Anny Kowalskiej po lekcji',
    payment_type: 'wplata',
    version: 1,
    created_at: '2026-11-09T17:05:00Z',
    updated_at: '2026-11-09T17:05:00Z'
  },
  {
    id: 'pay-2',
    student_id: 's-4',
    amount: 7500,
    received_date: '2026-11-06',
    method: 'przelew',
    description: 'Przelew tradycyjny',
    payment_type: 'wplata',
    version: 1,
    created_at: '2026-11-06T19:00:00Z',
    updated_at: '2026-11-06T19:00:00Z'
  },
  {
    id: 'pay-oct-bulk',
    student_id: 's-1',
    amount: 720000,
    received_date: '2026-10-28',
    method: 'przelew',
    description: 'Wpłaty za październik',
    payment_type: 'wplata',
    version: 1,
    created_at: '2026-10-31T20:00:00Z',
    updated_at: '2026-10-31T20:00:00Z'
  }
];

export const INITIAL_ALLOCATIONS: PaymentAllocation[] = [
  { id: 'al-1', payment_id: 'pay-1', charge_id: 'ch-1', amount: 7000, version: 1, created_at: '2026-11-09T17:05:00Z', updated_at: '2026-11-09T17:05:00Z' },
  { id: 'al-2', payment_id: 'pay-2', charge_id: 'ch-3', amount: 7500, version: 1, created_at: '2026-11-06T19:00:00Z', updated_at: '2026-11-06T19:00:00Z' },
  { id: 'al-oct', payment_id: 'pay-oct-bulk', charge_id: 'ch-oct-bulk', amount: 720000, version: 1, created_at: '2026-10-31T20:00:00Z', updated_at: '2026-10-31T20:00:00Z' }
];

export const INITIAL_INCOME_ENTRIES: IncomeEntry[] = [
  {
    id: 'inc-1',
    number: '2026/001',
    service_date: '2026-10-25',
    accrual_date: '2026-10-25',
    received_date: '2026-10-28',
    student_id: 's-1',
    service_type: 'Korepetycje z matematyki',
    amount_due: 720000,
    amount_received: 720000,
    method: 'przelew',
    status: 'paid',
    version: 1,
    created_at: '2026-10-31T20:00:00Z',
    updated_at: '2026-10-31T20:00:00Z'
  },
  {
    id: 'inc-2',
    number: '2026/002',
    service_date: '2026-11-06',
    accrual_date: '2026-11-06',
    received_date: '2026-11-06',
    student_id: 's-4',
    service_type: 'Korepetycje z matematyki',
    amount_due: 7500,
    amount_received: 7500,
    method: 'przelew',
    status: 'paid',
    version: 1,
    created_at: '2026-11-06T19:00:00Z',
    updated_at: '2026-11-06T19:00:00Z'
  },
  {
    id: 'inc-3',
    number: '2026/003',
    service_date: '2026-11-09',
    accrual_date: '2026-11-09',
    received_date: '2026-11-09',
    student_id: 's-1',
    service_type: 'Korepetycje z matematyki',
    amount_due: 7000,
    amount_received: 7000,
    method: 'blik',
    status: 'paid',
    version: 1,
    created_at: '2026-11-09T17:05:00Z',
    updated_at: '2026-11-09T17:05:00Z'
  },
  {
    id: 'inc-4',
    number: '2026/004',
    service_date: '2026-11-10',
    accrual_date: '2026-11-10',
    student_id: 's-2',
    service_type: 'Korepetycje z matematyki',
    amount_due: 8000,
    amount_received: 0,
    method: 'blik',
    status: 'unpaid',
    version: 1,
    created_at: '2026-11-10T18:00:00Z',
    updated_at: '2026-11-10T18:00:00Z'
  }
];

export const INITIAL_PERIODS: Period[] = [
  {
    id: 'per-2026-10',
    period_type: 'month',
    date_from: '2026-10-01',
    date_to: '2026-10-31',
    status: 'closed',
    closed_at: '2026-11-01T09:00:00Z',
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-11-01T09:00:00Z'
  },
  {
    id: 'per-2026-11',
    period_type: 'month',
    date_from: '2026-11-01',
    date_to: '2026-11-30',
    status: 'open',
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  }
];

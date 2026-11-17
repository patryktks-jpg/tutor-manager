export type UUID = string;

export type LessonStatus =
  | 'planned'               // zaplanowana
  | 'completed'             // zrealizowana
  | 'cancelled_student'     // odwołana przez ucznia
  | 'cancelled_tutor'       // odwołana przez korepetytora
  | 'no_show'               // nieobecność ucznia
  | 'needs_confirmation';   // oczekuje na potwierdzenie

export type PaymentMethod = 'gotowka' | 'przelew' | 'blik' | 'inna';

export type ChargeType = 'lesson' | 'package' | 'paid_cancellation' | 'correction';

export type PaymentType = 'wplata' | 'zwrot';

export type LessonLocation = 'student_home' | 'online' | 'tutor_home';

export type StudentStatus = 'active' | 'paused' | 'archived';

export interface CancelPolicy {
  id: UUID;
  name: string;
  free_cancel_hours: number;     // e.g. 24h
  late_cancel_fee_pct: number;   // e.g. 100% or 50%
  no_show_fee_pct: number;       // e.g. 100%
}

export interface Student {
  id: UUID;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  grade_level: string;           // klasa / poziom (np. "Klasa 8", "Liceum 4 - rozszerzenie")
  subject: string;               // przedmiot (np. "Matematyka")
  default_rate: number;          // in grosze (e.g. 7000 = 70.00 zł)
  default_duration_min: number;  // e.g. 60
  preferred_slots: string;       // e.g. "Pon 16:00, Śr 17:00"
  start_date: string;            // yyyy-MM-dd
  status: StudentStatus;
  notes: string;
  birth_day?: number;            // dzień urodzin (1-31)
  birth_month?: number;          // miesiąc urodzin (1-12)
  cancel_policy_id?: UUID;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Guardian {
  id: UUID;
  student_id: UUID;
  full_name: string;
  phone: string;
  email?: string;
  role: string;                  // Mama, Tata, Opiekun prawny
  is_payer: boolean;             // Czy opłaca lekcje
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RateHistory {
  id: UUID;
  student_id: UUID;
  rate: number;                  // in grosze
  valid_from: string;            // yyyy-MM-dd
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LessonSeries {
  id: UUID;
  student_id: UUID;
  day_of_week: number;           // 0 = Niedziela, 1 = Poniedziałek, ... 6 = Sobota
  start_time: string;            // HH:mm (e.g. "16:00")
  duration_min: number;          // e.g. 60
  from_date: string;             // yyyy-MM-dd
  to_date?: string;              // yyyy-MM-dd
  exceptions: string[];          // list of yyyy-MM-dd
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: UUID;
  student_id: UUID;
  series_id?: UUID;
  start_at: string;              // ISO string (e.g. "2026-11-16T16:00:00")
  duration_min: number;          // e.g. 60
  status: LessonStatus;
  price_snapshot: number;        // in grosze (frozen from rate_history at creation)
  subject: string;
  location: LessonLocation;
  notes: string;
  moved_from_lesson_id?: UUID;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LessonEvent {
  id: UUID;
  lesson_id: UUID;
  event_type: 'created' | 'rescheduled' | 'status_changed' | 'price_changed';
  old_val: string;
  new_val: string;
  timestamp: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Charge {
  id: UUID;
  student_id: UUID;
  lesson_id?: UUID;
  package_id?: UUID;
  amount: number;                // in grosze (positive, or negative if storno)
  accrual_date: string;          // yyyy-MM-dd (crucial for limit)
  charge_type: ChargeType;
  reverses_charge_id?: UUID;     // for storno / cancellations
  description?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: UUID;
  student_id: UUID;
  amount: number;                // in grosze
  received_date: string;         // yyyy-MM-dd (crucial for PIT)
  method: PaymentMethod;
  description: string;
  payment_type: PaymentType;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentAllocation {
  id: UUID;
  payment_id: UUID;
  charge_id: UUID;
  amount: number;                // in grosze
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Package {
  id: UUID;
  student_id: UUID;
  lessons_count: number;
  price: number;                 // in grosze
  purchase_date: string;         // yyyy-MM-dd
  used_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface IncomeEntry {
  id: UUID;
  charge_id?: UUID;              // A4: Link to specific charge (1 charge = 1 income entry)
  number: string;                // e.g. "2026/001"
  service_date: string;          // yyyy-MM-dd
  accrual_date: string;          // yyyy-MM-dd
  received_date?: string;        // yyyy-MM-dd
  student_id: UUID;
  service_type: string;          // np. "Lekcja matematyki", "Pakiet 4 lekcji"
  amount_due: number;            // in grosze
  amount_received: number;       // in grosze
  method: PaymentMethod;
  status: 'paid' | 'partial' | 'unpaid';
  period_id?: UUID;
  lesson_id?: UUID;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LegalParams {
  id: UUID;
  year: number;                  // 2026
  min_wage: number;              // 480600 (4 806,00 zł)
  factor_pct: number;            // 225
  frequency: 'quarter' | 'month';// 'quarter'
  valid_from: string;            // "2026-01-01"
  calculated_limit: number;      // 1081350 (10 813,50 zł = 2.25 * 480600)
  manual_override?: number;
  note?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Period {
  id: UUID;
  period_type: 'month' | 'quarter' | 'year';
  date_from: string;             // yyyy-MM-dd
  date_to: string;               // yyyy-MM-dd
  status: 'open' | 'closed';
  closed_at?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ReportSnapshot {
  id: UUID;
  period_id: UUID;
  version_num: number;           // 1, 2...
  data_json: string;
  pdf_url?: string;
  hash: string;
  correction_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: UUID;
  entity_name: string;
  entity_id: UUID;
  action: 'insert' | 'update' | 'delete' | 'storno';
  before_json?: string;
  after_json?: string;
  timestamp: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: UUID;
  tutor_name: string;
  default_rate: number;          // in grosze
  default_duration_min: number;  // minutes
  default_payment_method: PaymentMethod;
  work_hours_start: string;      // "08:00"
  work_hours_end: string;        // "21:00"
  work_days: number[];           // [1,2,3,4,5,6] (Mon-Sat)
  breaks_min: number;            // 15
  pin_hash?: string;
  pin_salt?: string;             // A5: PBKDF2 random salt
  failed_pin_attempts?: number;  // A5: lockout counter
  lockout_until?: string;        // A5: lockout expiration timestamp
  pin_enabled: boolean;
  biometrics_enabled: boolean;
  auto_lock_min: number;
  legal_declaration_accepted_at?: string;
  warning_thresholds: number[];  // [70, 85, 95, 100]
  gas_web_app_url?: string;
  gas_secret_token?: string;
  last_sync_at?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface OfflineOperation {
  op_id: UUID;
  table: string;
  action: 'insert' | 'update' | 'delete';
  record: any;
  timestamp: string;
  status: 'pending' | 'synced' | 'failed';
  error?: string;
}

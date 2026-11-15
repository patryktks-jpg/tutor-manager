/**
 * SetupSheet.gs - Automatyczny kreator struktury Arkusza Google dla Tutor Manager
 *
 * Uruchom funkcję 'initializeAllSheets()', aby:
 * 1. Utworzyć wszystkie zakładki zgodnie z Rozdziałem 3 specyfikacji
 * 2. Skonfigurować nagłówki kolumn
 * 3. Ustawić formatowanie
 * 4. Zainstalować codzienny wyzwalacz kopii zapasowej
 */

function initializeAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var schemas = {
    students: [
      'id', 'first_name', 'last_name', 'phone', 'email', 'grade_level',
      'subject', 'default_rate', 'default_duration_min', 'preferred_slots',
      'start_date', 'status', 'notes', 'cancel_policy_id', 'version', 'created_at', 'updated_at'
    ],
    guardians: [
      'id', 'student_id', 'full_name', 'phone', 'email', 'role', 'is_payer',
      'version', 'created_at', 'updated_at'
    ],
    rate_history: [
      'id', 'student_id', 'rate', 'valid_from', 'version', 'created_at', 'updated_at'
    ],
    lesson_series: [
      'id', 'student_id', 'day_of_week', 'start_time', 'duration_min',
      'from_date', 'to_date', 'exceptions', 'version', 'created_at', 'updated_at'
    ],
    lessons: [
      'id', 'student_id', 'series_id', 'start_at', 'duration_min', 'status',
      'price_snapshot', 'subject', 'location', 'notes', 'moved_from_lesson_id',
      'version', 'created_at', 'updated_at'
    ],
    lesson_events: [
      'id', 'lesson_id', 'event_type', 'old_val', 'new_val', 'timestamp',
      'version', 'created_at', 'updated_at'
    ],
    charges: [
      'id', 'student_id', 'lesson_id', 'package_id', 'amount', 'accrual_date',
      'charge_type', 'reverses_charge_id', 'description', 'version', 'created_at', 'updated_at'
    ],
    payments: [
      'id', 'student_id', 'amount', 'received_date', 'method', 'description',
      'payment_type', 'version', 'created_at', 'updated_at'
    ],
    payment_allocations: [
      'id', 'payment_id', 'charge_id', 'amount', 'version', 'created_at', 'updated_at'
    ],
    packages: [
      'id', 'student_id', 'lessons_count', 'price', 'purchase_date', 'used_count',
      'version', 'created_at', 'updated_at'
    ],
    income_entries: [
      'id', 'number', 'service_date', 'accrual_date', 'received_date', 'student_id',
      'service_type', 'amount_due', 'amount_received', 'method', 'status',
      'period_id', 'version', 'created_at', 'updated_at'
    ],
    legal_params: [
      'id', 'year', 'min_wage', 'factor_pct', 'frequency', 'valid_from',
      'calculated_limit', 'manual_override', 'note', 'version', 'created_at', 'updated_at'
    ],
    periods: [
      'id', 'period_type', 'date_from', 'date_to', 'status', 'closed_at',
      'version', 'created_at', 'updated_at'
    ],
    report_snapshots: [
      'id', 'period_id', 'version_num', 'data_json', 'pdf_url', 'hash',
      'correction_reason', 'version', 'created_at', 'updated_at'
    ],
    audit_logs: [
      'id', 'entity_name', 'entity_id', 'action', 'before_json', 'after_json',
      'timestamp', 'version', 'created_at', 'updated_at'
    ],
    settings: [
      'id', 'tutor_name', 'default_rate', 'default_duration_min', 'default_payment_method',
      'work_hours_start', 'work_hours_end', 'work_days', 'breaks_min', 'pin_hash',
      'pin_enabled', 'biometrics_enabled', 'auto_lock_min', 'legal_declaration_accepted_at',
      'warning_thresholds', 'gas_web_app_url', 'gas_secret_token', 'last_sync_at',
      'version', 'created_at', 'updated_at'
    ]
  };

  var tableNames = Object.keys(schemas);

  for (var i = 0; i < tableNames.length; i++) {
    var name = tableNames[i];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    var headers = schemas[name];
    var currentRange = sheet.getRange(1, 1, 1, headers.length);
    currentRange.setValues([headers]);

    // Stylizacja nagłówków
    currentRange.setBackground('#007AFF');
    currentRange.setFontColor('#FFFFFF');
    currentRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // Usunięcie domyślnego pustego arkusza "Arkusz 1" jeśli istnieje
  var defaultSheet = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }

  // Konfiguracja wyzwalacza codziennej kopii zapasowej (o godzinie 02:00 w nocy)
  setupDailyBackupTrigger();

  SpreadsheetApp.getUi().alert('Struktura Arkusza Google dla Tutor Manager została pomyślnie utworzona!');
}

function setupDailyBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var triggerExists = false;

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'createDailyBackup') {
      triggerExists = true;
      break;
    }
  }

  if (!triggerExists) {
    ScriptApp.newTrigger('createDailyBackup')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .inTimezone('Europe/Warsaw')
      .create();
  }
}

/**
 * SetupSheet.gs - Automatyczny kreator struktury Arkusza Google dla Tutor Manager (v2.3)
 *
 * Poprawka kluczowa:
 * - Ustawienie formatowania kolumn jako 'Tekst zwykły' (@), aby zapobiec
 *   automatycznej konwersji dat na obiekty Date i przesunięciom strefy czasowej!
 */

function initializeAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var schemas = {
    students: [
      'id', 'first_name', 'last_name', 'phone', 'email', 'grade_level',
      'subject', 'default_rate', 'default_duration_min', 'preferred_slots',
      'start_date', 'status', 'notes', 'cancel_policy_id', 'version', 'created_at', 'updated_at',
      'birth_day', 'birth_month'
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
      'period_id', 'version', 'created_at', 'updated_at', 'lesson_id'
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
      'work_hours_start', 'work_hours_end', 'work_days', 'breaks_min',
      'auto_lock_min', 'legal_declaration_accepted_at',
      'warning_thresholds', 'last_sync_at',
      'version', 'created_at', 'updated_at'
    ],
    processed_ops: [
      'op_id', 'processed_at'
    ]
  };

  var tableNames = Object.keys(schemas);

  for (var i = 0; i < tableNames.length; i++) {
    var name = tableNames[i];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    var expectedHeaders = schemas[name];
    var lastCol = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();

    if (lastCol === 0 || lastRow === 0) {
      // Pusty arkusz: wstaw nagłówki od zera
      var headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
      headerRange.setValues([expectedHeaders]);
      headerRange.setBackground('#007AFF');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // Arkusz z danymi (PUNKT 2 FIX): dopisuje brakujące kolumny na końcu, NIE przesuwając istniejących danych!
      var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < expectedHeaders.length; h++) {
        var colName = expectedHeaders[h];
        if (existingHeaders.indexOf(colName) === -1) {
          lastCol++;
          var newHeaderCell = sheet.getRange(1, lastCol);
          newHeaderCell.setValue(colName);
          newHeaderCell.setBackground('#007AFF');
          newHeaderCell.setFontColor('#FFFFFF');
          newHeaderCell.setFontWeight('bold');
          existingHeaders.push(colName);
        }
      }
    }

    // Ustawienie formatowania całego arkusza jako TEKST ZWYKŁY (@)
    var numRows = Math.max(1, sheet.getMaxRows() - 1);
    sheet.getRange(2, 1, numRows, sheet.getLastColumn()).setNumberFormat('@');
  }

  var defaultSheet = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }

  setupTriggers();
  SpreadsheetApp.getUi().alert('Struktura Arkusza Google dla Tutor Manager została pomyślnie utworzona i zabezpieczona!');
}

function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var backupExists = false;
  var alertExists = false;

  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'createDailyBackup') backupExists = true;
    if (fn === 'sendWeeklyTutorAlerts') alertExists = true;
  }

  if (!backupExists) {
    ScriptApp.newTrigger('createDailyBackup')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .inTimezone('Europe/Warsaw')
      .create();
  }

  if (!alertExists) {
    ScriptApp.newTrigger('sendWeeklyTutorAlerts')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(8)
      .inTimezone('Europe/Warsaw')
      .create();
  }
}

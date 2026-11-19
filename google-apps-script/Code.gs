/**
 * Tutor Manager - Google Apps Script Backend
 * Wersja 2.4 (listopad 2026)
 *
 * Poprawki:
 * 1. Obsługa update dla 'income_entries' (rejestracja zapłaty za wystawioną wcześniej lekcję)
 * 2. Idempotencja po 'id' rekordu (blokada duplikacji wiersza przy insert, jeśli id już istnieje)
 * 3. Zwracanie 'server_time' w pull (zapobieganie problemom z zegarem telefonu)
 * 4. Eksport zarówno PDF jak i XLSX na Dysk Google
 * 5. Maile z kontrolą limitu, alertem CEIDG i szczegółami zaległości
 * 6. Tworzenie zdarzeń w Kalendarzu Google z przypomnieniem 30 min przed
 */

function getSecretToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('SECRET_TOKEN');
  if (!token) {
    token = Utilities.getUuid();
    props.setProperty('SECRET_TOKEN', token);
  }
  return token;
}

var TABLES = [
  'students',
  'guardians',
  'rate_history',
  'lesson_series',
  'lessons',
  'lesson_events',
  'charges',
  'payments',
  'payment_allocations',
  'packages',
  'income_entries',
  'legal_params',
  'periods',
  'report_snapshots',
  'audit_logs',
  'settings'
];

// Niezmiennicze tabele finansowe (charges i payments są ściśle append-only: modyfikacja zabroniona)
var STRICT_IMMUTABLE_TABLES = [
  'charges',
  'payments',
  'payment_allocations',
  'report_snapshots',
  'audit_logs'
];

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'ping';
    var token = params.token || '';

    // Bezpieczeństwo: weryfikacja tokenu PRZED wykonaniem akcji
    if (token !== getSecretToken()) {
      return jsonResponse({ status: 'error', message: 'Błędny token autoryzacji (401 Unauthorized)' }, 401);
    }

    if (action === 'ping') {
      return jsonResponse({ status: 'ok', message: 'Tutor Manager Backend gotowy do pracy.' });
    }

    if (action === 'pull') {
      var since = params.since || '1970-01-01T00:00:00Z';
      var data = fetchIncremental(since);
      var serverTime = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
      return jsonResponse({ status: 'ok', data: data, server_time: serverTime });
    }

    return jsonResponse({ status: 'error', message: 'Nieznana akcja GET' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var rawContent = e.postData.contents;
    var body = JSON.parse(rawContent);

    if (body.token !== getSecretToken()) {
      return jsonResponse({ status: 'error', message: 'Brak uprawnień (błędny token)' }, 401);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === 'push_batch') {
      var operations = body.operations || [];
      var results = [];

      var sheetCache = {};
      var processedOpsSet = loadProcessedOps(ss);

      // Przetwarzanie operacji INDYWIDUALNIE
      for (var i = 0; i < operations.length; i++) {
        var op = operations[i];
        try {
          var res = applySingleOperation(ss, op, sheetCache, processedOpsSet);
          results.push(res);
        } catch (opErr) {
          results.push({
            op_id: op.op_id,
            status: 'rejected',
            error: opErr.message || opErr.toString()
          });
        }
      }

      var serverTime = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
      return jsonResponse({
        status: 'ok',
        processed: results.length,
        results: results,
        server_time: serverTime
      });
    }

    if (body.action === 'pull') {
      var since = body.since || '1970-01-01T00:00:00Z';
      var data = fetchIncremental(since);
      var serverTime = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
      return jsonResponse({ status: 'ok', data: data, server_time: serverTime });
    }

    if (body.action === 'export_report') {
      var exportRes = generateReportFiles(ss, body.period_id, body.data);
      return jsonResponse({ status: 'ok', files: exportRes });
    }

    if (body.action === 'calendar_sync') {
      var calRes = syncLessonToGoogleCalendar(body.lesson, body.student_name);
      return jsonResponse({ status: 'ok', calendar_event_id: calRes });
    }

    return jsonResponse({ status: 'error', message: 'Nieznana akcja POST' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function loadProcessedOps(ss) {
  var sheet = ss.getSheetByName('processed_ops');
  if (!sheet) {
    sheet = ss.insertSheet('processed_ops');
    sheet.appendRow(['op_id', 'processed_at']);
    sheet.setFrozenRows(1);
    return {};
  }

  var data = sheet.getDataRange().getValues();
  var set = {};

  if (data.length > 1200) {
    sheet.deleteRows(2, 300);
    data = sheet.getDataRange().getValues();
  }

  for (var i = 1; i < data.length; i++) {
    set[data[i][0]] = true;
  }
  return set;
}

/**
 * A1 [P0]: Normalizuje odczytaną komórkę arkusza.
 * Obiekty Date zamienia na string ISO (yyyy-MM-dd lub yyyy-MM-ddTHH:mm:ss w strefie Europe/Warsaw).
 * Liczby, stringi i wartości logiczne pozostawia bez zmian.
 */
function normalizeCell(val) {
  if (val instanceof Date) {
    var hours = val.getHours();
    var minutes = val.getMinutes();
    var seconds = val.getSeconds();
    if (hours === 0 && minutes === 0 && seconds === 0) {
      return Utilities.formatDate(val, 'Europe/Warsaw', 'yyyy-MM-dd');
    }
    return Utilities.formatDate(val, 'Europe/Warsaw', "yyyy-MM-dd'T'HH:mm:ss");
  }
  return val;
}

var normalizeDateValue = normalizeCell;

function isDateInClosedPeriod(ss, dateStr) {
  if (!dateStr) return false;
  var periodsSheet = ss.getSheetByName('periods');
  if (!periodsSheet) return false;

  var data = periodsSheet.getDataRange().getValues();
  var headers = data[0];
  var fromIdx = headers.indexOf('date_from');
  var toIdx = headers.indexOf('date_to');
  var statusIdx = headers.indexOf('status');

  var d = String(normalizeDateValue(dateStr)).slice(0, 10);
  for (var r = 1; r < data.length; r++) {
    var status = data[r][statusIdx];
    var from = String(normalizeDateValue(data[r][fromIdx])).slice(0, 10);
    var to = String(normalizeDateValue(data[r][toIdx])).slice(0, 10);
    if (status === 'closed' && d >= from && d <= to) {
      return true;
    }
  }
  return false;
}

function applySingleOperation(ss, op, sheetCache, processedOpsSet) {
  if (processedOpsSet[op.op_id]) {
    return { op_id: op.op_id, status: 'already_processed' };
  }

  // Wymuszenie niezmienności finansowej
  if (STRICT_IMMUTABLE_TABLES.indexOf(op.table) >= 0) {
    if (op.action === 'delete') {
      throw new Error('Operacja delete zabroniona w tabeli: ' + op.table + '. Wymagane storno.');
    }
    if (op.action === 'update') {
      throw new Error('Modyfikacja rekordu zabroniona w tabeli: ' + op.table + ' (append-only).');
    }
  }

  // Ochrona zamkniętego okresu
  var record = op.record || {};
  var recordDate = record.accrual_date || record.service_date || record.start_at || record.received_date;
  if (isDateInClosedPeriod(ss, recordDate)) {
    throw new Error('Data ' + recordDate + ' należy do zamkniętego okresu. Modyfikacja zablokowana.');
  }

  var sheet = ss.getSheetByName(op.table);
  if (!sheet) {
    sheet = ss.insertSheet(op.table);
    var defaultHeaders = Object.keys(record);
    if (defaultHeaders.indexOf('id') === -1) defaultHeaders.unshift('id');
    if (defaultHeaders.indexOf('version') === -1) defaultHeaders.push('version');
    if (defaultHeaders.indexOf('created_at') === -1) defaultHeaders.push('created_at');
    if (defaultHeaders.indexOf('updated_at') === -1) defaultHeaders.push('updated_at');
    sheet.appendRow(defaultHeaders);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight('bold');
    sheetCache[op.table] = [defaultHeaders];
  }

  var data = sheetCache[op.table] || sheet.getDataRange().getValues();
  sheetCache[op.table] = data;

  var headers = data[0];
  var idIndex = headers.indexOf('id');
  var versionIndex = headers.indexOf('version');

  var recordId = record.id;
  var rowIndex = -1;
  var currentVersion = 0;
  var beforeRowValues = null;

  for (var r = 1; r < data.length; r++) {
    if (data[r][idIndex] === recordId) {
      rowIndex = r + 1;
      currentVersion = Number(data[r][versionIndex]) || 0;
      beforeRowValues = data[r];
      break;
    }
  }

  // Idempotencja po record.id (PUNKT 5): jeśli insert wysyła rekord, który już istnieje w arkuszu
  if (op.action === 'insert' && rowIndex > 0) {
    return { op_id: op.op_id, status: 'already_processed' };
  }

  // Idempotencja po lesson_id dla charges (blokada zdublowanego naliczenia za tę samą lekcję)
  if (op.table === 'charges' && op.action === 'insert' && record.lesson_id && record.charge_type === 'lesson') {
    var lessonIdIdx = headers.indexOf('lesson_id');
    var chargeTypeIdx = headers.indexOf('charge_type');
    for (var cr = 1; cr < data.length; cr++) {
      if (data[cr][lessonIdIdx] === record.lesson_id && (chargeTypeIdx === -1 || data[cr][chargeTypeIdx] === 'lesson')) {
        return { op_id: op.op_id, status: 'already_processed' };
      }
    }
  }

  // Kontrola wersji
  if (rowIndex > 0 && currentVersion > Number(record.version || 0)) {
    throw new Error('Konflikt wersji: wiersz ma wersję ' + currentVersion + ', dane: ' + record.version);
  }

  var rowValues = [];
  for (var c = 0; c < headers.length; c++) {
    var colName = headers[c];
    var v = record[colName];
    if (v === undefined || v === null) {
      v = '';
    } else if (typeof v === 'object') {
      v = JSON.stringify(v);
    }
    rowValues.push(v);
  }

  var beforeJson = '';
  if (beforeRowValues) {
    var beforeObj = {};
    for (var hc = 0; hc < headers.length; hc++) {
      beforeObj[headers[hc]] = beforeRowValues[hc];
    }
    beforeJson = JSON.stringify(beforeObj);
  }

  if (op.action === 'insert') {
    sheet.appendRow(rowValues);
  } else if (op.action === 'update') {
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      // Upsert (PUNKT 2 FIX): Rekord nie istnieje jeszcze w arkuszu (np. utworzony offline lub z demo), więc dopisujemy
      sheet.appendRow(rowValues);
    }
  } else if (op.action === 'delete' && rowIndex > 0) {
    sheet.deleteRow(rowIndex);
  }

  var pSheet = ss.getSheetByName('processed_ops');
  if (pSheet) pSheet.appendRow([op.op_id, new Date().toISOString()]);
  processedOpsSet[op.op_id] = true;

  logAudit(ss, op.table, recordId, op.action, beforeJson, JSON.stringify(record));

  return { op_id: op.op_id, status: 'applied' };
}

function logAudit(ss, entity, entityId, action, beforeJson, afterJson) {
  var auditSheet = ss.getSheetByName('audit_logs');
  if (!auditSheet) return;

  auditSheet.appendRow([
    'audit-' + Utilities.getUuid(),
    entity,
    entityId,
    action,
    beforeJson || '',
    afterJson || '',
    new Date().toISOString(),
    1,
    new Date().toISOString(),
    new Date().toISOString()
  ]);
}

function fetchIncremental(sinceIso) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};

  for (var i = 0; i < TABLES.length; i++) {
    var tableName = TABLES[i];
    var sheet = ss.getSheetByName(tableName);
    if (!sheet) continue;

    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      result[tableName] = [];
      continue;
    }

    var headers = rows[0];
    var updatedAtIndex = headers.indexOf('updated_at');
    var tableItems = [];

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var rawUpdatedAt = updatedAtIndex >= 0 ? row[updatedAtIndex] : '';
      var rowUpdatedAt = normalizeDateValue(rawUpdatedAt);

      if (!sinceIso || String(rowUpdatedAt) >= sinceIso) {
        var item = {};
        for (var c = 0; c < headers.length; c++) {
          var key = headers[c];
          var val = normalizeDateValue(row[c]);
          if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
            try { val = JSON.parse(val); } catch (e) {}
          }
          item[key] = val;
        }
        tableItems.push(item);
      }
    }

    result[tableName] = tableItems;
  }

  return result;
}

/**
 * Generowanie plików raportu PDF i XLSX na Dysku Google.
 * PUNKT 4 FIX (RODO): Tworzy odrębny, czysty skoroszyt zawierający WYŁĄCZNIE
 * dane raportu – dane osobowe uczniów i opiekunów z innych zakładek nigdy nie trafiają do pliku!
 */
function generateReportFiles(ss, periodId, reportData) {
  var folderName = 'TutorManager_Raporty';
  var folders = DriveApp.getFoldersByName(folderName);
  var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  // Bezpieczeństwo: folder raportów dostępny wyłącznie dla właściciela konta (brak dostępu publicznego)
  try {
    targetFolder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (e) {}

  // Bezpieczna obsługa pustego reportData (PUNKT 4 FIX)
  reportData = reportData || {};
  var periodLabel = reportData.periodLabel || periodId || 'Miesiac';
  var fileName = 'Raport_' + periodLabel + '_' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyyMMdd_HHmm');

  var accruedRev = Number(reportData.accruedRevenueGrosze) || 0;
  var receivedRev = Number(reportData.receivedRevenueGrosze) || 0;
  var hours = reportData.hoursCompleted || 0;
  var lessons = reportData.lessonsCompletedCount || 0;
  var unpaid = Number(reportData.unpaidGrosze) || 0;

  // Stwórz czysty, wyizolowany skoroszyt wyłącznie dla raportu (RODO)
  var isolatedSs = SpreadsheetApp.create(fileName);
  var repSheet = isolatedSs.getActiveSheet();
  repSheet.setName('Raport');

  repSheet.appendRow(['TUTOR MANAGER – MIESIĘCZNY RAPORT EWIDENCJI']);
  repSheet.appendRow(['Okres rozliczeniowy:', periodLabel]);
  repSheet.appendRow(['Data wygenerowania:', Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm')]);
  repSheet.appendRow([]);
  repSheet.appendRow(['Wskaźnik', 'Wartość']);
  repSheet.appendRow(['Przychód należny (limit działalności):', (accruedRev / 100).toFixed(2) + ' zł']);
  repSheet.appendRow(['Przychód faktycznie otrzymany (PIT):', (receivedRev / 100).toFixed(2) + ' zł']);
  repSheet.appendRow(['Godziny zrealizowane:', hours + ' h']);
  repSheet.appendRow(['Liczba zrealizowanych lekcji:', lessons]);
  repSheet.appendRow(['Nieopłacone należności uczniów:', (unpaid / 100).toFixed(2) + ' zł']);

  SpreadsheetApp.flush();

  // Zapisz do folderu docelowego
  var isolatedFile = DriveApp.getFileById(isolatedSs.getId());
  targetFolder.addFile(isolatedFile);
  DriveApp.getRootFolder().removeFile(isolatedFile);

  // 1. Prawdziwy plik PDF
  var pdfBlob = isolatedFile.getAs('application/pdf').setName(fileName + '.pdf');
  var pdfFile = targetFolder.createFile(pdfBlob);

  // 2. Prawdziwy plik XLSX przez eksport Google Docs (PUNKT 4 FIX)
  var xlsxFile = null;
  try {
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + isolatedSs.getId() + '/export?format=xlsx';
    var fetchRes = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (fetchRes.getResponseCode() === 200) {
      var xlsxBlob = fetchRes.getBlob().setName(fileName + '.xlsx');
      xlsxFile = targetFolder.createFile(xlsxBlob);
    }
  } catch (e) {
    // UrlFetch fallback
  }

  return {
    pdf_url: pdfFile.getUrl(),
    xlsx_url: xlsxFile ? xlsxFile.getUrl() : isolatedFile.getUrl(),
    sheet_url: isolatedFile.getUrl(),
    folder_url: targetFolder.getUrl()
  };
}

/**
 * Tworzenie zdarzenia w Kalendarzu Google z przypomnieniem 30 min przed lekcją
 */
function syncLessonToGoogleCalendar(lesson, studentName) {
  var cal = CalendarApp.getDefaultCalendar();
  if (!cal || !lesson) return '';

  var title = 'Korepetycje: ' + (studentName || 'Uczeń') + ' (' + (lesson.subject || 'Matematyka') + ')';
  var startTime = new Date(lesson.start_at);
  var endTime = new Date(startTime.getTime() + (lesson.duration_min || 60) * 60000);

  var event = cal.createEvent(title, startTime, endTime, {
    description: 'Tutor Manager – lekcja zaplanowana\nStawka: ' + (lesson.price_snapshot / 100).toFixed(2) + ' zł'
  });

  event.addPopupReminder(30);
  return event.getId();
}

/**
 * Codzienna kopia zapasowa na Dysku Google z rotacją do 30 kopii
 */
function createDailyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var file = DriveApp.getFileById(ss.getId());

  var folderName = 'TutorManager_Kopie_Zapasowe';
  var folders = DriveApp.getFoldersByName(folderName);
  var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  // Bezpieczeństwo: folder kopii zapasowych dostępny wyłącznie dla właściciela konta (brak dostępu publicznego)
  try {
    targetFolder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (e) {}

  var dateStr = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd_HH-mm');
  var copyName = 'Kopia_TutorManager_' + dateStr;
  var copyFile = file.makeCopy(copyName, targetFolder);
  try {
    copyFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (e) {}

  var existingFiles = targetFolder.getFiles();
  var list = [];
  while (existingFiles.hasNext()) {
    list.push(existingFiles.next());
  }

  list.sort(function(a, b) {
    return b.getDateCreated().getTime() - a.getDateCreated().getTime();
  });

  if (list.length > 30) {
    for (var i = 30; i < list.length; i++) {
      list[i].setTrashed(true);
    }
  }
}

/**
 * Cotygodniowy alert e-mail z limitem kwartalnym i zaległościami.
 * PUNKT 3 FIX:
 * - Filtruje przychody wyłącznie z BIEŻĄCEGO kwartału (accrual_date >= qStart && <= qEnd)
 * - Pobiera limit dynamicznie z zakładki legal_params dla bieżącego roku zamiast sztywnej kwoty
 */
function sendWeeklyTutorAlerts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var email = Session.getEffectiveUser().getEmail();
  if (!email) return;

  var chargesSheet = ss.getSheetByName('charges');
  var paymentsSheet = ss.getSheetByName('payments');
  var legalParamsSheet = ss.getSheetByName('legal_params');
  if (!chargesSheet || !paymentsSheet) return;

  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-11
  var quarter = Math.floor(month / 3) + 1; // 1, 2, 3, 4

  var qStartMonth = (quarter - 1) * 3 + 1;
  var qEndMonth = quarter * 3;
  var qStartDate = year + '-' + (qStartMonth < 10 ? '0' : '') + qStartMonth + '-01';
  var endDay = (quarter === 1 || quarter === 4) ? '31' : '30';
  var qEndDate = year + '-' + (qEndMonth < 10 ? '0' : '') + qEndMonth + '-' + endDay;

  // 1. Pobierz limit dynamicznie z legal_params
  var limit = 1081350; // Domyślny fallback dla 2026 (10 813,50 zł)
  if (legalParamsSheet) {
    var lpData = legalParamsSheet.getDataRange().getValues();
    for (var l = 1; l < lpData.length; l++) {
      if (Number(lpData[l][1]) === year) {
        var override = Number(lpData[l][7]);
        var calcLimit = Number(lpData[l][6]);
        limit = override > 0 ? override : (calcLimit > 0 ? calcLimit : limit);
        break;
      }
    }
  }

  // 2. Sumuj należności z bieżącego kwartału oraz łączną sumę
  var charges = chargesSheet.getDataRange().getValues();
  var totalQuarterAccrued = 0;
  var totalAllCharges = 0;

  for (var i = 1; i < charges.length; i++) {
    var amt = Number(charges[i][4]) || 0;
    var accDate = String(normalizeDateValue(charges[i][5])).slice(0, 10);
    totalAllCharges += amt;
    if (accDate >= qStartDate && accDate <= qEndDate) {
      totalQuarterAccrued += amt;
    }
  }

  // 3. Sumuj wpłaty
  var payments = paymentsSheet.getDataRange().getValues();
  var totalAllPayments = 0;
  for (var j = 1; j < payments.length; j++) {
    var pAmt = Number(payments[j][2]) || 0;
    var pType = payments[j][6];
    if (pType === 'zwrot') {
      totalAllPayments -= pAmt;
    } else {
      totalAllPayments += pAmt;
    }
  }

  var totalUnpaid = Math.max(0, totalAllCharges - totalAllPayments);
  var pct = limit > 0 ? Math.round((totalQuarterAccrued / limit) * 100) : 0;

  var subject = 'Tutor Manager: Raport tygodniowy Q' + quarter + ' ' + year + ' (Limit: ' + pct + '%)';
  var body = 'Cześć!\n\nOto stan Twojej działalności nierejestrowanej na dzień ' + Utilities.formatDate(now, 'Europe/Warsaw', 'yyyy-MM-dd') + ':\n' +
    '- Przychód należny w kwartale (Q' + quarter + ' ' + year + '): ' + (totalQuarterAccrued / 100).toFixed(2) + ' zł / ' + (limit / 100).toFixed(2) + ' zł (' + pct + '%)\n' +
    '- Pozostało do limitu kwartalnego: ' + (Math.max(0, limit - totalQuarterAccrued) / 100).toFixed(2) + ' zł\n' +
    '- Łączne nieopłacone należności uczniów: ' + (totalUnpaid / 100).toFixed(2) + ' zł\n\n' +
    (pct >= 95 ? 'UWAGA: Zbliżasz się do limitu działalności nierejestrowanej (95%+)! Po przekroczeniu masz 7 dni na wpis do CEIDG.\n\n' : '') +
    'Pozdrawiamy,\nTutor Manager';

  MailApp.sendEmail({ to: email, subject: subject, body: body });
}

function jsonResponse(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

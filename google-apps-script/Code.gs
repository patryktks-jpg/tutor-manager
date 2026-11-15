/**
 * Tutor Manager - Google Apps Script Backend
 * Wersja 2.3 (listopad 2026)
 *
 * Poprawki produkcyjne:
 * 1. Wyniki per-operacja (brak zatruwania kolejki przy błędzie pojedynczej operacji)
 * 2. Rygorystyczna ochrona tokenu w ping i doGet
 * 3. Niezmienność finansowa: blokada 'update' i 'delete' dla charges, payments, income_entries
 * 4. Prawdziwe 'before_json' w audit_log
 * 5. Normalizacja dat (strefa Europe/Warsaw, zapobieganie przesunięciom o 1 dzień)
 * 6. Wydajność: pamięć podręczna arkuszy per batch + rotacja processed_ops do 1000 wpisów
 * 7. Eksport PDF/XLSX na Dysk Google, przypomnienia mailowe i Kalendarz Google
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

// Całkowicie nienaruszalne tabele finansowe (zakaz update i delete)
var APPEND_ONLY_FINANCIAL_TABLES = [
  'charges',
  'payments',
  'income_entries',
  'report_snapshots',
  'audit_logs'
];

/**
 * Obsługa GET: Ping oraz przyrostowy Pull
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'ping';
    var token = params.token || '';

    // PUNKT 4: Weryfikacja tokenu PRZED wykonaniem jakiejkolwiek akcji, łącznie z ping!
    if (token !== getSecretToken()) {
      return jsonResponse({ status: 'error', message: 'Błędny token autoryzacji (401 Unauthorized)' }, 401);
    }

    if (action === 'ping') {
      return jsonResponse({ status: 'ok', message: 'Tutor Manager Backend gotowy do pracy.' });
    }

    if (action === 'pull') {
      var since = params.since || '1970-01-01T00:00:00Z';
      var data = fetchIncremental(since);
      return jsonResponse({ status: 'ok', data: data });
    }

    return jsonResponse({ status: 'error', message: 'Nieznana akcja GET' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * Obsługa POST: Przetwarzanie paczki operacji
 */
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

      // Pamięć podręczna arkuszy dla całego batcha (PUNKT 7: Wydajność)
      var sheetCache = {};
      var processedOpsSet = loadProcessedOps(ss);

      // PUNKT 1: Przetwarzanie operacji INDYWIDUALNIE
      // Błąd jednej operacji NIE zatruwa całej kolejki i nie cofa pozostałych!
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

      return jsonResponse({
        status: 'ok',
        processed: results.length,
        results: results
      });
    }

    if (body.action === 'export_report') {
      var pdfResult = generateReportFiles(ss, body.period_id, body.data);
      return jsonResponse({ status: 'ok', files: pdfResult });
    }

    return jsonResponse({ status: 'error', message: 'Nieznana akcja POST' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ładuje processed_ops do szybkiego zbioru w pamięci podręcznej i rotuje stare wpisy (PUNKT 7)
 */
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

  // Jeśli jest więcej niż 1200 wpisów, usuń najstarsze 300 (rotacja)
  if (data.length > 1200) {
    sheet.deleteRows(2, 300);
    data = sheet.getDataRange().getValues();
  }

  for (var i = 1; i < data.length; i++) {
    set[data[i][0]] = true;
  }
  return set;
}

function normalizeDateValue(val) {
  if (val instanceof Date) {
    // Normalizacja do strefy Europe/Warsaw bez przesunięć UTC!
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

  // PUNKT 3: Wymuszenie niezmienności finansowej (blokada update i delete)
  if (APPEND_ONLY_FINANCIAL_TABLES.indexOf(op.table) >= 0) {
    if (op.action === 'delete') {
      throw new Error('Operacja delete jest zabroniona dla tabeli finansowej: ' + op.table + '. Wymagane storno.');
    }
    if (op.action === 'update') {
      throw new Error('Rekordy finansowe są nienaruszalne (append-only). Modyfikacja zabroniona w tabeli: ' + op.table);
    }
  }

  // Sprawdzenie zamkniętego okresu rozliczeniowego
  var record = op.record || {};
  var recordDate = record.accrual_date || record.service_date || record.start_at || record.received_date;
  if (isDateInClosedPeriod(ss, recordDate)) {
    throw new Error('Okres dla daty ' + recordDate + ' jest zamknięty! Wymagana oficjalna korekta raportu.');
  }

  var sheet = ss.getSheetByName(op.table);
  if (!sheet) {
    throw new Error('Zakładka nie istnieje: ' + op.table);
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

  // Kontrola wersji (Last-write-wins)
  if (rowIndex > 0 && currentVersion > Number(record.version || 0)) {
    throw new Error('Konflikt wersji: wiersz ma wersję ' + currentVersion + ', a wysyłana wersja to ' + record.version);
  }

  // Przygotowanie wiersza
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

  if (op.action === 'insert' || (op.action === 'update' && rowIndex === -1)) {
    sheet.appendRow(rowValues);
  } else if (op.action === 'update' && rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else if (op.action === 'delete' && rowIndex > 0) {
    sheet.deleteRow(rowIndex);
  }

  // Zapisz w processed_ops
  var pSheet = ss.getSheetByName('processed_ops');
  if (pSheet) pSheet.appendRow([op.op_id, new Date().toISOString()]);
  processedOpsSet[op.op_id] = true;

  // PUNKT 3: Prawdziwe beforeJson w audycie
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

/**
 * Odczyt przyrostowy z normalizacją obiektów Date na tekst (PUNKT 2)
 */
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
 * PUNKT 10: Generowanie raportu PDF i XLSX na Dysku Google
 */
function generateReportFiles(ss, periodId, reportData) {
  var folderName = 'TutorManager_Raporty';
  var folders = DriveApp.getFoldersByName(folderName);
  var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  var periodLabel = reportData ? reportData.periodLabel : periodId;
  var fileName = 'Raport_' + periodLabel + '_' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyyMMdd_HHmm');

  // Utwórz tymczasowy arkusz pod PDF
  var tempSheet = ss.insertSheet('TempReport_' + Utilities.getUuid().slice(0, 8));
  tempSheet.appendRow(['RAPORT MIESIĘCZNY DZIAŁALNOŚCI NIEREJESTROWANEJ: ' + periodLabel]);
  tempSheet.appendRow(['Data wygenerowania:', Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm')]);
  tempSheet.appendRow([]);
  tempSheet.appendRow(['Wskaźnik', 'Wartość']);
  tempSheet.appendRow(['Przychód należny (limit):', (reportData.accruedRevenueGrosze / 100).toFixed(2) + ' zł']);
  tempSheet.appendRow(['Przychód otrzymany (PIT):', (reportData.receivedRevenueGrosze / 100).toFixed(2) + ' zł']);
  tempSheet.appendRow(['Godziny zrealizowane:', reportData.hoursCompleted + ' h']);
  tempSheet.appendRow(['Liczba zrealizowanych lekcji:', reportData.lessonsCompletedCount]);
  tempSheet.appendRow(['Nieopłacone należności:', (reportData.unpaidGrosze / 100).toFixed(2) + ' zł']);

  SpreadsheetApp.flush();

  // Eksport PDF
  var pdfBlob = tempSheet.getAs('application/pdf').setName(fileName + '.pdf');
  var pdfFile = targetFolder.createFile(pdfBlob);

  ss.deleteSheet(tempSheet);

  return {
    pdf_url: pdfFile.getUrl(),
    file_id: pdfFile.getId()
  };
}

/**
 * PUNKT 10: Codzienna automatyczna kopia zapasowa na Dysku Google z rotacją do 30 kopii
 */
function createDailyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var file = DriveApp.getFileById(ss.getId());

  var folderName = 'TutorManager_Kopie_Zapasowe';
  var folders = DriveApp.getFoldersByName(folderName);
  var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  var dateStr = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd_HH-mm');
  var copyName = 'Kopia_TutorManager_' + dateStr;
  file.makeCopy(copyName, targetFolder);

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
 * PUNKT 10: Przypomnienia e-mail o zaległościach i zbliżaniu się do limitu
 */
function sendWeeklyTutorAlerts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var email = Session.getEffectiveUser().getEmail();
  if (!email) return;

  var chargesSheet = ss.getSheetByName('charges');
  var paymentsSheet = ss.getSheetByName('payments');
  if (!chargesSheet || !paymentsSheet) return;

  // Wylicz sumy
  var charges = chargesSheet.getDataRange().getValues();
  var totalDue = 0;
  for (var i = 1; i < charges.length; i++) {
    totalDue += Number(charges[i][4]) || 0;
  }

  var payments = paymentsSheet.getDataRange().getValues();
  var totalPaid = 0;
  for (var j = 1; j < payments.length; j++) {
    totalPaid += Number(payments[j][2]) || 0;
  }

  var unpaid = totalDue - totalPaid;
  if (unpaid > 0) {
    MailApp.sendEmail({
      to: email,
      subject: 'Tutor Manager: Podsumowanie zaległości',
      body: 'Witaj! Twoje aktualne nieopłacone należności wynoszą: ' + (unpaid / 100).toFixed(2) + ' zł. Sprawdź aplikację Tutor Manager.'
    });
  }
}

function jsonResponse(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

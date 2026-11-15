/**
 * Tutor Manager - Google Apps Script Web App Backend
 * Wersja 2.2 (listopad 2026)
 *
 * Poprawki bezpieczeństwa i integralności:
 * 1. Idempotencja przez 'processed_ops' (ochrona przed duplikatami przy ponawianiu op_id)
 * 2. Blokada modyfikacji/zapisu do zamkniętych okresów rozliczeniowych
 * 3. Całkowity zakaz 'delete' dla tabel finansowych (anulowanie tylko storno)
 * 4. Kontrola wersji (Last-write-wins z weryfikacją wersji)
 * 5. Obsługa text/plain z CORS
 * 6. Bezpieczny token w ScriptProperties (brak hardcodowanego tokenu w repozytorium)
 */

function getSecretToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('SECRET_TOKEN');
  if (!token) {
    // Jeśli token nie został jeszcze skonfigurowany w ScriptProperties,
    // wygeneruj unikalny i zapisz w bezpiecznych właściwościach projektu
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

var IMMUTABLE_FINANCIAL_TABLES = [
  'charges',
  'payments',
  'payment_allocations',
  'income_entries',
  'report_snapshots',
  'audit_logs'
];

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'ping';
    var token = params.token || '';

    if (action === 'ping') {
      return jsonResponse({ status: 'ok', message: 'Tutor Manager Backend gotowy do pracy.' });
    }

    if (token !== getSecretToken()) {
      return jsonResponse({ status: 'error', message: 'Błędny token autoryzacji' }, 401);
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

      for (var i = 0; i < operations.length; i++) {
        var op = operations[i];
        var res = applyOperation(ss, op);
        results.push(res);
      }

      return jsonResponse({ status: 'ok', processed: results.length, details: results });
    }

    return jsonResponse({ status: 'error', message: 'Nieznana akcja POST' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Zapewnia istnienie arkusza 'processed_ops' i sprawdza, czy dana operacja była już wykonana (idempotencja).
 */
function isOpAlreadyProcessed(ss, opId) {
  var sheet = ss.getSheetByName('processed_ops');
  if (!sheet) {
    sheet = ss.insertSheet('processed_ops');
    sheet.appendRow(['op_id', 'processed_at']);
    sheet.setFrozenRows(1);
    return false;
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === opId) {
      return true;
    }
  }
  return false;
}

function markOpProcessed(ss, opId) {
  var sheet = ss.getSheetByName('processed_ops');
  if (sheet) {
    sheet.appendRow([opId, new Date().toISOString()]);
  }
}

/**
 * Sprawdza, czy podana data wpada w zamknięty okres rozliczeniowy.
 */
function isDateInClosedPeriod(ss, dateStr) {
  if (!dateStr) return false;
  var periodsSheet = ss.getSheetByName('periods');
  if (!periodsSheet) return false;

  var data = periodsSheet.getDataRange().getValues();
  var headers = data[0];
  var fromIdx = headers.indexOf('date_from');
  var toIdx = headers.indexOf('date_to');
  var statusIdx = headers.indexOf('status');

  var d = dateStr.slice(0, 10);
  for (var r = 1; r < data.length; r++) {
    var status = data[r][statusIdx];
    var from = data[r][fromIdx];
    var to = data[r][toIdx];
    if (status === 'closed' && d >= from && d <= to) {
      return true;
    }
  }
  return false;
}

function applyOperation(ss, op) {
  // Idempotencja: jeśli ta operacja op_id była już zaaplikowana, pomiń bez duplikowania!
  if (isOpAlreadyProcessed(ss, op.op_id)) {
    return { op_id: op.op_id, status: 'already_processed' };
  }

  // Ochrona integralności: zakaz delete w tabelach finansowych
  if (op.action === 'delete' && IMMUTABLE_FINANCIAL_TABLES.indexOf(op.table) >= 0) {
    throw new Error('Operacja usunięcia (delete) jest zabroniona dla tabeli finansowej: ' + op.table + '. Wymagane storno/korekta.');
  }

  // Sprawdzenie zamkniętego okresu
  var record = op.record || {};
  var recordDate = record.accrual_date || record.service_date || record.start_at || record.received_date;
  if (isDateInClosedPeriod(ss, recordDate)) {
    throw new Error('Modyfikacja zablokowana: data ' + recordDate + ' należy do zamkniętego okresu rozliczeniowego!');
  }

  var sheet = ss.getSheetByName(op.table);
  if (!sheet) {
    throw new Error('Zakładka nie istnieje: ' + op.table);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIndex = headers.indexOf('id');
  var versionIndex = headers.indexOf('version');

  var recordId = record.id;
  var rowIndex = -1;
  var currentVersion = 0;

  for (var r = 1; r < data.length; r++) {
    if (data[r][idIndex] === recordId) {
      rowIndex = r + 1;
      currentVersion = Number(data[r][versionIndex]) || 0;
      break;
    }
  }

  // Kontrola wersji: jeśli wiersz w arkuszu ma wyższą wersję niż przychodząca, odrzuć
  if (rowIndex > 0 && currentVersion > Number(record.version || 0)) {
    throw new Error('Konflikt wersji dla rekordu ' + recordId + ' w tabeli ' + op.table + ' (arkusz: v' + currentVersion + ', dane: v' + record.version + ')');
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

  if (op.action === 'insert' || (op.action === 'update' && rowIndex === -1)) {
    sheet.appendRow(rowValues);
  } else if (op.action === 'update' && rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else if (op.action === 'delete' && rowIndex > 0) {
    sheet.deleteRow(rowIndex);
  }

  // Zapisz w processed_ops
  markOpProcessed(ss, op.op_id);

  // Zapis do audit_log
  logAudit(ss, op.table, recordId, op.action, JSON.stringify(record));

  return { op_id: op.op_id, status: 'applied' };
}

function logAudit(ss, entity, entityId, action, afterJson) {
  var auditSheet = ss.getSheetByName('audit_logs');
  if (!auditSheet) return;

  auditSheet.appendRow([
    'audit-' + Utilities.getUuid(),
    entity,
    entityId,
    action,
    '',
    afterJson,
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
      var rowUpdatedAt = updatedAtIndex >= 0 ? row[updatedAtIndex] : '';

      if (!sinceIso || rowUpdatedAt >= sinceIso) {
        var item = {};
        for (var c = 0; c < headers.length; c++) {
          var key = headers[c];
          var val = row[c];
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

function jsonResponse(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

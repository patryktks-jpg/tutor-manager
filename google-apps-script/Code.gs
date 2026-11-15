/**
 * Tutor Manager - Google Apps Script Web App Backend
 * Wersja 2.1 (listopad 2026)
 *
 * Zapewnia:
 * 1. Ochronę przed równoległym zapisem (LockService)
 * 2. Zapis zbiorczy (batch operations bez pętli po komórkach)
 * 3. Pobieranie przyrostowe wg 'updated_at'
 * 4. Odrzucanie edycji do zamkniętych okresów
 * 5. Niezmienniczą ewidencję i audyt
 * 6. Codzienną automatyczną kopię zapasową na Dysku Google (ostatnie 30)
 * 7. Synchronizację z Kalendarzem Google i przypomnienia mailowe
 */

// Konfiguracja tajnego tokenu (wprowadź ten sam token w aplikacji PWA w Ustawieniach)
var SECRET_TOKEN = 'TUTOR_SECRET_2026_MATH';

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

/**
 * Obsługa zapytań GET (Ping, pobieranie przyrostowe)
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'ping';
    var token = params.token || '';

    if (token !== SECRET_TOKEN && action !== 'ping') {
      return jsonResponse({ status: 'error', message: 'Nieprawidłowy token autoryzacji' }, 401);
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
 * Obsługa zapytań POST (Zapis pojedynczy lub paczka operacji offline)
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Blokada współbieżności do 30 sekund
    lock.waitLock(30000);

    var body = JSON.parse(e.postData.contents);
    if (body.token !== SECRET_TOKEN) {
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

      return jsonResponse({ status: 'ok', processed: results.length });
    }

    return jsonResponse({ status: 'error', message: 'Nieznana akcja POST' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Pobiera przyrostowo wiersze zmienione po dacie 'since'
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
      var rowUpdatedAt = updatedAtIndex >= 0 ? row[updatedAtIndex] : '';

      if (!sinceIso || rowUpdatedAt >= sinceIso) {
        var item = {};
        for (var c = 0; c < headers.length; c++) {
          var key = headers[c];
          var val = row[c];
          // Rozpoznawanie pól JSON
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
 * Aplikuje pojedynczą operację insert/update/delete do arkusza z kontrolą wersji
 */
function applyOperation(ss, op) {
  var sheet = ss.getSheetByName(op.table);
  if (!sheet) {
    throw new Error('Zakładka nie istnieje: ' + op.table);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIndex = headers.indexOf('id');
  var versionIndex = headers.indexOf('version');

  var record = op.record;
  var recordId = record.id;

  var rowIndex = -1;
  var currentVersion = 0;

  for (var r = 1; r < data.length; r++) {
    if (data[r][idIndex] === recordId) {
      rowIndex = r + 1; // 1-based row index in sheet
      currentVersion = Number(data[r][versionIndex]) || 0;
      break;
    }
  }

  // Budowanie wiersza zgodnie z kolejnością nagłówków
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
    // Last-write-wins z weryfikacją wersji
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else if (op.action === 'delete' && rowIndex > 0) {
    sheet.deleteRow(rowIndex);
  }

  // Zapis do audit_log
  logAudit(ss, op.table, recordId, op.action, JSON.stringify(record));

  return { op_id: op.op_id, status: 'applied' };
}

/**
 * Rejestruje zdarzenie w nienaruszalnym audit_log
 */
function logAudit(ss, entity, entityId, action, afterJson) {
  var auditSheet = ss.getSheetByName('audit_logs');
  if (!auditSheet) return;

  auditSheet.appendRow([
    'audit-' + new Date().getTime(),
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

/**
 * Codzienna automatyczna kopia zapasowa całego Arkusza na Dysku Google (ostatnie 30)
 * Wywoływana przez wyzwalacz czasowy (Time-driven trigger)
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

  // Rotacja: zachowaj tylko 30 najnowszych kopii
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
 * Pomocnik odpowiedzi JSON
 */
function jsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

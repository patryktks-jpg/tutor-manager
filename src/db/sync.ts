import { OfflineOperation, Settings } from '../domain/types';
import { IDBManager } from './idb';

export interface SyncResult {
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  rejectedCount: number;
  message: string;
  error?: string;
  rejectedDetails?: Array<{ op_id: string; error: string; table: string }>;
}

export async function testGasConnection(url: string, token: string): Promise<{ success: boolean; message: string }> {
  if (!url) {
    return { success: false, message: 'Adres Web App Google Apps Script jest pusty.' };
  }
  if (!token) {
    return { success: false, message: 'Tajny token autoryzacji jest pusty.' };
  }

  try {
    const fullUrl = `${url}?action=ping&token=${encodeURIComponent(token)}`;
    const res = await fetch(fullUrl, { method: 'GET' });
    const json = await res.json();

    if (json.status === 'ok') {
      return { success: true, message: 'Połączono pomyślnie z Arkuszem Google! Token poprawny.' };
    }
    return { success: false, message: json.message || 'Błąd autoryzacji tokenu.' };
  } catch (err: any) {
    return { success: false, message: `Błąd sieci / CORS: ${err.message}` };
  }
}

/**
 * Sanitizes records before sending to Google Sheets so sensitive security credentials
 * (pin_hash, gas_secret_token) are NEVER leaked into the spreadsheet! (PUNKT 5)
 */
function sanitizeRecordForSheets(table: string, record: any): any {
  if (table === 'settings' && record) {
    const copy = { ...record };
    delete copy.pin_hash;
    delete copy.pin_salt;
    delete copy.failed_pin_attempts;
    delete copy.lockout_until;
    delete copy.gas_secret_token;
    return copy;
  }
  return record;
}

export async function syncWithGas(
  settings: Settings,
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const url = settings.gas_web_app_url;
  const token = settings.gas_secret_token;

  if (!url) {
    return {
      success: true,
      pushedCount: 0,
      pulledCount: 0,
      rejectedCount: 0,
      message: 'Tryb lokalny / offline (brak skonfigurowanego Web App URL)'
    };
  }

  onProgress?.('Pobieranie kolejki offline...');
  const db = await IDBManager.getDB();
  const queue = await IDBManager.getAll<OfflineOperation>(db, 'offline_queue');

  let pushedCount = 0;
  let rejectedCount = 0;
  const rejectedDetails: Array<{ op_id: string; error: string; table: string }> = [];

  // 1. PUSH: Wysyłanie operacji offline z dezynfekcją tajemnic
  if (queue.length > 0) {
    onProgress?.(`Wysyłanie ${queue.length} operacji do Arkusza Google...`);
    const sanitizedOps = queue.map(op => ({
      ...op,
      record: sanitizeRecordForSheets(op.table, op.record)
    }));

    try {
      const pushRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'push_batch',
          token,
          operations: sanitizedOps
        })
      });

      const pushJson = await pushRes.json();
      if (pushJson.status === 'ok' && Array.isArray(pushJson.results)) {
        // PUNKT 1: Obsługa per-operacja (brak zatruwania kolejki!)
        for (const res of pushJson.results) {
          const originalOp = queue.find(o => o.op_id === res.op_id);
          if (res.status === 'applied' || res.status === 'already_processed') {
            await IDBManager.removeQueuedOperation(res.op_id);
            pushedCount++;
          } else if (res.status === 'rejected') {
            // Przenieś odrzuconą operację z offline_queue do rejected_operations,
            // aby NIE blokowała zamknięcia miesiąca i nie zatruwała kolejki!
            await IDBManager.removeQueuedOperation(res.op_id);
            if (originalOp) {
              await IDBManager.put('rejected_operations', {
                ...originalOp,
                status: 'rejected',
                error: res.error || 'Odrzucono przez serwer'
              });
              rejectedDetails.push({
                op_id: res.op_id,
                error: res.error || 'Odrzucono przez serwer',
                table: originalOp.table
              });
            }
            rejectedCount++;
          }
        }
      } else {
        return {
          success: false,
          pushedCount: 0,
          pulledCount: 0,
          rejectedCount: 0,
          message: 'Błąd synchronizacji zapisu: ' + (pushJson.message || 'Nieznany błąd'),
          error: pushJson.message
        };
      }
    } catch (err: any) {
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        rejectedCount: 0,
        message: 'Brak połączenia z siecią. Zmiany pozostają bezpiecznie w kolejce offline.',
        error: err.message
      };
    }
  }

  // 2. PULL: Pobieranie przyrostowe
  let pulledCount = 0;
  try {
    onProgress?.('Pobieranie przyrostowych zmian z Arkusza Google...');
    const since = settings.last_sync_at || '1970-01-01T00:00:00Z';
    const pullUrl = `${url}?action=pull&since=${encodeURIComponent(since)}&token=${encodeURIComponent(token || '')}`;

    const pullRes = await fetch(pullUrl, { method: 'GET' });
    const pullJson = await pullRes.json();

    if (pullJson.status === 'ok' && pullJson.data) {
      let maxUpdatedAt = settings.last_sync_at || '1970-01-01T00:00:00Z';

      for (const table of Object.keys(pullJson.data)) {
        if (table === 'settings') continue; // Nigdy nie nadpisuj lokalnych ustawień bezpieczeństwa z arkusza!
        const rows = pullJson.data[table];
        if (Array.isArray(rows)) {
          for (const row of rows) {
            await IDBManager.put(table, row);
            pulledCount++;
            if (row.updated_at && row.updated_at > maxUpdatedAt) {
              maxUpdatedAt = row.updated_at;
            }
          }
        }
      }

      // Aktualizuj last_sync_at bazując na świeżych ustawieniach z IndexedDB, aby nie nadpisać współbieżnych zmian (FIX)
      const syncTimestamp = pullJson.server_time || (maxUpdatedAt > (settings.last_sync_at || '') ? maxUpdatedAt : new Date().toISOString());
      const freshSettings = (await IDBManager.get<Settings>(db, 'settings', settings.id)) || settings;
      await IDBManager.put('settings', {
        ...freshSettings,
        last_sync_at: syncTimestamp
      });
    } else {
      return {
        success: false,
        pushedCount,
        pulledCount: 0,
        rejectedCount,
        message: 'Błąd pobierania danych: ' + (pullJson.message || 'Niepowodzenie')
      };
    }
  } catch (err: any) {
    return {
      success: false,
      pushedCount,
      pulledCount: 0,
      rejectedCount,
      message: 'Błąd podczas pobierania aktualizacji z Arkusza Google.',
      error: err.message
    };
  }

  let msg = `Zsynchronizowano pomyślnie. Wysłano: ${pushedCount}, pobrano: ${pulledCount}.`;
  if (rejectedCount > 0) {
    msg += ` Odrzucono operacji: ${rejectedCount} (szczegóły w odrzuconych).`;
  }

  return {
    success: true,
    pushedCount,
    pulledCount,
    rejectedCount,
    message: msg,
    rejectedDetails
  };
}

/**
 * Wywołuje backend Google Apps Script, aby wygenerować pliki raportu (PDF i XLSX) na Dysku Google
 */
export async function exportReportViaGas(
  settings: Settings,
  periodId: string,
  reportData: any
): Promise<{ success: boolean; files?: { pdf_url: string; xlsx_url?: string; folder_url?: string }; message: string }> {
  const url = settings.gas_web_app_url;
  const token = settings.gas_secret_token;
  if (!url) {
    return { success: false, message: 'Brak skonfigurowanego adresu Web App Arkusza Google' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'export_report',
        token,
        period_id: periodId,
        data: reportData
      })
    });
    const json = await res.json();
    if (json.status === 'ok') {
      return { success: true, files: json.files, message: 'Wygenerowano raport PDF i XLSX na Dysku Google!' };
    }
    return { success: false, message: json.message || 'Błąd generowania raportu na Dysku Google' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Zgłasza lekcję do Kalendarza Google z powiadomieniem 30 min przed
 */
export async function syncLessonToCalendarViaGas(
  settings: Settings,
  lesson: any,
  studentName?: string
): Promise<{ success: boolean; eventId?: string; message: string }> {
  const url = settings.gas_web_app_url;
  const token = settings.gas_secret_token;
  if (!url) return { success: false, message: 'Brak URL' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'calendar_sync',
        token,
        lesson,
        student_name: studentName
      })
    });
    const json = await res.json();
    if (json.status === 'ok') {
      return { success: true, eventId: json.calendar_event_id, message: 'Dodano do Kalendarza Google' };
    }
    return { success: false, message: json.message || 'Błąd kalendarza' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Wymusza wysłanie wszystkich lokalnych rekordów z telefonu do Arkusza Google.
 * Dzięki idempotencji w backendzie Google Apps Script (blokada duplikacji po record.id),
 * istniejące wiersze nie są duplikowane, a brakujące są bezpiecznie dopisywane.
 */
export async function forcePushAllData(
  settings: Settings,
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const url = settings.gas_web_app_url;
  const token = settings.gas_secret_token;

  if (!url) {
    return { success: false, pushedCount: 0, pulledCount: 0, rejectedCount: 0, message: 'Brak skonfigurowanego URL Arkusza Google.' };
  }

  try {
    const db = await IDBManager.getDB();
    const tables = [
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
      'settings'
    ] as const;

    const operations: any[] = [];
    for (const table of tables) {
      const records = await IDBManager.getAll<any>(db, table);
      for (const record of records) {
        operations.push({
          op_id: `force-${table}-${record.id}-${Date.now().toString(36)}`,
          table,
          action: 'insert',
          record: sanitizeRecordForSheets(table, record),
          timestamp: new Date().toISOString()
        });
      }
    }

    if (operations.length === 0) {
      return { success: true, pushedCount: 0, pulledCount: 0, rejectedCount: 0, message: 'Baza na telefonie jest pusta.' };
    }

    onProgress?.(`Wysyłanie ${operations.length} rekordów do Arkusza Google...`);

    const pushRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'push_batch',
        token,
        operations
      })
    });

    const pushJson = await pushRes.json();
    if (pushJson.status === 'ok') {
      return {
        success: true,
        pushedCount: operations.length,
        pulledCount: 0,
        rejectedCount: 0,
        message: `Pomyślnie zsynchronizowano całą bazę (${operations.length} rekordów)!`
      };
    }

    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      rejectedCount: 0,
      message: pushJson.message || 'Błąd wysyłania bazy do Arkusza.'
    };
  } catch (err: any) {
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      rejectedCount: 0,
      message: `Błąd sieci: ${err.message}`
    };
  }
}

/**
 * Pobiera czyste dane bezpośrednio z Arkusza Google, usuwając lokalne ewentualne duplikaty.
 * Gwarantuje, że stan aplikacji w telefonie jest dokładnie taki sam jak w Arkuszu Google.
 */
export async function pullCleanFromGas(
  settings: Settings,
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const url = settings.gas_web_app_url;
  const token = settings.gas_secret_token;

  if (!url) {
    return { success: false, pushedCount: 0, pulledCount: 0, rejectedCount: 0, message: 'Brak skonfigurowanego URL Arkusza Google.' };
  }

  try {
    onProgress?.('Pobieranie czystych danych z Arkusza Google...');
    const pullUrl = `${url}?action=pull&since=1970-01-01T00:00:00Z&token=${encodeURIComponent(token || '')}`;
    const pullRes = await fetch(pullUrl, { method: 'GET' });
    const pullJson = await pullRes.json();

    if (pullJson.status === 'ok' && pullJson.data) {
      const db = await IDBManager.getDB();
      const tablesToClean = [
        'charges',
        'payments',
        'payment_allocations',
        'income_entries',
        'lessons',
        'students',
        'guardians',
        'rate_history'
      ] as const;

      for (const table of tablesToClean) {
        // Clear local store
        const clearTx = db.transaction(table, 'readwrite');
        clearTx.objectStore(table).clear();
        await new Promise((resolve, reject) => {
          clearTx.oncomplete = () => resolve(true);
          clearTx.onerror = () => reject(clearTx.error);
        });

        // Populate with rows from Google Sheets
        const rows = pullJson.data[table];
        if (Array.isArray(rows) && rows.length > 0) {
          const writeTx = db.transaction(table, 'readwrite');
          const store = writeTx.objectStore(table);
          const seenIds = new Set<string>();
          for (const row of rows) {
            if (row.id && !seenIds.has(row.id)) {
              seenIds.add(row.id);
              store.put(row);
            }
          }
          await new Promise((resolve, reject) => {
            writeTx.oncomplete = () => resolve(true);
            writeTx.onerror = () => reject(writeTx.error);
          });
        }
      }

      // Clear offline queue
      const qTx = db.transaction('offline_queue', 'readwrite');
      qTx.objectStore('offline_queue').clear();
      await new Promise((resolve, reject) => {
        qTx.oncomplete = () => resolve(true);
        qTx.onerror = () => reject(qTx.error);
      });

      return {
        success: true,
        pushedCount: 0,
        pulledCount: 1,
        rejectedCount: 0,
        message: 'Baza danych została zsynchronizowana z Arkuszem Google! Lokalne duplikaty usunięte.'
      };
    }

    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      rejectedCount: 0,
      message: pullJson.message || 'Błąd pobierania danych'
    };
  } catch (err: any) {
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      rejectedCount: 0,
      message: `Błąd sieci: ${err.message}`
    };
  }
}

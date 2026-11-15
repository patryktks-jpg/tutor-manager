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

      // Aktualizuj last_sync_at bazując na czasie serwera lub maksymalnym updated_at pobranych danych (PUNKT 2 FIX)
      const syncTimestamp = pullJson.server_time || (maxUpdatedAt > (settings.last_sync_at || '') ? maxUpdatedAt : new Date().toISOString());
      await IDBManager.put('settings', {
        ...settings,
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

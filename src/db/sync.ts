import { OfflineOperation, Settings } from '../domain/types';
import { IDBManager } from './idb';

export interface SyncResult {
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  message: string;
  error?: string;
}

export async function testGasConnection(url: string, token: string): Promise<{ success: boolean; message: string }> {
  if (!url) {
    return { success: false, message: 'Adres Web App Google Apps Script jest pusty.' };
  }

  try {
    const fullUrl = `${url}?action=ping&token=${encodeURIComponent(token)}`;
    const res = await fetch(fullUrl, { method: 'GET' });
    const json = await res.json();

    if (json.status === 'ok') {
      return { success: true, message: 'Połączono pomyślnie z Arkuszem Google!' };
    }
    return { success: false, message: json.message || 'Błąd autoryzacji tokenu.' };
  } catch (err: any) {
    return { success: false, message: `Błąd sieci / CORS: ${err.message}` };
  }
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
      message: 'Tryb lokalny / offline (brak skonfigurowanego Web App URL)'
    };
  }

  onProgress?.('Pobieranie kolejki offline...');
  const db = await IDBManager.getDB();
  const queue = await IDBManager.getAll<OfflineOperation>(db, 'offline_queue');

  let pushedCount = 0;

  // Push pending operations
  if (queue.length > 0) {
    onProgress?.(`Wysyłanie ${queue.length} operacji do Arkusza Google...`);
    try {
      const pushRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_batch',
          token,
          operations: queue
        })
      });

      const pushJson = await pushRes.json();
      if (pushJson.status === 'ok') {
        pushedCount = queue.length;
        // Clear pushed operations from IDB
        for (const op of queue) {
          await IDBManager.removeQueuedOperation(op.op_id);
        }
      } else {
        return {
          success: false,
          pushedCount: 0,
          pulledCount: 0,
          message: 'Błąd podczas synchronizacji zapisu w Apps Script',
          error: pushJson.message
        };
      }
    } catch (err: any) {
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        message: 'Brak połączenia z siecią. Zmiany pozostają w kolejce offline.',
        error: err.message
      };
    }
  }

  // Pull incremental updates
  let pulledCount = 0;
  try {
    onProgress?.('Pobieranie przyrostowych zmian z Arkusza Google...');
    const since = settings.last_sync_at || '1970-01-01T00:00:00Z';
    const pullUrl = `${url}?action=pull&since=${encodeURIComponent(since)}&token=${encodeURIComponent(token || '')}`;

    const pullRes = await fetch(pullUrl, { method: 'GET' });
    const pullJson = await pullRes.json();

    if (pullJson.status === 'ok' && pullJson.data) {
      for (const table of Object.keys(pullJson.data)) {
        const rows = pullJson.data[table];
        if (Array.isArray(rows)) {
          for (const row of rows) {
            await IDBManager.put(table, row);
            pulledCount++;
          }
        }
      }
    }
  } catch (err: any) {
    // Non-fatal if push worked or if offline
    console.warn('Sync pull warning:', err);
  }

  const nowIso = new Date().toISOString();
  await IDBManager.put('settings', {
    ...settings,
    last_sync_at: nowIso
  });

  return {
    success: true,
    pushedCount,
    pulledCount,
    message: `Zsynchronizowano pomyślnie. Wysłano: ${pushedCount}, pobrano: ${pulledCount}.`
  };
}

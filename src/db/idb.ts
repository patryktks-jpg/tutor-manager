import {
  Student,
  Guardian,
  RateHistory,
  LessonSeries,
  Lesson,
  LessonEvent,
  Charge,
  Payment,
  PaymentAllocation,
  Package,
  IncomeEntry,
  LegalParams,
  Period,
  ReportSnapshot,
  AuditLog,
  Settings,
  OfflineOperation,
  UUID
} from '../domain/types';
import { generateUUID } from '../domain/crypto';
import {
  INITIAL_STUDENTS,
  INITIAL_GUARDIANS,
  INITIAL_RATE_HISTORY,
  INITIAL_SERIES,
  INITIAL_LESSONS,
  INITIAL_CHARGES,
  INITIAL_PAYMENTS,
  INITIAL_ALLOCATIONS,
  INITIAL_INCOME_ENTRIES,
  INITIAL_LEGAL_PARAMS_2026,
  INITIAL_SETTINGS,
  INITIAL_PERIODS
} from './sampleData';

const DB_NAME = 'tutor_manager_db';
const DB_VERSION = 1;

export interface AppDatabaseSchema {
  students: Student[];
  guardians: Guardian[];
  rate_history: RateHistory[];
  lesson_series: LessonSeries[];
  lessons: Lesson[];
  lesson_events: LessonEvent[];
  charges: Charge[];
  payments: Payment[];
  payment_allocations: PaymentAllocation[];
  packages: Package[];
  income_entries: IncomeEntry[];
  legal_params: LegalParams[];
  periods: Period[];
  report_snapshots: ReportSnapshot[];
  audit_logs: AuditLog[];
  settings: Settings;
  offline_queue: OfflineOperation[];
}

export class IDBManager {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  public static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const stores = [
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
          'settings',
          'offline_queue',
          'rejected_operations'
        ];

        for (const s of stores) {
          if (!db.objectStoreNames.contains(s)) {
            if (s === 'offline_queue' || s === 'rejected_operations') {
              db.createObjectStore(s, { keyPath: 'op_id' });
            } else {
              db.createObjectStore(s, { keyPath: 'id' });
            }
          }
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  public static async loadInitialState(): Promise<AppDatabaseSchema> {
    const db = await this.getDB();
    const legalParams = await this.getAll<LegalParams>(db, 'legal_params');

    // Only seed initial legal params and settings if completely fresh
    if (legalParams.length === 0) {
      await this.seedMinimal(db);
    }

    const state: AppDatabaseSchema = {
      students: await this.getAll<Student>(db, 'students'),
      guardians: await this.getAll<Guardian>(db, 'guardians'),
      rate_history: await this.getAll<RateHistory>(db, 'rate_history'),
      lesson_series: await this.getAll<LessonSeries>(db, 'lesson_series'),
      lessons: await this.getAll<Lesson>(db, 'lessons'),
      lesson_events: await this.getAll<LessonEvent>(db, 'lesson_events'),
      charges: await this.getAll<Charge>(db, 'charges'),
      payments: await this.getAll<Payment>(db, 'payments'),
      payment_allocations: await this.getAll<PaymentAllocation>(db, 'payment_allocations'),
      packages: await this.getAll<Package>(db, 'packages'),
      income_entries: await this.getAll<IncomeEntry>(db, 'income_entries'),
      legal_params: await this.getAll<LegalParams>(db, 'legal_params'),
      periods: await this.getAll<Period>(db, 'periods'),
      report_snapshots: await this.getAll<ReportSnapshot>(db, 'report_snapshots'),
      audit_logs: await this.getAll<AuditLog>(db, 'audit_logs'),
      settings: (await this.get<Settings>(db, 'settings', INITIAL_SETTINGS.id)) || INITIAL_SETTINGS,
      offline_queue: await this.getAll<OfflineOperation>(db, 'offline_queue')
    };

    return state;
  }

  public static async seedMinimal(db: IDBDatabase): Promise<void> {
    const tx = db.transaction(['legal_params', 'periods', 'settings'], 'readwrite');
    tx.objectStore('legal_params').put(INITIAL_LEGAL_PARAMS_2026);
    for (const p of INITIAL_PERIODS) {
      tx.objectStore('periods').put(p);
    }
    tx.objectStore('settings').put(INITIAL_SETTINGS);

    await new Promise((res, rej) => {
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  }

  public static async seedDemoData(db: IDBDatabase): Promise<void> {
    const tx = db.transaction([
      'students', 'guardians', 'rate_history', 'lesson_series', 'lessons',
      'charges', 'payments', 'payment_allocations', 'income_entries',
      'legal_params', 'periods', 'settings'
    ], 'readwrite');

    const putAll = (storeName: string, items: any[]) => {
      const store = tx.objectStore(storeName);
      for (const item of items) store.put(item);
    };

    putAll('students', INITIAL_STUDENTS);
    putAll('guardians', INITIAL_GUARDIANS);
    putAll('rate_history', INITIAL_RATE_HISTORY);
    putAll('lesson_series', INITIAL_SERIES);
    putAll('lessons', INITIAL_LESSONS);
    putAll('charges', INITIAL_CHARGES);
    putAll('payments', INITIAL_PAYMENTS);
    putAll('payment_allocations', INITIAL_ALLOCATIONS);
    putAll('income_entries', INITIAL_INCOME_ENTRIES);
    putAll('legal_params', [INITIAL_LEGAL_PARAMS_2026]);
    putAll('periods', INITIAL_PERIODS);
    tx.objectStore('settings').put(INITIAL_SETTINGS);

    await new Promise((res, rej) => {
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  }

  public static async clearAllUserData(): Promise<void> {
    const db = await this.getDB();
    const stores = [
      'students', 'guardians', 'rate_history', 'lesson_series', 'lessons',
      'lesson_events', 'charges', 'payments', 'payment_allocations', 'packages',
      'income_entries', 'report_snapshots', 'audit_logs', 'offline_queue'
    ];
    for (const s of stores) {
      const tx = db.transaction(s, 'readwrite');
      tx.objectStore(s).clear();
    }
  }

  public static async getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public static async get<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public static async put<T>(storeName: string, item: T): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public static async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Records an offline operation to guarantee idempotency and sync upon reconnect.
   * Uses RFC4122 UUID.
   */
  public static async queueOperation(
    table: string,
    action: 'insert' | 'update' | 'delete',
    record: any
  ): Promise<OfflineOperation> {
    const op: OfflineOperation = {
      op_id: generateUUID(),
      table,
      action,
      record,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    await this.put('offline_queue', op);
    return op;
  }

  public static async removeQueuedOperation(opId: UUID): Promise<void> {
    await this.delete('offline_queue', opId);
  }

  public static async exportBackupJSON(): Promise<string> {
    const state = await this.loadInitialState();
    return JSON.stringify(state, null, 2);
  }

  public static async restoreFromJSON(jsonStr: string): Promise<void> {
    const data = JSON.parse(jsonStr) as Partial<AppDatabaseSchema>;
    const db = await this.getDB();
    const stores = Object.keys(data) as Array<keyof AppDatabaseSchema>;

    for (const store of stores) {
      if (store === 'settings') {
        if (data.settings) await this.put('settings', data.settings);
        continue;
      }
      const items = data[store];
      if (Array.isArray(items)) {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        s.clear();
        for (const item of items) {
          s.put(item);
        }
      }
    }
  }
}

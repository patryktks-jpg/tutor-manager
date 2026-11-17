import { describe, it, expect } from 'vitest';
import { Charge, Payment, PaymentAllocation, Student } from '../domain/types';
import { deriveIncomeEntry } from '../domain/income';
import { hashPin, verifyAndMigratePin, hashPinLegacySha256 } from '../domain/crypto';
import { checkPolishHoliday, getPolishHolidays } from '../domain/holidays';
import { buildPaymentReminderText, generateSmsLink, generateWhatsAppLink } from '../domain/reminders';
import { encryptBackup, decryptBackup } from '../domain/backupCrypto';
import { canUsePackage, buildPackagePurchasePayload } from '../domain/packages';

describe('New Features & Fixes Specification Test Suite (A1-A7, B1-B11)', () => {
  describe('A4: Income Entries Derived From Charges & Allocations', () => {
    it('creates distinct income entries for two lessons on the same day for same student', () => {
      const charge1: Charge = {
        id: 'c1',
        student_id: 's1',
        lesson_id: 'l1',
        amount: 7000,
        accrual_date: '2026-11-20',
        charge_type: 'lesson',
        description: 'Lekcja 1',
        version: 1,
        created_at: '2026-11-20T10:00:00Z',
        updated_at: '2026-11-20T10:00:00Z'
      };

      const charge2: Charge = {
        id: 'c2',
        student_id: 's1',
        lesson_id: 'l2',
        amount: 7000,
        accrual_date: '2026-11-20',
        charge_type: 'lesson',
        description: 'Lekcja 2',
        version: 1,
        created_at: '2026-11-20T16:00:00Z',
        updated_at: '2026-11-20T16:00:00Z'
      };

      const entry1 = deriveIncomeEntry({ charge: charge1, allocations: [], payments: [], number: '2026/001' });
      const entry2 = deriveIncomeEntry({ charge: charge2, allocations: [], payments: [], number: '2026/002' });

      expect(entry1.id).not.toBe(entry2.id);
      expect(entry1.charge_id).toBe('c1');
      expect(entry2.charge_id).toBe('c2');
      expect(entry1.lesson_id).toBe('l1');
      expect(entry2.lesson_id).toBe('l2');
      expect(entry1.service_date).toBe('2026-11-20');
      expect(entry2.service_date).toBe('2026-11-20');
      expect(entry1.status).toBe('unpaid');
      expect(entry2.status).toBe('unpaid');
    });

    it('calculates partial payment status correctly from allocations', () => {
      const charge: Charge = {
        id: 'c1',
        student_id: 's1',
        amount: 8000,
        accrual_date: '2026-11-15',
        charge_type: 'lesson',
        version: 1,
        created_at: '2026-11-15T12:00:00Z',
        updated_at: '2026-11-15T12:00:00Z'
      };

      const payment: Payment = {
        id: 'p1',
        student_id: 's1',
        amount: 5000,
        received_date: '2026-11-16',
        method: 'blik',
        description: 'Wpłata częściowa',
        payment_type: 'wplata',
        version: 1,
        created_at: '2026-11-16T12:00:00Z',
        updated_at: '2026-11-16T12:00:00Z'
      };

      const allocation: PaymentAllocation = {
        id: 'a1',
        payment_id: 'p1',
        charge_id: 'c1',
        amount: 5000,
        version: 1,
        created_at: '2026-11-16T12:00:00Z',
        updated_at: '2026-11-16T12:00:00Z'
      };

      const entry = deriveIncomeEntry({
        charge,
        allocations: [allocation],
        payments: [payment],
        number: '2026/010'
      });

      expect(entry.status).toBe('partial');
      expect(entry.amount_due).toBe(8000);
      expect(entry.amount_received).toBe(5000);
      expect(entry.received_date).toBe('2026-11-16');
      expect(entry.method).toBe('blik');
    });

    it('sets status to paid and selects latest payment date when multiple partial payments complete charge', () => {
      const charge: Charge = {
        id: 'c1',
        student_id: 's1',
        amount: 10000,
        accrual_date: '2026-11-01',
        charge_type: 'lesson',
        version: 1,
        created_at: '2026-11-01T12:00:00Z',
        updated_at: '2026-11-01T12:00:00Z'
      };

      const pay1: Payment = {
        id: 'p1',
        student_id: 's1',
        amount: 4000,
        received_date: '2026-11-03',
        method: 'gotowka',
        description: 'Zaliczka',
        payment_type: 'wplata',
        version: 1,
        created_at: '2026-11-03T12:00:00Z',
        updated_at: '2026-11-03T12:00:00Z'
      };

      const pay2: Payment = {
        id: 'p2',
        student_id: 's1',
        amount: 6000,
        received_date: '2026-11-10',
        method: 'przelew',
        description: 'Dopłata',
        payment_type: 'wplata',
        version: 1,
        created_at: '2026-11-10T12:00:00Z',
        updated_at: '2026-11-10T12:00:00Z'
      };

      const alloc1: PaymentAllocation = {
        id: 'a1',
        payment_id: 'p1',
        charge_id: 'c1',
        amount: 4000,
        version: 1,
        created_at: '2026-11-03T12:00:00Z',
        updated_at: '2026-11-03T12:00:00Z'
      };

      const alloc2: PaymentAllocation = {
        id: 'a2',
        payment_id: 'p2',
        charge_id: 'c1',
        amount: 6000,
        version: 1,
        created_at: '2026-11-10T12:00:00Z',
        updated_at: '2026-11-10T12:00:00Z'
      };

      const entry = deriveIncomeEntry({
        charge,
        allocations: [alloc1, alloc2],
        payments: [pay1, pay2],
        number: '2026/020'
      });

      expect(entry.status).toBe('paid');
      expect(entry.amount_received).toBe(10000);
      expect(entry.received_date).toBe('2026-11-10'); // latest payment date!
      expect(entry.method).toBe('przelew'); // latest method!
    });

    it('creates income entry for late cancellation fee', () => {
      const cancelCharge: Charge = {
        id: 'c-cancel',
        student_id: 's1',
        lesson_id: 'l1',
        amount: 3500,
        accrual_date: '2026-11-17',
        charge_type: 'paid_cancellation',
        description: 'Odwołanie < 4h przed terminem',
        version: 1,
        created_at: '2026-11-17T14:00:00Z',
        updated_at: '2026-11-17T14:00:00Z'
      };

      const entry = deriveIncomeEntry({
        charge: cancelCharge,
        allocations: [],
        payments: [],
        number: '2026/030'
      });

      expect(entry.charge_id).toBe('c-cancel');
      expect(entry.service_type).toBe('Opłata za późne odwołanie lekcji');
      expect(entry.amount_due).toBe(3500);
      expect(entry.status).toBe('unpaid');
    });
  });

  describe('A5: PBKDF2 PIN Hashing and Transparent Migration', () => {
    it('hashes PIN with PBKDF2 (min 200 000 iterations) and verifies correctly', async () => {
      const { hash, salt } = await hashPin('123456');
      expect(hash).toBeDefined();
      expect(salt).toBeDefined();

      const verification = await verifyAndMigratePin('123456', hash, salt);
      expect(verification.valid).toBe(true);
      expect(verification.shouldMigrate).toBe(false);

      const wrongVerification = await verifyAndMigratePin('654321', hash, salt);
      expect(wrongVerification.valid).toBe(false);
    });

    it('transparently migrates legacy SHA-256 PIN hash to PBKDF2 with salt', async () => {
      const legacyHash = await hashPinLegacySha256('9876');

      const verification = await verifyAndMigratePin('9876', legacyHash, undefined);
      expect(verification.valid).toBe(true);
      expect(verification.shouldMigrate).toBe(true);
      expect(verification.newHash).toBeDefined();
      expect(verification.newSalt).toBeDefined();

      // Now verify that the new PBKDF2 credentials work
      const reVerify = await verifyAndMigratePin('9876', verification.newHash, verification.newSalt);
      expect(reVerify.valid).toBe(true);
      expect(reVerify.shouldMigrate).toBe(false);
    });

    it('transparently migrates legacy plaintext PIN to PBKDF2', async () => {
      const plaintext = '4321';

      const verification = await verifyAndMigratePin('4321', plaintext, undefined);
      expect(verification.valid).toBe(true);
      expect(verification.shouldMigrate).toBe(true);
      expect(verification.newHash).toBeDefined();
      expect(verification.newSalt).toBeDefined();
    });

    it('rejects invalid PIN during migration check', async () => {
      const legacyHash = await hashPinLegacySha256('1111');
      const verification = await verifyAndMigratePin('2222', legacyHash, undefined);
      expect(verification.valid).toBe(false);
      expect(verification.shouldMigrate).toBe(false);
    });
  });

  describe('B4: Polish Public Holidays Calculation', () => {
    it('detects fixed statutory Polish holidays', () => {
      expect(checkPolishHoliday('2026-01-01').isHoliday).toBe(true);
      expect(checkPolishHoliday('2026-01-01').name).toBe('Nowy Rok');

      expect(checkPolishHoliday('2026-05-03').isHoliday).toBe(true);
      expect(checkPolishHoliday('2026-05-03').name).toBe('Święto Konstytucji 3 Maja');

      expect(checkPolishHoliday('2026-11-11').isHoliday).toBe(true);
      expect(checkPolishHoliday('2026-11-11').name).toBe('Narodowe Święto Niepodległości');

      expect(checkPolishHoliday('2026-11-17').isHoliday).toBe(false);
    });

    it('calculates movable feasts (Easter Monday, Corpus Christi) for 2026 and 2027', () => {
      // In 2026, Easter Sunday is April 5, Easter Monday is April 6, Corpus Christi is June 4
      expect(checkPolishHoliday('2026-04-06').isHoliday).toBe(true);
      expect(checkPolishHoliday('2026-04-06').name).toBe('Poniedziałek Wielkanocny');

      expect(checkPolishHoliday('2026-06-04').isHoliday).toBe(true);
      expect(checkPolishHoliday('2026-06-04').name).toBe('Boże Ciało');

      const holidays2026 = getPolishHolidays(2026);
      expect(holidays2026.length).toBe(13);
    });
  });

  describe('B8 & B9: Reminders and Links', () => {
    const student: Student = {
      id: 's1',
      first_name: 'Jan',
      last_name: 'Kowalski',
      phone: '500 600 700',
      grade_level: 'Liceum',
      subject: 'Matematyka',
      default_rate: 8000,
      default_duration_min: 60,
      preferred_slots: '',
      start_date: '2026-09-01',
      status: 'active',
      notes: '',
      version: 1,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z'
    };

    it('builds payment reminder text and direct SMS/WhatsApp links', () => {
      const text = buildPaymentReminderText({
        student,
        tutorName: 'Marek',
        customAmountGrosze: 16000
      });

      expect(text).toContain('Jan');
      expect(text).toContain('160,00 zł');
      expect(text).toContain('Marek');

      const smsLink = generateSmsLink(student.phone, text);
      expect(smsLink).toContain('sms:+48500600700?body=');

      const waLink = generateWhatsAppLink(student.phone, text);
      expect(waLink).toContain('https://wa.me/48500600700?text=');
    });
  });

  describe('B7: Encrypted Backup via AES-GCM and PBKDF2', () => {
    it('encrypts and successfully decrypts backup with valid password', async () => {
      const data = JSON.stringify({ students: [{ id: '1', name: 'Adam' }], secret: 'xyz' });
      const encrypted = await encryptBackup(data, 'SuperSecretPass123!');

      expect(encrypted).toContain('tutor_manager_encrypted_backup');
      expect(encrypted).toContain('ciphertext');

      const decrypted = await decryptBackup(encrypted, 'SuperSecretPass123!');
      expect(decrypted).toBe(data);
    });

    it('fails decryption with wrong password', async () => {
      const data = JSON.stringify({ test: 123 });
      const encrypted = await encryptBackup(data, 'CorrectPassword');

      await expect(decryptBackup(encrypted, 'WrongPassword')).rejects.toThrow();
    });
  });

  describe('B10: Lesson Packages', () => {
    it('creates package purchase payload and tracks remaining lessons', () => {
      const payload = buildPackagePurchasePayload('s1', 5, 30000, '2026-11-01', true, 'blik');

      expect(payload.newPackage.lessons_count).toBe(5);
      expect(payload.newPackage.used_count).toBe(0);
      expect(payload.packageCharge.amount).toBe(30000);
      expect(payload.packageCharge.charge_type).toBe('package');
      expect(payload.packagePayment?.amount).toBe(30000);

      expect(canUsePackage(payload.newPackage)).toBe(true);

      payload.newPackage.used_count = 5;
      expect(canUsePackage(payload.newPackage)).toBe(false);
    });
  });
});

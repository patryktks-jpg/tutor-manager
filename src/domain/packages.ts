import { Package, UUID, Charge, Payment } from './types';
import { generateUUID } from './crypto';

/**
 * Checks if a lesson package has remaining unused lessons (B10).
 */
export function canUsePackage(pkg: Package): boolean {
  return pkg.used_count < pkg.lessons_count;
}

/**
 * Returns the oldest active package for a student that still has available lessons.
 */
export function getActivePackageForStudent(
  studentId: UUID,
  packages: Package[]
): Package | undefined {
  return packages
    .filter(p => p.student_id === studentId && canUsePackage(p))
    .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date))[0];
}

/**
 * Creates entities for purchasing a new prepaid lesson package.
 */
export function buildPackagePurchasePayload(
  studentId: UUID,
  lessonsCount: number,
  priceGrosze: number,
  purchaseDate: string,
  isPaidImmediately = true,
  paymentMethod: 'blik' | 'przelew' | 'gotowka' = 'przelew',
  nowIso: string = new Date().toISOString()
): {
  newPackage: Package;
  packageCharge: Charge;
  packagePayment: Payment | null;
} {
  const packageId = generateUUID();

  const newPackage: Package = {
    id: packageId,
    student_id: studentId,
    lessons_count: lessonsCount,
    price: priceGrosze,
    purchase_date: purchaseDate,
    used_count: 0,
    version: 1,
    created_at: nowIso,
    updated_at: nowIso
  };

  const packageCharge: Charge = {
    id: generateUUID(),
    student_id: studentId,
    package_id: packageId,
    amount: priceGrosze,
    accrual_date: purchaseDate,
    charge_type: 'package',
    description: `Pakiet ${lessonsCount} lekcji`,
    version: 1,
    created_at: nowIso,
    updated_at: nowIso
  };

  let packagePayment: Payment | null = null;
  if (isPaidImmediately) {
    packagePayment = {
      id: generateUUID(),
      student_id: studentId,
      amount: priceGrosze,
      received_date: purchaseDate,
      method: paymentMethod,
      description: `Opłata za pakiet ${lessonsCount} lekcji`,
      payment_type: 'wplata',
      version: 1,
      created_at: nowIso,
      updated_at: nowIso
    };
  }

  return {
    newPackage,
    packageCharge,
    packagePayment
  };
}

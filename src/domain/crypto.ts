import { UUID } from './types';

/**
 * Generates a standard RFC4122 v4 UUID using crypto.randomUUID with fallback.
 */
export function generateUUID(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a random cryptographic salt (hex string).
 */
export function generateSalt(byteLength: number = 16): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Legacy SHA-256 PIN hash for backward compatibility and migration.
 */
export async function hashPinLegacySha256(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`tutor_salt_${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Requirement A5:
 * Secure PIN hashing using PBKDF2 with HMAC-SHA-256, 200,000 iterations, and random salt.
 */
export async function hashPinPBKDF2(
  pin: string,
  salt: string,
  iterations: number = 200000
): Promise<string> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  const saltData = encoder.encode(salt);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 32 bytes (256 bits)
  );

  const derivedArray = Array.from(new Uint8Array(derivedBits));
  return derivedArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Main PIN hashing function - generates new salt and returns PBKDF2 hash.
 */
export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = generateSalt();
  const hash = await hashPinPBKDF2(pin, salt);
  return { hash, salt };
}

export interface VerifyPinResult {
  valid: boolean;
  shouldMigrate: boolean;
  newHash?: string;
  newSalt?: string;
}

/**
 * Requirement A5:
 * Verifies PIN and automatically triggers migration from legacy SHA-256 or plaintext.
 * Strictly disallows plaintext in normal operation.
 */
export async function verifyAndMigratePin(
  enteredPin: string,
  currentHash?: string,
  currentSalt?: string
): Promise<VerifyPinResult> {
  if (!currentHash) {
    return { valid: true, shouldMigrate: false };
  }

  // 1. If salt exists, verify via PBKDF2
  if (currentSalt) {
    const computedHash = await hashPinPBKDF2(enteredPin, currentSalt);
    const valid = computedHash === currentHash;
    return { valid, shouldMigrate: false };
  }

  // 2. Migration path: check legacy SHA-256
  const legacyHash = await hashPinLegacySha256(enteredPin);
  if (legacyHash === currentHash) {
    const { hash: newHash, salt: newSalt } = await hashPin(enteredPin);
    return { valid: true, shouldMigrate: true, newHash, newSalt };
  }

  // 3. Migration path: check legacy plaintext (only for migration, never saved back)
  if (enteredPin === currentHash) {
    const { hash: newHash, salt: newSalt } = await hashPin(enteredPin);
    return { valid: true, shouldMigrate: true, newHash, newSalt };
  }

  return { valid: false, shouldMigrate: false };
}

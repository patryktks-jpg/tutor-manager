import { generateSalt } from './crypto';

export interface EncryptedBackupContainer {
  type: 'tutor_manager_encrypted_backup';
  version: number;
  kdf: 'PBKDF2';
  iterations: number;
  salt: string;       // hex
  iv: string;         // hex
  ciphertext: string; // hex
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derives an AES-GCM 256-bit key from a user password and salt using PBKDF2 (B7).
 */
async function deriveAesKey(password: string, salt: Uint8Array, iterations = 200000): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts backup JSON string using AES-GCM with a user-supplied password.
 */
export async function encryptBackup(jsonString: string, password: string): Promise<string> {
  const saltHex = generateSalt(16);
  const salt = hexToBytes(saltHex);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await deriveAesKey(password, salt, 200000);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(jsonString);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintext
  );

  const container: EncryptedBackupContainer = {
    type: 'tutor_manager_encrypted_backup',
    version: 1,
    kdf: 'PBKDF2',
    iterations: 200000,
    salt: saltHex,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encryptedBuffer))
  };

  return JSON.stringify(container, null, 2);
}

/**
 * Decrypts an encrypted backup container with password.
 * Throws an Error if password is incorrect or file is corrupted.
 */
export async function decryptBackup(containerJson: string, password: string): Promise<string> {
  const container: EncryptedBackupContainer = JSON.parse(containerJson);
  if (container.type !== 'tutor_manager_encrypted_backup') {
    throw new Error('Niepoprawny format zaszyfrowanej kopii zapasowej.');
  }

  const salt = hexToBytes(container.salt);
  const iv = hexToBytes(container.iv);
  const ciphertext = hexToBytes(container.ciphertext);

  const key = await deriveAesKey(password, salt, container.iterations || 200000);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch {
    throw new Error('Błędne hasło odszyfrowania lub uszkodzony plik kopii zapasowej.');
  }
}

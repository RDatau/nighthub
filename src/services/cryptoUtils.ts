/**
 * AES-256-GCM Encryption and Decryption utilities for database backup files
 * using the native W3C Web Cryptography API (crypto.subtle).
 */

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const PBKDF2_ITERATIONS = 100000;

export interface EncryptedBackupPayload {
  _encrypted: true;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  hint?: string;
  _exportMetadata?: any;
}

/**
 * Encrypts arbitrary serializable data with a master password using AES-256-GCM + PBKDF2.
 */
export async function encryptBackupData(
  data: any,
  masterPassword: string,
  hint?: string,
  metadata?: any
): Promise<EncryptedBackupPayload> {
  if (!masterPassword || masterPassword.trim().length === 0) {
    throw new Error('Master password cannot be empty.');
  }

  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(masterPassword);

  // Generate cryptographically secure random salt (16 bytes) and IV (12 bytes for AES-GCM)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Import raw password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive 256-bit AES-GCM encryption key
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Encrypt JSON plaintext
  const plaintextBuffer = encoder.encode(JSON.stringify(data));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    aesKey,
    plaintextBuffer
  );

  const payload: EncryptedBackupPayload = {
    _encrypted: true,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2',
    iterations: PBKDF2_ITERATIONS,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer)
  };

  if (hint && hint.trim()) {
    payload.hint = hint.trim();
  }

  if (metadata) {
    payload._exportMetadata = metadata;
  }

  return payload;
}

/**
 * Decrypts an AES-256-GCM encrypted backup payload with the master password.
 */
export async function decryptBackupData(
  encryptedPayload: EncryptedBackupPayload | any,
  masterPassword: string
): Promise<any> {
  if (!encryptedPayload || !encryptedPayload._encrypted) {
    throw new Error('Payload is not encrypted.');
  }
  if (!masterPassword) {
    throw new Error('Master password is required.');
  }

  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(masterPassword);

  const salt = base64ToBuffer(encryptedPayload.salt);
  const iv = base64ToBuffer(encryptedPayload.iv);
  const ciphertext = base64ToBuffer(encryptedPayload.ciphertext);
  const iterations = encryptedPayload.iterations || PBKDF2_ITERATIONS;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      aesKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonString);
  } catch (err) {
    // AES-GCM fails authentication tag validation if password or ciphertext is wrong
    throw new Error('DECRYPTION_FAILED');
  }
}

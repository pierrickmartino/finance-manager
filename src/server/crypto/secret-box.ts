import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/*
 * Encryption at rest for small secrets (the TOTP secret), with AES-256-GCM.
 * Stored form: `v1:<nonce>:<auth tag>:<ciphertext>`, each part base64.
 */

export const SECRET_KEY_ENV = 'TOTP_ENCRYPTION_KEY';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function encryptSecret(plaintext: string, key: Buffer): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join(':');
}

/** Throws when the value was tampered with or was sealed with another key. */
export function decryptSecret(sealed: string, key: Buffer): string {
  if (!isEncryptedSecret(sealed)) throw new Error('Not an encrypted secret');
  const [, nonce, tag, ciphertext] = sealed.split(':').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, key, nonce!, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString('utf8');
}

/** True for a value written by `encryptSecret` (a legacy plaintext Base32 secret is not). */
export function isEncryptedSecret(value: string): boolean {
  return /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * The key from the environment: 32 random bytes, base64 (`openssl rand -base64 32`).
 * Throws a clear message when it is missing or malformed.
 */
export function readSecretKey(env: Record<string, string | undefined> = process.env): Buffer {
  const encoded = env[SECRET_KEY_ENV]?.trim();
  if (!encoded) {
    throw new Error(
      `${SECRET_KEY_ENV} is not set. Generate one with \`openssl rand -base64 32\`.`,
    );
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`${SECRET_KEY_ENV} must be ${KEY_BYTES} bytes, base64-encoded`);
  }
  return key;
}

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, isEncryptedSecret, readSecretKey } from './secret-box';

const key = randomBytes(32);

describe('Secret box (AES-256-GCM)', () => {
  it('round-trips a secret and never stores it in the clear', () => {
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP', key);

    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(isEncryptedSecret(sealed)).toBe(true);
    expect(decryptSecret(sealed, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh nonce each time', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
  });

  it('refuses a tampered value or the wrong key', () => {
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const parts = sealed.split(':');
    const ciphertext = Buffer.from(parts[3]!, 'base64');
    ciphertext[0] = ciphertext[0]! ^ 1;
    const tampered = [...parts.slice(0, 3), ciphertext.toString('base64')].join(':');

    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
  });

  it('does not take a plaintext value for an encrypted one', () => {
    expect(isEncryptedSecret('JBSWY3DPEHPK3PXP')).toBe(false);
  });
});

describe('readSecretKey', () => {
  it('reads a base64 key of 32 bytes', () => {
    const encoded = key.toString('base64');

    expect(readSecretKey({ TOTP_ENCRYPTION_KEY: encoded }).equals(key)).toBe(true);
  });

  it('fails clearly when the key is missing or the wrong length', () => {
    expect(() => readSecretKey({})).toThrow(/TOTP_ENCRYPTION_KEY is not set/);
    expect(() =>
      readSecretKey({ TOTP_ENCRYPTION_KEY: randomBytes(16).toString('base64') }),
    ).toThrow(/32 bytes/);
  });
});

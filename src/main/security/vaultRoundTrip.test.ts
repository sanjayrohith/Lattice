import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '@main/db/database';
import { migrations } from '@main/db/migrations';
import { CredentialVault } from './credentialVault';
import type { SafeStorageEncryptor } from './credentialEncryption';
import type { SafeStorageDecryptor } from './credentialDecryption';

/**
 * A real (if toy) AES-256-GCM implementation standing in for Electron's
 * `safeStorage`, so this round-trip test exercises genuine byte-level
 * encrypt/decrypt fidelity rather than a string-prefix stub.
 */
function realisticSafeStorage(): SafeStorageEncryptor & SafeStorageDecryptor {
  const key = randomBytes(32);

  return {
    encryptString(plainText: string): Buffer {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return Buffer.concat([iv, authTag, ciphertext]);
    },
    decryptString(encrypted: Buffer): string {
      const iv = encrypted.subarray(0, 12);
      const authTag = encrypted.subarray(12, 28);
      const ciphertext = encrypted.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },
  };
}

describe('vault round trip', () => {
  let userDataPath: string;
  let db: Database.Database;
  let vault: CredentialVault;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-vault-roundtrip-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    vault = new CredentialVault(db, realisticSafeStorage());
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it.each([
    'sk-live-simple-ascii-key',
    'sk-with-unicode-🔑-emoji-and-áccents',
    'x'.repeat(4096),
    '{"nested":"json-shaped-secret","n":1}',
  ])('reproduces the exact plaintext for %s', (secret) => {
    vault.set('openai', secret);

    expect(vault.credentials.get('openai')).toBe(secret);
  });

  it('never persists the plaintext substring anywhere in the stored row', () => {
    const secret = 'sk-super-secret-value-should-not-appear-on-disk';
    vault.set('openai', secret);

    const row = db.prepare("SELECT value FROM settings WHERE key = 'credential:openai'").get() as
      | { value: string }
      | undefined;

    expect(row?.value).toBeDefined();
    expect(row?.value).not.toContain(secret);
  });

  it('reflects an overwrite on the very next decrypted read', () => {
    vault.set('openai', 'first-secret');
    expect(vault.credentials.get('openai')).toBe('first-secret');

    vault.set('openai', 'second-secret');
    expect(vault.credentials.get('openai')).toBe('second-secret');
  });

  it('returns undefined after delete rather than a stale cached plaintext', () => {
    vault.set('openai', 'to-be-deleted');
    vault.credentials.get('openai');

    vault.delete('openai');

    expect(vault.credentials.get('openai')).toBeUndefined();
  });
});

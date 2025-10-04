import type Database from 'better-sqlite3';

export interface SafeStorageEncryptor {
  encryptString(plainText: string): Buffer;
}

/** The `settings` table key prefix under which encrypted credential blobs are stored. */
export function credentialSettingsKey(id: string): string {
  return `credential:${id}`;
}

/**
 * Encrypts `plainText` with `safeStorage.encryptString` and returns the
 * resulting buffer as a base64 string — the only form a credential is
 * ever allowed to take once it leaves memory.
 */
export function encryptCredential(safeStorage: SafeStorageEncryptor, plainText: string): string {
  return safeStorage.encryptString(plainText).toString('base64');
}

/**
 * Encrypts `plainText` and upserts it into the `settings` table under
 * `credential:<id>`. No plaintext ever reaches SQLite: only the base64
 * encoding of the encrypted buffer is written.
 */
export function persistEncryptedCredential(
  db: Database.Database,
  safeStorage: SafeStorageEncryptor,
  id: string,
  plainText: string,
): void {
  const encoded = encryptCredential(safeStorage, plainText);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(credentialSettingsKey(id), encoded, now);
}

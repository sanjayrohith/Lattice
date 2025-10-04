import type Database from 'better-sqlite3';
import { credentialSettingsKey } from './credentialEncryption';

export interface SafeStorageDecryptor {
  decryptString(encrypted: Buffer): string;
}

/**
 * Decrypts a base64-encoded, `safeStorage`-encrypted blob back into
 * plaintext. Callers must not persist or forward the return value —
 * it exists only to be held in {@link CredentialCache}.
 */
export function decryptCredential(safeStorage: SafeStorageDecryptor, base64: string): string {
  return safeStorage.decryptString(Buffer.from(base64, 'base64'));
}

/**
 * Holds decrypted credential plaintext in main-process memory only. Reads
 * the encrypted blob from the `settings` table on first access, decrypts
 * it once, and serves subsequent lookups from this in-memory map so the
 * decrypted secret is never round-tripped back through SQLite or sent to
 * a renderer.
 */
export class CredentialCache {
  private readonly plaintextById = new Map<string, string>();

  constructor(
    private readonly db: Database.Database,
    private readonly safeStorage: SafeStorageDecryptor,
  ) {}

  get(id: string): string | undefined {
    const cached = this.plaintextById.get(id);
    if (cached !== undefined) return cached;

    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(credentialSettingsKey(id)) as { value: string } | undefined;
    if (!row) return undefined;

    const plaintext = decryptCredential(this.safeStorage, row.value);
    this.plaintextById.set(id, plaintext);
    return plaintext;
  }

  /** Evicts a credential from the in-memory cache, forcing the next `get` to re-read and re-decrypt it. */
  invalidate(id: string): void {
    this.plaintextById.delete(id);
  }

  /** Evicts every cached plaintext, e.g. after the vault deletes a credential. */
  clear(): void {
    this.plaintextById.clear();
  }
}

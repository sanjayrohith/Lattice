import type Database from 'better-sqlite3';
import { credentialSettingsKey, persistEncryptedCredential, type SafeStorageEncryptor } from './credentialEncryption';
import { CredentialCache, type SafeStorageDecryptor } from './credentialDecryption';

const CREDENTIAL_KEY_PREFIX = 'credential:';

export interface VaultCredentialMetadata {
  id: string;
  configured: true;
  updatedAt: string;
}

interface SettingsRow {
  key: string;
  updated_at: string;
}

/**
 * The main-process credential vault: `set`, `has`, `delete`, and `list`
 * over encrypted provider API keys. Every operation here is safe to
 * expose across the IPC boundary because none of them can return
 * plaintext — only presence and metadata ever leave this module toward
 * a renderer. Plaintext retrieval for actual provider calls happens
 * exclusively through {@link CredentialCache.get}, which this vault owns.
 */
export class CredentialVault {
  private readonly cache: CredentialCache;

  constructor(
    private readonly db: Database.Database,
    private readonly safeStorage: SafeStorageEncryptor & SafeStorageDecryptor,
  ) {
    this.cache = new CredentialCache(db, safeStorage);
  }

  /** Encrypts and stores `plainText` under `id`, overwriting any existing credential. */
  set(id: string, plainText: string): void {
    persistEncryptedCredential(this.db, this.safeStorage, id, plainText);
    this.cache.invalidate(id);
  }

  /** Returns whether a credential is configured for `id`, without revealing its value. */
  has(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM settings WHERE key = ?')
      .get(credentialSettingsKey(id));
    return row !== undefined;
  }

  /** Removes the credential stored under `id`, if any, and evicts it from the decrypted cache. */
  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM settings WHERE key = ?')
      .run(credentialSettingsKey(id));
    this.cache.invalidate(id);
    return result.changes > 0;
  }

  /** Lists metadata for every configured credential — ids and timestamps only, never values. */
  list(): VaultCredentialMetadata[] {
    const rows = this.db
      .prepare("SELECT key, updated_at FROM settings WHERE key LIKE ? ORDER BY key ASC")
      .all(`${CREDENTIAL_KEY_PREFIX}%`) as SettingsRow[];

    return rows.map((row) => ({
      id: row.key.slice(CREDENTIAL_KEY_PREFIX.length),
      configured: true,
      updatedAt: row.updated_at,
    }));
  }

  /** The in-memory decrypted-credential cache backing runtime provider calls. Never exposed over IPC. */
  get credentials(): CredentialCache {
    return this.cache;
  }
}

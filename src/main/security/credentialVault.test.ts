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

function fakeSafeStorage(): SafeStorageEncryptor & SafeStorageDecryptor {
  return {
    encryptString: (plainText) => Buffer.from(`enc:${plainText}`, 'utf8'),
    decryptString: (encrypted) => encrypted.toString('utf8').replace(/^enc:/, ''),
  };
}

describe('CredentialVault', () => {
  let userDataPath: string;
  let db: Database.Database;
  let vault: CredentialVault;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-vault-api-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    vault = new CredentialVault(db, fakeSafeStorage());
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('reports not configured before set and configured after', () => {
    expect(vault.has('openai')).toBe(false);
    vault.set('openai', 'sk-secret');
    expect(vault.has('openai')).toBe(true);
  });

  it('resolves the decrypted plaintext only through the credentials cache', () => {
    vault.set('openai', 'sk-secret');
    expect(vault.credentials.get('openai')).toBe('sk-secret');
  });

  it('lists metadata without plaintext for every configured credential', () => {
    vault.set('openai', 'sk-1');
    vault.set('anthropic', 'sk-2');

    const list = vault.list();
    expect(list.map((c) => c.id).sort()).toEqual(['anthropic', 'openai']);
    for (const entry of list) {
      expect(JSON.stringify(entry)).not.toContain('sk-1');
      expect(JSON.stringify(entry)).not.toContain('sk-2');
      expect(entry.configured).toBe(true);
    }
  });

  it('deletes a credential and evicts it from the cache', () => {
    vault.set('openai', 'sk-secret');
    vault.credentials.get('openai');

    expect(vault.delete('openai')).toBe(true);
    expect(vault.has('openai')).toBe(false);
    expect(vault.credentials.get('openai')).toBeUndefined();
  });

  it('returns false when deleting a credential that does not exist', () => {
    expect(vault.delete('missing')).toBe(false);
  });
});

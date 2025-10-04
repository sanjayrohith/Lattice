import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '@main/db/database';
import { migrations } from '@main/db/migrations';
import { persistEncryptedCredential, type SafeStorageEncryptor } from './credentialEncryption';
import { CredentialCache, decryptCredential, type SafeStorageDecryptor } from './credentialDecryption';

function fakeSafeStorage(): SafeStorageEncryptor & SafeStorageDecryptor {
  return {
    encryptString: (plainText) => Buffer.from(`enc:${plainText}`, 'utf8'),
    decryptString: (encrypted) => encrypted.toString('utf8').replace(/^enc:/, ''),
  };
}

describe('decryptCredential', () => {
  it('round trips through encrypt then decrypt', () => {
    const safeStorage = fakeSafeStorage();
    const base64 = Buffer.from('enc:sk-secret', 'utf8').toString('base64');

    expect(decryptCredential(safeStorage, base64)).toBe('sk-secret');
  });
});

describe('CredentialCache', () => {
  let userDataPath: string;
  let db: Database.Database;
  let safeStorage: SafeStorageEncryptor & SafeStorageDecryptor;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-cache-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    safeStorage = fakeSafeStorage();
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('decrypts and returns the stored credential', () => {
    persistEncryptedCredential(db, safeStorage, 'openai', 'sk-secret');
    const cache = new CredentialCache(db, safeStorage);

    expect(cache.get('openai')).toBe('sk-secret');
  });

  it('returns undefined when no credential is stored', () => {
    const cache = new CredentialCache(db, safeStorage);

    expect(cache.get('missing')).toBeUndefined();
  });

  it('decrypts only once and serves subsequent reads from memory', () => {
    persistEncryptedCredential(db, safeStorage, 'openai', 'sk-secret');
    const decryptString = vi.spyOn(safeStorage, 'decryptString');
    const cache = new CredentialCache(db, safeStorage);

    cache.get('openai');
    cache.get('openai');
    cache.get('openai');

    expect(decryptString).toHaveBeenCalledTimes(1);
  });

  it('re-decrypts after invalidate', () => {
    persistEncryptedCredential(db, safeStorage, 'openai', 'sk-secret');
    const decryptString = vi.spyOn(safeStorage, 'decryptString');
    const cache = new CredentialCache(db, safeStorage);

    cache.get('openai');
    cache.invalidate('openai');
    cache.get('openai');

    expect(decryptString).toHaveBeenCalledTimes(2);
  });

  it('clears every cached credential', () => {
    persistEncryptedCredential(db, safeStorage, 'openai', 'sk-1');
    persistEncryptedCredential(db, safeStorage, 'anthropic', 'sk-2');
    const decryptString = vi.spyOn(safeStorage, 'decryptString');
    const cache = new CredentialCache(db, safeStorage);

    cache.get('openai');
    cache.get('anthropic');
    cache.clear();
    cache.get('openai');
    cache.get('anthropic');

    expect(decryptString).toHaveBeenCalledTimes(4);
  });
});

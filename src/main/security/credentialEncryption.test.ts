import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '@main/db/database';
import { migrations } from '@main/db/migrations';
import {
  credentialSettingsKey,
  encryptCredential,
  persistEncryptedCredential,
  type SafeStorageEncryptor,
} from './credentialEncryption';

const fakeSafeStorage: SafeStorageEncryptor = {
  encryptString: (plainText) => Buffer.from(`enc:${plainText}`, 'utf8'),
};

describe('encryptCredential', () => {
  it('returns the base64 encoding of the encrypted buffer', () => {
    const encoded = encryptCredential(fakeSafeStorage, 'sk-secret');

    expect(encoded).toBe(Buffer.from('enc:sk-secret', 'utf8').toString('base64'));
  });
});

describe('persistEncryptedCredential', () => {
  let userDataPath: string;
  let db: Database.Database;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-vault-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('writes only the encrypted base64 value, never the plaintext', () => {
    persistEncryptedCredential(db, fakeSafeStorage, 'openai', 'sk-super-secret');

    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(credentialSettingsKey('openai')) as { value: string } | undefined;

    expect(row?.value).toBe(encryptCredential(fakeSafeStorage, 'sk-super-secret'));
    expect(row?.value).not.toContain('sk-super-secret');
  });

  it('overwrites a previously stored credential for the same id', () => {
    persistEncryptedCredential(db, fakeSafeStorage, 'openai', 'first-key');
    persistEncryptedCredential(db, fakeSafeStorage, 'openai', 'second-key');

    const rows = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .all(credentialSettingsKey('openai'));

    expect(rows).toHaveLength(1);
    expect((rows[0] as { value: string }).value).toBe(
      encryptCredential(fakeSafeStorage, 'second-key'),
    );
  });
});

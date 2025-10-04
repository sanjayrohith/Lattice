import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) =>
        handlers.get(channel)?.({ sender: { id: 1 } }, payload),
    },
  };
});

describe('registerVaultHandlers', () => {
  let userDataPath: string;
  let db: Database.Database;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-vault-handlers-test-'));
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  async function setup() {
    const { openDatabase, runMigrations } = await import('@main/db/database');
    const { migrations } = await import('@main/db/migrations');
    const { CredentialVault } = await import('./credentialVault');
    const { registerVaultHandlers } = await import('./registerVaultHandlers');
    const { ipcMain } = await import('electron');

    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    const vault = new CredentialVault(db, {
      encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, 'utf8'),
      decryptString: (encrypted: Buffer) => encrypted.toString('utf8').replace(/^enc:/, ''),
    });
    registerVaultHandlers(vault);

    const invoke = (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> })
      .__invoke;

    return { invoke, vault };
  }

  it('sets and reports a configured credential without leaking plaintext', async () => {
    const { invoke } = await setup();

    const setResult = (await invoke('vault:set', { id: 'openai', value: 'sk-secret' })) as {
      ok: boolean;
    };
    expect(setResult.ok).toBe(true);
    expect(JSON.stringify(setResult)).not.toContain('sk-secret');

    const hasResult = (await invoke('vault:has', { id: 'openai' })) as {
      ok: boolean;
      data: { configured: boolean };
    };
    expect(hasResult.data.configured).toBe(true);
  });

  it('lists configured credentials without plaintext', async () => {
    const { invoke } = await setup();
    await invoke('vault:set', { id: 'openai', value: 'sk-secret' });

    const listResult = (await invoke('vault:list', undefined)) as {
      data: { credentials: Array<{ id: string }> };
    };

    expect(listResult.data.credentials).toEqual([
      expect.objectContaining({ id: 'openai', configured: true }),
    ]);
    expect(JSON.stringify(listResult)).not.toContain('sk-secret');
  });

  it('deletes a credential', async () => {
    const { invoke } = await setup();
    await invoke('vault:set', { id: 'openai', value: 'sk-secret' });

    const deleteResult = (await invoke('vault:delete', { id: 'openai' })) as {
      data: { deleted: boolean };
    };
    expect(deleteResult.data.deleted).toBe(true);

    const hasResult = (await invoke('vault:has', { id: 'openai' })) as {
      data: { configured: boolean };
    };
    expect(hasResult.data.configured).toBe(false);
  });

  it('rejects a malformed set payload before touching the vault', async () => {
    const { invoke } = await setup();

    const result = (await invoke('vault:set', { id: '' })) as { ok: boolean; error?: { code: string } };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_PAYLOAD');
  });
});

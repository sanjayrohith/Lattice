import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IPC_CHANNELS } from './channels';
import { ipcContracts } from './contracts';

/**
 * Statically walks a Zod schema's declared object keys (one level deep,
 * which is all any current vault response uses) looking for a field name
 * that could plausibly carry a decrypted credential value back to a
 * renderer.
 */
function objectKeys(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  return [];
}

const FORBIDDEN_FIELD_NAMES = new Set(['value', 'plaintext', 'secret', 'key', 'apiKey', 'credential']);

describe('vault IPC contracts never expose plaintext', () => {
  const vaultResponseChannels = [
    IPC_CHANNELS.VAULT_HAS,
    IPC_CHANNELS.VAULT_DELETE,
    IPC_CHANNELS.VAULT_LIST,
  ] as const;

  it('vault:set response carries no data at all', () => {
    const schema = ipcContracts[IPC_CHANNELS.VAULT_SET].response;
    expect(schema.safeParse(undefined).success).toBe(true);
  });

  it.each(vaultResponseChannels)('%s response schema declares no plaintext-shaped field', (channel) => {
    const keys = objectKeys(ipcContracts[channel].response);
    for (const key of keys) {
      expect(FORBIDDEN_FIELD_NAMES.has(key)).toBe(false);
    }
  });

  it('vault:list only ever describes credential presence and timestamps', () => {
    const schema = ipcContracts[IPC_CHANNELS.VAULT_LIST].response;
    const parsed = schema.parse({
      credentials: [{ id: 'openai', configured: true, updatedAt: '2025-01-01T00:00:00.000Z' }],
    });

    expect(Object.keys(parsed.credentials[0] as object).sort()).toEqual([
      'configured',
      'id',
      'updatedAt',
    ]);
  });

  it('strips an injected plaintext-shaped field from vault:has and vault:delete responses', () => {
    const hasParsed = ipcContracts[IPC_CHANNELS.VAULT_HAS].response.parse({
      configured: true,
      value: 'sk-secret',
    });
    expect(hasParsed).toEqual({ configured: true });

    const deleteParsed = ipcContracts[IPC_CHANNELS.VAULT_DELETE].response.parse({
      deleted: true,
      value: 'sk-secret',
    });
    expect(deleteParsed).toEqual({ deleted: true });
  });
});

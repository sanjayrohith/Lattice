import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from './channels';
import { errResult, ipcContracts, ipcResultSchema, okResult } from './contracts';

describe('ipcResultSchema envelope', () => {
  const schema = ipcResultSchema(ipcContracts[IPC_CHANNELS.APP_INFO].response);

  it('accepts a well-formed success envelope', () => {
    const result = okResult({
      appVersion: '0.1.0',
      electronVersion: '33.0.0',
      chromeVersion: '130.0.0',
      platform: 'linux',
      userDataPath: '/tmp/lattice',
    });

    expect(schema.safeParse(result).success).toBe(true);
  });

  it('accepts a well-formed failure envelope', () => {
    const result = errResult('UNKNOWN_CHANNEL', 'no handler registered');
    expect(schema.safeParse(result).success).toBe(true);
  });

  it('rejects a success envelope whose data violates the response schema', () => {
    const malformed = { ok: true, data: { appVersion: 123 } };
    expect(schema.safeParse(malformed).success).toBe(false);
  });

  it('rejects a payload missing the ok discriminant', () => {
    expect(schema.safeParse({ data: {} }).success).toBe(false);
  });
});

describe('ipcContracts', () => {
  it('defines a request and response schema for every declared channel', () => {
    for (const contract of Object.values(ipcContracts)) {
      expect(contract.request).toBeDefined();
      expect(contract.response).toBeDefined();
    }
  });

  it('validates the app:info request as void (no payload)', () => {
    expect(ipcContracts[IPC_CHANNELS.APP_INFO].request.safeParse(undefined).success).toBe(true);
  });

  it('rejects a state:dispatch request with an empty patch list', () => {
    const result = ipcContracts[IPC_CHANNELS.STATE_DISPATCH].request.safeParse({ patches: [] });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';

describe('window.electronAPI ambient typing', () => {
  it('exposes a typed invoke method callable with a known channel', async () => {
    const invoke = async (
      _channel: string,
      _payload: unknown,
    ): Promise<{ ok: true; data: unknown }> => ({ ok: true, data: undefined });

    (globalThis as unknown as { window: { electronAPI: { invoke: typeof invoke } } }).window = {
      electronAPI: { invoke },
    };

    const result = await window.electronAPI.invoke(IPC_CHANNELS.APP_INFO, undefined);
    expect(result.ok).toBe(true);
  });
});

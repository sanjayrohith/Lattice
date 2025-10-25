import { describe, expect, it, vi } from 'vitest';
import type { ConsentGate } from '../consent/consentGate';
import type { AcpConnection } from './acpConnection';
import { ACP_PERMISSION_OPTIONS, ACP_REQUEST_PERMISSION_METHOD, registerAcpPermissionBridge } from './acpPermissionBridge';

function fakeConnection(): { connection: AcpConnection; invoke: (params: unknown) => Promise<unknown> } {
  let listener: (method: string, params: unknown, respond?: (result: unknown) => void) => void = () => undefined;
  const connection = {
    onPeerMessage: vi.fn((l: typeof listener) => {
      listener = l;
      return () => undefined;
    }),
  } as unknown as AcpConnection;

  const invoke = (params: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      listener(ACP_REQUEST_PERMISSION_METHOD, params, resolve);
    });

  return { connection, invoke };
}

describe('registerAcpPermissionBridge', () => {
  it('routes an inbound permission request through the consent gate and maps acceptance', async () => {
    const requestConsent = vi.fn().mockResolvedValue('accepted');
    const consentGate = { requestConsent } as unknown as ConsentGate;
    const { connection, invoke } = fakeConnection();
    registerAcpPermissionBridge(connection, consentGate);

    const result = await invoke({
      sessionId: 'sess-1',
      toolCall: { toolCallId: 'tc-1', title: 'write_file' },
      input: { path: 'a.txt' },
    });

    expect(requestConsent).toHaveBeenCalledWith(
      'sess-1',
      { toolCallId: 'tc-1', toolName: 'write_file', input: { path: 'a.txt' } },
      'ask',
    );
    expect(result).toEqual({
      outcome: { outcome: 'selected', optionId: ACP_PERMISSION_OPTIONS.ACCEPT_ONCE },
    });
  });

  it('maps a decline to the decline option', async () => {
    const requestConsent = vi.fn().mockResolvedValue('declined');
    const consentGate = { requestConsent } as unknown as ConsentGate;
    const { connection, invoke } = fakeConnection();
    registerAcpPermissionBridge(connection, consentGate);

    const result = await invoke({
      sessionId: 'sess-1',
      toolCall: { toolCallId: 'tc-1', kind: 'edit' },
    });

    expect(result).toEqual({
      outcome: { outcome: 'selected', optionId: ACP_PERMISSION_OPTIONS.DECLINE },
    });
  });

  it('responds with a cancelled outcome for a malformed request', async () => {
    const consentGate = { requestConsent: vi.fn() } as unknown as ConsentGate;
    const { connection, invoke } = fakeConnection();
    registerAcpPermissionBridge(connection, consentGate);

    const result = await invoke({ nonsense: true });
    expect(result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('ignores calls for unrelated methods', () => {
    const consentGate = { requestConsent: vi.fn() } as unknown as ConsentGate;
    let listener: (method: string, params: unknown, respond?: (result: unknown) => void) => void = () => undefined;
    const connection = {
      onPeerMessage: vi.fn((l: typeof listener) => {
        listener = l;
        return () => undefined;
      }),
    } as unknown as AcpConnection;
    registerAcpPermissionBridge(connection, consentGate);

    const respond = vi.fn();
    listener('some/other', {}, respond);
    expect(respond).not.toHaveBeenCalled();
    expect(consentGate.requestConsent).not.toHaveBeenCalled();
  });
});

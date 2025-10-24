import { describe, expect, it, vi } from 'vitest';
import type { AcpTransport } from './acpTransport';
import { AcpCapabilityError, AcpConnection, AcpNotInitializedError, ACP_PROTOCOL_VERSION } from './acpConnection';

function fakeTransport(overrides?: Partial<AcpTransport>): AcpTransport {
  return {
    sendRequest: vi.fn(),
    sendNotification: vi.fn(),
    onPeerMessage: vi.fn(() => () => undefined),
    close: vi.fn(),
    ...overrides,
  };
}

describe('AcpConnection.initialize', () => {
  it('negotiates the lower of the two proposed protocol versions and stores capabilities', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      protocolVersion: 0,
      agentCapabilities: { loadSession: true },
    });
    const connection = new AcpConnection(fakeTransport({ sendRequest }));

    const capabilities = await connection.initialize();

    expect(sendRequest).toHaveBeenCalledWith('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    expect(connection.protocolVersion).toBe(0);
    expect(capabilities).toEqual({ loadSession: true });
    expect(connection.isInitialized).toBe(true);
  });

  it('defaults capabilities to an empty object when the peer omits them', async () => {
    const sendRequest = vi.fn().mockResolvedValue({ protocolVersion: 1 });
    const connection = new AcpConnection(fakeTransport({ sendRequest }));
    await connection.initialize();
    expect(connection.capabilities).toEqual({});
  });
});

describe('capability and initialization gating', () => {
  it('requireInitialized throws before initialize completes', () => {
    const connection = new AcpConnection(fakeTransport());
    expect(() => connection.requireInitialized()).toThrow(AcpNotInitializedError);
  });

  it('requireCapability throws for an undeclared capability', async () => {
    const sendRequest = vi.fn().mockResolvedValue({ protocolVersion: 1, agentCapabilities: {} });
    const connection = new AcpConnection(fakeTransport({ sendRequest }));
    await connection.initialize();
    expect(() => connection.requireCapability('loadSession')).toThrow(AcpCapabilityError);
  });

  it('requireCapability passes for a declared capability', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      protocolVersion: 1,
      agentCapabilities: { loadSession: true },
    });
    const connection = new AcpConnection(fakeTransport({ sendRequest }));
    await connection.initialize();
    expect(() => connection.requireCapability('loadSession')).not.toThrow();
  });
});

describe('request/notify/close delegation', () => {
  it('delegates request, notify, onPeerMessage, and close to the transport', () => {
    const transport = fakeTransport();
    const connection = new AcpConnection(transport);

    connection.notify('session/update', { a: 1 });
    expect(transport.sendNotification).toHaveBeenCalledWith('session/update', { a: 1 });

    void connection.request('session/prompt', { b: 2 });
    expect(transport.sendRequest).toHaveBeenCalledWith('session/prompt', { b: 2 });

    const listener = vi.fn();
    connection.onPeerMessage(listener);
    expect(transport.onPeerMessage).toHaveBeenCalledWith(listener);

    connection.close();
    expect(transport.close).toHaveBeenCalled();
  });
});

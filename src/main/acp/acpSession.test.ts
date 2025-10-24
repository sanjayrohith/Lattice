import { describe, expect, it, vi } from 'vitest';
import type { AcpConnection } from './acpConnection';
import { AcpSessionCreationError, AcpSessionRegistry, createAcpSession } from './acpSession';

function fakeConnection(request: ReturnType<typeof vi.fn>): AcpConnection {
  return {
    requireInitialized: vi.fn(),
    request,
  } as unknown as AcpConnection;
}

describe('createAcpSession', () => {
  it('sends session/new with the workspace cwd and returns the session id', async () => {
    const request = vi.fn().mockResolvedValue({ sessionId: 'sess-1' });
    const connection = fakeConnection(request);

    const session = await createAcpSession(connection, '/workspace/root');

    expect(request).toHaveBeenCalledWith('session/new', { cwd: '/workspace/root' });
    expect(session).toEqual({ sessionId: 'sess-1', workspaceDirectory: '/workspace/root' });
  });

  it('throws AcpSessionCreationError when the result has no session id', async () => {
    const request = vi.fn().mockResolvedValue({});
    const connection = fakeConnection(request);
    await expect(createAcpSession(connection, '/workspace/root')).rejects.toBeInstanceOf(
      AcpSessionCreationError,
    );
  });

  it('requires the connection to already be initialized', async () => {
    const request = vi.fn().mockResolvedValue({ sessionId: 's' });
    const connection = fakeConnection(request);
    (connection.requireInitialized as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not initialized');
    });
    await expect(createAcpSession(connection, '/root')).rejects.toThrow('not initialized');
  });
});

describe('AcpSessionRegistry', () => {
  it('adds, gets, lists, and removes sessions', () => {
    const registry = new AcpSessionRegistry();
    registry.add({ sessionId: 'a', workspaceDirectory: '/a' });
    registry.add({ sessionId: 'b', workspaceDirectory: '/b' });

    expect(registry.get('a')).toEqual({ sessionId: 'a', workspaceDirectory: '/a' });
    expect(registry.list()).toHaveLength(2);
    expect(registry.remove('a')).toBe(true);
    expect(registry.get('a')).toBeUndefined();
    expect(registry.remove('missing')).toBe(false);
  });
});

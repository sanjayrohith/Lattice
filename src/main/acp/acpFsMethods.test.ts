import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpConnection } from './acpConnection';
import { ACP_FS_METHODS, registerAcpFsHandlers } from './acpFsMethods';
import { WorkspacePathEscapeError } from '../tools/pathSandbox';

describe('registerAcpFsHandlers', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'acp-fs-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  function fakeConnection(): { connection: AcpConnection; invoke: (method: string, params: unknown) => Promise<unknown> } {
    let listener: (method: string, params: unknown, respond?: (result: unknown) => void) => void = () => undefined;
    const connection = {
      onPeerMessage: vi.fn((l: typeof listener) => {
        listener = l;
        return () => undefined;
      }),
    } as unknown as AcpConnection;

    const invoke = (method: string, params: unknown): Promise<unknown> =>
      new Promise((resolve) => {
        listener(method, params, resolve);
      });

    return { connection, invoke };
  }

  it('reads a file within the workspace via fs/read_text_file', async () => {
    await writeFile(join(workspaceRoot, 'a.txt'), 'hello world');
    const { connection, invoke } = fakeConnection();
    registerAcpFsHandlers(connection, workspaceRoot);

    const result = await invoke(ACP_FS_METHODS.READ_TEXT_FILE, { sessionId: 's', path: 'a.txt' });
    expect(result).toEqual({ content: 'hello world' });
  });

  it('writes a file within the workspace via fs/write_text_file', async () => {
    const { connection, invoke } = fakeConnection();
    registerAcpFsHandlers(connection, workspaceRoot);

    await invoke(ACP_FS_METHODS.WRITE_TEXT_FILE, { sessionId: 's', path: 'nested/b.txt', content: 'written' });
    const written = await readFile(join(workspaceRoot, 'nested/b.txt'), 'utf-8');
    expect(written).toBe('written');
  });

  it('responds with a structured error for a read that escapes the workspace root', async () => {
    const { connection, invoke } = fakeConnection();
    registerAcpFsHandlers(connection, workspaceRoot);

    const result = await invoke(ACP_FS_METHODS.READ_TEXT_FILE, {
      sessionId: 's',
      path: '../../etc/passwd',
    });
    expect(result).toMatchObject({ error: { code: new WorkspacePathEscapeError('x').code } });
  });

  it('ignores unrelated methods and notifications with no respond callback', () => {
    const { connection } = fakeConnection();
    expect(() => registerAcpFsHandlers(connection, workspaceRoot)).not.toThrow();
  });
});

import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { atomicWriteFile } from '../tools/atomicWrite';
import { resolveWorkspacePath } from '../tools/pathSandbox';
import type { AcpConnection } from './acpConnection';

const readTextFileParamsSchema = z.object({
  sessionId: z.string(),
  path: z.string().min(1),
});

const writeTextFileParamsSchema = z.object({
  sessionId: z.string(),
  path: z.string().min(1),
  content: z.string(),
});

/** ACP client-side method names the agent may call back into the client for. */
export const ACP_FS_METHODS = {
  READ_TEXT_FILE: 'fs/read_text_file',
  WRITE_TEXT_FILE: 'fs/write_text_file',
} as const;

/**
 * Registers handlers for the client-side filesystem methods an ACP
 * agent may invoke on this connection (`fs/read_text_file`,
 * `fs/write_text_file`), routing every path through the same
 * {@link resolveWorkspacePath} sandbox local tools use so an external
 * agent process can never escape the workspace root any more than a
 * local tool call could. Returns the unsubscribe function.
 */
export function registerAcpFsHandlers(connection: AcpConnection, workspaceRoot: string): () => void {
  return connection.onPeerMessage((method, params, respond) => {
    if (!respond) return;

    if (method === ACP_FS_METHODS.READ_TEXT_FILE) {
      void handleReadTextFile(params, workspaceRoot, respond);
      return;
    }

    if (method === ACP_FS_METHODS.WRITE_TEXT_FILE) {
      void handleWriteTextFile(params, workspaceRoot, respond);
    }
  });
}

function errorResult(error: unknown): { error: { code: string; message: string } } {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'FS_METHOD_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  return { error: { code, message } };
}

async function handleReadTextFile(
  params: unknown,
  workspaceRoot: string,
  respond: (result: unknown) => void,
): Promise<void> {
  try {
    const parsed = readTextFileParamsSchema.parse(params);
    const resolvedPath = resolveWorkspacePath(workspaceRoot, parsed.path);
    const content = await readFile(resolvedPath, 'utf-8');
    respond({ content });
  } catch (error) {
    respond(errorResult(error));
  }
}

async function handleWriteTextFile(
  params: unknown,
  workspaceRoot: string,
  respond: (result: unknown) => void,
): Promise<void> {
  try {
    const parsed = writeTextFileParamsSchema.parse(params);
    const resolvedPath = resolveWorkspacePath(workspaceRoot, parsed.path);
    await atomicWriteFile(resolvedPath, parsed.content);
    respond({});
  } catch (error) {
    respond(errorResult(error));
  }
}

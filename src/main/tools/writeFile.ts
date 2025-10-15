import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile as fsWriteFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { resolveWorkspacePath } from './pathSandbox';
import { defineTool } from './types';

export const writeFileInputSchema = z.object({
  path: z.string().min(1).describe('the workspace-relative path of the file to write'),
  content: z.string().describe('the full text content to write to the file'),
});

export interface WriteFileOutput {
  path: string;
  bytesWritten: number;
}

/**
 * Writes `content` to a workspace file, sandboxed against path escape,
 * creating any missing parent directories. The write itself is atomic:
 * content lands in a sibling temp file first, which is then renamed over
 * the target — a rename is a single filesystem operation, so a crash
 * mid-write can never leave the target file half-written. Requires
 * consent, since it can create or overwrite workspace content.
 */
export const writeFileTool = defineTool({
  name: 'write_file',
  description: 'writes text content to a workspace file, creating parent directories as needed',
  inputSchema: writeFileInputSchema,
  defaultConsent: 'ask',
  execute: async (input, context): Promise<WriteFileOutput> => {
    const resolvedPath = resolveWorkspacePath(context.workspaceRoot, input.path);
    const directory = dirname(resolvedPath);
    await mkdir(directory, { recursive: true });

    const tempPath = `${resolvedPath}.tmp-${randomUUID()}`;
    const buffer = Buffer.from(input.content, 'utf-8');

    try {
      await fsWriteFile(tempPath, buffer);
      await rename(tempPath, resolvedPath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }

    return { path: input.path, bytesWritten: buffer.length };
  },
});

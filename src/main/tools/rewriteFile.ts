import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { withFileLock } from '../locks/withFileLock';
import { atomicWriteFile } from './atomicWrite';
import { resolveWorkspacePath } from './pathSandbox';
import { defineTool } from './types';

export const rewriteFileInputSchema = z.object({
  path: z.string().min(1).describe('the workspace-relative path of the file to rewrite'),
  content: z
    .string()
    .describe('the replacement content; replaces the whole file, or just the given line range'),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('1-indexed first line to replace, inclusive; omit to replace the entire file'),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('1-indexed last line to replace, inclusive; omit to replace the entire file'),
});

export interface RewriteFileOutput {
  path: string;
  bytesWritten: number;
}

/**
 * The fallback tool for when `edit_file`'s exact search-and-replace can't
 * find a unique match — the model escalates here to replace either a
 * specific line range or the file's entire content wholesale, rather
 * than continuing to guess at a search string. Requires consent, since
 * it modifies workspace content.
 */
export const rewriteFileTool = defineTool({
  name: 'rewrite_file',
  description:
    'replaces a workspace file entirely, or a specific line range within it, escalating past a failed edit_file',
  inputSchema: rewriteFileInputSchema,
  defaultConsent: 'ask',
  execute: async (input, context): Promise<RewriteFileOutput> => {
    const resolvedPath = resolveWorkspacePath(context.workspaceRoot, input.path);

    const bytesWritten = await withFileLock(context, resolvedPath, async () => {
      if (input.startLine === undefined && input.endLine === undefined) {
        return atomicWriteFile(resolvedPath, input.content);
      }

      const original = await readFile(resolvedPath, 'utf-8');
      const lines = original.split('\n');
      const from = Math.max(1, input.startLine ?? 1);
      const to = Math.min(lines.length, input.endLine ?? lines.length);

      const rewritten = [...lines.slice(0, from - 1), input.content, ...lines.slice(to)].join('\n');
      return atomicWriteFile(resolvedPath, rewritten);
    });

    return { path: input.path, bytesWritten };
  },
});

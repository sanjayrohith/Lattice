import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { detectEncoding } from './readFile';
import { matchesAnyGlob } from './globMatch';
import { resolveWorkspacePath } from './pathSandbox';
import { defineTool } from './types';

export interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

async function collectFiles(
  absoluteRoot: string,
  currentDir: string,
  ignorePatterns: readonly string[],
  files: string[],
): Promise<void> {
  const dirents = await readdir(currentDir, { withFileTypes: true });
  for (const dirent of [...dirents].sort((a, b) => a.name.localeCompare(b.name))) {
    if (matchesAnyGlob(dirent.name, ignorePatterns)) continue;

    const entryPath = join(currentDir, dirent.name);
    if (dirent.isDirectory()) {
      await collectFiles(absoluteRoot, entryPath, ignorePatterns, files);
    } else if (dirent.isFile()) {
      files.push(entryPath);
    }
  }
}

export const grepSearchInputSchema = z.object({
  pattern: z.string().min(1).describe('the regular expression to search for, applied per line'),
  path: z.string().default('.').describe('the workspace-relative directory to search within'),
  ignorePatterns: z
    .array(z.string())
    .default(['node_modules', '.git'])
    .describe('basename glob patterns excluded from the search'),
  caseSensitive: z.boolean().default(true).describe('whether the pattern match is case-sensitive'),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(200)
    .describe('cap on the number of matches returned; search stops once reached'),
});

/**
 * Searches workspace file contents for `pattern`, line by line, sandboxed
 * against path escape and skipping binary files. Stops as soon as
 * `maxResults` matches are collected — on a large tree this is a cheap,
 * early-exit way to keep the model's context window bounded — and reports
 * whether the cap was hit via `truncated`. Safe to run without consent —
 * it can only ever read.
 */
export const grepSearchTool = defineTool({
  name: 'grep_search',
  description: 'searches workspace file contents for a regular expression, line by line',
  inputSchema: grepSearchInputSchema,
  defaultConsent: 'always',
  execute: async (input, context): Promise<{ matches: GrepMatch[]; truncated: boolean }> => {
    const resolvedRoot = resolveWorkspacePath(context.workspaceRoot, input.path);
    const regex = new RegExp(input.pattern, input.caseSensitive ? '' : 'i');

    const files: string[] = [];
    await collectFiles(resolvedRoot, resolvedRoot, input.ignorePatterns, files);

    const matches: GrepMatch[] = [];
    let truncated = false;

    for (const filePath of files) {
      const buffer = await readFile(filePath);
      if (detectEncoding(buffer) === 'binary') continue;

      const lines = buffer.toString('utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (regex.test(line)) {
          matches.push({ file: relative(resolvedRoot, filePath), line: i + 1, text: line });
          if (matches.length >= input.maxResults) {
            truncated = true;
            break;
          }
        }
      }
      if (truncated) break;
    }

    return { matches, truncated };
  },
});

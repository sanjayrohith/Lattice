import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { resolveWorkspacePath } from './pathSandbox';
import { defineTool } from './types';

export type DirectoryEntryType = 'file' | 'directory' | 'symlink' | 'other';

export interface DirectoryEntry {
  path: string;
  type: DirectoryEntryType;
  depth: number;
}

/** Converts a simple `*`-wildcard glob (matched against a basename) into a `RegExp`. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function isIgnored(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(name));
}

async function walk(
  absoluteRoot: string,
  currentDir: string,
  depth: number,
  maxDepth: number,
  ignorePatterns: readonly string[],
  entries: DirectoryEntry[],
): Promise<void> {
  const dirents = await readdir(currentDir, { withFileTypes: true });
  const sorted = [...dirents].sort((a, b) => a.name.localeCompare(b.name));

  for (const dirent of sorted) {
    if (isIgnored(dirent.name, ignorePatterns)) continue;

    const entryPath = join(currentDir, dirent.name);
    const type: DirectoryEntryType = dirent.isDirectory()
      ? 'directory'
      : dirent.isSymbolicLink()
        ? 'symlink'
        : dirent.isFile()
          ? 'file'
          : 'other';

    entries.push({ path: relative(absoluteRoot, entryPath), type, depth });

    if (type === 'directory' && depth < maxDepth) {
      await walk(absoluteRoot, entryPath, depth + 1, maxDepth, ignorePatterns, entries);
    }
  }
}

export const listDirectoryInputSchema = z.object({
  path: z.string().default('.').describe('the workspace-relative directory to list'),
  maxDepth: z
    .number()
    .int()
    .positive()
    .max(10)
    .default(1)
    .describe('how many directory levels to descend; 1 lists only immediate children'),
  ignorePatterns: z
    .array(z.string())
    .default([])
    .describe('basename glob patterns (e.g. "node_modules", "*.log") to exclude from the listing'),
});

/**
 * Lists a workspace directory's entries, sandboxed against path escape,
 * with each entry annotated by type and the depth it was found at, up to
 * `maxDepth` levels, skipping any basename matching an ignore pattern.
 * Safe to run without consent — it can only ever read directory metadata.
 */
export const listDirectoryTool = defineTool({
  name: 'list_directory',
  description: 'lists the files and directories under a workspace directory',
  inputSchema: listDirectoryInputSchema,
  defaultConsent: 'always',
  execute: async (input, context): Promise<{ entries: DirectoryEntry[] }> => {
    const resolvedRoot = resolveWorkspacePath(context.workspaceRoot, input.path);
    const entries: DirectoryEntry[] = [];
    await walk(resolvedRoot, resolvedRoot, 1, input.maxDepth, input.ignorePatterns, entries);
    return { entries };
  },
});

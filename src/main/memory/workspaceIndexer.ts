import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { matchesAnyGlob } from '../tools/globMatch';

/** The default basename globs skipped by every indexer pass unless overridden. */
export const DEFAULT_INDEXER_IGNORE_PATTERNS: readonly string[] = [
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '*.lock',
];

/** What the indexer knew about a single file as of its last completed pass. */
export interface FileIndexEntry {
  size: number;
  mtimeMs: number;
  contentHash: string;
}

/** Workspace-relative path to {@link FileIndexEntry}, carried forward between passes. */
export type FileIndexSnapshot = Readonly<Record<string, FileIndexEntry>>;

export type FileChangeKind = 'added' | 'modified' | 'deleted';

export interface FileChange {
  path: string;
  kind: FileChangeKind;
}

export interface IndexWorkspaceOptions {
  ignorePatterns?: readonly string[];
}

export interface IndexWorkspaceResult {
  changes: readonly FileChange[];
  snapshot: FileIndexSnapshot;
}

async function collectFilePaths(
  absoluteRoot: string,
  currentDir: string,
  ignorePatterns: readonly string[],
  out: string[],
): Promise<void> {
  const dirents = await readdir(currentDir, { withFileTypes: true });

  for (const dirent of dirents) {
    if (matchesAnyGlob(dirent.name, ignorePatterns)) continue;

    const entryPath = join(currentDir, dirent.name);
    if (dirent.isDirectory()) {
      await collectFilePaths(absoluteRoot, entryPath, ignorePatterns, out);
    } else if (dirent.isFile()) {
      out.push(relative(absoluteRoot, entryPath));
    }
  }
}

function hashContent(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Walks `workspaceRoot`, skipping any path segment matching an ignore
 * pattern, and diffs the current file set against `previousSnapshot`. A
 * file is only re-read and re-hashed when its size or mtime differs from
 * the prior pass — an unchanged stat is trusted without touching content,
 * so a repeat pass over a mostly-static workspace stays cheap. Returns
 * both the added/modified/deleted changes and the snapshot to persist for
 * the next pass.
 */
export async function indexWorkspace(
  workspaceRoot: string,
  previousSnapshot: FileIndexSnapshot,
  options: IndexWorkspaceOptions = {},
): Promise<IndexWorkspaceResult> {
  const ignorePatterns = options.ignorePatterns ?? DEFAULT_INDEXER_IGNORE_PATTERNS;

  const currentPaths: string[] = [];
  await collectFilePaths(workspaceRoot, workspaceRoot, ignorePatterns, currentPaths);

  const changes: FileChange[] = [];
  const snapshot: Record<string, FileIndexEntry> = {};

  for (const relPath of currentPaths) {
    const stats = await stat(join(workspaceRoot, relPath));
    const previous = previousSnapshot[relPath];

    if (previous && previous.size === stats.size && previous.mtimeMs === stats.mtimeMs) {
      snapshot[relPath] = previous;
      continue;
    }

    const content = await readFile(join(workspaceRoot, relPath));
    const contentHash = hashContent(content);
    snapshot[relPath] = { size: stats.size, mtimeMs: stats.mtimeMs, contentHash };

    if (!previous) {
      changes.push({ path: relPath, kind: 'added' });
    } else if (previous.contentHash !== contentHash) {
      changes.push({ path: relPath, kind: 'modified' });
    }
  }

  const currentPathSet = new Set(currentPaths);
  for (const relPath of Object.keys(previousSnapshot)) {
    if (!currentPathSet.has(relPath)) {
      changes.push({ path: relPath, kind: 'deleted' });
    }
  }

  return { changes, snapshot };
}

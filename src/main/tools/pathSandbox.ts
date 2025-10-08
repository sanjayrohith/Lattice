import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Thrown by {@link resolveWorkspacePath} when a requested path resolves outside the workspace root. */
export class WorkspacePathEscapeError extends Error {
  readonly code = 'PATH_ESCAPE';

  constructor(public readonly requestedPath: string) {
    super(`path "${requestedPath}" escapes the workspace root`);
    this.name = 'WorkspacePathEscapeError';
  }
}

/**
 * Resolves `path` to its real, symlink-free form even when `path` (or a
 * suffix of it) does not exist yet — as is normal for `write_file`
 * creating a new file. Walks up to the nearest ancestor that does exist,
 * `realpath`s that ancestor, and rejoins the not-yet-existing suffix.
 */
function realpathOfNearestExistingAncestor(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) {
      // Reached the filesystem root without finding anything that exists.
      return path;
    }
    return join(realpathOfNearestExistingAncestor(parent), path.slice(parent.length + 1));
  }
}

/**
 * Resolves `requestedPath` against `workspaceRoot`, normalizes it, and
 * follows symlinks (including on ancestors of a path that does not yet
 * exist) to its real location. Throws {@link WorkspacePathEscapeError} if
 * the real, resolved path falls outside the real, resolved workspace
 * root — whether via a `..` traversal segment or a symlink that points
 * outside the sandbox. Every filesystem-touching tool must resolve its
 * path argument through this function before touching disk.
 */
export function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const combined = isAbsolute(requestedPath) ? requestedPath : join(workspaceRoot, requestedPath);
  const resolvedRequested = realpathOfNearestExistingAncestor(resolve(combined));
  const resolvedRoot = realpathOfNearestExistingAncestor(resolve(workspaceRoot));

  const rel = relative(resolvedRoot, resolvedRequested);
  const escapesRoot = rel !== '' && (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
  if (escapesRoot) {
    throw new WorkspacePathEscapeError(requestedPath);
  }

  return resolvedRequested;
}

import type { AppState } from '@shared/state/appState';

export interface StatePatch {
  path: (string | number)[];
  value: unknown;
}

export interface PatchRejection {
  code: 'FORBIDDEN_KEY';
  message: string;
}

/**
 * Root state keys a renderer may mutate directly via `state:dispatch`.
 * Everything else (`agents`, `runs`, `activeModel`) is main-process-owned —
 * derived from IPC-driven domain operations added in later phases — and can
 * never be overwritten by an arbitrary renderer-supplied patch.
 */
export const WRITABLE_ROOT_KEYS: ReadonlySet<keyof AppState> = new Set(['settings', 'layout']);

/**
 * Rejects the whole patch batch if any single patch targets a root key
 * outside the writable allowlist, returning a typed rejection describing
 * which key and patch index failed.
 */
export function validatePatches(patches: readonly StatePatch[]): PatchRejection | undefined {
  for (const [index, patch] of patches.entries()) {
    const rootKey = patch.path[0];
    if (typeof rootKey !== 'string' || !WRITABLE_ROOT_KEYS.has(rootKey as keyof AppState)) {
      return {
        code: 'FORBIDDEN_KEY',
        message: `patch ${index} targets non-writable root key "${String(rootKey)}"`,
      };
    }
  }
  return undefined;
}

function setAtPath(target: unknown, path: readonly (string | number)[], value: unknown): unknown {
  const [head, ...rest] = path;

  if (head === undefined) {
    return value;
  }

  if (Array.isArray(target)) {
    const next = [...target];
    next[head as number] = setAtPath(next[head as number], rest, value);
    return next;
  }

  const source = (target ?? {}) as Record<string, unknown>;
  return {
    ...source,
    [head]: setAtPath(source[head as string], rest, value),
  };
}

/** Applies every patch in order, returning a new state object (never mutates `state`). */
export function applyPatches(state: AppState, patches: readonly StatePatch[]): AppState {
  return patches.reduce<AppState>(
    (acc, patch) => setAtPath(acc, patch.path, patch.value) as AppState,
    state,
  );
}

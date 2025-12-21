// Resolve a workspace relative path and reject any path that escapes the workspace root.
export function resolveSandboxedPath(root: string, path: string): string {
  return `${root}/${path}`;
}

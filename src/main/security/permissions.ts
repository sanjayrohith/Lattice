import type { Session } from 'electron';

/**
 * Permissions Chromium may ask the app to grant on behalf of a renderer
 * (camera, microphone, geolocation, notifications, clipboard, etc). None are
 * allowed by default; a future settings surface can extend this per-origin.
 */
export type AllowedPermission = never;

export const allowedPermissions: ReadonlySet<AllowedPermission> = new Set<AllowedPermission>();

/**
 * Installs a default-deny permission policy on the given session:
 *
 * - `setPermissionRequestHandler` rejects every request that is not on the
 *   `allowedPermissions` allowlist.
 * - `setPermissionCheckHandler` mirrors the same decision for synchronous
 *   permission checks (e.g. `navigator.permissions.query`).
 */
export function applyPermissionPolicy(session: Session): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission as AllowedPermission));
  });

  session.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission as AllowedPermission);
  });
}

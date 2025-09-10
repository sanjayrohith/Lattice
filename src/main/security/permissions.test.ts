import { describe, expect, it } from 'vitest';
import type { Session } from 'electron';
import { applyPermissionPolicy } from './permissions';

function createMockSession(): Session {
  let requestHandler:
    | ((webContents: unknown, permission: string, callback: (granted: boolean) => void) => void)
    | undefined;
  let checkHandler: ((webContents: unknown, permission: string) => boolean) | undefined;

  return {
    setPermissionRequestHandler: (handler: typeof requestHandler) => {
      requestHandler = handler;
    },
    setPermissionCheckHandler: (handler: typeof checkHandler) => {
      checkHandler = handler;
    },
    __request: (permission: string) =>
      new Promise<boolean>((resolve) => requestHandler?.(undefined, permission, resolve)),
    __check: (permission: string) => checkHandler?.(undefined, permission) ?? false,
  } as unknown as Session;
}

const permissionsUnderTest = [
  'camera',
  'microphone',
  'geolocation',
  'notifications',
  'midi',
  'clipboard-read',
];

describe('applyPermissionPolicy', () => {
  it('rejects every permission request by default', async () => {
    const mockSession = createMockSession();
    applyPermissionPolicy(mockSession);

    const helper = mockSession as unknown as { __request: (p: string) => Promise<boolean> };

    for (const permission of permissionsUnderTest) {
      await expect(helper.__request(permission)).resolves.toBe(false);
    }
  });

  it('denies every synchronous permission check by default', () => {
    const mockSession = createMockSession();
    applyPermissionPolicy(mockSession);

    const helper = mockSession as unknown as { __check: (p: string) => boolean };

    for (const permission of permissionsUnderTest) {
      expect(helper.__check(permission)).toBe(false);
    }
  });
});

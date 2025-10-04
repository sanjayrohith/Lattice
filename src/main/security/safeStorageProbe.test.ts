import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  probeEncryptionAvailability,
  resetEncryptionAvailabilityProbeForTests,
  type SafeStorageLike,
} from './safeStorageProbe';

describe('probeEncryptionAvailability', () => {
  afterEach(() => {
    resetEncryptionAvailabilityProbeForTests();
  });

  it('reports available when the OS backend reports available', () => {
    const safeStorage: SafeStorageLike = { isEncryptionAvailable: () => true };

    expect(probeEncryptionAvailability(safeStorage)).toEqual({ available: true });
  });

  it('reports unavailable when the OS backend reports unavailable', () => {
    const safeStorage: SafeStorageLike = { isEncryptionAvailable: () => false };

    expect(probeEncryptionAvailability(safeStorage)).toEqual({ available: false });
  });

  it('caches the result and only calls the backend once', () => {
    const isEncryptionAvailable = vi.fn(() => true);
    const safeStorage: SafeStorageLike = { isEncryptionAvailable };

    probeEncryptionAvailability(safeStorage);
    probeEncryptionAvailability(safeStorage);

    expect(isEncryptionAvailable).toHaveBeenCalledTimes(1);
  });
});

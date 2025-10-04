export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
}

export interface EncryptionAvailability {
  available: boolean;
}

let cached: EncryptionAvailability | undefined;

/**
 * Calls `safeStorage.isEncryptionAvailable()` once and caches the result
 * for the lifetime of the process. The credential vault consults this
 * explicit availability state rather than attempting to encrypt and
 * silently falling back to plaintext when the OS keychain is missing.
 */
export function probeEncryptionAvailability(safeStorage: SafeStorageLike): EncryptionAvailability {
  cached ??= { available: safeStorage.isEncryptionAvailable() };
  return cached;
}

/** Test-only: clears the cached probe result between suites. */
export function resetEncryptionAvailabilityProbeForTests(): void {
  cached = undefined;
}

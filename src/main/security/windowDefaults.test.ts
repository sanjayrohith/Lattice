import { describe, expect, it } from 'vitest';
import { hardenedWebPreferences } from './windowDefaults';

describe('hardenedWebPreferences', () => {
  it('disables node integration in the renderer', () => {
    expect(hardenedWebPreferences.nodeIntegration).toBe(false);
  });

  it('enables context isolation', () => {
    expect(hardenedWebPreferences.contextIsolation).toBe(true);
  });

  it('enables the OS-level renderer sandbox', () => {
    expect(hardenedWebPreferences.sandbox).toBe(true);
  });

  it('enables web security (same-origin policy, mixed content blocking)', () => {
    expect(hardenedWebPreferences.webSecurity).toBe(true);
  });

  it('is frozen so no call site can mutate the shared defaults', () => {
    expect(Object.isFrozen(hardenedWebPreferences)).toBe(true);
  });

  it('fails if any hardening flag deviates from its required value', () => {
    const required = {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    } as const;

    for (const [key, value] of Object.entries(required)) {
      expect(hardenedWebPreferences[key as keyof typeof required]).toBe(value);
    }
  });
});

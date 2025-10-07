import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPreferencesStore as createPreferencesStoreImpl } from './preferencesStore';
import { PREFERENCES_DEFAULTS } from './preferences';

function createPreferencesStore(options: { cwd: string }) {
  return createPreferencesStoreImpl({ ...options, projectVersion: '0.1.0' });
}

describe('createPreferencesStore', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'lattice-preferences-test-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('initializes with schema defaults on first run', () => {
    const store = createPreferencesStore({ cwd });

    expect(store.get('theme')).toBe(PREFERENCES_DEFAULTS.theme);
    expect(store.get('stepCap')).toBe(PREFERENCES_DEFAULTS.stepCap);
    expect(store.get('defaultAgentId')).toBe(PREFERENCES_DEFAULTS.defaultAgentId);
    expect(store.get('telemetryOptIn')).toBe(PREFERENCES_DEFAULTS.telemetryOptIn);
  });

  it('persists a value across store instances backed by the same directory', () => {
    const first = createPreferencesStore({ cwd });
    first.set('theme', 'light');
    first.set('stepCap', 40);

    const second = createPreferencesStore({ cwd });
    expect(second.get('theme')).toBe('light');
    expect(second.get('stepCap')).toBe(40);
  });

  it('rejects a value outside the schema bounds', () => {
    const store = createPreferencesStore({ cwd });

    expect(() => store.set('stepCap', 1000)).toThrow();
  });

  it('rejects an invalid enum value for theme', () => {
    const store = createPreferencesStore({ cwd });

    expect(() => store.set('theme', 'neon' as never)).toThrow();
  });

  it('allows a null defaultAgentId and a concrete override', () => {
    const store = createPreferencesStore({ cwd });

    expect(store.get('defaultAgentId')).toBeNull();
    store.set('defaultAgentId', 'agent-1');
    expect(store.get('defaultAgentId')).toBe('agent-1');
  });

  it('backfills missing keys via the 1.0.0 migration', () => {
    const first = createPreferencesStore({ cwd });
    first.delete('telemetryOptIn');

    const second = createPreferencesStore({ cwd });
    expect(second.get('telemetryOptIn')).toBe(PREFERENCES_DEFAULTS.telemetryOptIn);
  });
});

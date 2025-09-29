import { describe, expect, it } from 'vitest';
import { createDefaultAppState } from '@shared/state/appState';
import { applyPatches, validatePatches, WRITABLE_ROOT_KEYS } from './patchValidator';

describe('WRITABLE_ROOT_KEYS', () => {
  it('allows settings and layout but nothing else', () => {
    expect(WRITABLE_ROOT_KEYS.has('settings')).toBe(true);
    expect(WRITABLE_ROOT_KEYS.has('layout')).toBe(true);
    expect(WRITABLE_ROOT_KEYS.has('agents')).toBe(false);
    expect(WRITABLE_ROOT_KEYS.has('runs')).toBe(false);
    expect(WRITABLE_ROOT_KEYS.has('activeModel')).toBe(false);
  });
});

describe('validatePatches', () => {
  it('accepts a batch touching only writable keys', () => {
    const rejection = validatePatches([
      { path: ['settings', 'theme'], value: 'dark' },
      { path: ['layout', 'activeWorkspaceId'], value: 'default' },
    ]);
    expect(rejection).toBeUndefined();
  });

  it('rejects a patch targeting a non-writable root key', () => {
    const rejection = validatePatches([{ path: ['agents'], value: [] }]);
    expect(rejection?.code).toBe('FORBIDDEN_KEY');
    expect(rejection?.message).toContain('agents');
  });

  it('rejects the entire batch if even one patch among several is forbidden', () => {
    const rejection = validatePatches([
      { path: ['settings', 'theme'], value: 'dark' },
      { path: ['runs'], value: [] },
    ]);
    expect(rejection?.code).toBe('FORBIDDEN_KEY');
  });

  it('rejects a patch with a non-string root segment', () => {
    const rejection = validatePatches([{ path: [0], value: 'x' }]);
    expect(rejection?.code).toBe('FORBIDDEN_KEY');
  });
});

describe('applyPatches', () => {
  it('applies a single nested patch immutably', () => {
    const state = createDefaultAppState();
    const next = applyPatches(state, [{ path: ['settings', 'theme'], value: 'dark' }]);

    expect(next.settings.theme).toBe('dark');
    expect(state.settings.theme).toBe('system');
    expect(next).not.toBe(state);
  });

  it('applies multiple patches in order', () => {
    const state = createDefaultAppState();
    const next = applyPatches(state, [
      { path: ['settings', 'theme'], value: 'dark' },
      { path: ['settings', 'stepCap'], value: 40 },
      { path: ['layout', 'activeWorkspaceId'], value: 'project-x' },
    ]);

    expect(next.settings.theme).toBe('dark');
    expect(next.settings.stepCap).toBe(40);
    expect(next.layout.activeWorkspaceId).toBe('project-x');
  });

  it('does not mutate nested objects not touched by the patch', () => {
    const state = createDefaultAppState();
    const next = applyPatches(state, [{ path: ['settings', 'theme'], value: 'dark' }]);

    expect(next.layout).toBe(state.layout);
  });
});

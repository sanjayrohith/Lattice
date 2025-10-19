import { describe, expect, it } from 'vitest';
import { ConsentPolicyStore } from './consentPolicyStore';

describe('ConsentPolicyStore', () => {
  it('falls back to the tool default when nothing else is configured', () => {
    const store = new ConsentPolicyStore();
    expect(store.resolve('s1', 'read_file', 'always')).toBe('always');
  });

  it('prefers a session override over the tool default', () => {
    const store = new ConsentPolicyStore();
    store.setSessionOverride('s1', 'write_file', 'always');

    expect(store.resolve('s1', 'write_file', 'ask')).toBe('always');
  });

  it('prefers a user preference over the tool default', () => {
    const store = new ConsentPolicyStore();
    store.setUserPreference('write_file', 'always');

    expect(store.resolve('s1', 'write_file', 'ask')).toBe('always');
  });

  it('prefers a session override over a user preference', () => {
    const store = new ConsentPolicyStore();
    store.setUserPreference('write_file', 'always');
    store.setSessionOverride('s1', 'write_file', 'ask');

    expect(store.resolve('s1', 'write_file', 'ask')).toBe('ask');
  });

  it('scopes session overrides to their own session', () => {
    const store = new ConsentPolicyStore();
    store.setSessionOverride('s1', 'write_file', 'always');

    expect(store.resolve('s2', 'write_file', 'ask')).toBe('ask');
  });

  it('never on the tool default cannot be relaxed by a session override', () => {
    const store = new ConsentPolicyStore();
    store.setSessionOverride('s1', 'dangerous_tool', 'always');

    expect(store.resolve('s1', 'dangerous_tool', 'never')).toBe('never');
  });

  it('never on the tool default cannot be relaxed by a user preference', () => {
    const store = new ConsentPolicyStore();
    store.setUserPreference('dangerous_tool', 'always');

    expect(store.resolve('s1', 'dangerous_tool', 'never')).toBe('never');
  });

  it('clearSession removes only that session\'s overrides', () => {
    const store = new ConsentPolicyStore();
    store.setSessionOverride('s1', 'write_file', 'always');
    store.setUserPreference('write_file', 'ask');

    store.clearSession('s1');

    expect(store.resolve('s1', 'write_file', 'ask')).toBe('ask');
  });

  it('reads an initial user preference from injected persistence', () => {
    const persisted = new Map<string, 'always' | 'ask' | 'never'>([['write_file', 'always']]);
    const store = new ConsentPolicyStore({
      get: (name) => persisted.get(name),
      set: (name, policy) => persisted.set(name, policy),
    });

    expect(store.getUserPreference('write_file')).toBe('always');
  });

  it('writes a user preference through to injected persistence', () => {
    const persisted = new Map<string, 'always' | 'ask' | 'never'>();
    const store = new ConsentPolicyStore({
      get: (name) => persisted.get(name),
      set: (name, policy) => persisted.set(name, policy),
    });

    store.setUserPreference('write_file', 'always');

    expect(persisted.get('write_file')).toBe('always');
  });
});

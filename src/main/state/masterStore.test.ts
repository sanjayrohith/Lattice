import { describe, expect, it } from 'vitest';
import { createDefaultAppState } from '@shared/state/appState';
import { MasterStore } from './masterStore';

describe('MasterStore', () => {
  it('starts at revision 0 with the default app state', () => {
    const store = new MasterStore();
    expect(store.getRevision()).toBe(0);
    expect(store.getState()).toEqual(createDefaultAppState());
  });

  it('increments the revision on every setState call', () => {
    const store = new MasterStore();

    store.setState((state) => ({ ...state, settings: { ...state.settings, stepCap: 30 } }));
    expect(store.getRevision()).toBe(1);

    store.setState((state) => ({ ...state, settings: { ...state.settings, stepCap: 40 } }));
    expect(store.getRevision()).toBe(2);
  });

  it('applies the updater and validates the result against the schema', () => {
    const store = new MasterStore();
    store.setState((state) => ({ ...state, settings: { ...state.settings, stepCap: 50 } }));

    expect(store.getState().settings.stepCap).toBe(50);
  });

  it('rejects an update that violates the schema, leaving the revision unchanged', () => {
    const store = new MasterStore();

    expect(() =>
      store.setState((state) => ({ ...state, settings: { ...state.settings, stepCap: -5 } })),
    ).toThrow();

    expect(store.getRevision()).toBe(0);
  });

  it('getSnapshot returns the current revision and state together', () => {
    const store = new MasterStore();
    store.setState((state) => ({ ...state, settings: { ...state.settings, stepCap: 12 } }));

    const snapshot = store.getSnapshot();
    expect(snapshot.revision).toBe(1);
    expect(snapshot.state.settings.stepCap).toBe(12);
  });

  it('accepts a valid custom initial state', () => {
    const initial = { ...createDefaultAppState(), settings: { theme: 'dark' as const, stepCap: 10, defaultAgentId: null, telemetryOptIn: false } };
    const store = new MasterStore(initial);

    expect(store.getState().settings.theme).toBe('dark');
  });
});

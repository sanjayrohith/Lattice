import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppState } from '@shared/state/appState';
import { useAppStore } from './appStore';

beforeEach(() => {
  useAppStore.setState({ revision: 0, state: createDefaultAppState() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stubInvoke(result: unknown): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockResolvedValue(result);
  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('useAppStore', () => {
  it('starts at revision 0 with the default app state', () => {
    const { revision, state } = useAppStore.getState();
    expect(revision).toBe(0);
    expect(state).toEqual(createDefaultAppState());
  });

  it('dispatch sends patches over IPC rather than mutating state locally', async () => {
    const invoke = stubInvoke({ ok: true, data: { revision: 1 } });

    await useAppStore
      .getState()
      .dispatch([{ path: ['settings', 'theme'], value: 'dark' }]);

    expect(invoke).toHaveBeenCalledWith('state:dispatch', {
      patches: [{ path: ['settings', 'theme'], value: 'dark' }],
    });
    // The local projection is untouched until the broadcast/hydration path applies it.
    expect(useAppStore.getState().state.settings.theme).toBe('system');
  });

  it('dispatch throws when the main process rejects the patch', async () => {
    stubInvoke({ ok: false, error: { code: 'FORBIDDEN_KEY', message: 'nope' } });

    await expect(
      useAppStore.getState().dispatch([{ path: ['agents'], value: [] }]),
    ).rejects.toThrow(/FORBIDDEN_KEY/);
  });

  it('setSnapshot updates both revision and state', () => {
    const nextState = { ...createDefaultAppState(), settings: { ...createDefaultAppState().settings, theme: 'dark' as const } };
    useAppStore.getState().setSnapshot(5, nextState);

    expect(useAppStore.getState().revision).toBe(5);
    expect(useAppStore.getState().state.settings.theme).toBe('dark');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DockviewApi } from 'dockview-react';
import { persistLayoutOnChange } from './useLayoutPersistence';

function createMockApi(): DockviewApi & { __emitLayoutChange: () => void } {
  let handler: (() => void) | undefined;
  return {
    onDidLayoutChange: (listener: () => void) => {
      handler = listener;
      return { dispose: vi.fn() };
    },
    toJSON: () => ({ panels: {} }),
    __emitLayoutChange: () => handler?.(),
  } as unknown as DockviewApi & { __emitLayoutChange: () => void };
}

beforeEach(() => {
  vi.useFakeTimers();
  (window as unknown as { electronAPI: { invoke: ReturnType<typeof vi.fn> } }).electronAPI = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('persistLayoutOnChange', () => {
  it('debounces rapid layout changes into a single save call', () => {
    const api = createMockApi();
    persistLayoutOnChange(api, 'default');

    api.__emitLayoutChange();
    api.__emitLayoutChange();
    api.__emitLayoutChange();

    vi.advanceTimersByTime(300);

    expect(window.electronAPI.invoke).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('layout:save', {
      workspaceId: 'default',
      layout: { panels: {} },
    });
  });

  it('does not save before the debounce window elapses', () => {
    const api = createMockApi();
    persistLayoutOnChange(api, 'default');

    api.__emitLayoutChange();
    vi.advanceTimersByTime(100);

    expect(window.electronAPI.invoke).not.toHaveBeenCalled();
  });

  it('clears the pending timer when disposed', () => {
    const api = createMockApi();
    const dispose = persistLayoutOnChange(api, 'default');

    api.__emitLayoutChange();
    dispose();
    vi.advanceTimersByTime(300);

    expect(window.electronAPI.invoke).not.toHaveBeenCalled();
  });
});

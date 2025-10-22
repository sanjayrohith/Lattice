import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunProgress } from './useRunProgress';

function stubElectronAPI() {
  let listener: ((batch: unknown) => void) | undefined;
  const subscribe = vi.fn((_channel: string, cb: (batch: unknown) => void) => {
    listener = cb;
    return vi.fn();
  });

  (window as unknown as { electronAPI: { subscribe: typeof subscribe } }).electronAPI = { subscribe };

  return { emit: (batch: unknown) => listener?.(batch) };
}

describe('useRunProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts idle with zeroed progress', () => {
    stubElectronAPI();
    const { result } = renderHook(() => useRunProgress('run-1'));

    expect(result.current).toEqual({
      running: false,
      currentStep: 0,
      elapsedSeconds: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
  });

  it('becomes running on a non-terminal state-change and tracks the reported step', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useRunProgress('run-1'));

    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'streaming', step: 1 }]);
    });

    expect(result.current.running).toBe(true);
    expect(result.current.currentStep).toBe(1);
  });

  it('stops running on a terminal state-change', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useRunProgress('run-1'));

    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'streaming', step: 1 }]);
    });
    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'completed', step: 3 }]);
    });

    expect(result.current.running).toBe(false);
    expect(result.current.currentStep).toBe(3);
  });

  it('updates usage from usage events', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useRunProgress('run-1'));

    act(() => {
      api.emit([
        { type: 'usage', runId: 'run-1', promptTokens: 100, completionTokens: 40, totalTokens: 140 },
      ]);
    });

    expect(result.current.usage).toEqual({ promptTokens: 100, completionTokens: 40, totalTokens: 140 });
  });

  it('ticks elapsedSeconds once a second while running', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useRunProgress('run-1'));

    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'streaming' }]);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.elapsedSeconds).toBe(3);
  });

  it('stops ticking once the run reaches a terminal state', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useRunProgress('run-1'));

    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'streaming' }]);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'completed' }]);
    });
    const elapsedAtCompletion = result.current.elapsedSeconds;
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsedSeconds).toBe(elapsedAtCompletion);
  });

  it('ignores events for a different run id', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useRunProgress('run-1'));

    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-other', state: 'streaming' }]);
    });

    expect(result.current.running).toBe(false);
  });

  it('resets progress when activeRunId changes', () => {
    const api = stubElectronAPI();
    const { result, rerender } = renderHook(({ runId }) => useRunProgress(runId), {
      initialProps: { runId: 'run-1' as string | undefined },
    });

    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'streaming', step: 5 }]);
    });
    expect(result.current.currentStep).toBe(5);

    rerender({ runId: 'run-2' });

    expect(result.current).toEqual({
      running: false,
      currentStep: 0,
      elapsedSeconds: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
  });
});

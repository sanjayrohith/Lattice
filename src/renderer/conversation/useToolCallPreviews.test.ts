import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToolCallPreviews } from './useToolCallPreviews';

afterEach(() => {
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  let listener: ((batch: unknown) => void) | undefined;
  const subscribe = vi.fn((_channel: string, cb: (batch: unknown) => void) => {
    listener = cb;
    return vi.fn();
  });

  (window as unknown as { electronAPI: { subscribe: typeof subscribe } }).electronAPI = { subscribe };

  return { emit: (batch: unknown) => listener?.(batch) };
}

describe('useToolCallPreviews', () => {
  it('starts with no previews', () => {
    stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));
    expect(result.current).toEqual([]);
  });

  it('adds a pending preview on tool-start', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));

    act(() => {
      api.emit([{ type: 'tool-start', runId: 'run-1', toolCallId: 'c1', toolName: 'write_file' }]);
    });

    expect(result.current).toEqual([
      { toolCallId: 'c1', toolName: 'write_file', partialArgs: undefined, status: 'pending' },
    ]);
  });

  it('updates the partial args as partial-tool-args events arrive', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));

    act(() => {
      api.emit([
        {
          type: 'partial-tool-args',
          runId: 'run-1',
          toolCallId: 'c1',
          toolName: 'write_file',
          partialArgs: { path: 'a' },
        },
      ]);
    });
    act(() => {
      api.emit([
        {
          type: 'partial-tool-args',
          runId: 'run-1',
          toolCallId: 'c1',
          toolName: 'write_file',
          partialArgs: { path: 'a.txt', content: 'hi' },
        },
      ]);
    });

    expect(result.current[0]?.partialArgs).toEqual({ path: 'a.txt', content: 'hi' });
  });

  it('marks a preview succeeded on a successful tool-result', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));

    act(() => {
      api.emit([{ type: 'tool-start', runId: 'run-1', toolCallId: 'c1', toolName: 'read_file' }]);
    });
    act(() => {
      api.emit([
        { type: 'tool-result', runId: 'run-1', toolCallId: 'c1', result: { ok: true, output: 'hi' } },
      ]);
    });

    expect(result.current[0]?.status).toBe('succeeded');
  });

  it('marks a preview failed on a failed tool-result', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));

    act(() => {
      api.emit([{ type: 'tool-start', runId: 'run-1', toolCallId: 'c1', toolName: 'write_file' }]);
    });
    act(() => {
      api.emit([
        {
          type: 'tool-result',
          runId: 'run-1',
          toolCallId: 'c1',
          result: { ok: false, error: { code: 'X', message: 'bad' } },
        },
      ]);
    });

    expect(result.current[0]?.status).toBe('failed');
  });

  it('ignores events for a different run id', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));

    act(() => {
      api.emit([{ type: 'tool-start', runId: 'run-other', toolCallId: 'c1', toolName: 'write_file' }]);
    });

    expect(result.current).toEqual([]);
  });

  it('keeps a finished preview rather than removing it', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));

    act(() => {
      api.emit([{ type: 'tool-start', runId: 'run-1', toolCallId: 'c1', toolName: 'read_file' }]);
      api.emit([{ type: 'tool-result', runId: 'run-1', toolCallId: 'c1', result: { ok: true } }]);
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.status).toBe('succeeded');
  });

  it('tracks multiple concurrent tool calls independently', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useToolCallPreviews('run-1'));

    act(() => {
      api.emit([
        { type: 'tool-start', runId: 'run-1', toolCallId: 'c1', toolName: 'read_file' },
        { type: 'tool-start', runId: 'run-1', toolCallId: 'c2', toolName: 'write_file' },
      ]);
    });

    expect(result.current.map((p) => p.toolCallId)).toEqual(['c1', 'c2']);
  });
});

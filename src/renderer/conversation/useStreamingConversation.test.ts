import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStreamingConversation } from './useStreamingConversation';

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

  return { subscribe, emit: (batch: unknown) => listener?.(batch) };
}

describe('useStreamingConversation', () => {
  it('starts with an empty message list', () => {
    stubElectronAPI();
    const { result } = renderHook(() => useStreamingConversation());
    expect(result.current.messages).toEqual([]);
  });

  it('adds a user message immediately, fully formed', () => {
    stubElectronAPI();
    const { result } = renderHook(() => useStreamingConversation());

    act(() => {
      result.current.addUserMessage('hello');
    });

    expect(result.current.messages).toEqual([{ id: expect.any(String), role: 'user', text: 'hello' }]);
  });

  it('begins an empty, streaming assistant message', () => {
    stubElectronAPI();
    const { result } = renderHook(() => useStreamingConversation());

    act(() => {
      result.current.beginAssistantMessage();
    });

    expect(result.current.messages).toEqual([
      { id: expect.any(String), role: 'assistant', text: '', streaming: true },
    ]);
  });

  it('appends matching text-delta events to the in-progress assistant message', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useStreamingConversation('run-1'));

    act(() => {
      result.current.beginAssistantMessage();
    });
    act(() => {
      api.emit([{ type: 'text-delta', runId: 'run-1', delta: 'Hello' }]);
    });
    act(() => {
      api.emit([{ type: 'text-delta', runId: 'run-1', delta: ', world' }]);
    });

    expect(result.current.messages[0]?.text).toBe('Hello, world');
  });

  it('ignores text-delta events for a different run id', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useStreamingConversation('run-1'));

    act(() => {
      result.current.beginAssistantMessage();
    });
    act(() => {
      api.emit([{ type: 'text-delta', runId: 'run-other', delta: 'nope' }]);
    });

    expect(result.current.messages[0]?.text).toBe('');
  });

  it('ignores non-text-delta events in the batch', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useStreamingConversation('run-1'));

    act(() => {
      result.current.beginAssistantMessage();
    });
    act(() => {
      api.emit([{ type: 'state-change', runId: 'run-1', state: 'streaming' }]);
    });

    expect(result.current.messages[0]?.text).toBe('');
  });

  it('preserves earlier messages when appending to a later assistant message', () => {
    const api = stubElectronAPI();
    const { result } = renderHook(() => useStreamingConversation('run-1'));

    act(() => {
      result.current.addUserMessage('question');
      result.current.beginAssistantMessage();
    });
    act(() => {
      api.emit([{ type: 'text-delta', runId: 'run-1', delta: 'answer' }]);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.text).toBe('question');
    expect(result.current.messages[1]?.text).toBe('answer');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { AcpConnection } from './acpConnection';
import { normalizeSessionUpdate, subscribeSessionUpdates } from './acpSessionUpdate';

describe('normalizeSessionUpdate', () => {
  it('normalizes an agent_message_chunk into a text-delta event', () => {
    const event = normalizeSessionUpdate(
      { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } } },
      'run-1',
    );
    expect(event).toEqual({ type: 'text-delta', runId: 'run-1', delta: 'hi' });
  });

  it('normalizes an in-progress tool_call into a tool-start event', () => {
    const event = normalizeSessionUpdate(
      {
        sessionId: 's1',
        update: { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'read_file', status: 'in_progress' },
      },
      'run-1',
    );
    expect(event).toEqual({ type: 'tool-start', runId: 'run-1', toolCallId: 'tc-1', toolName: 'read_file' });
  });

  it('normalizes a completed tool_call into a tool-result event', () => {
    const event = normalizeSessionUpdate(
      {
        sessionId: 's1',
        update: { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'read_file', status: 'completed' },
      },
      'run-1',
    );
    expect(event).toEqual({
      type: 'tool-result',
      runId: 'run-1',
      toolCallId: 'tc-1',
      result: { status: 'completed', title: 'read_file' },
    });
  });

  it('normalizes a plan update into a plan event', () => {
    const event = normalizeSessionUpdate(
      {
        sessionId: 's1',
        update: { sessionUpdate: 'plan', entries: [{ content: 'step one', status: 'pending' }] },
      },
      'run-1',
    );
    expect(event).toEqual({
      type: 'plan',
      runId: 'run-1',
      entries: [{ content: 'step one', status: 'pending' }],
    });
  });

  it('returns undefined for a payload that fails to parse', () => {
    expect(normalizeSessionUpdate({ nonsense: true }, 'run-1')).toBeUndefined();
  });
});

describe('subscribeSessionUpdates', () => {
  it('forwards only normalized events matching the target sessionId', () => {
    let capturedListener: (method: string, params: unknown) => void = () => undefined;
    const connection = {
      onPeerMessage: vi.fn((listener: (method: string, params: unknown) => void) => {
        capturedListener = listener;
        return () => undefined;
      }),
    } as unknown as AcpConnection;

    const onEvent = vi.fn();
    subscribeSessionUpdates(connection, 'target-session', 'run-1', onEvent);

    capturedListener('session/update', {
      sessionId: 'other-session',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ignored' } },
    });
    expect(onEvent).not.toHaveBeenCalled();

    capturedListener('session/update', {
      sessionId: 'target-session',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'kept' } },
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'text-delta', runId: 'run-1', delta: 'kept' });

    capturedListener('some/other-method', {});
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});

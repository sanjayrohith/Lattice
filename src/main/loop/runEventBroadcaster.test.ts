import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunEventBroadcaster } from './runEventBroadcaster';
import type { RunStreamEvent } from '@shared/ipc/events';

describe('RunEventBroadcaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not send anything before the interval elapses', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'hi' });

    expect(send).not.toHaveBeenCalled();
  });

  it('coalesces multiple text-delta events into one concatenated delta', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'Hello' });
    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: ', ' });
    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'world' });
    vi.advanceTimersByTime(50);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([{ type: 'text-delta', runId: 'r1', delta: 'Hello, world' }]);
  });

  it('keeps only the latest partial-tool-args per tool call', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.emit({
      type: 'partial-tool-args',
      runId: 'r1',
      toolCallId: 'c1',
      toolName: 'read_file',
      partialArgs: { path: 'a' },
    });
    broadcaster.emit({
      type: 'partial-tool-args',
      runId: 'r1',
      toolCallId: 'c1',
      toolName: 'read_file',
      partialArgs: { path: 'a.txt' },
    });
    vi.advanceTimersByTime(50);

    expect(send).toHaveBeenCalledWith([
      {
        type: 'partial-tool-args',
        runId: 'r1',
        toolCallId: 'c1',
        toolName: 'read_file',
        partialArgs: { path: 'a.txt' },
      },
    ]);
  });

  it('keeps discrete events individually and in order', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    const events: RunStreamEvent[] = [
      { type: 'tool-start', runId: 'r1', toolCallId: 'c1', toolName: 'read_file' },
      { type: 'tool-result', runId: 'r1', toolCallId: 'c1', result: { content: 'hi' } },
      { type: 'state-change', runId: 'r1', state: 'completed' },
    ];
    for (const event of events) broadcaster.emit(event);
    vi.advanceTimersByTime(50);

    expect(send).toHaveBeenCalledWith(events);
  });

  it('batches text delta, partial tool args, and discrete events into a single send', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'thinking' });
    broadcaster.emit({ type: 'tool-start', runId: 'r1', toolCallId: 'c1', toolName: 'read_file' });
    vi.advanceTimersByTime(50);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('sends at most once per interval regardless of how many events arrive', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    for (let i = 0; i < 100; i++) {
      broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'x' });
    }
    vi.advanceTimersByTime(50);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('schedules a fresh flush for events emitted after the previous flush', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'first' });
    vi.advanceTimersByTime(50);
    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'second' });
    vi.advanceTimersByTime(50);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, [{ type: 'text-delta', runId: 'r1', delta: 'second' }]);
  });

  it('flush() sends immediately and cancels the pending timer', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(1000, send);

    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'now' });
    broadcaster.flush();

    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush() with nothing buffered does not call send', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.flush();

    expect(send).not.toHaveBeenCalled();
  });

  it('dispose() cancels a pending flush', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'x' });
    broadcaster.dispose();
    vi.advanceTimersByTime(50);

    expect(send).not.toHaveBeenCalled();
  });

  it('keeps separate runs from mixing their coalesced text deltas', () => {
    const send = vi.fn();
    const broadcaster = new RunEventBroadcaster(50, send);

    broadcaster.emit({ type: 'text-delta', runId: 'run-a', delta: 'A' });
    broadcaster.emit({ type: 'text-delta', runId: 'run-b', delta: 'B' });
    vi.advanceTimersByTime(50);

    expect(send).toHaveBeenCalledWith(
      expect.arrayContaining([
        { type: 'text-delta', runId: 'run-a', delta: 'A' },
        { type: 'text-delta', runId: 'run-b', delta: 'B' },
      ]),
    );
  });
});

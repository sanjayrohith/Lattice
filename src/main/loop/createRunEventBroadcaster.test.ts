import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: sendMock } }],
  },
}));

describe('createRunEventBroadcaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a flushed batch to every open window on the run:stream channel', async () => {
    const { createRunEventBroadcaster, RUN_STREAM_FLUSH_INTERVAL_MS } = await import(
      './createRunEventBroadcaster'
    );

    const broadcaster = createRunEventBroadcaster();
    broadcaster.emit({ type: 'text-delta', runId: 'r1', delta: 'hi' });
    vi.advanceTimersByTime(RUN_STREAM_FLUSH_INTERVAL_MS);

    expect(sendMock).toHaveBeenCalledWith('run:stream', [{ type: 'text-delta', runId: 'r1', delta: 'hi' }]);
  });

  it('skips a destroyed window', async () => {
    const { BrowserWindow } = await import('electron');
    const destroyedSend = vi.fn();
    vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([
      { isDestroyed: () => true, webContents: { send: destroyedSend } } as never,
    ]);

    const { createRunEventBroadcaster, RUN_STREAM_FLUSH_INTERVAL_MS } = await import(
      './createRunEventBroadcaster'
    );
    const broadcaster = createRunEventBroadcaster();
    broadcaster.emit({ type: 'state-change', runId: 'r1', state: 'completed' });
    vi.advanceTimersByTime(RUN_STREAM_FLUSH_INTERVAL_MS);

    expect(destroyedSend).not.toHaveBeenCalled();
  });
});

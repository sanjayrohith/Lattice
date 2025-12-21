import type { watch as WatchFn } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createReindexWatcher } from './reindexWatcher';
import type { ReindexPipeline } from './reindexPipeline';

function fakePipeline(): ReindexPipeline & { runIncrementalPass: ReturnType<typeof vi.fn> } {
  return {
    runIncrementalPass: vi.fn().mockResolvedValue({ snapshot: {}, changes: [] }),
  } as unknown as ReindexPipeline & { runIncrementalPass: ReturnType<typeof vi.fn> };
}

function fakeWatch(): { watchImpl: typeof WatchFn; close: ReturnType<typeof vi.fn>; emit: () => void } {
  let listener: (() => void) | undefined;
  const close = vi.fn();
  const watchImpl = vi.fn((_path: unknown, optionsOrListener: unknown, maybeListener?: unknown) => {
    listener = (typeof optionsOrListener === 'function' ? optionsOrListener : maybeListener) as () => void;
    return { close } as unknown as ReturnType<typeof WatchFn>;
  });
  return { watchImpl: watchImpl as unknown as typeof WatchFn, close, emit: () => listener?.() };
}

describe('createReindexWatcher', () => {
  it('runs an initial pass immediately on start', async () => {
    const pipeline = fakePipeline();
    const { watchImpl } = fakeWatch();
    const watcher = createReindexWatcher('/workspace', pipeline, { watchImpl });

    await watcher.start();

    expect(pipeline.runIncrementalPass).toHaveBeenCalledTimes(1);
  });

  it('debounces a burst of filesystem events into a single pass', async () => {
    vi.useFakeTimers();
    try {
      const pipeline = fakePipeline();
      const { watchImpl, emit } = fakeWatch();
      const watcher = createReindexWatcher('/workspace', pipeline, { watchImpl, debounceMs: 100 });
      await watcher.start();
      pipeline.runIncrementalPass.mockClear();

      emit();
      await vi.advanceTimersByTimeAsync(30);
      emit();
      await vi.advanceTimersByTimeAsync(30);
      emit();
      await vi.advanceTimersByTimeAsync(100);

      expect(pipeline.runIncrementalPass).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('threads the resolved snapshot from one pass into the next', async () => {
    vi.useFakeTimers();
    try {
      const pipeline = fakePipeline();
      pipeline.runIncrementalPass
        .mockResolvedValueOnce({ snapshot: { 'a.ts': { size: 1, mtimeMs: 1, contentHash: 'h' } }, changes: [] })
        .mockResolvedValueOnce({ snapshot: {}, changes: [] });

      const { watchImpl, emit } = fakeWatch();
      const watcher = createReindexWatcher('/workspace', pipeline, { watchImpl, debounceMs: 10 });
      await watcher.start();

      emit();
      await vi.advanceTimersByTimeAsync(20);

      expect(pipeline.runIncrementalPass).toHaveBeenNthCalledWith(2, '/workspace', {
        'a.ts': { size: 1, mtimeMs: 1, contentHash: 'h' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops watching and cancels a pending pass on stop', async () => {
    const pipeline = fakePipeline();
    const { watchImpl, close } = fakeWatch();
    const watcher = createReindexWatcher('/workspace', pipeline, { watchImpl, debounceMs: 1000 });
    await watcher.start();

    watcher.stop();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('falls back to a non-recursive watch when recursive watching throws', async () => {
    const pipeline = fakePipeline();
    const close = vi.fn();
    const watchImpl = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('recursive watch unsupported on this platform');
      })
      .mockImplementationOnce(() => ({ close })) as unknown as typeof WatchFn;

    const watcher = createReindexWatcher('/workspace', pipeline, { watchImpl });
    await watcher.start();

    expect(watchImpl).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { SdkAgentBackend, type StreamInvoker } from './sdkAgentBackend';
import type { InternalMessage } from '../ai/messages';

async function* toAsyncIterable<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

function fakeStreamFn(parts: readonly unknown[]): StreamInvoker {
  return vi.fn(() => ({ fullStream: toAsyncIterable(parts) })) as unknown as StreamInvoker;
}

const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

describe('SdkAgentBackend.stream', () => {
  it('yields text-delta events for text-delta parts', async () => {
    const streamFn = fakeStreamFn([
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ', world' },
    ]);
    const backend = new SdkAgentBackend({} as never, streamFn);

    const events = [];
    for await (const event of backend.stream({ runId: 'run-1', history })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text-delta', runId: 'run-1', delta: 'Hello' },
      { type: 'text-delta', runId: 'run-1', delta: ', world' },
    ]);
  });

  it('yields a tool-start event for a tool-call part', async () => {
    const streamFn = fakeStreamFn([{ type: 'tool-call', toolCallId: 'tc-1', toolName: 'read_file' }]);
    const backend = new SdkAgentBackend({} as never, streamFn);

    const events = [];
    for await (const event of backend.stream({ runId: 'run-1', history })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'tool-start', runId: 'run-1', toolCallId: 'tc-1', toolName: 'read_file' }]);
  });

  it('ignores unrecognized part types', async () => {
    const streamFn = fakeStreamFn([{ type: 'finish-step' }, { type: 'text-delta', text: 'kept' }]);
    const backend = new SdkAgentBackend({} as never, streamFn);

    const events = [];
    for await (const event of backend.stream({ runId: 'run-1', history })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'text-delta', runId: 'run-1', delta: 'kept' }]);
  });

  it('passes an abort signal that cancel() aborts into the stream call', async () => {
    let capturedSignal: AbortSignal | undefined;
    let releaseFirstPart: (() => void) | undefined;

    const pendingThenDone: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise((resolve) => {
              releaseFirstPart = () => resolve({ done: true, value: undefined });
            }),
        };
      },
    };

    const streamFn = vi.fn((params: { signal?: AbortSignal }) => {
      capturedSignal = params.signal;
      return { fullStream: pendingThenDone };
    }) as unknown as StreamInvoker;

    const backend = new SdkAgentBackend({} as never, streamFn);
    const iterator = backend.stream({ runId: 'run-1', history })[Symbol.asyncIterator]();
    const pendingNext = iterator.next();

    // Give the generator a tick to reach the `for await` and call streamFn.
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedSignal?.aborted).toBe(false);
    backend.cancel('run-1');
    expect(capturedSignal?.aborted).toBe(true);

    releaseFirstPart?.();
    await pendingNext;
  });
});

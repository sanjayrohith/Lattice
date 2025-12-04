import { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { EmbeddingWorkerPool, type WorkerLike } from './embeddingWorkerPool';

function createFakeWorker(): WorkerLike & {
  postedMessages: Array<{ id: number; texts: readonly string[] }>;
  emitMessage: (message: { id: number; vectors?: number[][]; error?: string }) => void;
  emitError: (error: Error) => void;
} {
  const listeners: { message: Array<(message: unknown) => void>; error: Array<(error: Error) => void> } = {
    message: [],
    error: [],
  };
  const postedMessages: Array<{ id: number; texts: readonly string[] }> = [];

  return {
    postedMessages,
    postMessage: (message) => postedMessages.push(message),
    on: (event, listener) => {
      if (event === 'message') listeners.message.push(listener as (message: unknown) => void);
      else listeners.error.push(listener as (error: Error) => void);
    },
    terminate: vi.fn().mockResolvedValue(0),
    emitMessage: (message) => listeners.message.forEach((l) => l(message)),
    emitError: (error) => listeners.error.forEach((l) => l(error)),
  };
}

describe('EmbeddingWorkerPool', () => {
  it('processes jobs one at a time and resolves in order of completion', async () => {
    const worker = createFakeWorker();
    const pool = new EmbeddingWorkerPool(worker);

    const first = pool.submit(['a']);
    const second = pool.submit(['b']);

    expect(worker.postedMessages).toHaveLength(1);
    worker.emitMessage({ id: 0, vectors: [[1, 0]] });
    await expect(first).resolves.toEqual([[1, 0]]);

    expect(worker.postedMessages).toHaveLength(2);
    worker.emitMessage({ id: 1, vectors: [[0, 1]] });
    await expect(second).resolves.toEqual([[0, 1]]);
  });

  it('rejects a job when the worker reports an error for it', async () => {
    const worker = createFakeWorker();
    const pool = new EmbeddingWorkerPool(worker);

    const job = pool.submit(['a']);
    worker.emitMessage({ id: 0, error: 'boom' });

    await expect(job).rejects.toThrow('boom');
  });

  it('rejects the active job and continues the queue on a worker-level error', async () => {
    const worker = createFakeWorker();
    const pool = new EmbeddingWorkerPool(worker);

    const first = pool.submit(['a']);
    const second = pool.submit(['b']);

    worker.emitError(new Error('worker crashed'));
    await expect(first).rejects.toThrow('worker crashed');

    expect(worker.postedMessages).toHaveLength(2);
    worker.emitMessage({ id: 1, vectors: [[1]] });
    await expect(second).resolves.toEqual([[1]]);
  });

  it('rejects new submissions once maxQueueDepth pending jobs are waiting', async () => {
    const worker = createFakeWorker();
    const pool = new EmbeddingWorkerPool(worker, 1);

    void pool.submit(['a']).catch(() => undefined);
    void pool.submit(['b']).catch(() => undefined);

    await expect(pool.submit(['c'])).rejects.toThrow(/queue is full/);
  });

  it('reports pendingCount including the active job', async () => {
    const worker = createFakeWorker();
    const pool = new EmbeddingWorkerPool(worker);

    void pool.submit(['a']).catch(() => undefined);
    void pool.submit(['b']).catch(() => undefined);
    expect(pool.pendingCount).toBe(2);

    worker.emitMessage({ id: 0, vectors: [[1]] });
    expect(pool.pendingCount).toBe(1);
  });
});

describe('EmbeddingWorkerPool with a real worker thread', () => {
  it('embeds off the main thread end to end', async () => {
    const workerSource = `
      const { parentPort } = require('node:worker_threads');
      parentPort.on('message', (msg) => {
        const vectors = msg.texts.map((t) => [t.length]);
        parentPort.postMessage({ id: msg.id, vectors });
      });
    `;
    const worker = new Worker(workerSource, { eval: true }) as unknown as WorkerLike;
    const pool = new EmbeddingWorkerPool(worker);

    const result = await pool.submit(['abcd', 'xy']);
    expect(result).toEqual([[4], [2]]);

    await pool.terminate();
  });
});

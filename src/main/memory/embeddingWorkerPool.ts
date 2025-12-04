import { Worker } from 'node:worker_threads';
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from './embeddingWorker';

/** The subset of `worker_threads.Worker` the pool depends on, so tests can supply a fake. */
export interface WorkerLike {
  postMessage(message: EmbeddingWorkerRequest): void;
  on(event: 'message', listener: (message: EmbeddingWorkerResponse) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  terminate(): Promise<number> | number;
}

interface QueuedJob {
  id: number;
  texts: readonly string[];
  resolve: (vectors: number[][]) => void;
  reject: (error: Error) => void;
}

const DEFAULT_MAX_QUEUE_DEPTH = 200;

/**
 * Runs embedding jobs on a single worker thread, one at a time, behind a
 * bounded FIFO queue — so a burst of indexer calls from the main process
 * never touches the event loop with CPU-bound embedding work, and never
 * grows unbounded when the worker falls behind.
 */
export class EmbeddingWorkerPool {
  private readonly queue: QueuedJob[] = [];
  private active: QueuedJob | undefined;
  private nextId = 0;

  constructor(
    private readonly worker: WorkerLike,
    private readonly maxQueueDepth: number = DEFAULT_MAX_QUEUE_DEPTH,
  ) {
    this.worker.on('message', (message) => this.handleMessage(message));
    this.worker.on('error', (error) => this.handleWorkerError(error));
  }

  /** Queues a batch for embedding, rejecting immediately once `maxQueueDepth` pending jobs are already waiting. */
  submit(texts: readonly string[]): Promise<number[][]> {
    if (this.queue.length >= this.maxQueueDepth) {
      return Promise.reject(
        new Error(`embedding worker queue is full (max ${this.maxQueueDepth} pending jobs)`),
      );
    }

    return new Promise<number[][]>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, texts, resolve, reject });
      this.pump();
    });
  }

  get pendingCount(): number {
    return this.queue.length + (this.active ? 1 : 0);
  }

  async terminate(): Promise<void> {
    await this.worker.terminate();
  }

  private pump(): void {
    if (this.active || this.queue.length === 0) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    this.worker.postMessage({ id: job.id, texts: job.texts });
  }

  private handleMessage(message: EmbeddingWorkerResponse): void {
    if (!this.active || message.id !== this.active.id) return;
    const job = this.active;
    this.active = undefined;

    if (message.error) {
      job.reject(new Error(message.error));
    } else {
      job.resolve(message.vectors ?? []);
    }
    this.pump();
  }

  private handleWorkerError(error: Error): void {
    const job = this.active;
    this.active = undefined;
    job?.reject(error);
    this.pump();
  }
}

/** Builds the production pool, backed by a real worker thread running {@link handleEmbeddingWorkerRequest}. */
export function createEmbeddingWorkerPool(maxQueueDepth?: number): EmbeddingWorkerPool {
  const worker = new Worker(new URL('./embeddingWorker.js', import.meta.url));
  return new EmbeddingWorkerPool(worker, maxQueueDepth);
}

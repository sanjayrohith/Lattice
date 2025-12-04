import { isMainThread, parentPort } from 'node:worker_threads';
import { LocalHashingEmbeddingProvider } from './embeddingProvider';

export interface EmbeddingWorkerRequest {
  id: number;
  texts: readonly string[];
}

export interface EmbeddingWorkerResponse {
  id: number;
  vectors?: number[][];
  error?: string;
}

/**
 * Entry point run inside the embedding worker thread. Receives a batch of
 * texts tagged with a job id, embeds them with the dependency-free local
 * provider (no network access from a worker), and posts the result — or
 * the error message — back under the same id so the pool on the main
 * thread can resolve the matching job.
 */
export async function handleEmbeddingWorkerRequest(
  request: EmbeddingWorkerRequest,
): Promise<EmbeddingWorkerResponse> {
  try {
    const provider = new LocalHashingEmbeddingProvider();
    const vectors = await provider.embed(request.texts);
    return { id: request.id, vectors };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}

/* istanbul ignore next -- exercised only when actually running as a worker thread */
if (!isMainThread && parentPort) {
  parentPort.on('message', (request: EmbeddingWorkerRequest) => {
    void handleEmbeddingWorkerRequest(request).then((response) => parentPort?.postMessage(response));
  });
}

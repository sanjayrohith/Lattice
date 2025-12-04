import { describe, expect, it } from 'vitest';
import { handleEmbeddingWorkerRequest } from './embeddingWorker';

describe('handleEmbeddingWorkerRequest', () => {
  it('embeds the requested texts and echoes the job id', async () => {
    const response = await handleEmbeddingWorkerRequest({ id: 7, texts: ['hello world'] });

    expect(response.id).toBe(7);
    expect(response.error).toBeUndefined();
    expect(response.vectors).toHaveLength(1);
    expect(response.vectors?.[0]).toHaveLength(256);
  });
});

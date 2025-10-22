import { decodeJsonRpc, JsonRpcDecodeError, type JsonRpcMessage } from './jsonRpc';

export interface HttpTransportConfig {
  url: string;
  headers?: Readonly<Record<string, string>>;
  /** Milliseconds before an individual request (including the streaming connect) is aborted. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export type HttpTransportEvent =
  | { type: 'message'; message: JsonRpcMessage }
  | { type: 'decode-error'; error: JsonRpcDecodeError }
  | { type: 'closed' }
  | { type: 'error'; error: Error };

const DEFAULT_TIMEOUT_MS = 30_000;

/** Thrown when the remote agent's HTTP endpoint responds with a non-2xx status. */
export class HttpTransportRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpTransportRequestError';
  }
}

/**
 * Transport for remote ACP agents reachable over HTTP: outbound JSON-RPC
 * frames are POSTed as the request body, and the response is consumed as
 * a server-sent-event stream so a single request can yield many
 * JSON-RPC messages (notifications interleaved with the eventual
 * response) rather than exactly one reply per request.
 */
export class HttpTransport {
  private readonly listeners = new Set<(event: HttpTransportEvent) => void>();
  private closed = false;

  constructor(private readonly config: HttpTransportConfig) {}

  onEvent(listener: (event: HttpTransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: HttpTransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private fetchFn(): typeof fetch {
    return this.config.fetchImpl ?? fetch;
  }

  /**
   * Posts one JSON-RPC frame and streams the response body as SSE,
   * decoding each `data:` line as a JSON-RPC message and emitting it.
   * Resolves once the response stream ends.
   */
  async send(frame: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await this.fetchFn()(this.config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          ...(this.config.headers ?? {}),
        },
        body: frame,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpTransportRequestError(response.status, `agent endpoint returned ${response.status}`);
      }
      if (!response.body) {
        this.emit({ type: 'closed' });
        return;
      }

      await this.consumeSseStream(response.body);
      this.emit({ type: 'closed' });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: 'error', error: normalized });
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async consumeSseStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const dataLine = line.startsWith('data:') ? line.slice(5).trim() : undefined;
          if (!dataLine) continue;

          try {
            this.emit({ type: 'message', message: decodeJsonRpc(dataLine) });
          } catch (error) {
            if (error instanceof JsonRpcDecodeError) {
              this.emit({ type: 'decode-error', error });
            } else {
              throw error;
            }
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  close(): void {
    this.closed = true;
  }
}

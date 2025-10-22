import { describe, expect, it, vi } from 'vitest';
import { HttpTransport, HttpTransportRequestError, type HttpTransportEvent } from './httpTransport';

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe('HttpTransport', () => {
  it('decodes each SSE data line as a JSON-RPC message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { a: 1 } }),
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
      ]),
    );

    const transport = new HttpTransport({ url: 'https://agent.example/rpc', fetchImpl });
    const events: HttpTransportEvent[] = [];
    transport.onEvent((event) => events.push(event));

    await transport.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agent.example/rpc',
      expect.objectContaining({ method: 'POST' }),
    );
    const messages = events.filter((e) => e.type === 'message');
    expect(messages).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'closed' });
  });

  it('sends configured headers alongside the required content-type and accept headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([]));
    const transport = new HttpTransport({
      url: 'https://agent.example/rpc',
      fetchImpl,
      headers: { authorization: 'Bearer secret' },
    });

    await transport.send('{}');

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret');
    expect(headers['content-type']).toBe('application/json');
    expect(headers.accept).toBe('text/event-stream');
  });

  it('throws HttpTransportRequestError and emits an error event on non-2xx status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const transport = new HttpTransport({ url: 'https://agent.example/rpc', fetchImpl });
    const events: HttpTransportEvent[] = [];
    transport.onEvent((event) => events.push(event));

    await expect(transport.send('{}')).rejects.toBeInstanceOf(HttpTransportRequestError);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('emits a decode-error for a malformed SSE data line without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(['not json']));
    const transport = new HttpTransport({ url: 'https://agent.example/rpc', fetchImpl });
    const events: HttpTransportEvent[] = [];
    transport.onEvent((event) => events.push(event));

    await transport.send('{}');
    expect(events.some((e) => e.type === 'decode-error')).toBe(true);
  });

  it('aborts the request after the configured timeout', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    const transport = new HttpTransport({ url: 'https://agent.example/rpc', fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 });
    await expect(transport.send('{}')).rejects.toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  JsonRpcDecodeError,
  JsonRpcProtocolError,
  JSON_RPC_ERROR_CODES,
  NewlineFrameSplitter,
  RequestIdCorrelator,
  decodeJsonRpc,
  encodeJsonRpcError,
  encodeJsonRpcNotification,
  encodeJsonRpcRequest,
  encodeJsonRpcSuccess,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcSuccessResponse,
} from './jsonRpc';

describe('encode/decode round trip', () => {
  it('round-trips a request', () => {
    const frame = encodeJsonRpcRequest(1, 'initialize', { protocolVersion: 1 });
    expect(frame.endsWith('\n')).toBe(true);
    const decoded = decodeJsonRpc(frame.trim());
    expect(isJsonRpcRequest(decoded)).toBe(true);
    if (isJsonRpcRequest(decoded)) {
      expect(decoded.method).toBe('initialize');
      expect(decoded.id).toBe(1);
      expect(decoded.params).toEqual({ protocolVersion: 1 });
    }
  });

  it('round-trips a notification with no id', () => {
    const frame = encodeJsonRpcNotification('session/update', { foo: 'bar' });
    const decoded = decodeJsonRpc(frame.trim());
    expect(isJsonRpcNotification(decoded)).toBe(true);
    expect(isJsonRpcRequest(decoded)).toBe(false);
  });

  it('round-trips a success response', () => {
    const frame = encodeJsonRpcSuccess('abc', { ok: true });
    const decoded = decodeJsonRpc(frame.trim());
    expect(isJsonRpcResponse(decoded)).toBe(true);
    if (isJsonRpcResponse(decoded) && isJsonRpcSuccessResponse(decoded)) {
      expect(decoded.result).toEqual({ ok: true });
    }
  });

  it('round-trips an error response', () => {
    const frame = encodeJsonRpcError(2, {
      code: JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
      message: 'no such method',
    });
    const decoded = decodeJsonRpc(frame.trim());
    expect(isJsonRpcResponse(decoded)).toBe(true);
    if (isJsonRpcResponse(decoded) && !isJsonRpcSuccessResponse(decoded)) {
      expect(decoded.error.code).toBe(JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND);
    }
  });
});

describe('decodeJsonRpc error handling', () => {
  it('throws JsonRpcDecodeError on invalid JSON', () => {
    expect(() => decodeJsonRpc('not json')).toThrow(JsonRpcDecodeError);
  });

  it('throws JsonRpcDecodeError on well-formed JSON that matches no shape', () => {
    expect(() => decodeJsonRpc(JSON.stringify({ jsonrpc: '2.0' }))).toThrow(JsonRpcDecodeError);
  });
});

describe('NewlineFrameSplitter', () => {
  it('returns complete lines and retains a partial trailing chunk', () => {
    const splitter = new NewlineFrameSplitter();
    const first = splitter.push('{"a":1}\n{"b":2}\n{"c"');
    expect(first).toEqual(['{"a":1}', '{"b":2}']);
    expect(splitter.pending).toBe('{"c"');

    const second = splitter.push(':3}\n');
    expect(second).toEqual(['{"c":3}']);
    expect(splitter.pending).toBe('');
  });

  it('skips blank lines', () => {
    const splitter = new NewlineFrameSplitter();
    const lines = splitter.push('\n\n{"a":1}\n\n');
    expect(lines).toEqual(['{"a":1}']);
  });
});

describe('RequestIdCorrelator', () => {
  it('resolves the tracked promise for a matching success response', async () => {
    const correlator = new RequestIdCorrelator();
    const id = correlator.nextRequestId();
    const promise = correlator.track(id);

    const resolved = correlator.resolve({ jsonrpc: '2.0', id, result: { value: 42 } });
    expect(resolved).toBe(true);
    await expect(promise).resolves.toEqual({ value: 42 });
  });

  it('rejects the tracked promise for a matching error response', async () => {
    const correlator = new RequestIdCorrelator();
    const id = correlator.nextRequestId();
    const promise = correlator.track(id);

    correlator.resolve({
      jsonrpc: '2.0',
      id,
      error: { code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR, message: 'boom' },
    });
    await expect(promise).rejects.toBeInstanceOf(JsonRpcProtocolError);
  });

  it('returns false for an id with no tracked call', () => {
    const correlator = new RequestIdCorrelator();
    expect(correlator.resolve({ jsonrpc: '2.0', id: 999, result: null })).toBe(false);
  });

  it('rejectAll flushes every pending call', async () => {
    const correlator = new RequestIdCorrelator();
    const a = correlator.track(correlator.nextRequestId());
    const b = correlator.track(correlator.nextRequestId());
    const onRejectA = vi.fn();
    a.catch(onRejectA);

    correlator.rejectAll(new JsonRpcProtocolError(JSON_RPC_ERROR_CODES.INTERNAL_ERROR, 'closed'));
    await expect(b).rejects.toBeInstanceOf(JsonRpcProtocolError);
    expect(correlator.pendingCount).toBe(0);
  });
});

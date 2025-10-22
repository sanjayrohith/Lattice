import { z } from 'zod';

/**
 * JSON-RPC 2.0 encoding and decoding for the Agent Client Protocol
 * transports (`stdioTransport.ts`, `httpTransport.ts`). Every frame on
 * the wire is newline-delimited JSON — one complete JSON-RPC object per
 * line — so a stream reader only needs to split on `\n` to find message
 * boundaries, never a length-prefixed or otherwise binary framing.
 */

const jsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);
export type JsonRpcId = z.infer<typeof jsonRpcIdSchema>;

export const jsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcErrorPayload = z.infer<typeof jsonRpcErrorSchema>;

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: jsonRpcIdSchema,
  method: z.string(),
  params: z.unknown().optional(),
});
export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

const jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
});
export type JsonRpcNotification = z.infer<typeof jsonRpcNotificationSchema>;

const jsonRpcSuccessResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: jsonRpcIdSchema,
  result: z.unknown(),
});
export type JsonRpcSuccessResponse = z.infer<typeof jsonRpcSuccessResponseSchema>;

const jsonRpcErrorResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: jsonRpcIdSchema,
  error: jsonRpcErrorSchema,
});
export type JsonRpcErrorResponse = z.infer<typeof jsonRpcErrorResponseSchema>;

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/** Standard JSON-RPC 2.0 reserved error codes this codec maps protocol failures onto. */
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** Thrown when a decoded frame is not a well-formed JSON-RPC 2.0 message of any known shape. */
export class JsonRpcDecodeError extends Error {
  readonly code = JSON_RPC_ERROR_CODES.PARSE_ERROR;

  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = 'JsonRpcDecodeError';
  }
}

/** An application-level JSON-RPC error, distinct from a decode failure of the wire frame itself. */
export class JsonRpcProtocolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'JsonRpcProtocolError';
  }

  toErrorPayload(): JsonRpcErrorPayload {
    return { code: this.code, message: this.message, data: this.data };
  }
}

export function isJsonRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'method' in message && 'id' in message;
}

export function isJsonRpcNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return 'method' in message && !('id' in message);
}

export function isJsonRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return !('method' in message) && 'id' in message;
}

export function isJsonRpcSuccessResponse(
  message: JsonRpcResponse,
): message is JsonRpcSuccessResponse {
  return 'result' in message;
}

/** Serializes one JSON-RPC message into a single newline-terminated frame. */
export function encodeJsonRpc(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function encodeJsonRpcRequest(id: JsonRpcId, method: string, params?: unknown): string {
  return encodeJsonRpc({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) });
}

export function encodeJsonRpcNotification(method: string, params?: unknown): string {
  return encodeJsonRpc({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) });
}

export function encodeJsonRpcSuccess(id: JsonRpcId, result: unknown): string {
  return encodeJsonRpc({ jsonrpc: '2.0', id, result });
}

export function encodeJsonRpcError(id: JsonRpcId, error: JsonRpcErrorPayload): string {
  return encodeJsonRpc({ jsonrpc: '2.0', id, error });
}

/**
 * Parses one line of text into a typed JSON-RPC message. Throws
 * {@link JsonRpcDecodeError} for malformed JSON or a shape matching none
 * of request/notification/success/error-response, so a caller reading a
 * stream can catch decode failures per-line without losing the rest of
 * the stream.
 */
export function decodeJsonRpc(line: string): JsonRpcMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new JsonRpcDecodeError(
      `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      line,
    );
  }

  const asRequest = jsonRpcRequestSchema.safeParse(parsed);
  if (asRequest.success) return asRequest.data;

  const asNotification = jsonRpcNotificationSchema.safeParse(parsed);
  if (asNotification.success) return asNotification.data;

  const asSuccess = jsonRpcSuccessResponseSchema.safeParse(parsed);
  if (asSuccess.success) return asSuccess.data;

  const asError = jsonRpcErrorResponseSchema.safeParse(parsed);
  if (asError.success) return asError.data;

  throw new JsonRpcDecodeError('does not match any known JSON-RPC 2.0 message shape', line);
}

/**
 * Splits a growing buffer of bytes/text on newline-delimited frame
 * boundaries, returning every complete line found and the remainder to
 * keep accumulating. Transport-agnostic: both the stdio and HTTP SSE
 * transports feed arbitrarily-chunked input through this.
 */
export class NewlineFrameSplitter {
  private buffer = '';

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.filter((line) => line.trim().length > 0);
  }

  /** Any content still held in the buffer that has not yet been terminated by a newline. */
  get pending(): string {
    return this.buffer;
  }
}

/**
 * Correlates outbound JSON-RPC requests with their eventual response by
 * numeric id, so a transport can resolve/reject the right caller's
 * promise when a response frame arrives out of order relative to other
 * in-flight calls.
 */
export class RequestIdCorrelator {
  private nextId = 1;
  private readonly pending = new Map<
    JsonRpcId,
    { resolve: (result: unknown) => void; reject: (error: JsonRpcProtocolError) => void }
  >();

  nextRequestId(): number {
    return this.nextId++;
  }

  track(id: JsonRpcId): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  resolve(response: JsonRpcResponse): boolean {
    const entry = this.pending.get(response.id);
    if (!entry) return false;
    this.pending.delete(response.id);

    if (isJsonRpcSuccessResponse(response)) {
      entry.resolve(response.result);
    } else {
      entry.reject(new JsonRpcProtocolError(response.error.code, response.error.message, response.error.data));
    }
    return true;
  }

  /** Rejects every still-pending call, e.g. when the underlying transport closes. */
  rejectAll(error: JsonRpcProtocolError): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}

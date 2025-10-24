/**
 * The transport-agnostic surface {@link AcpConnection} drives: send a
 * request and await its correlated response, fire-and-forget a
 * notification, and receive inbound requests/notifications from the
 * peer. `StdioTransport` and `HttpTransport` are adapted to this
 * interface so the connection logic — initialize handshake, session
 * management, streaming update handling — never branches on which
 * wire format is underneath.
 */
export interface AcpTransport {
  sendRequest(method: string, params?: unknown): Promise<unknown>;
  sendNotification(method: string, params?: unknown): void;
  /** Inbound JSON-RPC requests and notifications sent *by* the peer, keyed by method. */
  onPeerMessage(listener: (method: string, params: unknown, respond?: (result: unknown) => void) => void): () => void;
  close(): void;
}

import {
  RequestIdCorrelator,
  encodeJsonRpcNotification,
  encodeJsonRpcRequest,
  encodeJsonRpcSuccess,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  JsonRpcProtocolError,
  JSON_RPC_ERROR_CODES,
  type JsonRpcMessage,
} from './jsonRpc';
import { StdioTransport, type StdioTransportConfig } from './stdioTransport';
import type { AcpTransport } from './acpTransport';

/**
 * Adapts {@link StdioTransport}'s raw frame events onto {@link AcpTransport}:
 * outbound calls are correlated by id via {@link RequestIdCorrelator},
 * and inbound peer requests/notifications (the agent calling back into
 * the client, e.g. filesystem or permission methods) are routed to
 * `onPeerMessage` listeners with a `respond` callback for requests.
 */
export class StdioAcpTransport implements AcpTransport {
  private readonly transport: StdioTransport;
  private readonly correlator = new RequestIdCorrelator();
  private readonly peerListeners = new Set<
    (method: string, params: unknown, respond?: (result: unknown) => void) => void
  >();

  constructor(config: StdioTransportConfig) {
    this.transport = new StdioTransport(config);
    this.transport.onEvent((event) => {
      if (event.type === 'message') {
        this.handleMessage(event.message);
      } else if (event.type === 'exit') {
        this.correlator.rejectAll(
          new JsonRpcProtocolError(JSON_RPC_ERROR_CODES.INTERNAL_ERROR, 'agent process exited'),
        );
      }
    });
    this.transport.start();
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (isJsonRpcResponse(message)) {
      this.correlator.resolve(message);
      return;
    }
    if (isJsonRpcRequest(message)) {
      for (const listener of this.peerListeners) {
        listener(message.method, message.params, (result) => {
          this.transport.send(encodeJsonRpcSuccess(message.id, result));
        });
      }
      return;
    }
    if (isJsonRpcNotification(message)) {
      for (const listener of this.peerListeners) {
        listener(message.method, message.params);
      }
    }
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.correlator.nextRequestId();
    const pending = this.correlator.track(id);
    this.transport.send(encodeJsonRpcRequest(id, method, params));
    return pending;
  }

  sendNotification(method: string, params?: unknown): void {
    this.transport.send(encodeJsonRpcNotification(method, params));
  }

  onPeerMessage(
    listener: (method: string, params: unknown, respond?: (result: unknown) => void) => void,
  ): () => void {
    this.peerListeners.add(listener);
    return () => this.peerListeners.delete(listener);
  }

  close(): void {
    this.correlator.rejectAll(
      new JsonRpcProtocolError(JSON_RPC_ERROR_CODES.INTERNAL_ERROR, 'transport closed'),
    );
    this.transport.stop();
  }
}

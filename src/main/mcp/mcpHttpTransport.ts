import {
  StreamableHTTPClientTransport,
  type StreamableHTTPReconnectionOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpHttpServerConfig } from './mcpServerConfig';

/** Capped-exponential-backoff reconnection for a dropped SSE stream — same shape of tolerance as `ConnectorSupervisor`'s process-restart backoff, just handled inside the SDK's transport itself. */
export const DEFAULT_HTTP_RECONNECTION_OPTIONS: StreamableHTTPReconnectionOptions = {
  initialReconnectionDelay: 1000,
  maxReconnectionDelay: 30_000,
  reconnectionDelayGrowFactor: 1.5,
  maxRetries: 5,
};

export interface CreateHttpTransportOptions {
  reconnectionOptions?: StreamableHTTPReconnectionOptions;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
}

/**
 * Builds the Streamable HTTP + SSE transport for a remote MCP server:
 * `config.headers` (typically an `Authorization` bearer token) rides on
 * every request via `requestInit.headers`, and a dropped event stream
 * reconnects on its own per `reconnectionOptions` rather than failing
 * the run outright. Per-request timeouts are a call-time concern, not a
 * transport one — see {@link McpClient.listTools}/{@link McpClient.callTool}'s
 * `timeoutMs`.
 */
export function createHttpTransport(config: McpHttpServerConfig, options: CreateHttpTransportOptions = {}): Transport {
  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers },
    reconnectionOptions: options.reconnectionOptions ?? DEFAULT_HTTP_RECONNECTION_OPTIONS,
    ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}),
  });
}

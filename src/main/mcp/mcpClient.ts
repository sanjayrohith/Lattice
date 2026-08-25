import { Client as SdkClient } from '@modelcontextprotocol/sdk/client';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptDescriptor {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpRequestOptions {
  /** Milliseconds to wait before aborting this request; the SDK default (60s) applies when omitted. */
  timeoutMs?: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toRequestOptions(options: McpRequestOptions): { timeout?: number } | undefined {
  return options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : undefined;
}

/** Thrown by {@link McpClient.connect} when the transport handshake fails. */
export class McpConnectionError extends Error {
  readonly code = 'MCP_CONNECTION_FAILED';

  constructor(cause: unknown) {
    super(`MCP connection failed: ${messageOf(cause)}`);
    this.name = 'McpConnectionError';
  }
}

/** Thrown by any {@link McpClient} method other than `connect` when called before a successful connection. */
export class McpNotConnectedError extends Error {
  readonly code = 'MCP_NOT_CONNECTED';

  constructor() {
    super('MCP client is not connected');
    this.name = 'McpNotConnectedError';
  }
}

/** Thrown by {@link McpClient.listTools} or {@link McpClient.callTool} when the underlying request fails. */
export class McpToolCallError extends Error {
  readonly code = 'MCP_TOOL_CALL_FAILED';

  constructor(
    public readonly operation: string,
    cause: unknown,
  ) {
    super(`MCP operation "${operation}" failed: ${messageOf(cause)}`);
    this.name = 'McpToolCallError';
  }
}

/**
 * A thin, typed-error wrapper around the MCP SDK's `Client`, exposing
 * only the four operations the connector supervisor and tool adapter
 * need: `connect`, `listTools`, `callTool`, and `disconnect`. Every SDK
 * exception is caught and re-thrown as one of the typed errors above, so
 * callers can branch on `.code` instead of parsing SDK error messages.
 */
export class McpClient {
  private client: SdkClient | undefined;

  constructor(private readonly clientInfo: { name: string; version: string } = { name: 'lattice', version: '0.1.0' }) {}

  get connected(): boolean {
    return this.client !== undefined;
  }

  async connect(transport: Transport): Promise<void> {
    const client = new SdkClient(this.clientInfo, { capabilities: {} });
    try {
      await client.connect(transport);
    } catch (error) {
      throw new McpConnectionError(error);
    }
    this.client = client;
  }

  async listTools(options: McpRequestOptions = {}): Promise<McpToolDescriptor[]> {
    const client = this.requireClient();
    try {
      const result = await client.listTools(undefined, toRequestOptions(options));
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      throw new McpToolCallError('listTools', error);
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options: McpRequestOptions = {},
  ): Promise<unknown> {
    const client = this.requireClient();
    let result: Awaited<ReturnType<SdkClient['callTool']>>;
    try {
      result = await client.callTool({ name, arguments: args }, undefined, toRequestOptions(options));
    } catch (error) {
      throw new McpToolCallError(name, error);
    }

    // The MCP protocol reports a failed tool execution (e.g. an unknown
    // tool name) as a normal result with `isError: true`, not a thrown
    // JSON-RPC error — surface it the same way a thrown error would be.
    if (result.isError) {
      throw new McpToolCallError(name, JSON.stringify(result.content));
    }
    return result;
  }

  async listResources(options: McpRequestOptions = {}): Promise<McpResourceDescriptor[]> {
    const client = this.requireClient();
    try {
      const result = await client.listResources(undefined, toRequestOptions(options));
      return result.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      }));
    } catch (error) {
      throw new McpToolCallError('listResources', error);
    }
  }

  async readResource(uri: string, options: McpRequestOptions = {}): Promise<McpResourceContent[]> {
    const client = this.requireClient();
    try {
      const result = await client.readResource({ uri }, toRequestOptions(options));
      return result.contents.map((content) => ({
        uri: content.uri,
        mimeType: content.mimeType,
        text: 'text' in content ? content.text : undefined,
        blob: 'blob' in content ? content.blob : undefined,
      }));
    } catch (error) {
      throw new McpToolCallError('readResource', error);
    }
  }

  async listPrompts(options: McpRequestOptions = {}): Promise<McpPromptDescriptor[]> {
    const client = this.requireClient();
    try {
      const result = await client.listPrompts(undefined, toRequestOptions(options));
      return result.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
      }));
    } catch (error) {
      throw new McpToolCallError('listPrompts', error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = undefined;
    await client.close();
  }

  private requireClient(): SdkClient {
    if (!this.client) throw new McpNotConnectedError();
    return this.client;
  }
}

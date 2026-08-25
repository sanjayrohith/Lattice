import { z } from 'zod';
import type { AnyTool } from '../tools/types';
import { defineTool } from '../tools/types';
import type { McpClient, McpToolDescriptor } from './mcpClient';
import type { McpServerConfig } from './mcpServerConfig';

export interface McpDiscoveredTool {
  serverId: string;
  descriptor: McpToolDescriptor;
}

/** Resolves a connected server's id to its {@link McpClient}, or `undefined` if it isn't connected. */
export type McpClientLookup = (serverId: string) => McpClient | undefined;

/**
 * Queries every enabled, connected MCP server for its current tool
 * definitions. Called at the start of each agent turn — an MCP server's
 * tool list is not assumed static (`feat(mcp): cache tool discovery with
 * invalidation` is what makes that affordable per turn). A disabled
 * server, or one with no connected client, contributes nothing rather
 * than failing the discovery pass.
 */
export async function discoverMcpTools(
  servers: readonly McpServerConfig[],
  getClient: McpClientLookup,
): Promise<McpDiscoveredTool[]> {
  const enabledServers = servers.filter((server) => server.enabled);

  const perServer = await Promise.all(
    enabledServers.map(async (server): Promise<McpDiscoveredTool[]> => {
      const client = getClient(server.id);
      if (!client?.connected) return [];

      const descriptors = await client.listTools();
      return descriptors.map((descriptor) => ({ serverId: server.id, descriptor }));
    }),
  );

  return perServer.flat();
}

/**
 * Wraps one discovered MCP tool as an internal {@link AnyTool} so it can
 * ride in the same toolset the model sees. The input schema here is
 * deliberately permissive (`z.record(z.unknown())`) — deriving a precise
 * Zod schema from the tool's JSON Schema is `feat(mcp): adapt mcp tools
 * into the internal tool interface`; validation in the meantime is left
 * to the MCP server itself, which will reject a malformed call.
 * `defaultConsent: 'ask'` because an externally supplied tool is never
 * implicitly trusted the way a built-in filesystem tool is.
 */
export function toMcpAnyTool(discovered: McpDiscoveredTool, getClient: McpClientLookup): AnyTool {
  return defineTool({
    name: discovered.descriptor.name,
    description: discovered.descriptor.description,
    inputSchema: z.record(z.string(), z.unknown()),
    defaultConsent: 'ask',
    execute: async (input: Record<string, unknown>) => {
      const client = getClient(discovered.serverId);
      if (!client) {
        throw new Error(`mcp server "${discovered.serverId}" is not connected`);
      }
      return client.callTool(discovered.descriptor.name, input);
    },
  });
}

/** Appends every discovered MCP tool, wrapped via {@link toMcpAnyTool}, onto the run's base toolset. */
export function mergeMcpToolsIntoToolset(
  baseTools: readonly AnyTool[],
  discovered: readonly McpDiscoveredTool[],
  getClient: McpClientLookup,
): AnyTool[] {
  return [...baseTools, ...discovered.map((tool) => toMcpAnyTool(tool, getClient))];
}

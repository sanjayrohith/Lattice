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
 * Namespaces a discovered tool's bare name with the id of the server
 * that declared it — `mcp__<serverId>__<toolName>` — so two servers
 * declaring the same tool name (or a server declaring a name that
 * happens to match a built-in, like `read_file`) can never collide.
 * No built-in tool name contains `mcp__`, so this alone is sufficient to
 * guarantee an MCP tool can never shadow a core capability.
 */
export function namespaceMcpToolName(serverId: string, toolName: string): string {
  return `mcp__${serverId}__${toolName}`;
}

/**
 * Deterministically resolves a remaining name collision (e.g. two
 * differently-configured entries somehow producing the same namespaced
 * name) by appending an incrementing numeric suffix — `__2`, `__3`, … —
 * until the name is unique against `existingNames`. Given
 * {@link namespaceMcpToolName}'s per-server prefix this should never
 * fire in practice; it exists so a collision fails safe (a distinguishable,
 * still-callable name) rather than silently dropping a tool.
 */
export function resolveToolNameCollision(candidate: string, existingNames: ReadonlySet<string>): string {
  if (!existingNames.has(candidate)) return candidate;

  let attempt = 2;
  while (existingNames.has(`${candidate}__${attempt}`)) attempt += 1;
  return `${candidate}__${attempt}`;
}

/**
 * Wraps one discovered MCP tool as an internal {@link AnyTool}, named
 * per {@link namespaceMcpToolName} and disambiguated against
 * `existingNames` via {@link resolveToolNameCollision}. The input schema
 * here is deliberately permissive (`z.record(z.unknown())`) — deriving a
 * precise Zod schema from the tool's JSON Schema is `feat(mcp): adapt
 * mcp tools into the internal tool interface`; validation in the
 * meantime is left to the MCP server itself, which will reject a
 * malformed call. `defaultConsent: 'ask'` because an externally supplied
 * tool is never implicitly trusted the way a built-in filesystem tool is.
 */
export function toMcpAnyTool(
  discovered: McpDiscoveredTool,
  getClient: McpClientLookup,
  existingNames: ReadonlySet<string> = new Set(),
): AnyTool {
  const name = resolveToolNameCollision(
    namespaceMcpToolName(discovered.serverId, discovered.descriptor.name),
    existingNames,
  );

  return defineTool({
    name,
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

/**
 * Appends every discovered MCP tool, namespaced and collision-resolved
 * via {@link toMcpAnyTool}, onto the run's base toolset. Names are
 * resolved against the base toolset first and then against each other in
 * order, so the full merged set is guaranteed unique.
 */
export function mergeMcpToolsIntoToolset(
  baseTools: readonly AnyTool[],
  discovered: readonly McpDiscoveredTool[],
  getClient: McpClientLookup,
): AnyTool[] {
  const usedNames = new Set(baseTools.map((tool) => tool.name));
  const mcpTools: AnyTool[] = [];

  for (const tool of discovered) {
    const wrapped = toMcpAnyTool(tool, getClient, usedNames);
    usedNames.add(wrapped.name);
    mcpTools.push(wrapped);
  }

  return [...baseTools, ...mcpTools];
}

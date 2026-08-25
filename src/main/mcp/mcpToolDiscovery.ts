import type { AnyTool, ConsentPolicy } from '../tools/types';
import { defineTool } from '../tools/types';
import {
  DEFAULT_MCP_CALL_TIMEOUT_MS,
  isolateMcpServerFailure,
  noopMcpLogger,
  withTimeout,
  type McpLogger,
} from './mcpFaultIsolation';
import { jsonSchemaToZod, type JsonSchema } from './jsonSchemaToZod';
import type { McpClient, McpToolDescriptor } from './mcpClient';
import type { McpServerConfig } from './mcpServerConfig';

export interface McpDiscoveredTool {
  serverId: string;
  descriptor: McpToolDescriptor;
}

/** Resolves a connected server's id to its {@link McpClient}, or `undefined` if it isn't connected. */
export type McpClientLookup = (serverId: string) => McpClient | undefined;

export interface DiscoverMcpToolsOptions {
  timeoutMs?: number;
  logger?: McpLogger;
}

/**
 * Queries every enabled, connected MCP server for its current tool
 * definitions. Called at the start of each agent turn — an MCP server's
 * tool list is not assumed static (`feat(mcp): cache tool discovery with
 * invalidation` is what makes that affordable per turn). A disabled
 * server, or one with no connected client, contributes nothing rather
 * than failing the discovery pass. Each server's discovery call is
 * independently isolated via {@link isolateMcpServerFailure}: a server
 * that hangs, crashes, or returns a malformed response is logged and
 * skipped rather than failing every other server's discovery — or the
 * agent turn itself.
 */
export async function discoverMcpTools(
  servers: readonly McpServerConfig[],
  getClient: McpClientLookup,
  options: DiscoverMcpToolsOptions = {},
): Promise<McpDiscoveredTool[]> {
  const enabledServers = servers.filter((server) => server.enabled);

  const perServer = await Promise.all(
    enabledServers.map((server): Promise<McpDiscoveredTool[]> => {
      const client = getClient(server.id);
      if (!client?.connected) return Promise.resolve([]);

      return isolateMcpServerFailure(
        server.id,
        'tool discovery',
        async () => {
          const descriptors = await client.listTools();
          return descriptors.map((descriptor) => ({ serverId: server.id, descriptor }));
        },
        [],
        options,
      );
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

export interface ToMcpAnyToolOptions {
  existingNames?: ReadonlySet<string>;
  /** Namespaced tool names (see {@link namespaceMcpToolName}) the user has explicitly allowlisted to run without prompting. */
  consentAllowlist?: ReadonlySet<string>;
  /** Milliseconds before an invocation is abandoned as hung; forwarded to {@link isolateMcpServerFailure}'s default. */
  callTimeoutMs?: number;
  logger?: McpLogger;
}

/**
 * Wraps one discovered MCP tool as an internal {@link AnyTool}, named
 * per {@link namespaceMcpToolName} and disambiguated against
 * `options.existingNames` via {@link resolveToolNameCollision}. The
 * input schema is derived from the tool's declared JSON Schema via
 * {@link jsonSchemaToZod} — real per-field validation and the
 * descriptions the model relies on for guidance, rather than the
 * permissive `z.record(z.unknown())` placeholder `feat(mcp): discover
 * tools at the start of every turn` used. `defaultConsent` is `'ask'`
 * unless the resolved name appears in `options.consentAllowlist`, in
 * which case it is `'always'` — an externally supplied tool is never
 * implicitly trusted the way a built-in filesystem tool is, except where
 * the user has explicitly said otherwise.
 */
export function toMcpAnyTool(
  discovered: McpDiscoveredTool,
  getClient: McpClientLookup,
  options: ToMcpAnyToolOptions = {},
): AnyTool {
  const name = resolveToolNameCollision(
    namespaceMcpToolName(discovered.serverId, discovered.descriptor.name),
    options.existingNames ?? new Set(),
  );
  const defaultConsent: ConsentPolicy = options.consentAllowlist?.has(name) ? 'always' : 'ask';

  return defineTool({
    name,
    description: discovered.descriptor.description,
    inputSchema: jsonSchemaToZod(discovered.descriptor.inputSchema as JsonSchema | undefined),
    defaultConsent,
    execute: async (input: unknown) => {
      const client = getClient(discovered.serverId);
      if (!client) {
        throw new Error(`mcp server "${discovered.serverId}" is not connected`);
      }

      const timeoutMs = options.callTimeoutMs ?? DEFAULT_MCP_CALL_TIMEOUT_MS;
      try {
        return await withTimeout(
          client.callTool(discovered.descriptor.name, input as Record<string, unknown>),
          timeoutMs,
          `mcp server "${discovered.serverId}" tool "${discovered.descriptor.name}" call timed out after ${timeoutMs}ms`,
        );
      } catch (error) {
        (options.logger ?? noopMcpLogger).warn(
          `mcp server "${discovered.serverId}" tool "${discovered.descriptor.name}" call failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      }
    },
  });
}

export interface MergeMcpToolsOptions {
  consentAllowlist?: ReadonlySet<string>;
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
  options: MergeMcpToolsOptions = {},
): AnyTool[] {
  const usedNames = new Set(baseTools.map((tool) => tool.name));
  const mcpTools: AnyTool[] = [];

  for (const tool of discovered) {
    const wrapped = toMcpAnyTool(tool, getClient, {
      existingNames: usedNames,
      consentAllowlist: options.consentAllowlist,
    });
    usedNames.add(wrapped.name);
    mcpTools.push(wrapped);
  }

  return [...baseTools, ...mcpTools];
}

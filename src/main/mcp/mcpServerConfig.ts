import { z } from 'zod';

/** A per-tool override of {@link ConsentPolicy}, keyed by the tool's namespaced name (see `namespaceMcpToolName`). */
export const mcpConsentOverridesSchema = z.record(z.string(), z.enum(['always', 'ask', 'never'])).default({});

/**
 * How the orchestrator reaches an MCP server: `stdio` spawns a local
 * process and speaks JSON-RPC over its stdin/stdout, exactly like an ACP
 * connector's stdio transport; `http` speaks to a remote server URL with
 * optional auth headers.
 */
export const mcpStdioServerConfigSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean().default(true),
  transport: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  consentOverrides: mcpConsentOverridesSchema,
});
export type McpStdioServerConfig = z.infer<typeof mcpStdioServerConfigSchema>;

export const mcpHttpServerConfigSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean().default(true),
  transport: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  consentOverrides: mcpConsentOverridesSchema,
});
export type McpHttpServerConfig = z.infer<typeof mcpHttpServerConfigSchema>;

export const mcpServerConfigSchema = z.discriminatedUnion('transport', [
  mcpStdioServerConfigSchema,
  mcpHttpServerConfigSchema,
]);
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

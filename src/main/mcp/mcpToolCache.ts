import type { McpToolDescriptor } from './mcpClient';

interface CacheEntry {
  tools: readonly McpToolDescriptor[];
  expiresAt: number;
  configVersion: string;
}

const DEFAULT_TTL_MS = 30_000;

/** A stable fingerprint of a server config; any field change (command, args, env, url, headers, …) yields a different version. */
export function configVersionOf(config: unknown): string {
  return JSON.stringify(config);
}

/**
 * Caches each server's most recently discovered tool list for
 * `ttlMs`, keyed by server id and fingerprinted against its current
 * config — so per-turn discovery (`feat(mcp): discover tools at the
 * start of every turn`) hits the network only once per TTL window per
 * server instead of every single turn. A cached entry is invalidated
 * automatically the instant its server's config changes (the
 * fingerprint no longer matches), and can be invalidated explicitly —
 * on a supervised restart, or a user-triggered "refresh" action — via
 * {@link invalidate}/{@link invalidateAll}.
 */
export class McpToolDiscoveryCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(serverId: string, configVersion: string): readonly McpToolDescriptor[] | undefined {
    const entry = this.entries.get(serverId);
    if (!entry) return undefined;
    if (entry.configVersion !== configVersion) return undefined;
    if (this.now() >= entry.expiresAt) return undefined;
    return entry.tools;
  }

  set(serverId: string, tools: readonly McpToolDescriptor[], configVersion: string): void {
    this.entries.set(serverId, { tools, configVersion, expiresAt: this.now() + this.ttlMs });
  }

  /** Forces the next lookup for `serverId` to miss — call on a supervised restart or an explicit user-triggered refresh. */
  invalidate(serverId: string): void {
    this.entries.delete(serverId);
  }

  invalidateAll(): void {
    this.entries.clear();
  }
}

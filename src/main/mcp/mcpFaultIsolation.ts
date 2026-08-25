/** The subset of `electron-log`'s API this module depends on, so tests can inject a plain spy instead of the real logger. */
export interface McpLogger {
  warn: (message: string, ...meta: unknown[]) => void;
}

export const noopMcpLogger: McpLogger = { warn: () => undefined };

export const DEFAULT_MCP_CALL_TIMEOUT_MS = 15_000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Races `promise` against a timer, rejecting with a descriptive error if
 * `timeoutMs` elapses first — the mechanism that turns a genuinely hung
 * MCP server (one that accepts the connection but never responds) into a
 * bounded failure instead of an indefinite stall.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Runs `operation` bounded by `timeoutMs`; on either a timeout or any
 * thrown/rejected error, logs a warning naming `serverId` and returns
 * `fallback` instead of propagating. A hung, crashed, or
 * malformed server degrades to "contributes nothing this turn" rather
 * than failing every other server's discovery or the agent turn itself.
 */
export async function isolateMcpServerFailure<T>(
  serverId: string,
  label: string,
  operation: () => Promise<T>,
  fallback: T,
  options: { timeoutMs?: number; logger?: McpLogger } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_CALL_TIMEOUT_MS;
  const logger = options.logger ?? noopMcpLogger;

  try {
    return await withTimeout(operation(), timeoutMs, `mcp server "${serverId}" ${label} timed out after ${timeoutMs}ms`);
  } catch (error) {
    logger.warn(`mcp server "${serverId}" ${label} failed, skipping: ${messageOf(error)}`);
    return fallback;
  }
}

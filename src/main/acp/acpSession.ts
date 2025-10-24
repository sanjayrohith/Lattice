import { z } from 'zod';
import type { AcpConnection } from './acpConnection';

const sessionNewResultSchema = z.object({
  sessionId: z.string().min(1),
});

/** An open ACP session bound to a specific workspace directory on the peer. */
export interface AcpSession {
  sessionId: string;
  workspaceDirectory: string;
}

/** Thrown when `session/new` succeeds but returns no usable session id. */
export class AcpSessionCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcpSessionCreationError';
  }
}

/**
 * Opens a new agent session on `connection`, isolated to
 * `workspaceDirectory` — every filesystem-touching method the agent
 * subsequently issues for this session is expected to stay rooted
 * there. The connection must already be initialized; see
 * {@link AcpConnection.requireInitialized}.
 */
export async function createAcpSession(
  connection: AcpConnection,
  workspaceDirectory: string,
): Promise<AcpSession> {
  connection.requireInitialized();

  const rawResult = await connection.request('session/new', {
    cwd: workspaceDirectory,
  });

  const parsed = sessionNewResultSchema.safeParse(rawResult);
  if (!parsed.success) {
    throw new AcpSessionCreationError(`session/new returned an unusable result: ${parsed.error.message}`);
  }

  return { sessionId: parsed.data.sessionId, workspaceDirectory };
}

/**
 * Tracks every open session for a connection, keyed by session id, so a
 * caller can look up which workspace directory a given session is
 * bound to without threading it through every call site separately.
 */
export class AcpSessionRegistry {
  private readonly sessions = new Map<string, AcpSession>();

  add(session: AcpSession): void {
    this.sessions.set(session.sessionId, session);
  }

  get(sessionId: string): AcpSession | undefined {
    return this.sessions.get(sessionId);
  }

  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  list(): AcpSession[] {
    return [...this.sessions.values()];
  }
}

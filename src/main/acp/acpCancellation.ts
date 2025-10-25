import type { AcpConnection } from './acpConnection';

/** The ACP notification method sent to cancel an in-flight session turn. */
export const ACP_SESSION_CANCEL_METHOD = 'session/cancel';

/**
 * Wires an `AbortSignal` to send `session/cancel` the moment it fires,
 * and tears the connection down once the agent's exit or its own
 * acknowledgement arrives. `session/cancel` is a notification, not a
 * request — ACP does not require (and this orchestrator does not wait
 * for) a reply before considering the run cancelled locally; teardown
 * proceeds unconditionally.
 *
 * Returns a cleanup function that removes the abort listener without
 * closing the connection, for callers that manage the connection
 * lifecycle separately from any one run's cancellation.
 */
export function wireCancellationOnAbort(
  connection: AcpConnection,
  sessionId: string,
  signal: AbortSignal,
  onCancelled?: () => void,
): () => void {
  if (signal.aborted) {
    sendSessionCancel(connection, sessionId);
    onCancelled?.();
    return () => undefined;
  }

  const handleAbort = (): void => {
    sendSessionCancel(connection, sessionId);
    onCancelled?.();
  };

  signal.addEventListener('abort', handleAbort);
  return () => signal.removeEventListener('abort', handleAbort);
}

function sendSessionCancel(connection: AcpConnection, sessionId: string): void {
  connection.notify(ACP_SESSION_CANCEL_METHOD, { sessionId });
}

/**
 * Tears a session down cleanly once cancellation has been sent: closes
 * the connection (releasing any pending correlated requests) and
 * removes it from the given session registry, if provided.
 */
export interface SessionTeardownTarget {
  remove(sessionId: string): boolean;
}

export function cancelAndTeardownSession(
  connection: AcpConnection,
  sessionId: string,
  registry?: SessionTeardownTarget,
): void {
  sendSessionCancel(connection, sessionId);
  registry?.remove(sessionId);
}

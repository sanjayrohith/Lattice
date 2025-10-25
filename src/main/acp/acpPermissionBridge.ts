import { z } from 'zod';
import type { ConsentGate } from '../consent/consentGate';
import type { ConsentPolicy } from '../tools/types';
import type { AcpConnection } from './acpConnection';

/** The ACP method name an agent invokes on the client to request permission for an action. */
export const ACP_REQUEST_PERMISSION_METHOD = 'session/request_permission';

const requestPermissionParamsSchema = z.object({
  sessionId: z.string(),
  toolCall: z.object({
    toolCallId: z.string(),
    title: z.string().optional(),
    kind: z.string().optional(),
  }),
  input: z.unknown().optional(),
});

/**
 * The outcome shape ACP expects back from `session/request_permission`:
 * an `optionId` naming which of the agent-offered options was chosen.
 * The three options this bridge always offers mirror the local consent
 * modal exactly, so an external agent surfaces the identical
 * Accept once / Accept always / Decline choice a local tool call would.
 */
export const ACP_PERMISSION_OPTIONS = {
  ACCEPT_ONCE: 'accept-once',
  ACCEPT_ALWAYS: 'accept-always',
  DECLINE: 'decline',
} as const;

function toDefaultConsent(): ConsentPolicy {
  // An inbound permission request always means the agent itself judged
  // the action to need a decision; there is no "always"/"never" static
  // policy to consult here, so it is routed to the gate as `ask`.
  return 'ask';
}

/**
 * Registers a handler on `connection` that maps every inbound
 * `session/request_permission` call onto {@link ConsentGate.requestConsent},
 * so an external ACP agent's permission prompts surface through the
 * exact same Accept once / Accept always / Decline modal a local tool
 * call would, and resolves back to the agent with the option chosen.
 * Returns the unsubscribe function.
 */
export function registerAcpPermissionBridge(
  connection: AcpConnection,
  consentGate: ConsentGate,
): () => void {
  return connection.onPeerMessage((method, params, respond) => {
    if (method !== ACP_REQUEST_PERMISSION_METHOD || !respond) return;

    void handlePermissionRequest(params, consentGate, respond);
  });
}

async function handlePermissionRequest(
  params: unknown,
  consentGate: ConsentGate,
  respond: (result: unknown) => void,
): Promise<void> {
  const parsed = requestPermissionParamsSchema.safeParse(params);
  if (!parsed.success) {
    respond({ outcome: { outcome: 'cancelled' } });
    return;
  }

  const decision = await consentGate.requestConsent(
    parsed.data.sessionId,
    {
      toolCallId: parsed.data.toolCall.toolCallId,
      toolName: parsed.data.toolCall.title ?? parsed.data.toolCall.kind ?? 'unknown',
      input: parsed.data.input,
    },
    toDefaultConsent(),
  );

  respond({
    outcome: {
      outcome: 'selected',
      optionId: decision === 'accepted' ? ACP_PERMISSION_OPTIONS.ACCEPT_ONCE : ACP_PERMISSION_OPTIONS.DECLINE,
    },
  });
}

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import type { PendingDecisionRegistry } from '../loop/abortCleanup';
import type { ConsentGateRequest, ConsentDecision } from './consentGate';
import { DEFAULT_CONSENT_TIMEOUT_MS, scheduleConsentTimeout } from './consentTimeout';

export interface RegisterConsentHandlersOptions {
  timeoutMs?: number;
}

/**
 * Registers `consent:respond` — the renderer's side of resolving a
 * pending decision by its `toolCallId` — and returns the `notifyPending`
 * function `ConsentGate` calls to broadcast a `consent:request` event to
 * every window and arm that request's decline-on-timeout fallback.
 */
export function registerConsentHandlers(
  pending: PendingDecisionRegistry<ConsentDecision>,
  options: RegisterConsentHandlersOptions = {},
): (sessionId: string, request: ConsentGateRequest) => void {
  registerHandler(IPC_CHANNELS.CONSENT_RESPOND, (payload) => ({
    resolved: pending.resolve(payload.toolCallId, payload.decision),
  }));

  return (sessionId, request) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.CONSENT_REQUEST, { runId: sessionId, ...request });
      }
    });

    scheduleConsentTimeout(pending, request.toolCallId, options.timeoutMs ?? DEFAULT_CONSENT_TIMEOUT_MS);
  };
}

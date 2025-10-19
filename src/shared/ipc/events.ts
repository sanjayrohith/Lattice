import { z } from 'zod';
import { IPC_CHANNELS, type IpcChannel } from './channels';

/**
 * Payload schemas for channels the main process *pushes* to renderers
 * (broadcasts and notifications) rather than channels a renderer invokes.
 * Kept separate from `ipcContracts` because these have no request/response
 * pairing — only an inbound event shape.
 */
/**
 * One run stream event. Broadcast on a throttled, coalesced schedule
 * (see `src/main/loop/runEventBroadcaster.ts`) rather than one IPC
 * message per token, so heavy streaming never floods the renderer.
 */
export const runStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text-delta'), runId: z.string(), delta: z.string() }),
  z.object({
    type: z.literal('partial-tool-args'),
    runId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    partialArgs: z.unknown(),
  }),
  z.object({
    type: z.literal('tool-start'),
    runId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
  }),
  z.object({
    type: z.literal('tool-result'),
    runId: z.string(),
    toolCallId: z.string(),
    result: z.unknown(),
  }),
  z.object({ type: z.literal('state-change'), runId: z.string(), state: z.string() }),
]);
export type RunStreamEvent = z.infer<typeof runStreamEventSchema>;

/**
 * A tool call awaiting a consent decision, broadcast to every window so
 * whichever one is focused can present the consent modal. Carries a
 * correlation id (`toolCallId`) and the fully resolved arguments the
 * tool would run with — not just its name — so the user can see exactly
 * what they are approving.
 */
export const consentRequestEventSchema = z.object({
  runId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
});
export type ConsentRequestEvent = z.infer<typeof consentRequestEventSchema>;

export const ipcEventContracts = {
  [IPC_CHANNELS.STATE_REVISION]: z.object({
    revision: z.number().int().nonnegative(),
    state: z.unknown(),
  }),
  [IPC_CHANNELS.RUN_STREAM]: z.array(runStreamEventSchema),
  [IPC_CHANNELS.CONSENT_REQUEST]: consentRequestEventSchema,
} satisfies Partial<Record<IpcChannel, z.ZodTypeAny>>;

export type IpcEventContracts = typeof ipcEventContracts;
export type SubscribableChannel = keyof IpcEventContracts;
export type IpcEventPayload<C extends SubscribableChannel> = z.infer<IpcEventContracts[C]>;

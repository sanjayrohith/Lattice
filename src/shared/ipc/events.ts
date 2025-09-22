import { z } from 'zod';
import { IPC_CHANNELS, type IpcChannel } from './channels';

/**
 * Payload schemas for channels the main process *pushes* to renderers
 * (broadcasts and notifications) rather than channels a renderer invokes.
 * Kept separate from `ipcContracts` because these have no request/response
 * pairing — only an inbound event shape.
 */
export const ipcEventContracts = {
  [IPC_CHANNELS.STATE_REVISION]: z.object({
    revision: z.number().int().nonnegative(),
    state: z.unknown(),
  }),
} satisfies Partial<Record<IpcChannel, z.ZodTypeAny>>;

export type IpcEventContracts = typeof ipcEventContracts;
export type SubscribableChannel = keyof IpcEventContracts;
export type IpcEventPayload<C extends SubscribableChannel> = z.infer<IpcEventContracts[C]>;

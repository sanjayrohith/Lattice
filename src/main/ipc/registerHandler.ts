import { ipcMain } from 'electron';
import {
  ipcContracts,
  type InvokableChannel,
  type IpcRequest,
  type IpcResponse,
  type IpcResult,
} from '@shared/ipc/contracts';

export interface HandlerContext {
  /** The `webContents.id` of the renderer that invoked this handler. */
  senderId: number;
}

/** Throw this from a handler to control the failure envelope's `code`, instead of the generic `HANDLER_ERROR`. */
export class HandlerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HandlerError';
  }
}

/**
 * Registers a validating `ipcMain.handle` for `channel`:
 *
 * 1. The incoming payload is parsed against the channel's Zod request
 *    schema before `handler` ever runs.
 * 2. A parse failure short-circuits into a structured `INVALID_PAYLOAD`
 *    failure envelope — `handler` is never invoked.
 * 3. Any error thrown by `handler` is caught and normalized into a
 *    structured failure envelope rather than crossing the process
 *    boundary as a raw exception with a leaked stack trace.
 */
export function registerHandler<C extends InvokableChannel>(
  channel: C,
  handler: (
    payload: IpcRequest<C>,
    context: HandlerContext,
  ) => Promise<IpcResponse<C>> | IpcResponse<C>,
): void {
  const contract = ipcContracts[channel];

  ipcMain.handle(channel, async (event, rawPayload): Promise<IpcResult<unknown>> => {
    const parsedRequest = contract.request.safeParse(rawPayload);

    if (!parsedRequest.success) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: parsedRequest.error.message,
        },
      };
    }

    try {
      const data = await handler(parsedRequest.data as IpcRequest<C>, {
        senderId: event.sender.id,
      });
      const parsedResponse = contract.response.safeParse(data);

      if (!parsedResponse.success) {
        return {
          ok: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: parsedResponse.error.message,
          },
        };
      }

      return { ok: true, data: parsedResponse.data };
    } catch (error) {
      if (error instanceof HandlerError) {
        return { ok: false, error: { code: error.code, message: error.message } };
      }
      return {
        ok: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
}

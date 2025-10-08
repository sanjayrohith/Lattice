import { z } from 'zod';
import { IPC_CHANNELS, type IpcChannel } from './channels';

/**
 * The discriminated envelope every IPC response is wrapped in. Callers
 * narrow on `ok` rather than relying on a thrown exception crossing the
 * process boundary, so failures are always structured and typed.
 */
export const ipcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type IpcError = z.infer<typeof ipcErrorSchema>;

export function ipcResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: ipcErrorSchema }),
  ]);
}
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export function okResult<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function errResult(code: string, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Per-channel request / response schemas
// ---------------------------------------------------------------------------

const appInfoRequestSchema = z.void();
const appInfoResponseSchema = z.object({
  appVersion: z.string(),
  electronVersion: z.string(),
  chromeVersion: z.string(),
  platform: z.string(),
  userDataPath: z.string(),
});

const logWriteRequestSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']),
  message: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
const logWriteResponseSchema = z.void();

const windowPopoutRequestSchema = z.object({
  panelId: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
const windowPopoutResponseSchema = z.object({
  windowId: z.number(),
});

const windowControlRequestSchema = z.void();
const windowControlResponseSchema = z.void();

const stateSnapshotRequestSchema = z.void();
const stateSnapshotResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  state: z.unknown(),
});

const statePatchSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])).min(1),
  value: z.unknown(),
});
const stateDispatchRequestSchema = z.object({
  patches: z.array(statePatchSchema).min(1),
});
const stateDispatchResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
});

const layoutSaveRequestSchema = z.object({
  workspaceId: z.string(),
  layout: z.unknown(),
});
const layoutSaveResponseSchema = z.void();

const layoutLoadRequestSchema = z.object({
  workspaceId: z.string(),
});
const layoutLoadResponseSchema = z.object({
  layout: z.unknown().nullable(),
});

const securityEncryptionStatusRequestSchema = z.void();
const securityEncryptionStatusResponseSchema = z.object({
  available: z.boolean(),
});

const vaultSetRequestSchema = z.object({
  id: z.string().min(1),
  value: z.string().min(1),
});
const vaultSetResponseSchema = z.void();

const vaultHasRequestSchema = z.object({ id: z.string().min(1) });
const vaultHasResponseSchema = z.object({ configured: z.boolean() });

const vaultDeleteRequestSchema = z.object({ id: z.string().min(1) });
const vaultDeleteResponseSchema = z.object({ deleted: z.boolean() });

const aiProviderHealthCheckRequestSchema = z.object({
  providerId: z.enum(['openai', 'anthropic', 'google']),
  modelId: z.string().min(1),
});
const aiProviderHealthCheckResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

const vaultListRequestSchema = z.void();
const vaultCredentialMetadataSchema = z.object({
  id: z.string(),
  configured: z.literal(true),
  updatedAt: z.string(),
});
const vaultListResponseSchema = z.object({
  credentials: z.array(vaultCredentialMetadataSchema),
});

/**
 * Maps every channel in the registry to its request and response schema.
 * `registerHandler` and the preload `invoke` wrapper both key off this map
 * so a handler can never be registered for, or called against, a channel
 * whose contract is undefined here.
 */
export const ipcContracts = {
  [IPC_CHANNELS.APP_INFO]: {
    request: appInfoRequestSchema,
    response: appInfoResponseSchema,
  },
  [IPC_CHANNELS.LOG_WRITE]: {
    request: logWriteRequestSchema,
    response: logWriteResponseSchema,
  },
  [IPC_CHANNELS.WINDOW_POPOUT]: {
    request: windowPopoutRequestSchema,
    response: windowPopoutResponseSchema,
  },
  [IPC_CHANNELS.WINDOW_MINIMIZE]: {
    request: windowControlRequestSchema,
    response: windowControlResponseSchema,
  },
  [IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE]: {
    request: windowControlRequestSchema,
    response: windowControlResponseSchema,
  },
  [IPC_CHANNELS.WINDOW_CLOSE]: {
    request: windowControlRequestSchema,
    response: windowControlResponseSchema,
  },
  [IPC_CHANNELS.STATE_SNAPSHOT]: {
    request: stateSnapshotRequestSchema,
    response: stateSnapshotResponseSchema,
  },
  [IPC_CHANNELS.STATE_DISPATCH]: {
    request: stateDispatchRequestSchema,
    response: stateDispatchResponseSchema,
  },
  [IPC_CHANNELS.LAYOUT_SAVE]: {
    request: layoutSaveRequestSchema,
    response: layoutSaveResponseSchema,
  },
  [IPC_CHANNELS.LAYOUT_LOAD]: {
    request: layoutLoadRequestSchema,
    response: layoutLoadResponseSchema,
  },
  [IPC_CHANNELS.SECURITY_ENCRYPTION_STATUS]: {
    request: securityEncryptionStatusRequestSchema,
    response: securityEncryptionStatusResponseSchema,
  },
  [IPC_CHANNELS.VAULT_SET]: {
    request: vaultSetRequestSchema,
    response: vaultSetResponseSchema,
  },
  [IPC_CHANNELS.VAULT_HAS]: {
    request: vaultHasRequestSchema,
    response: vaultHasResponseSchema,
  },
  [IPC_CHANNELS.VAULT_DELETE]: {
    request: vaultDeleteRequestSchema,
    response: vaultDeleteResponseSchema,
  },
  [IPC_CHANNELS.VAULT_LIST]: {
    request: vaultListRequestSchema,
    response: vaultListResponseSchema,
  },
  [IPC_CHANNELS.AI_PROVIDER_HEALTH_CHECK]: {
    request: aiProviderHealthCheckRequestSchema,
    response: aiProviderHealthCheckResponseSchema,
  },
} satisfies Partial<Record<IpcChannel, { request: z.ZodTypeAny; response: z.ZodTypeAny }>>;

export type IpcContracts = typeof ipcContracts;
export type InvokableChannel = keyof IpcContracts;

export type IpcRequest<C extends InvokableChannel> = z.infer<IpcContracts[C]['request']>;
export type IpcResponse<C extends InvokableChannel> = z.infer<IpcContracts[C]['response']>;

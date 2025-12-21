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

const runCancelRequestSchema = z.object({ runId: z.string().min(1) });
const runCancelResponseSchema = z.object({ cancelled: z.boolean() });

const consentRespondRequestSchema = z.object({
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  decision: z.enum(['accept-once', 'accept-always', 'decline']),
});
const consentRespondResponseSchema = z.object({ resolved: z.boolean() });

const acpConnectorConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    transport: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    cwd: z.string().optional(),
    enabled: z.boolean().default(true),
  }),
  z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    transport: z.literal('http'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
    enabled: z.boolean().default(true),
  }),
]);

const acpConnectorHealthSchema = z.object({
  connectorId: z.string(),
  state: z.enum(['starting', 'running', 'restarting', 'unavailable', 'stopped']),
  consecutiveFailures: z.number().int().nonnegative(),
  lastError: z.string().optional(),
});

const acpConnectorListRequestSchema = z.void();
const acpConnectorListResponseSchema = z.object({
  connectors: z.array(z.object({ config: acpConnectorConfigSchema, health: acpConnectorHealthSchema })),
});

const acpConnectorUpsertRequestSchema = z.object({ config: acpConnectorConfigSchema });
const acpConnectorUpsertResponseSchema = z.object({ config: acpConnectorConfigSchema });

const acpConnectorDeleteRequestSchema = z.object({ id: z.string().min(1) });
const acpConnectorDeleteResponseSchema = z.object({ deleted: z.boolean() });

const acpConnectorSetEnabledRequestSchema = z.object({ id: z.string().min(1), enabled: z.boolean() });
const acpConnectorSetEnabledResponseSchema = z.object({ config: acpConnectorConfigSchema.nullable() });

const acpConnectorTestRequestSchema = z.object({ id: z.string().min(1) });
const acpConnectorTestResponseSchema = z.object({ ok: z.boolean(), error: z.string().optional() });

const agentBackendRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('sdk'),
    modelConfig: z.object({
      providerId: z.enum(['openai', 'anthropic', 'google']),
      modelId: z.string().min(1),
      temperature: z.number().min(0).max(2),
      maxTokens: z.number().int().positive(),
      systemPrompt: z.string(),
    }),
  }),
  z.object({ kind: z.literal('acp'), connectorId: z.string().min(1) }),
]);

const agentRoleEnumSchema = z.enum([
  'worker',
  'orchestrator',
  'project-manager',
  'architect',
  'developer',
  'devops',
  'reviewer',
  'critic',
]);

const agentProfileResponseSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  backend: agentBackendRefSchema,
  systemPrompt: z.string(),
  toolAllowlist: z.array(z.string()).optional(),
  stepBudget: z.number().int().positive(),
  role: agentRoleEnumSchema,
});

const agentProfileInputSchema = z.object({
  displayName: z.string().min(1),
  backend: agentBackendRefSchema,
  systemPrompt: z.string().optional(),
  toolAllowlist: z.array(z.string()).optional(),
  stepBudget: z.number().int().positive().optional(),
  role: agentRoleEnumSchema.optional(),
});

const agentListRequestSchema = z.void();
const agentListResponseSchema = z.object({ agents: z.array(agentProfileResponseSchema) });

const agentCreateRequestSchema = z.object({ profile: agentProfileInputSchema });
const agentCreateResponseSchema = z.object({ agent: agentProfileResponseSchema });

const agentUpdateRequestSchema = z.object({
  id: z.string().min(1),
  patch: agentProfileInputSchema.partial(),
});
const agentUpdateResponseSchema = z.object({ agent: agentProfileResponseSchema.nullable() });

const agentDuplicateRequestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).optional(),
});
const agentDuplicateResponseSchema = z.object({ agent: agentProfileResponseSchema.nullable() });

const agentDeleteRequestSchema = z.object({ id: z.string().min(1) });
const agentDeleteResponseSchema = z.object({ deleted: z.boolean() });

const delegationNodeSchema = z.object({
  runId: z.string(),
  parentRunId: z.string().nullable(),
  agentId: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  totalTokens: z.number().int().nonnegative(),
});

const delegationTreeRequestSchema = z.object({ rootRunId: z.string().min(1) });
const delegationTreeResponseSchema = z.object({ nodes: z.array(delegationNodeSchema) });

const lockRecordSchema = z.object({
  path: z.string(),
  runId: z.string(),
  agentId: z.string(),
  acquiredAt: z.number(),
});

const locksListRequestSchema = z.void();
const locksListResponseSchema = z.object({ locks: z.array(lockRecordSchema) });

const locksForceReleaseRequestSchema = z.object({ path: z.string().min(1) });
const locksForceReleaseResponseSchema = z.object({ released: z.boolean() });

const driftSignalSchema = z.object({
  path: z.string(),
  diverged: z.boolean(),
  score: z.number(),
  baselineContent: z.string(),
  currentContent: z.string(),
});

const driftSignalsRequestSchema = z.object({ runId: z.string().min(1) });
const driftSignalsResponseSchema = z.object({ signals: z.array(driftSignalSchema) });

const driftAcceptRequestSchema = z.object({ runId: z.string().min(1), path: z.string().min(1) });
const driftAcceptResponseSchema = z.object({ accepted: z.boolean() });

const driftRevertRequestSchema = z.object({ runId: z.string().min(1), path: z.string().min(1) });
const driftRevertResponseSchema = z.object({ reverted: z.boolean() });

const memorySearchChunkSchema = z.object({
  chunkId: z.string(),
  filePath: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  content: z.string(),
  score: z.number().nullable(),
});
const memorySearchRequestSchema = z.object({ query: z.string().min(1), limit: z.number().int().positive().max(50).optional() });
const memorySearchResponseSchema = z.object({ results: z.array(memorySearchChunkSchema) });

const memoryReindexRequestSchema = z.void();
const memoryReindexResponseSchema = z.object({ reindexed: z.boolean(), changedFiles: z.number() });

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
  [IPC_CHANNELS.RUN_CANCEL]: {
    request: runCancelRequestSchema,
    response: runCancelResponseSchema,
  },
  [IPC_CHANNELS.CONSENT_RESPOND]: {
    request: consentRespondRequestSchema,
    response: consentRespondResponseSchema,
  },
  [IPC_CHANNELS.ACP_CONNECTOR_LIST]: {
    request: acpConnectorListRequestSchema,
    response: acpConnectorListResponseSchema,
  },
  [IPC_CHANNELS.ACP_CONNECTOR_UPSERT]: {
    request: acpConnectorUpsertRequestSchema,
    response: acpConnectorUpsertResponseSchema,
  },
  [IPC_CHANNELS.ACP_CONNECTOR_DELETE]: {
    request: acpConnectorDeleteRequestSchema,
    response: acpConnectorDeleteResponseSchema,
  },
  [IPC_CHANNELS.ACP_CONNECTOR_SET_ENABLED]: {
    request: acpConnectorSetEnabledRequestSchema,
    response: acpConnectorSetEnabledResponseSchema,
  },
  [IPC_CHANNELS.ACP_CONNECTOR_TEST]: {
    request: acpConnectorTestRequestSchema,
    response: acpConnectorTestResponseSchema,
  },
  [IPC_CHANNELS.AGENT_LIST]: {
    request: agentListRequestSchema,
    response: agentListResponseSchema,
  },
  [IPC_CHANNELS.AGENT_CREATE]: {
    request: agentCreateRequestSchema,
    response: agentCreateResponseSchema,
  },
  [IPC_CHANNELS.AGENT_UPDATE]: {
    request: agentUpdateRequestSchema,
    response: agentUpdateResponseSchema,
  },
  [IPC_CHANNELS.AGENT_DUPLICATE]: {
    request: agentDuplicateRequestSchema,
    response: agentDuplicateResponseSchema,
  },
  [IPC_CHANNELS.AGENT_DELETE]: {
    request: agentDeleteRequestSchema,
    response: agentDeleteResponseSchema,
  },
  [IPC_CHANNELS.DELEGATION_TREE]: {
    request: delegationTreeRequestSchema,
    response: delegationTreeResponseSchema,
  },
  [IPC_CHANNELS.LOCKS_LIST]: {
    request: locksListRequestSchema,
    response: locksListResponseSchema,
  },
  [IPC_CHANNELS.LOCKS_FORCE_RELEASE]: {
    request: locksForceReleaseRequestSchema,
    response: locksForceReleaseResponseSchema,
  },
  [IPC_CHANNELS.DRIFT_SIGNALS]: {
    request: driftSignalsRequestSchema,
    response: driftSignalsResponseSchema,
  },
  [IPC_CHANNELS.DRIFT_ACCEPT]: {
    request: driftAcceptRequestSchema,
    response: driftAcceptResponseSchema,
  },
  [IPC_CHANNELS.DRIFT_REVERT]: {
    request: driftRevertRequestSchema,
    response: driftRevertResponseSchema,
  },
  [IPC_CHANNELS.MEMORY_SEARCH]: {
    request: memorySearchRequestSchema,
    response: memorySearchResponseSchema,
  },
  [IPC_CHANNELS.MEMORY_REINDEX]: {
    request: memoryReindexRequestSchema,
    response: memoryReindexResponseSchema,
  },
} satisfies Partial<Record<IpcChannel, { request: z.ZodTypeAny; response: z.ZodTypeAny }>>;

export type IpcContracts = typeof ipcContracts;
export type InvokableChannel = keyof IpcContracts;

export type IpcRequest<C extends InvokableChannel> = z.infer<IpcContracts[C]['request']>;
export type IpcResponse<C extends InvokableChannel> = z.infer<IpcContracts[C]['response']>;

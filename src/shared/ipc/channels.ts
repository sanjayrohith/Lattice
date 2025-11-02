/**
 * The canonical registry of every IPC channel name used anywhere in the
 * application. No call site — main, preload, or renderer — should ever
 * reference a channel by string literal; import from here instead so a
 * typo becomes a compile error rather than a silently dead channel.
 */
export const IPC_CHANNELS = {
  /** Renderer -> main: request app/version/platform diagnostics. */
  APP_INFO: 'app:info',

  /** Renderer -> main: emit a structured log entry into the shared log stream. */
  LOG_WRITE: 'log:write',

  /** Renderer -> main: promote a docked panel into a native popout window. */
  WINDOW_POPOUT: 'window:popout',

  /** Renderer -> main: minimize the calling window. */
  WINDOW_MINIMIZE: 'window:minimize',

  /** Renderer -> main: toggle the calling window between maximized and restored. */
  WINDOW_MAXIMIZE_TOGGLE: 'window:maximize-toggle',

  /** Renderer -> main: close the calling window. */
  WINDOW_CLOSE: 'window:close',

  /** Renderer -> main: request the full current application state snapshot. */
  STATE_SNAPSHOT: 'state:snapshot',

  /** Renderer -> main: dispatch a proposed state patch for validation and application. */
  STATE_DISPATCH: 'state:dispatch',

  /** Main -> renderer (broadcast): a new state revision has been applied. */
  STATE_REVISION: 'state:revision',

  /** Renderer -> main: persist the serialized Dockview layout for a workspace. */
  LAYOUT_SAVE: 'layout:save',

  /** Renderer -> main: load the persisted Dockview layout for a workspace. */
  LAYOUT_LOAD: 'layout:load',

  /** Renderer -> main: query whether OS-backed credential encryption is available. */
  SECURITY_ENCRYPTION_STATUS: 'security:encryption-status',

  /** Renderer -> main: encrypt and store a provider credential. */
  VAULT_SET: 'vault:set',

  /** Renderer -> main: check whether a credential is configured, without revealing it. */
  VAULT_HAS: 'vault:has',

  /** Renderer -> main: delete a stored credential. */
  VAULT_DELETE: 'vault:delete',

  /** Renderer -> main: list metadata for every configured credential. */
  VAULT_LIST: 'vault:list',

  /** Renderer -> main: verify a configured provider credential actually authenticates. */
  AI_PROVIDER_HEALTH_CHECK: 'ai:provider-health-check',

  /** Renderer -> main: cancel an in-flight agent run. */
  RUN_CANCEL: 'run:cancel',

  /** Main -> renderer (broadcast): a throttled, coalesced batch of run stream events. */
  RUN_STREAM: 'run:stream',

  /** Main -> renderer (broadcast): a tool call is awaiting a consent decision. */
  CONSENT_REQUEST: 'consent:request',

  /** Renderer -> main: resolve a pending consent request by its correlation id. */
  CONSENT_RESPOND: 'consent:respond',

  /** Renderer -> main: list every configured ACP connector and its live health. */
  ACP_CONNECTOR_LIST: 'acp:connector-list',

  /** Renderer -> main: create or update an ACP connector's configuration. */
  ACP_CONNECTOR_UPSERT: 'acp:connector-upsert',

  /** Renderer -> main: delete an ACP connector's configuration. */
  ACP_CONNECTOR_DELETE: 'acp:connector-delete',

  /** Renderer -> main: enable or disable a configured ACP connector. */
  ACP_CONNECTOR_SET_ENABLED: 'acp:connector-set-enabled',

  /** Renderer -> main: attempt to start a connector and report whether it came up healthy. */
  ACP_CONNECTOR_TEST: 'acp:connector-test',

  /** Renderer -> main: list every persisted agent profile. */
  AGENT_LIST: 'agent:list',

  /** Renderer -> main: create a new agent profile. */
  AGENT_CREATE: 'agent:create',

  /** Renderer -> main: update fields on an existing agent profile. */
  AGENT_UPDATE: 'agent:update',

  /** Renderer -> main: duplicate an existing agent profile under a new id. */
  AGENT_DUPLICATE: 'agent:duplicate',

  /** Renderer -> main: delete an agent profile. */
  AGENT_DELETE: 'agent:delete',

  /** Renderer -> main: fetch the live delegation hierarchy rooted at a given run. */
  DELEGATION_TREE: 'orchestrator:delegation-tree',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_CHANNEL_SET: ReadonlySet<string> = new Set(Object.values(IPC_CHANNELS));

export function isKnownChannel(channel: string): channel is IpcChannel {
  return IPC_CHANNEL_SET.has(channel);
}

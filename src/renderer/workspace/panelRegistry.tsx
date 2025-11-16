import { lazy, Suspense, type ComponentType, type FunctionComponent } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';

/**
 * Canonical panel ids. Every panel a Dockview layout can reference by
 * `component` must have a matching entry in `panelRegistry` below.
 */
export const PANEL_IDS = {
  AGENT_ROSTER: 'agent-roster',
  CONVERSATION: 'conversation',
  EDITOR: 'editor',
  TERMINAL: 'terminal',
  INSPECTOR: 'inspector',
  PROVIDER_CREDENTIALS: 'provider-credentials',
  ACP_CONNECTOR_SETTINGS: 'acp-connector-settings',
  DELEGATION_TREE: 'delegation-tree',
  ORCHESTRATION_MODE_SELECTOR: 'orchestration-mode-selector',
  LOCKS_INSPECTOR: 'locks-inspector',
  DRIFT_ALERTS: 'drift-alerts',
} as const;

export type PanelId = (typeof PANEL_IDS)[keyof typeof PANEL_IDS];

type LazyPanelImport = () => Promise<{ default: ComponentType<IDockviewPanelProps> }>;

function withSuspense(load: LazyPanelImport): FunctionComponent<IDockviewPanelProps> {
  const LazyComponent = lazy(load);
  return function SuspendedPanel(props: IDockviewPanelProps) {
    return (
      <Suspense fallback={<div className="panel panel--loading">Loading…</div>}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * Maps every panel id to its lazily loaded React component. Passed to
 * Dockview as its `components` resolver so a layout preset can add a panel
 * purely by id — the concrete component module is only fetched the first
 * time that panel is actually mounted.
 */
export const panelRegistry: Record<PanelId, FunctionComponent<IDockviewPanelProps>> = {
  [PANEL_IDS.AGENT_ROSTER]: withSuspense(() => import('../panels/AgentRosterPanel')),
  [PANEL_IDS.CONVERSATION]: withSuspense(() => import('../panels/ConversationPanel')),
  [PANEL_IDS.EDITOR]: withSuspense(() => import('../panels/EditorPanel')),
  [PANEL_IDS.TERMINAL]: withSuspense(() => import('../panels/TerminalPanel')),
  [PANEL_IDS.INSPECTOR]: withSuspense(() => import('../panels/InspectorPanel')),
  [PANEL_IDS.PROVIDER_CREDENTIALS]: withSuspense(() => import('../panels/ProviderCredentialsPanel')),
  [PANEL_IDS.ACP_CONNECTOR_SETTINGS]: withSuspense(() => import('../panels/AcpConnectorSettingsPanel')),
  [PANEL_IDS.DELEGATION_TREE]: withSuspense(() => import('../panels/DelegationTreePanel')),
  [PANEL_IDS.ORCHESTRATION_MODE_SELECTOR]: withSuspense(() => import('../panels/OrchestrationModeSelectorPanel')),
  [PANEL_IDS.LOCKS_INSPECTOR]: withSuspense(() => import('../panels/LocksInspectorPanel')),
  [PANEL_IDS.DRIFT_ALERTS]: withSuspense(() => import('../panels/DriftAlertsPanel')),
};

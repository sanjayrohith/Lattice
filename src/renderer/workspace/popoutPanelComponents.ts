import { lazy, type ComponentType } from 'react';
import { PANEL_IDS, type PanelId } from './panelRegistry';

/**
 * Maps each panel id to its bare component (no Dockview `IDockviewPanelProps`
 * wrapper) for standalone rendering inside a native popout `BrowserWindow`,
 * which mounts a single panel outside of any Dockview surface.
 */
export const popoutPanelComponents: Record<PanelId, ComponentType> = {
  [PANEL_IDS.AGENT_ROSTER]: lazy(() => import('../panels/AgentRosterPanel')),
  [PANEL_IDS.CONVERSATION]: lazy(() => import('../panels/ConversationPanel')),
  [PANEL_IDS.EDITOR]: lazy(() => import('../panels/EditorPanel')),
  [PANEL_IDS.TERMINAL]: lazy(() => import('../panels/TerminalPanel')),
  [PANEL_IDS.INSPECTOR]: lazy(() => import('../panels/InspectorPanel')),
  [PANEL_IDS.PROVIDER_CREDENTIALS]: lazy(() => import('../panels/ProviderCredentialsPanel')),
  [PANEL_IDS.ACP_CONNECTOR_SETTINGS]: lazy(() => import('../panels/AcpConnectorSettingsPanel')),
  [PANEL_IDS.DELEGATION_TREE]: lazy(() => import('../panels/DelegationTreePanel')),
  [PANEL_IDS.ORCHESTRATION_MODE_SELECTOR]: lazy(() => import('../panels/OrchestrationModeSelectorPanel')),
  [PANEL_IDS.LOCKS_INSPECTOR]: lazy(() => import('../panels/LocksInspectorPanel')),
  [PANEL_IDS.DRIFT_ALERTS]: lazy(() => import('../panels/DriftAlertsPanel')),
};

export function isPanelId(value: string): value is PanelId {
  return (Object.values(PANEL_IDS) as string[]).includes(value);
}

import type { DockviewApi } from 'dockview-react';
import { PANEL_IDS } from './panelRegistry';

/**
 * Builds the default workspace: Agent Roster docked to the left, the
 * Conversation and Editor panels tabbed together in the center, Terminal
 * docked below them, and Inspector docked to the right — matching the
 * primary agent-orchestration workflow this shell is designed around.
 */
export function applyDefaultLayout(api: DockviewApi): void {
  const conversation = api.addPanel({
    id: PANEL_IDS.CONVERSATION,
    component: PANEL_IDS.CONVERSATION,
    title: 'Conversation',
  });

  api.addPanel({
    id: PANEL_IDS.EDITOR,
    component: PANEL_IDS.EDITOR,
    title: 'Editor',
    position: { referencePanel: conversation.id, direction: 'within' },
  });

  api.addPanel({
    id: PANEL_IDS.AGENT_ROSTER,
    component: PANEL_IDS.AGENT_ROSTER,
    title: 'Agent Roster',
    position: { referencePanel: conversation.id, direction: 'left' },
  });

  api.addPanel({
    id: PANEL_IDS.TERMINAL,
    component: PANEL_IDS.TERMINAL,
    title: 'Terminal',
    position: { referencePanel: conversation.id, direction: 'below' },
  });

  api.addPanel({
    id: PANEL_IDS.INSPECTOR,
    component: PANEL_IDS.INSPECTOR,
    title: 'Inspector',
    position: { referencePanel: conversation.id, direction: 'right' },
  });

  conversation.api.setActive();
}

/** Clears every panel and reapplies the default workspace preset from scratch. */
export function resetLayout(api: DockviewApi): void {
  api.clear();
  applyDefaultLayout(api);
}

import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { PANEL_IDS, panelRegistry } from './panelRegistry';

afterEach(() => {
  cleanup();
});

describe('panelRegistry', () => {
  it('has a registered component for every canonical panel id', () => {
    for (const panelId of Object.values(PANEL_IDS)) {
      expect(panelRegistry[panelId]).toBeDefined();
    }
  });

  it('lazily renders the agent roster panel content', async () => {
    const AgentRoster = panelRegistry[PANEL_IDS.AGENT_ROSTER];
    render(
      <Suspense fallback={<div>loading</div>}>
        <AgentRoster
          api={{} as never}
          containerApi={{} as never}
          params={{}}
        />
      </Suspense>,
    );

    await waitFor(() => expect(screen.getByText('Agent Roster')).toBeTruthy());
  });

  it('lazily renders the conversation panel content', async () => {
    const Conversation = panelRegistry[PANEL_IDS.CONVERSATION];
    render(
      <Suspense fallback={<div>loading</div>}>
        <Conversation
          api={{} as never}
          containerApi={{} as never}
          params={{}}
        />
      </Suspense>,
    );

    await waitFor(() => expect(screen.getByText('Conversation')).toBeTruthy(), { timeout: 10_000 });
  });
});

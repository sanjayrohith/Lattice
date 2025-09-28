import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DockviewShell } from './DockviewShell';

beforeEach(() => {
  (window as unknown as { electronAPI: { invoke: ReturnType<typeof vi.fn> } }).electronAPI = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: { layout: null } }),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DockviewShell', () => {
  it('mounts the dockview surface without throwing', () => {
    expect(() => render(<DockviewShell />)).not.toThrow();
  });

  it('invokes onReady once the dockview api is available', () => {
    const onReady = vi.fn();
    render(<DockviewShell onReady={onReady} />);

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0]?.[0]).toHaveProperty('api');
  });

  it('falls back to the default layout preset when nothing has been persisted', async () => {
    render(<DockviewShell />);

    await waitFor(() => {
      for (const title of ['Agent Roster', 'Conversation', 'Editor', 'Terminal', 'Inspector']) {
        expect(screen.getAllByText(title).length).toBeGreaterThan(0);
      }
    });
  });

  it('skips hydration/default layout when skipDefaultLayout is set', () => {
    render(<DockviewShell skipDefaultLayout />);
    expect(screen.queryByText('Conversation')).toBeNull();
  });

  it('resets to the default layout when the Reset Layout button is clicked', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<DockviewShell />);

    await waitFor(() => expect(screen.getAllByText('Conversation').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText('Reset Layout'));

    await waitFor(() => {
      for (const title of ['Agent Roster', 'Conversation', 'Editor', 'Terminal', 'Inspector']) {
        expect(screen.getAllByText(title).length).toBeGreaterThan(0);
      }
    });
  });
});

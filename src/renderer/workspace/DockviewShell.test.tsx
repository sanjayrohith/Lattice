import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DockviewShell } from './DockviewShell';

afterEach(() => {
  cleanup();
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

  it('applies the default layout preset with all five panels docked by default', () => {
    render(<DockviewShell />);

    for (const title of ['Agent Roster', 'Conversation', 'Editor', 'Terminal', 'Inspector']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it('skips the default layout when skipDefaultLayout is set', () => {
    render(<DockviewShell skipDefaultLayout />);
    expect(screen.queryByText('Conversation')).toBeNull();
  });
});

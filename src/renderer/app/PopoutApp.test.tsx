import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { parsePopoutRoute, PopoutApp } from './PopoutApp';

afterEach(() => {
  cleanup();
});

describe('parsePopoutRoute', () => {
  it('parses a bare panel hash', () => {
    expect(parsePopoutRoute('#/popout/conversation')).toEqual({ panelId: 'conversation' });
  });

  it('parses a panel hash with a query string', () => {
    expect(parsePopoutRoute('#/popout/editor?sessionId=abc')).toEqual({ panelId: 'editor' });
  });

  it('decodes a percent-encoded panel id', () => {
    expect(parsePopoutRoute('#/popout/agent%20roster')).toEqual({ panelId: 'agent roster' });
  });

  it('returns undefined for a non-popout hash', () => {
    expect(parsePopoutRoute('')).toBeUndefined();
    expect(parsePopoutRoute('#/something-else')).toBeUndefined();
  });
});

describe('PopoutApp', () => {
  it('renders the panel identified by the route hash', async () => {
    render(<PopoutApp hash="#/popout/conversation" />);
    await waitFor(() => expect(screen.getByText('Conversation')).toBeTruthy(), { timeout: 10_000 });
  });

  it('renders a fallback message for an unknown panel id', () => {
    render(<PopoutApp hash="#/popout/not-a-real-panel" />);
    expect(screen.getByText(/Unknown panel/)).toBeTruthy();
  });
});

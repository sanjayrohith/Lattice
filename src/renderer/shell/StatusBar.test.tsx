import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StatusBar } from './StatusBar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI(appVersion: string): void {
  (window as unknown as { electronAPI: { invoke: () => Promise<unknown> } }).electronAPI = {
    invoke: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        appVersion,
        electronVersion: '33.0.0',
        chromeVersion: '130.0.0',
        platform: 'linux',
        userDataPath: '/tmp',
      },
    }),
  };
}

describe('StatusBar', () => {
  it('shows the connection state and active run count immediately', () => {
    stubElectronAPI('0.1.0');
    render(<StatusBar connectionState="connecting" activeRunCount={3} />);

    expect(screen.getByText('connecting')).toBeTruthy();
    expect(screen.getByText('Active runs: 3')).toBeTruthy();
  });

  it('fetches and displays the app version from app:info', async () => {
    stubElectronAPI('0.1.0');
    render(<StatusBar />);

    await waitFor(() => expect(screen.getByText('v0.1.0')).toBeTruthy());
  });

  it('defaults to a connected state with zero active runs', () => {
    stubElectronAPI('0.1.0');
    render(<StatusBar />);

    expect(screen.getByText('connected')).toBeTruthy();
    expect(screen.getByText('Active runs: 0')).toBeTruthy();
  });
});

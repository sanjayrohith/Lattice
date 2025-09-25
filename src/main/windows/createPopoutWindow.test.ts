import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  class MockBrowserWindow {
    id = Math.floor(Math.random() * 100000);
    loadURL = vi.fn();
    loadFile = vi.fn();
    once = vi.fn();
    webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn() };
    show = vi.fn();
    isDestroyed = () => false;
  }
  return {
    app: { isPackaged: false, getPath: () => '/tmp' },
    BrowserWindow: MockBrowserWindow,
  };
});

describe('buildRouteHash', () => {
  it('builds a bare panel hash with no params', async () => {
    const { buildRouteHash } = await import('./createPopoutWindow');
    expect(buildRouteHash({ panelId: 'conversation' })).toBe('#/popout/conversation');
  });

  it('encodes the panel id and appends a query string for params', async () => {
    const { buildRouteHash } = await import('./createPopoutWindow');
    expect(buildRouteHash({ panelId: 'agent roster', params: { sessionId: 'abc' } })).toBe(
      '#/popout/agent%20roster?sessionId=abc',
    );
  });
});

describe('createPopoutWindow', () => {
  it('loads the dev server url with the route hash in development', async () => {
    const { createPopoutWindow } = await import('./createPopoutWindow');

    const window = createPopoutWindow(
      { panelId: 'editor' },
      { isDev: true, rendererDevServerUrl: 'http://localhost:5173' },
    );

    expect((window as unknown as { loadURL: ReturnType<typeof vi.fn> }).loadURL).toHaveBeenCalledWith(
      'http://localhost:5173#/popout/editor',
    );
  });

  it('loads the packaged renderer file with the route hash in production', async () => {
    const { createPopoutWindow } = await import('./createPopoutWindow');

    const window = createPopoutWindow({ panelId: 'terminal' }, { isDev: false });

    expect(
      (window as unknown as { loadFile: ReturnType<typeof vi.fn> }).loadFile,
    ).toHaveBeenCalledWith(expect.stringContaining('index.html'), { hash: '#/popout/terminal' });
  });
});

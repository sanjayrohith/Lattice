import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanel } from 'dockview-react';
import { promotePanelToNativeWindow } from './promotePanelToNativeWindow';

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockPanel(id: string): IDockviewPanel {
  return { id, api: { close: vi.fn() } } as unknown as IDockviewPanel;
}

describe('promotePanelToNativeWindow', () => {
  it('requests a popout window and closes the docked panel on success', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: { windowId: 7 } });
    (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };

    const panel = createMockPanel('conversation');
    await promotePanelToNativeWindow(panel);

    expect(invoke).toHaveBeenCalledWith('window:popout', { panelId: 'conversation' });
    expect(panel.api.close).toHaveBeenCalledOnce();
  });

  it('leaves the panel docked and logs an error when the popout request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const invoke = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'HANDLER_ERROR', message: 'boom' } });
    (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };

    const panel = createMockPanel('editor');
    await promotePanelToNativeWindow(panel);

    expect(panel.api.close).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DockviewApi } from 'dockview-react';
import { hydrateLayout } from './hydrateLayout';

afterEach(() => {
  vi.restoreAllMocks();
});

function stubInvoke(result: unknown): void {
  (window as unknown as { electronAPI: { invoke: ReturnType<typeof vi.fn> } }).electronAPI = {
    invoke: vi.fn().mockResolvedValue(result),
  };
}

describe('hydrateLayout', () => {
  it('hydrates the api from a persisted layout when one exists', async () => {
    stubInvoke({ ok: true, data: { layout: { panels: {} } } });

    const fromJSON = vi.fn();
    const api = { fromJSON } as unknown as DockviewApi;

    await hydrateLayout(api, 'default');

    expect(fromJSON).toHaveBeenCalledWith({ panels: {} });
  });

  it('applies the default preset when nothing has been persisted', async () => {
    stubInvoke({ ok: true, data: { layout: null } });

    const addPanel = vi.fn().mockReturnValue({ id: 'conversation', api: { setActive: vi.fn() } });
    const api = { fromJSON: vi.fn(), addPanel } as unknown as DockviewApi;

    await hydrateLayout(api, 'default');

    expect(addPanel).toHaveBeenCalled();
  });

  it('applies the default preset when the load request fails', async () => {
    stubInvoke({ ok: false, error: { code: 'HANDLER_ERROR', message: 'disk error' } });

    const addPanel = vi.fn().mockReturnValue({ id: 'conversation', api: { setActive: vi.fn() } });
    const api = { fromJSON: vi.fn(), addPanel } as unknown as DockviewApi;

    await hydrateLayout(api, 'default');

    expect(addPanel).toHaveBeenCalled();
  });

  it('falls back to the default preset when the persisted layout is no longer valid', async () => {
    stubInvoke({ ok: true, data: { layout: { corrupt: true } } });

    const fromJSON = vi.fn(() => {
      throw new Error('unknown panel component');
    });
    const addPanel = vi.fn().mockReturnValue({ id: 'conversation', api: { setActive: vi.fn() } });
    const api = { fromJSON, addPanel } as unknown as DockviewApi;

    await hydrateLayout(api, 'default');

    expect(fromJSON).toHaveBeenCalled();
    expect(addPanel).toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MemoryInspectorPanel from './MemoryInspectorPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  const chunks = [
    { chunkId: 'chunk-1', filePath: 'src/a.ts', startLine: 1, endLine: 5, content: 'export function alpha() {}', score: 0.9 },
  ];

  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'memory:search') return { ok: true, data: { results: chunks } };
    if (channel === 'memory:reindex') return { ok: true, data: { reindexed: true, changedFiles: 3 } };
    throw new Error(`unexpected channel ${channel}`);
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('MemoryInspectorPanel', () => {
  it('shows an empty state before any search has run', () => {
    render(<MemoryInspectorPanel />);
    expect(screen.getByText('No results yet.')).toBeTruthy();
  });

  it('runs a search and previews the first result by default', async () => {
    const invoke = stubElectronAPI();
    render(<MemoryInspectorPanel />);

    fireEvent.change(screen.getByPlaceholderText('Search workspace memory…'), { target: { value: 'alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('src/a.ts:1-5')).toBeTruthy());
    expect(screen.getByTestId('chunk-preview').textContent).toBe('export function alpha() {}');
    expect(invoke).toHaveBeenCalledWith('memory:search', { query: 'alpha' });
  });

  it('triggers a full reindex and reports the changed file count', async () => {
    const invoke = stubElectronAPI();
    render(<MemoryInspectorPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Full Reindex' }));

    await waitFor(() => expect(screen.getByText('Reindexed 3 file(s).')).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('memory:reindex', undefined);
  });

  it('switches the preview when a different result is selected', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'memory:search') {
        return {
          ok: true,
          data: {
            results: [
              { chunkId: 'chunk-1', filePath: 'src/a.ts', startLine: 1, endLine: 2, content: 'first', score: 0.9 },
              { chunkId: 'chunk-2', filePath: 'src/b.ts', startLine: 1, endLine: 2, content: 'second', score: 0.5 },
            ],
          },
        };
      }
      throw new Error(`unexpected channel ${channel}`);
    });
    (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };

    render(<MemoryInspectorPanel />);
    fireEvent.change(screen.getByPlaceholderText('Search workspace memory…'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByTestId('chunk-preview').textContent).toBe('first'));
    fireEvent.click(screen.getByText('src/b.ts:1-2'));
    expect(screen.getByTestId('chunk-preview').textContent).toBe('second');
  });
});

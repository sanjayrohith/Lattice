import { useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

interface MemoryChunk {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number | null;
}

/**
 * Lets a user browse the knowledge graph directly: type a query and run
 * the same hybrid keyword-plus-vector search an agent would via
 * `search_memory`, preview a matched chunk's content, and trigger a full
 * reindex of the workspace when the index is suspected stale.
 */
export default function MemoryInspectorPanel(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly MemoryChunk[]>([]);
  const [selectedChunkId, setSelectedChunkId] = useState<string | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [lastReindexSummary, setLastReindexSummary] = useState<string | undefined>(undefined);

  async function handleSearch(): Promise<void> {
    if (!query.trim() || !window.electronAPI) return;
    setSearching(true);
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.MEMORY_SEARCH, { query });
      if (result.ok) {
        const chunks = result.data.results as MemoryChunk[];
        setResults(chunks);
        setSelectedChunkId(chunks[0]?.chunkId);
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleReindex(): Promise<void> {
    if (!window.electronAPI) return;
    setReindexing(true);
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.MEMORY_REINDEX, undefined);
      if (result.ok) {
        setLastReindexSummary(`Reindexed ${result.data.changedFiles} file(s).`);
      }
    } finally {
      setReindexing(false);
    }
  }

  const selectedChunk = results.find((r) => r.chunkId === selectedChunkId);

  return (
    <div className="panel panel--memory-inspector">
      <h2 className="memory-inspector__heading">Memory Inspector</h2>

      <div className="memory-inspector__toolbar">
        <input
          className="memory-inspector__query"
          placeholder="Search workspace memory…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleSearch();
          }}
        />
        <button type="button" disabled={searching || !query.trim()} onClick={() => void handleSearch()}>
          Search
        </button>
        <button type="button" disabled={reindexing} onClick={() => void handleReindex()}>
          {reindexing ? 'Reindexing…' : 'Full Reindex'}
        </button>
      </div>

      {lastReindexSummary && <p className="memory-inspector__reindex-summary">{lastReindexSummary}</p>}

      <div className="memory-inspector__body">
        {results.length === 0 ? (
          <p className="memory-inspector__empty">No results yet.</p>
        ) : (
          <ul className="memory-inspector__results">
            {results.map((chunk) => (
              <li key={chunk.chunkId}>
                <button
                  type="button"
                  className="memory-inspector__result"
                  aria-pressed={chunk.chunkId === selectedChunkId}
                  onClick={() => setSelectedChunkId(chunk.chunkId)}
                >
                  <span className="memory-inspector__result-path">
                    {chunk.filePath}:{chunk.startLine}-{chunk.endLine}
                  </span>
                  {chunk.score !== null && (
                    <span className="memory-inspector__result-score">{chunk.score.toFixed(3)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedChunk && (
          <pre data-testid="chunk-preview" className="memory-inspector__preview">
            {selectedChunk.content}
          </pre>
        )}
      </div>
    </div>
  );
}

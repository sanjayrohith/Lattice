import type { Migration } from '../database';

/**
 * The memory subsystem's knowledge graph: `kg_nodes` (symbols, files, and
 * durable agent-authored notes), `kg_edges` (typed relationships between
 * nodes), `kg_chunks` (the indexed text spans retrieval matches against),
 * and `kg_embeddings` (one vector per chunk, keyed to the provider that
 * produced it so providers can be swapped without corrupting old vectors).
 */
export const knowledgeGraphMigration: Migration = {
  version: 4,
  name: 'knowledge_graph',
  up: (db) => {
    db.exec(`
      CREATE TABLE kg_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT,
        start_line INTEGER,
        end_line INTEGER,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_kg_nodes_file_path ON kg_nodes (file_path);
      CREATE INDEX idx_kg_nodes_type ON kg_nodes (type);
      CREATE INDEX idx_kg_nodes_updated_at ON kg_nodes (updated_at);

      CREATE TABLE kg_edges (
        id TEXT PRIMARY KEY,
        source_node_id TEXT NOT NULL REFERENCES kg_nodes (id) ON DELETE CASCADE,
        target_node_id TEXT NOT NULL REFERENCES kg_nodes (id) ON DELETE CASCADE,
        relation TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_kg_edges_source ON kg_edges (source_node_id, relation);
      CREATE INDEX idx_kg_edges_target ON kg_edges (target_node_id, relation);

      CREATE TABLE kg_chunks (
        id TEXT PRIMARY KEY,
        node_id TEXT REFERENCES kg_nodes (id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_kg_chunks_file_path ON kg_chunks (file_path);
      CREATE INDEX idx_kg_chunks_updated_at ON kg_chunks (updated_at);

      CREATE TABLE kg_embeddings (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL REFERENCES kg_chunks (id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        dimension INTEGER NOT NULL,
        vector BLOB NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX idx_kg_embeddings_chunk_provider ON kg_embeddings (chunk_id, provider);
    `);
  },
};

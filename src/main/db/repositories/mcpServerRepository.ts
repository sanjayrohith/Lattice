import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  mcpServerConfigSchema,
  type McpHttpServerConfig,
  type McpServerConfig,
  type McpStdioServerConfig,
} from '../../mcp/mcpServerConfig';

interface McpServerRow {
  id: string;
  display_name: string;
  enabled: number;
  config: string;
  created_at: string;
  updated_at: string;
}

function fromRow(row: McpServerRow): McpServerConfig {
  return mcpServerConfigSchema.parse({ ...(JSON.parse(row.config) as object), id: row.id, enabled: row.enabled === 1 });
}

export type McpServerConfigInput = Omit<McpStdioServerConfig, 'id'> | Omit<McpHttpServerConfig, 'id'>;

/**
 * Typed access to the `mcp_servers` table. Validates every row through
 * {@link mcpServerConfigSchema} on read, the same defensive pattern
 * `AgentProfileRepository` uses for its JSON `backend` column — a
 * malformed stored config fails loudly here rather than reaching the
 * connector supervisor.
 */
export class McpServerRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: McpServerConfigInput): McpServerConfig {
    const now = new Date().toISOString();
    const config = mcpServerConfigSchema.parse({ ...input, id: randomUUID() });

    this.db
      .prepare(
        `INSERT INTO mcp_servers (id, display_name, enabled, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(config.id, config.displayName, config.enabled ? 1 : 0, JSON.stringify(config), now, now);

    return config;
  }

  findById(id: string): McpServerConfig | undefined {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as McpServerRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  list(): McpServerConfig[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at ASC').all() as McpServerRow[];
    return rows.map(fromRow);
  }

  update(id: string, patch: Partial<McpServerConfigInput>): McpServerConfig | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updated = mcpServerConfigSchema.parse({ ...existing, ...patch, id });
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE mcp_servers SET display_name = ?, enabled = ?, config = ?, updated_at = ? WHERE id = ?`,
      )
      .run(updated.displayName, updated.enabled ? 1 : 0, JSON.stringify(updated), now, id);

    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

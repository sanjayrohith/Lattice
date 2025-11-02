import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { agentProfileSchema, type AgentProfile } from '../../agents/agentProfile';

interface AgentProfileRow {
  id: string;
  display_name: string;
  backend: string;
  system_prompt: string;
  tool_allowlist: string | null;
  step_budget: number;
  role: string;
  created_at: string;
  updated_at: string;
}

function fromRow(row: AgentProfileRow): AgentProfile {
  return agentProfileSchema.parse({
    id: row.id,
    displayName: row.display_name,
    backend: JSON.parse(row.backend),
    systemPrompt: row.system_prompt,
    toolAllowlist: row.tool_allowlist ? (JSON.parse(row.tool_allowlist) as string[]) : undefined,
    stepBudget: row.step_budget,
    role: row.role,
  });
}

export type AgentProfileInput = Omit<AgentProfile, 'id'>;

/**
 * Typed access to the `agent_profiles` table. This is the only module
 * allowed to hold a SQL string for this table; every other caller —
 * including the CRUD IPC handlers — goes through these functions.
 * `backend` and `toolAllowlist` are validated through
 * {@link agentProfileSchema} on every read, so a row that was somehow
 * written with a stale or malformed shape fails loudly at read time
 * rather than silently propagating.
 */
export class AgentProfileRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: AgentProfileInput): AgentProfile {
    const now = new Date().toISOString();
    const profile = agentProfileSchema.parse({ ...input, id: randomUUID() });

    this.db
      .prepare(
        `INSERT INTO agent_profiles
          (id, display_name, backend, system_prompt, tool_allowlist, step_budget, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        profile.id,
        profile.displayName,
        JSON.stringify(profile.backend),
        profile.systemPrompt,
        profile.toolAllowlist ? JSON.stringify(profile.toolAllowlist) : null,
        profile.stepBudget,
        profile.role,
        now,
        now,
      );

    return profile;
  }

  findById(id: string): AgentProfile | undefined {
    const row = this.db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) as
      | AgentProfileRow
      | undefined;
    return row ? fromRow(row) : undefined;
  }

  list(): AgentProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_profiles ORDER BY created_at ASC')
      .all() as AgentProfileRow[];
    return rows.map(fromRow);
  }

  update(id: string, patch: Partial<AgentProfileInput>): AgentProfile | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updated = agentProfileSchema.parse({ ...existing, ...patch, id });
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE agent_profiles
         SET display_name = ?, backend = ?, system_prompt = ?, tool_allowlist = ?, step_budget = ?, role = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.displayName,
        JSON.stringify(updated.backend),
        updated.systemPrompt,
        updated.toolAllowlist ? JSON.stringify(updated.toolAllowlist) : null,
        updated.stepBudget,
        updated.role,
        now,
        id,
      );

    return updated;
  }

  /** Creates a new profile as a copy of `id`, with a fresh id and `displayName` suffixed to distinguish it. */
  duplicate(id: string, displayNameOverride?: string): AgentProfile | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    return this.create({
      displayName: displayNameOverride ?? `${existing.displayName} (copy)`,
      backend: existing.backend,
      systemPrompt: existing.systemPrompt,
      toolAllowlist: existing.toolAllowlist,
      stepBudget: existing.stepBudget,
      role: existing.role,
    });
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM agent_profiles WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

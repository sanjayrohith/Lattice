import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { coreSchemaMigration } from './001_core_schema';
import { usageRecordsMigration } from './002_usage_records';
import { agentProfilesMigration } from './003_agent_profiles';

describe('agentProfilesMigration', () => {
  it('creates the agent_profiles table with the expected columns', () => {
    const db = new Database(':memory:');
    runMigrations(db, [coreSchemaMigration, usageRecordsMigration, agentProfilesMigration]);

    db.prepare(
      `INSERT INTO agent_profiles
        (id, display_name, backend, system_prompt, tool_allowlist, step_budget, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'agent-1',
      'Coder',
      JSON.stringify({ kind: 'sdk', modelConfig: { providerId: 'openai', modelId: 'gpt-4o' } }),
      '',
      null,
      25,
      'worker',
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
    );

    const row = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get('agent-1') as Record<
      string,
      unknown
    >;
    expect(row.display_name).toBe('Coder');
    expect(row.step_budget).toBe(25);
    db.close();
  });
});

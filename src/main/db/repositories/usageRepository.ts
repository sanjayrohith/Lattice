import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { StepUsage } from '@main/ai/usage';

interface UsageRow {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Typed access to the `usage_records` table: persisting one step's token
 * usage against the session and message that produced it, and summing a
 * session's usage on demand.
 */
export class UsageRepository {
  constructor(private readonly db: Database.Database) {}

  record(sessionId: string, messageId: string, usage: StepUsage): void {
    this.db
      .prepare(
        `INSERT INTO usage_records
           (id, session_id, message_id, prompt_tokens, completion_tokens, total_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        sessionId,
        messageId,
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
        new Date().toISOString(),
      );
  }

  sessionTotal(sessionId: string): StepUsage {
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
           COALESCE(SUM(total_tokens), 0) AS total_tokens
         FROM usage_records
         WHERE session_id = ?`,
      )
      .get(sessionId) as UsageRow;

    return {
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
    };
  }
}

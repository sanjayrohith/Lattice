import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type ToolCallStatus = 'pending' | 'succeeded' | 'failed';

export interface ToolCallRecord {
  id: string;
  messageId: string;
  toolName: string;
  /** JSON-encoded tool call arguments. */
  arguments: string;
  /** JSON-encoded tool result or error, or `null` while `status` is `pending`. */
  result: string | null;
  status: ToolCallStatus;
  createdAt: string;
}

interface ToolCallRow {
  id: string;
  message_id: string;
  tool_name: string;
  arguments: string;
  result: string | null;
  status: string;
  created_at: string;
}

function fromRow(row: ToolCallRow): ToolCallRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    toolName: row.tool_name,
    arguments: row.arguments,
    result: row.result,
    status: row.status as ToolCallStatus,
    createdAt: row.created_at,
  };
}

/**
 * Typed access to the `tool_calls` table. This is the only module allowed
 * to hold a SQL string for this table; every other caller goes through
 * these functions.
 */
export class ToolCallRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    messageId: string;
    toolName: string;
    arguments: string;
    result?: string | null;
    status: ToolCallStatus;
  }): ToolCallRecord {
    const record: ToolCallRecord = {
      id: randomUUID(),
      messageId: input.messageId,
      toolName: input.toolName,
      arguments: input.arguments,
      result: input.result ?? null,
      status: input.status,
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO tool_calls (id, message_id, tool_name, arguments, result, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.messageId,
        record.toolName,
        record.arguments,
        record.result,
        record.status,
        record.createdAt,
      );

    return record;
  }

  listByMessage(messageId: string): ToolCallRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM tool_calls WHERE message_id = ? ORDER BY created_at ASC')
      .all(messageId) as ToolCallRow[];
    return rows.map(fromRow);
  }
}

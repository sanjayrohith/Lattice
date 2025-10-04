import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

function fromRow(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as MessageRole,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Typed access to the `messages` table. This is the only module allowed
 * to hold a SQL string for this table; every other caller goes through
 * these functions.
 */
export class MessageRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: { sessionId: string; role: MessageRole; content: string }): Message {
    const message: Message = {
      id: randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(message.id, message.sessionId, message.role, message.content, message.createdAt);

    return message;
  }

  findById(id: string): Message | undefined {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | MessageRow
      | undefined;
    return row ? fromRow(row) : undefined;
  }

  listBySession(sessionId: string): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as MessageRow[];
    return rows.map(fromRow);
  }

  update(id: string, patch: { content: string }): Message | undefined {
    const result = this.db
      .prepare('UPDATE messages SET content = ? WHERE id = ?')
      .run(patch.content, id);

    if (result.changes === 0) return undefined;
    return this.findById(id);
  }
}

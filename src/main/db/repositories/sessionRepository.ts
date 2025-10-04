import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function fromRow(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Typed access to the `sessions` table. This is the only module allowed
 * to hold a SQL string for this table; every other caller goes through
 * these functions.
 */
export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: { title: string }): Session {
    const now = new Date().toISOString();
    const session: Session = { id: randomUUID(), title: input.title, createdAt: now, updatedAt: now };

    this.db
      .prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(session.id, session.title, session.createdAt, session.updatedAt);

    return session;
  }

  findById(id: string): Session | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;
    return row ? fromRow(row) : undefined;
  }

  list(): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
      .all() as SessionRow[];
    return rows.map(fromRow);
  }

  update(id: string, patch: { title: string }): Session | undefined {
    const now = new Date().toISOString();
    const result = this.db
      .prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
      .run(patch.title, now, id);

    if (result.changes === 0) return undefined;
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

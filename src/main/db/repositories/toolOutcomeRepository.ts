import type Database from 'better-sqlite3';

export interface ToolOutcomeStats {
  toolName: string;
  fileExtension: string;
  successCount: number;
  failureCount: number;
}

interface ToolOutcomeRow {
  tool_name: string;
  file_extension: string;
  success_count: number;
  failure_count: number;
}

function fromRow(row: ToolOutcomeRow): ToolOutcomeStats {
  return {
    toolName: row.tool_name,
    fileExtension: row.file_extension,
    successCount: row.success_count,
    failureCount: row.failure_count,
  };
}

/**
 * Typed access to `tool_outcomes`: one row per `(tool, file extension)`
 * pair, incremented on every recorded outcome rather than logged as an
 * unbounded event stream — only the running success rate is ever needed.
 */
export class ToolOutcomeRepository {
  constructor(private readonly db: Database.Database) {}

  record(toolName: string, fileExtension: string, success: boolean): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO tool_outcomes (tool_name, file_extension, success_count, failure_count, updated_at)
         VALUES (@toolName, @fileExtension, @successCount, @failureCount, @now)
         ON CONFLICT (tool_name, file_extension) DO UPDATE SET
           success_count = success_count + @successCount,
           failure_count = failure_count + @failureCount,
           updated_at = @now`,
      )
      .run({
        toolName,
        fileExtension,
        successCount: success ? 1 : 0,
        failureCount: success ? 0 : 1,
        now,
      });
  }

  get(toolName: string, fileExtension: string): ToolOutcomeStats | undefined {
    const row = this.db
      .prepare('SELECT * FROM tool_outcomes WHERE tool_name = ? AND file_extension = ?')
      .get(toolName, fileExtension) as ToolOutcomeRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** Every recorded tool's stats for one file extension, e.g. every candidate edit strategy for `.ts`. */
  listByFileExtension(fileExtension: string): ToolOutcomeStats[] {
    const rows = this.db
      .prepare('SELECT * FROM tool_outcomes WHERE file_extension = ?')
      .all(fileExtension) as ToolOutcomeRow[];
    return rows.map(fromRow);
  }
}

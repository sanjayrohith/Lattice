export interface LineRange {
  startLine: number;
  endLine: number;
}

function mergeRanges(ranges: readonly LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine);
  const merged: LineRange[] = [];

  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, range.endLine);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

/**
 * Tracks, per file, which 1-indexed line ranges the current run session
 * has already had placed in front of the model — via `read_file`,
 * `search_memory`, or any other content-bearing tool. Retrieval consults
 * this before injecting a chunk so the same lines are never spent twice
 * against the token budget in one session.
 */
export class SeenRangeTracker {
  private readonly rangesByFile = new Map<string, LineRange[]>();

  markSeen(filePath: string, range: LineRange): void {
    const existing = this.rangesByFile.get(filePath) ?? [];
    this.rangesByFile.set(filePath, mergeRanges([...existing, range]));
  }

  /** Whether every line in `range` falls inside a single previously-seen span for `filePath`. */
  isFullyCovered(filePath: string, range: LineRange): boolean {
    const ranges = this.rangesByFile.get(filePath);
    if (!ranges) return false;
    return ranges.some((seen) => seen.startLine <= range.startLine && range.endLine <= seen.endLine);
  }

  reset(): void {
    this.rangesByFile.clear();
  }
}

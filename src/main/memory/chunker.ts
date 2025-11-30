export interface Chunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface ChunkOptions {
  /** Maximum lines a single chunk may span before it is split further. */
  maxLines?: number;
  /** Lines of overlap between consecutive windows in the sliding-window fallback. */
  windowOverlap?: number;
}

const DEFAULT_MAX_LINES = 60;
const DEFAULT_WINDOW_OVERLAP = 8;

/** Matches a line that opens a top-level declaration in a C-family or TypeScript source file. */
const BOUNDARY_PATTERN =
  /^(export\s+)?(default\s+)?(async\s+)?(function|class|interface|type|enum|const|let|var)\b/;

/** 1-indexed line numbers where a new syntactic unit begins, per {@link BOUNDARY_PATTERN}. */
function findBoundaries(lines: readonly string[]): number[] {
  const boundaries: number[] = [];
  lines.forEach((line, index) => {
    if (BOUNDARY_PATTERN.test(line)) {
      boundaries.push(index + 1);
    }
  });
  return boundaries;
}

function sliceLines(lines: readonly string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join('\n');
}

/** Splits a run of lines wider than `maxLines` into consecutive fixed-size sub-chunks. */
function splitOversizedRange(
  filePath: string,
  lines: readonly string[],
  startLine: number,
  endLine: number,
  maxLines: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  for (let from = startLine; from <= endLine; from += maxLines) {
    const to = Math.min(from + maxLines - 1, endLine);
    chunks.push({ filePath, startLine: from, endLine: to, content: sliceLines(lines, from, to) });
  }
  return chunks;
}

function chunkBySyntaxBoundaries(
  filePath: string,
  lines: readonly string[],
  boundaries: readonly number[],
  maxLines: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  const starts = boundaries[0] === 1 ? boundaries : [1, ...boundaries];

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]! - 1 : lines.length;
    if (start > end) continue;

    if (end - start + 1 > maxLines) {
      chunks.push(...splitOversizedRange(filePath, lines, start, end, maxLines));
    } else {
      chunks.push({ filePath, startLine: start, endLine: end, content: sliceLines(lines, start, end) });
    }
  }

  return chunks;
}

function chunkBySlidingWindow(
  filePath: string,
  lines: readonly string[],
  windowSize: number,
  overlap: number,
): Chunk[] {
  if (lines.length === 0) return [];

  const chunks: Chunk[] = [];
  const step = Math.max(windowSize - overlap, 1);

  for (let start = 1; start <= lines.length; start += step) {
    const end = Math.min(start + windowSize - 1, lines.length);
    chunks.push({ filePath, startLine: start, endLine: end, content: sliceLines(lines, start, end) });
    if (end === lines.length) break;
  }

  return chunks;
}

/**
 * Splits `content` into retrieval-sized chunks, each tagged with the
 * originating file path and its 1-indexed line range. Source files whose
 * top-level declarations match {@link BOUNDARY_PATTERN} are split on those
 * boundaries so a chunk holds one coherent unit; anything else — prose,
 * config, a file with no recognizable boundaries — falls back to an
 * overlapping sliding window so context is never lost at a hard cut.
 */
export function chunkFile(filePath: string, content: string, options: ChunkOptions = {}): Chunk[] {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const windowOverlap = options.windowOverlap ?? DEFAULT_WINDOW_OVERLAP;
  const lines = content.split('\n');

  const boundaries = findBoundaries(lines);
  if (boundaries.length > 0) {
    return chunkBySyntaxBoundaries(filePath, lines, boundaries, maxLines);
  }

  return chunkBySlidingWindow(filePath, lines, maxLines, windowOverlap);
}

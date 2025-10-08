import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { resolveWorkspacePath } from './pathSandbox';
import { defineTool } from './types';

/** Hard byte cap on how much of a file `read_file` will ever return in one call. */
export const READ_FILE_MAX_BYTES = 200_000;

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * A lightweight binary/text heuristic: a UTF-8 BOM or the presence of a
 * NUL byte anywhere in the sampled prefix is enough to decide, without
 * pulling in a full charset-detection dependency for what is ultimately
 * a best-effort classification.
 */
export function detectEncoding(buffer: Buffer): 'utf-8' | 'binary' {
  if (buffer.subarray(0, 3).equals(UTF8_BOM)) return 'utf-8';
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0) ? 'binary' : 'utf-8';
}

function stripBom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

function selectLineRange(
  text: string,
  startLine: number | undefined,
  endLine: number | undefined,
): { content: string; totalLines: number } {
  const lines = text.split('\n');
  const totalLines = lines.length;
  if (startLine === undefined && endLine === undefined) {
    return { content: text, totalLines };
  }

  // 1-indexed, inclusive range.
  const from = Math.max(1, startLine ?? 1);
  const to = Math.min(totalLines, endLine ?? totalLines);
  return { content: lines.slice(from - 1, to).join('\n'), totalLines };
}

export const readFileInputSchema = z.object({
  path: z.string().min(1).describe('the workspace-relative path of the file to read'),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('1-indexed first line to return, inclusive; defaults to the start of the file'),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('1-indexed last line to return, inclusive; defaults to the end of the file'),
});

export interface ReadFileOutput {
  content: string;
  encoding: 'utf-8' | 'binary';
  truncated: boolean;
  totalLines: number;
}

/**
 * Reads a workspace file, sandboxed against path escape, capped at
 * {@link READ_FILE_MAX_BYTES} to protect the model's context window, with
 * a text/binary encoding guess and an optional 1-indexed line-range
 * selection. Safe to run without consent — it can only ever read.
 */
export const readFileTool = defineTool({
  name: 'read_file',
  description: 'reads a file from the workspace, optionally restricted to a line range',
  inputSchema: readFileInputSchema,
  defaultConsent: 'always',
  execute: async (input, context): Promise<ReadFileOutput> => {
    const resolvedPath = resolveWorkspacePath(context.workspaceRoot, input.path);
    const buffer = await readFile(resolvedPath);

    const truncated = buffer.length > READ_FILE_MAX_BYTES;
    const limited = truncated ? buffer.subarray(0, READ_FILE_MAX_BYTES) : buffer;
    const encoding = detectEncoding(limited);

    if (encoding === 'binary') {
      return { content: '', encoding, truncated, totalLines: 0 };
    }

    const text = stripBom(limited.toString('utf-8'));
    const { content, totalLines } = selectLineRange(text, input.startLine, input.endLine);
    return { content, encoding, truncated, totalLines };
  },
});

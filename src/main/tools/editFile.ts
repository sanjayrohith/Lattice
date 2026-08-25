import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { withFileLock } from '../locks/withFileLock';
import { fileExtensionOf } from '../telemetry/fileExtension';
import { atomicWriteFile } from './atomicWrite';
import { resolveWorkspacePath } from './pathSandbox';
import { defineTool } from './types';

/** Thrown when `search` does not match the file's content exactly once. */
export class SearchReplaceMismatchError extends Error {
  readonly code = 'SEARCH_REPLACE_MISMATCH';

  constructor(
    public readonly path: string,
    public readonly occurrences: number,
  ) {
    super(
      occurrences === 0
        ? `the search text was not found in "${path}"; re-read the file and match its exact current content`
        : `the search text matches ${occurrences} locations in "${path}"; narrow it to match exactly once`,
    );
    this.name = 'SearchReplaceMismatchError';
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export const editFileInputSchema = z.object({
  path: z.string().min(1).describe('the workspace-relative path of the file to edit'),
  search: z
    .string()
    .min(1)
    .describe('the exact text to find; must match the file content exactly once'),
  replace: z.string().describe('the text that replaces the matched search text'),
});

export interface EditFileOutput {
  path: string;
  bytesWritten: number;
}

/**
 * Replaces one exact-match occurrence of `search` with `replace` in a
 * workspace file. Throws a descriptive {@link SearchReplaceMismatchError}
 * — naming whether the search text was missing entirely or ambiguous
 * across multiple locations — rather than guessing, so the calling model
 * can re-read the file and retry with a corrected, uniquely matching
 * search string. Requires consent, since it modifies workspace content.
 */
export const editFileTool = defineTool({
  name: 'edit_file',
  description: 'replaces one exact-match occurrence of a search string in a workspace file',
  inputSchema: editFileInputSchema,
  defaultConsent: 'ask',
  execute: async (input, context): Promise<EditFileOutput> => {
    const resolvedPath = resolveWorkspacePath(context.workspaceRoot, input.path);

    try {
      const bytesWritten = await withFileLock(context, resolvedPath, async () => {
        const original = await readFile(resolvedPath, 'utf-8');

        const occurrences = countOccurrences(original, input.search);
        if (occurrences !== 1) {
          throw new SearchReplaceMismatchError(input.path, occurrences);
        }

        const updated = original.replace(input.search, input.replace);
        return atomicWriteFile(resolvedPath, updated);
      });

      context.toolOutcomes?.record('edit_file', fileExtensionOf(input.path), true);
      return { path: input.path, bytesWritten };
    } catch (error) {
      context.toolOutcomes?.record('edit_file', fileExtensionOf(input.path), false);
      throw error;
    }
  },
});

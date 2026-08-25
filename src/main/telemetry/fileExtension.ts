import { extname } from 'node:path';

/** The lowercased extension of `filePath` (e.g. `.ts`), or `'(none)'` for a file with none. */
export function fileExtensionOf(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return ext.length > 0 ? ext : '(none)';
}

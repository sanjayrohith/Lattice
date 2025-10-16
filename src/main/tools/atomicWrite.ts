import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Writes `content` to `resolvedPath`, creating missing parent directories,
 * via a sibling temp file followed by a rename over the target. A rename
 * is a single filesystem operation, so a crash mid-write can never leave
 * the target half-written. Shared by every tool that replaces a file's
 * entire on-disk content (`write_file`, `edit_file`, `rewrite_file`).
 */
export async function atomicWriteFile(resolvedPath: string, content: string): Promise<number> {
  await mkdir(dirname(resolvedPath), { recursive: true });

  const tempPath = `${resolvedPath}.tmp-${randomUUID()}`;
  const buffer = Buffer.from(content, 'utf-8');

  try {
    await writeFile(tempPath, buffer);
    await rename(tempPath, resolvedPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }

  return buffer.length;
}

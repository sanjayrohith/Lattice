import { z } from 'zod';
import type { AcpConnection } from './acpConnection';

/**
 * One block of prompt content sent to `session/prompt`. Mirrors the ACP
 * content block union (currently text and image) so a single request
 * can carry both an instruction and any attachments the agent needs to
 * see in the same turn, in order.
 */
export const acpContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
]);
export type AcpContentBlock = z.infer<typeof acpContentBlockSchema>;

const sessionPromptResultSchema = z.object({
  stopReason: z.string().optional(),
});
export type AcpPromptResult = z.infer<typeof sessionPromptResultSchema>;

export interface SendPromptParams {
  sessionId: string;
  content: readonly AcpContentBlock[];
}

/** Builds a text-only content block, the common case for a plain instruction. */
export function textBlock(text: string): AcpContentBlock {
  return { type: 'text', text };
}

/** Builds an image content block from base64 data and its declared MIME type. */
export function imageBlock(data: string, mimeType: string): AcpContentBlock {
  return { type: 'image', data, mimeType };
}

/**
 * Sends `session/prompt` for an already-open session with one or more
 * content blocks — text instructions and image attachments travel in a
 * single request so the agent receives them together as one turn,
 * rather than as separate calls it would have to correlate itself.
 */
export async function sendPrompt(
  connection: AcpConnection,
  params: SendPromptParams,
): Promise<AcpPromptResult> {
  connection.requireInitialized();

  const rawResult = await connection.request('session/prompt', {
    sessionId: params.sessionId,
    prompt: params.content,
  });

  return sessionPromptResultSchema.parse(rawResult ?? {});
}

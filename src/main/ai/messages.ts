import type { ModelMessage } from './sdk';

export type InternalMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string; mediaType?: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown; isError?: boolean };

export interface InternalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  parts: readonly InternalMessagePart[];
}

function textOf(parts: readonly InternalMessagePart[]): string {
  return parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * Converts one internal message into the shape the AI SDK core expects.
 * Because `ModelMessage` is already provider-agnostic — the same object
 * reaches the OpenAI, Anthropic, and Google provider packages unchanged —
 * this single conversion is what "normalizes message history across
 * providers": every provider consumes an identical `ModelMessage[]`
 * regardless of which one ultimately handles the call.
 */
export function toModelMessage(message: InternalMessage): ModelMessage {
  switch (message.role) {
    case 'system':
      return { role: 'system', content: textOf(message.parts) };

    case 'user': {
      const hasNonText = message.parts.some((part) => part.type !== 'text');
      if (!hasNonText) {
        return { role: 'user', content: textOf(message.parts) };
      }
      return {
        role: 'user',
        content: message.parts.map((part) => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          }
          if (part.type === 'image') {
            return {
              type: 'file' as const,
              data: part.dataUrl,
              mediaType: part.mediaType ?? 'image/png',
            };
          }
          throw new Error(`unsupported user message part: ${part.type}`);
        }),
      };
    }

    case 'assistant': {
      const hasNonText = message.parts.some((part) => part.type !== 'text');
      if (!hasNonText) {
        return { role: 'assistant', content: textOf(message.parts) };
      }
      return {
        role: 'assistant',
        content: message.parts.map((part) => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          }
          if (part.type === 'tool-call') {
            return {
              type: 'tool-call' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            };
          }
          throw new Error(`unsupported assistant message part: ${part.type}`);
        }),
      };
    }

    case 'tool':
      return {
        role: 'tool',
        content: message.parts.map((part) => {
          if (part.type !== 'tool-result') {
            throw new Error(`unsupported tool message part: ${part.type}`);
          }
          return {
            type: 'tool-result' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output:
              typeof part.output === 'string'
                ? { type: 'text' as const, value: part.output }
                : { type: 'json' as const, value: part.output as never },
          };
        }),
      };
  }
}

/** Converts a full internal message history into the SDK's `ModelMessage[]` in order. */
export function toModelMessages(messages: readonly InternalMessage[]): ModelMessage[] {
  return messages.map(toModelMessage);
}

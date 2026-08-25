import type { InternalMessagePart } from '../ai/messages';
import type { McpResourceContent } from './mcpClient';

type AttachablePart = InternalMessagePart;

const IMAGE_MIME_TYPE_PATTERN = /^image\//;

/**
 * Converts a resource read via {@link McpClient.readResource} into a
 * message content part so it can be attached directly to a run's
 * history, the same shape a user-supplied image or pasted text would
 * take (`src/main/ai/messages.ts`'s `InternalMessage` parts). A text
 * resource becomes a labelled text part; an image blob becomes an image
 * part as a data URL; any other binary content falls back to a text
 * placeholder rather than silently dropping the resource.
 */
export function resourceToMessagePart(resource: McpResourceContent): AttachablePart {
  if (resource.text !== undefined) {
    return { type: 'text', text: `[resource ${resource.uri}]\n${resource.text}` };
  }

  if (resource.blob !== undefined && resource.mimeType && IMAGE_MIME_TYPE_PATTERN.test(resource.mimeType)) {
    return { type: 'image', dataUrl: `data:${resource.mimeType};base64,${resource.blob}`, mediaType: resource.mimeType };
  }

  return {
    type: 'text',
    text: `[resource ${resource.uri}] binary content (${resource.mimeType ?? 'unknown type'}) not attachable inline`,
  };
}

/** Converts every content entry a `readResource` call returned into attachable message parts, in order. */
export function resourcesToMessageParts(resources: readonly McpResourceContent[]): AttachablePart[] {
  return resources.map(resourceToMessagePart);
}

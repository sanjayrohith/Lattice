import { z } from 'zod';
import type { AnyTool } from './types';

/** The provider-agnostic "function" shape every tool-calling model API expects. */
export interface ModelToolDefinition {
  name: string;
  description: string;
  /** JSON Schema (2020-12), converted from the tool's Zod `inputSchema`. */
  parameters: Record<string, unknown>;
}

/**
 * Converts one tool's Zod `inputSchema` into the JSON Schema payload sent
 * to the model as that tool's parameter definition. Required fields and
 * enum members fall out of the conversion automatically — `z.toJSONSchema`
 * marks every non-optional key as `required` and renders a `z.enum` as a
 * JSON Schema `enum`, so nothing here needs to special-case them.
 */
export function toModelToolDefinition(tool: AnyTool): ModelToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  };
}

/** Converts every tool in `tools` into its model-visible definition, in order. */
export function toModelToolDefinitions(tools: readonly AnyTool[]): ModelToolDefinition[] {
  return tools.map(toModelToolDefinition);
}

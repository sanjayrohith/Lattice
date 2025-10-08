import { toModelToolDefinition } from './modelToolDefinition';
import type { AnyTool } from './types';

interface JsonSchemaProperty {
  description?: string;
}

/**
 * Renders one tool's name, description, and every parameter's `.describe()`
 * annotation as a plain-text block. The structured JSON Schema from
 * {@link toModelToolDefinition} is what the model's tool-calling interface
 * actually consumes; this text block additionally surfaces the same
 * per-parameter guidance directly in the system prompt, so a provider
 * that pays less attention to schema-level descriptions still sees them.
 */
export function formatToolPromptSummary(tool: AnyTool): string {
  const definition = toModelToolDefinition(tool);
  const properties = (definition.parameters['properties'] ?? {}) as Record<string, JsonSchemaProperty>;
  const required = new Set((definition.parameters['required'] as string[] | undefined) ?? []);

  const lines = [`### ${definition.name}`, definition.description];

  const parameterNames = Object.keys(properties);
  if (parameterNames.length > 0) {
    for (const name of parameterNames) {
      const description = properties[name]?.description;
      const marker = required.has(name) ? `${name} (required)` : name;
      lines.push(description ? `- ${marker}: ${description}` : `- ${marker}`);
    }
  }

  return lines.join('\n');
}

/** Joins every tool's prompt summary into a single block, in order, separated by a blank line. */
export function formatToolsPromptSummary(tools: readonly AnyTool[]): string {
  return tools.map(formatToolPromptSummary).join('\n\n');
}

import { z } from 'zod';

/** The subset of JSON Schema an MCP tool's `inputSchema` is expected to use. */
export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: readonly unknown[];
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  items?: JsonSchema;
  [key: string]: unknown;
}

function withDescription(schema: z.ZodTypeAny, description: string | undefined): z.ZodTypeAny {
  return description ? schema.describe(description) : schema;
}

/**
 * Converts a JSON Schema object into an equivalent Zod schema, so an
 * MCP tool declared with `{ type: 'object', properties: {...} }` gets
 * real per-field validation and the descriptions the model relies on for
 * guidance, instead of a permissive `z.record(z.unknown())` fallback
 * placeholder. Recognizes
 * `object`, `array`, `string`, `number`/`integer`, `boolean`, and `enum`;
 * anything unrecognized (a schema-less tool, an unsupported keyword
 * combination, `type` omitted) falls back to `z.unknown()` rather than
 * throwing — a permissive field beats rejecting a tool outright.
 */
export function jsonSchemaToZod(schema: JsonSchema | undefined): z.ZodTypeAny {
  if (!schema) return z.unknown();

  if (schema.enum && schema.enum.length > 0) {
    const [first, ...rest] = schema.enum as [unknown, ...unknown[]];
    return withDescription(z.union([z.literal(first as never), ...rest.map((v) => z.literal(v as never))]) as z.ZodTypeAny, schema.description);
  }

  switch (schema.type) {
    case 'object': {
      const properties = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const [key, propertySchema] of Object.entries(properties)) {
        const propertyZod = jsonSchemaToZod(propertySchema);
        shape[key] = required.has(key) ? propertyZod : propertyZod.optional();
      }

      return withDescription(z.object(shape), schema.description);
    }
    case 'array':
      return withDescription(z.array(jsonSchemaToZod(schema.items)), schema.description);
    case 'string':
      return withDescription(z.string(), schema.description);
    case 'number':
      return withDescription(z.number(), schema.description);
    case 'integer':
      return withDescription(z.number().int(), schema.description);
    case 'boolean':
      return withDescription(z.boolean(), schema.description);
    default:
      return withDescription(z.unknown(), schema.description);
  }
}

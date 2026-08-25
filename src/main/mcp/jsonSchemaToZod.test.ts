import { describe, expect, it } from 'vitest';
import { jsonSchemaToZod } from './jsonSchemaToZod';

describe('jsonSchemaToZod', () => {
  it('falls back to z.unknown() for an undefined schema', () => {
    const zodSchema = jsonSchemaToZod(undefined);
    expect(zodSchema.parse('anything')).toBe('anything');
  });

  it('converts an object schema with required and optional properties', () => {
    const zodSchema = jsonSchemaToZod({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    });

    expect(zodSchema.parse({ name: 'a' })).toEqual({ name: 'a' });
    expect(zodSchema.parse({ name: 'a', age: 5 })).toEqual({ name: 'a', age: 5 });
    expect(() => zodSchema.parse({})).toThrow();
    expect(() => zodSchema.parse({ name: 'a', age: 1.5 })).toThrow();
  });

  it('converts an array schema using its items schema', () => {
    const zodSchema = jsonSchemaToZod({ type: 'array', items: { type: 'string' } });
    expect(zodSchema.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(() => zodSchema.parse([1])).toThrow();
  });

  it('converts string, number, and boolean primitives', () => {
    expect(jsonSchemaToZod({ type: 'string' }).parse('x')).toBe('x');
    expect(jsonSchemaToZod({ type: 'number' }).parse(1.5)).toBe(1.5);
    expect(jsonSchemaToZod({ type: 'boolean' }).parse(true)).toBe(true);
  });

  it('converts an enum into a union of literals', () => {
    const zodSchema = jsonSchemaToZod({ enum: ['a', 'b'] });
    expect(zodSchema.parse('a')).toBe('a');
    expect(() => zodSchema.parse('c')).toThrow();
  });

  it('carries the description onto the zod schema', () => {
    const zodSchema = jsonSchemaToZod({ type: 'string', description: 'a name' });
    expect(zodSchema.description).toBe('a name');
  });

  it('falls back to z.unknown() for an unrecognized type', () => {
    const zodSchema = jsonSchemaToZod({ type: 'null' });
    expect(zodSchema.parse(null)).toBe(null);
  });
});

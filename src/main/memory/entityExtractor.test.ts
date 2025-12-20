import { describe, expect, it } from 'vitest';
import { extractEntities } from './entityExtractor';

describe('extractEntities', () => {
  it('creates a file node and one symbol node per exported declaration', () => {
    const content = ['export function alpha() {}', '', 'export class Beta {}'].join('\n');

    const { nodes } = extractEntities('src/a.ts', content);

    expect(nodes.find((n) => n.type === 'file')).toMatchObject({ name: 'src/a.ts' });
    const symbols = nodes.filter((n) => n.type === 'symbol');
    expect(symbols.map((s) => s.name)).toEqual(['alpha', 'Beta']);
    expect(symbols[0]).toMatchObject({ startLine: 1, endLine: 1 });
    expect(symbols[1]).toMatchObject({ startLine: 3, endLine: 3 });
  });

  it('emits a defines edge from the file to each symbol', () => {
    const { nodes, edges } = extractEntities('src/a.ts', 'export const alpha = 1;');

    const fileNode = nodes.find((n) => n.type === 'file')!;
    const symbolNode = nodes.find((n) => n.type === 'symbol')!;
    expect(edges).toContainEqual({ sourceId: fileNode.id, targetId: symbolNode.id, relation: 'defines' });
  });

  it('creates one deduplicated import node per module specifier with an imports edge', () => {
    const content = [
      "import { a } from 'shared-module';",
      "import { b } from 'shared-module';",
      "import c from 'other-module';",
    ].join('\n');

    const { nodes, edges } = extractEntities('src/a.ts', content);

    const imports = nodes.filter((n) => n.type === 'import');
    expect(imports.map((n) => n.name).sort()).toEqual(['other-module', 'shared-module']);
    expect(edges.filter((e) => e.relation === 'imports')).toHaveLength(2);
  });

  it('links a referencing symbol to the symbol it references within the same file', () => {
    const content = [
      'export function helper() {',
      '  return 1;',
      '}',
      '',
      'export function caller() {',
      '  return helper();',
      '}',
    ].join('\n');

    const { nodes, edges } = extractEntities('src/a.ts', content);
    const helper = nodes.find((n) => n.name === 'helper')!;
    const caller = nodes.find((n) => n.name === 'caller')!;

    expect(edges).toContainEqual({ sourceId: caller.id, targetId: helper.id, relation: 'references' });
  });

  it('does not emit a self-referencing edge for a symbol mentioning its own name on its definition line', () => {
    const { edges } = extractEntities('src/a.ts', 'export function recurse() {\n  return recurse();\n}');
    expect(edges.filter((e) => e.relation === 'references')).toHaveLength(0);
  });
});

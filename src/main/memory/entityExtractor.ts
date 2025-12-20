export type ExtractedNodeType = 'file' | 'symbol' | 'import';

export interface ExtractedNode {
  id: string;
  type: ExtractedNodeType;
  name: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

export type ExtractedEdgeRelation = 'defines' | 'imports' | 'references';

export interface ExtractedEdge {
  sourceId: string;
  targetId: string;
  relation: ExtractedEdgeRelation;
}

export interface ExtractionResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
}

const SYMBOL_DEFINITION_PATTERN =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/;

const IMPORT_PATTERN = /^import\s+(?:type\s+)?(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/;

function fileNodeId(filePath: string): string {
  return `file:${filePath}`;
}

function symbolNodeId(filePath: string, name: string, startLine: number): string {
  return `symbol:${filePath}:${name}:${startLine}`;
}

function importNodeId(filePath: string, moduleSpecifier: string): string {
  return `import:${filePath}:${moduleSpecifier}`;
}

interface DefinedSymbol {
  node: ExtractedNode;
  name: string;
  startLine: number;
}

/** The symbol whose definition range most closely precedes `line`, i.e. the symbol `line` falls inside. */
function enclosingSymbol(symbols: readonly DefinedSymbol[], line: number): DefinedSymbol | undefined {
  let current: DefinedSymbol | undefined;
  for (const symbol of symbols) {
    if (symbol.startLine > line) break;
    current = symbol;
  }
  return current;
}

/**
 * Extracts a lightweight entity graph from a single file's source: a
 * `file` node; one `symbol` node per top-level exported declaration; one
 * `import` node per module specifier the file imports; `defines` edges
 * from the file to each symbol and `imports` edges from the file to each
 * import; and `references` edges from the symbol whose body contains an
 * identifier to the symbol that identifier names, wherever both are
 * defined in the same file. Regex-based rather than a full parse, so it
 * favors precision over completeness — good enough to seed retrieval,
 * not a substitute for a language server.
 */
export function extractEntities(filePath: string, content: string): ExtractionResult {
  const lines = content.split('\n');
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];

  const fileNode: ExtractedNode = {
    id: fileNodeId(filePath),
    type: 'file',
    name: filePath,
    filePath,
    startLine: null,
    endLine: null,
  };
  nodes.push(fileNode);

  const symbols: DefinedSymbol[] = [];
  const seenImports = new Set<string>();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const importMatch = IMPORT_PATTERN.exec(line);
    if (importMatch) {
      const moduleSpecifier = importMatch[1]!;
      if (!seenImports.has(moduleSpecifier)) {
        seenImports.add(moduleSpecifier);
        const importNode: ExtractedNode = {
          id: importNodeId(filePath, moduleSpecifier),
          type: 'import',
          name: moduleSpecifier,
          filePath,
          startLine: null,
          endLine: null,
        };
        nodes.push(importNode);
        edges.push({ sourceId: fileNode.id, targetId: importNode.id, relation: 'imports' });
      }
      return;
    }

    const symbolMatch = SYMBOL_DEFINITION_PATTERN.exec(line);
    if (symbolMatch) {
      const name = symbolMatch[1]!;
      const symbolNode: ExtractedNode = {
        id: symbolNodeId(filePath, name, lineNumber),
        type: 'symbol',
        name,
        filePath,
        startLine: lineNumber,
        endLine: lineNumber,
      };
      nodes.push(symbolNode);
      edges.push({ sourceId: fileNode.id, targetId: symbolNode.id, relation: 'defines' });
      symbols.push({ node: symbolNode, name, startLine: lineNumber });
    }
  });

  const seenReferenceEdges = new Set<string>();
  for (const target of symbols) {
    const wordBoundary = new RegExp(`\\b${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      if (lineNumber === target.startLine) return;
      if (!wordBoundary.test(line)) return;

      const referencing = enclosingSymbol(symbols, lineNumber);
      if (!referencing || referencing.node.id === target.node.id) return;

      const edgeKey = `${referencing.node.id}->${target.node.id}`;
      if (seenReferenceEdges.has(edgeKey)) return;
      seenReferenceEdges.add(edgeKey);

      edges.push({ sourceId: referencing.node.id, targetId: target.node.id, relation: 'references' });
    });
  }

  return { nodes, edges };
}

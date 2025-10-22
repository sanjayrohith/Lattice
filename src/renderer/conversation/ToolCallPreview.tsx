import type { ToolCallPreviewState } from './toolCallPreviewTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Renders the most useful summary of a tool call's (possibly still
 * partial) arguments: a shell-style command line for `run_command`, a
 * path-plus-content preview for the file-writing tools, and a generic
 * formatted JSON dump for everything else.
 */
function renderArgsPreview(toolName: string, args: unknown): React.JSX.Element {
  if (!isRecord(args)) {
    return <span className="tool-call-preview__placeholder">…</span>;
  }

  if (toolName === 'run_command') {
    const command = typeof args['command'] === 'string' ? args['command'] : '';
    const cmdArgs = Array.isArray(args['args']) ? (args['args'] as unknown[]) : [];
    return <pre className="tool-call-preview__command">$ {[command, ...cmdArgs].join(' ')}</pre>;
  }

  if (toolName === 'write_file' || toolName === 'rewrite_file') {
    return (
      <div className="tool-call-preview__file">
        <div className="tool-call-preview__path">{String(args['path'] ?? '')}</div>
        <pre className="tool-call-preview__content">{String(args['content'] ?? '')}</pre>
      </div>
    );
  }

  if (toolName === 'edit_file') {
    return (
      <div className="tool-call-preview__file">
        <div className="tool-call-preview__path">{String(args['path'] ?? '')}</div>
        <pre className="tool-call-preview__diff">
          <span className="tool-call-preview__diff-removed">- {String(args['search'] ?? '')}</span>
          {'\n'}
          <span className="tool-call-preview__diff-added">+ {String(args['replace'] ?? '')}</span>
        </pre>
      </div>
    );
  }

  return <pre className="tool-call-preview__json">{JSON.stringify(args, null, 2)}</pre>;
}

export interface ToolCallPreviewCardProps {
  preview: ToolCallPreviewState;
}

export function ToolCallPreviewCard({ preview }: ToolCallPreviewCardProps): React.JSX.Element {
  return (
    <li
      className={`tool-call-preview tool-call-preview--${preview.status}`}
      data-testid={`tool-call-${preview.toolCallId}`}
    >
      <div className="tool-call-preview__header">
        <span className="tool-call-preview__name">{preview.toolName}</span>
        <span className="tool-call-preview__status">{preview.status}</span>
      </div>
      {renderArgsPreview(preview.toolName, preview.partialArgs)}
    </li>
  );
}

export interface ToolCallPreviewListProps {
  previews: readonly ToolCallPreviewState[];
}

/** Renders one live preview card per in-flight or just-finished tool call, in the order first seen. */
export function ToolCallPreviewList({ previews }: ToolCallPreviewListProps): React.JSX.Element | null {
  if (previews.length === 0) return null;

  return (
    <ul className="tool-call-preview-list">
      {previews.map((preview) => (
        <ToolCallPreviewCard key={preview.toolCallId} preview={preview} />
      ))}
    </ul>
  );
}

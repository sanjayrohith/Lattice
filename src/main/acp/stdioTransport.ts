import { type ChildProcess, spawn } from 'node:child_process';
import {
  NewlineFrameSplitter,
  decodeJsonRpc,
  type JsonRpcMessage,
  JsonRpcDecodeError,
} from './jsonRpc';

export interface StdioTransportConfig {
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  cwd?: string;
}

export type StdioTransportEvent =
  | { type: 'message'; message: JsonRpcMessage }
  | { type: 'decode-error'; error: JsonRpcDecodeError }
  | { type: 'stderr'; text: string }
  | { type: 'exit'; code: number | null; signal: NodeJS.Signals | null };

/**
 * Spawns an ACP agent process with the configured argv, env, and cwd, and
 * pipes newline-delimited JSON-RPC over its stdin/stdout. The child's
 * stderr is never parsed as protocol traffic — it is surfaced verbatim as
 * a `stderr` event for the log, since agent processes commonly emit
 * human-readable diagnostics there.
 */
export class StdioTransport {
  private child: ChildProcess | undefined;
  private readonly splitter = new NewlineFrameSplitter();
  private readonly listeners = new Set<(event: StdioTransportEvent) => void>();

  constructor(private readonly config: StdioTransportConfig) {}

  onEvent(listener: (event: StdioTransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StdioTransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  get isRunning(): boolean {
    return this.child !== undefined && this.child.exitCode === null && !this.child.killed;
  }

  start(): void {
    if (this.child) {
      throw new Error('stdio transport already started');
    }

    this.child = spawn(this.config.command, [...(this.config.args ?? [])], {
      cwd: this.config.cwd,
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout?.setEncoding('utf-8').on('data', (chunk: string) => {
      for (const line of this.splitter.push(chunk)) {
        try {
          this.emit({ type: 'message', message: decodeJsonRpc(line) });
        } catch (error) {
          if (error instanceof JsonRpcDecodeError) {
            this.emit({ type: 'decode-error', error });
          } else {
            throw error;
          }
        }
      }
    });

    this.child.stderr?.setEncoding('utf-8').on('data', (text: string) => {
      this.emit({ type: 'stderr', text });
    });

    this.child.on('exit', (code, signal) => {
      this.emit({ type: 'exit', code, signal });
    });
  }

  /** Writes a raw already-newline-terminated JSON-RPC frame to the child's stdin. */
  send(frame: string): void {
    if (!this.child?.stdin || this.child.stdin.destroyed) {
      throw new Error('stdio transport is not running');
    }
    this.child.stdin.write(frame);
  }

  stop(): void {
    this.child?.kill();
    this.child = undefined;
  }
}

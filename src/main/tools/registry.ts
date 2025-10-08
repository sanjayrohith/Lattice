import type { AnyTool } from './types';

/** Thrown by {@link ToolRegistry.register} when a tool name is already registered. */
export class DuplicateToolError extends Error {
  constructor(public readonly toolName: string) {
    super(`a tool named "${toolName}" is already registered`);
    this.name = 'DuplicateToolError';
  }
}

/**
 * Holds every tool the application knows how to run, keyed by name.
 * Registration is a hard error on a duplicate name rather than a silent
 * overwrite, so two tool modules can never shadow one another by accident.
 */
export class ToolRegistry {
  private readonly toolsByName = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    if (this.toolsByName.has(tool.name)) {
      throw new DuplicateToolError(tool.name);
    }
    this.toolsByName.set(tool.name, tool);
  }

  get(name: string): AnyTool | undefined {
    return this.toolsByName.get(name);
  }

  /** Every registered tool, in registration order. */
  list(): AnyTool[] {
    return [...this.toolsByName.values()];
  }

  /**
   * Every registered tool an agent may call. With no `allowlist`, every
   * tool is available; with one, only tools whose name appears in it —
   * silently ignoring allowlist entries that name no registered tool,
   * since that is the agent profile's problem, not the registry's.
   */
  listForAgent(allowlist?: readonly string[]): AnyTool[] {
    if (!allowlist) return this.list();
    const allowed = new Set(allowlist);
    return this.list().filter((tool) => allowed.has(tool.name));
  }
}

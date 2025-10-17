export type RunState =
  | 'idle'
  | 'streaming'
  | 'awaiting-consent'
  | 'executing-tool'
  | 'completed'
  | 'failed'
  | 'aborted';

const TERMINAL_STATES: ReadonlySet<RunState> = new Set(['completed', 'failed', 'aborted']);

/**
 * The legal state graph for one agent run:
 *
 * - `idle -> streaming`: the run starts its first model call.
 * - `streaming -> executing-tool`: the model emitted a tool call whose
 *   consent is already resolved (`always`/`never`), so it runs immediately.
 * - `streaming -> awaiting-consent`: the model emitted a tool call that
 *   needs a user decision before it can run.
 * - `streaming -> completed`: the model finished with no pending tool call.
 * - `awaiting-consent -> executing-tool`: the user accepted.
 * - `awaiting-consent -> streaming`: the user declined; the decline is
 *   reinjected as a tool observation and the model gets another turn.
 * - `executing-tool -> streaming`: the tool result is reinjected and the
 *   model gets another turn.
 * - any non-terminal state `-> failed` / `-> aborted`: an unrecoverable
 *   error, or cancellation, ends the run from wherever it currently is.
 * - `completed` / `failed` / `aborted` are terminal: no further transitions.
 */
const LEGAL_TRANSITIONS: Record<RunState, ReadonlySet<RunState>> = {
  idle: new Set(['streaming']),
  streaming: new Set(['executing-tool', 'awaiting-consent', 'completed', 'failed', 'aborted']),
  'awaiting-consent': new Set(['executing-tool', 'streaming', 'failed', 'aborted']),
  'executing-tool': new Set(['streaming', 'failed', 'aborted']),
  completed: new Set(),
  failed: new Set(),
  aborted: new Set(),
};

/** Thrown by {@link AgentRunStateMachine.transition} when `to` is not legal from the current state. */
export class IllegalRunTransitionError extends Error {
  constructor(
    public readonly from: RunState,
    public readonly to: RunState,
  ) {
    super(`illegal agent run transition: "${from}" -> "${to}"`);
    this.name = 'IllegalRunTransitionError';
  }
}

/**
 * Tracks one agent run's lifecycle state and enforces that only a legal
 * transition can ever be applied, so a bug elsewhere in the loop cannot
 * silently corrupt the run into an inconsistent state (e.g. executing a
 * tool while the run believes it already completed).
 */
export class AgentRunStateMachine {
  private state: RunState = 'idle';

  get current(): RunState {
    return this.state;
  }

  isTerminal(): boolean {
    return TERMINAL_STATES.has(this.state);
  }

  canTransition(to: RunState): boolean {
    return LEGAL_TRANSITIONS[this.state].has(to);
  }

  transition(to: RunState): RunState {
    if (!this.canTransition(to)) {
      throw new IllegalRunTransitionError(this.state, to);
    }
    this.state = to;
    return this.state;
  }
}

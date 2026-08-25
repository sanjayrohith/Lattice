# Lattice — Architecture Reference

Lattice is an Electron desktop application that orchestrates one or more coding
agents — driven directly through a model provider's SDK, or reached as peers
over the Agent Client Protocol (ACP) — against a local workspace, with a
persistent knowledge-graph memory and pluggable MCP tool/resource servers.
This document covers process segregation, the IPC contract, the orchestration
topology, and the security model. For "how do I run this," see
[`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md).

## Process segregation

Electron's three-process model is enforced strictly; nothing bypasses it.

- **Main** (`src/main/`) — the only process with Node.js access, filesystem
  access, and the SQLite database. Owns the authoritative application state,
  every agent run, the tool registry, and every external connection (model
  providers, ACP connectors, MCP servers).
- **Preload** (`src/preload/`) — a narrow bridge. `contextBridge.exposeInMainWorld`
  publishes exactly two functions to the renderer: `invoke` (request/response
  against a fixed, typed channel registry) and `subscribe` (main → renderer
  broadcasts). The raw `ipcRenderer` object is never exposed — a compromised
  renderer cannot register arbitrary listeners or invoke an unregistered
  channel.
- **Renderer** (`src/renderer/`) — a sandboxed, context-isolated Chromium
  page. `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`,
  `webSecurity: true` (`src/main/security/windowDefaults.ts`), enforced by a
  unit test that fails the build if any of the four flags drifts.

Every `BrowserWindow` — the main window and any panel popped out into its own
native window (`src/main/windows/`) — is created with the same hardened
defaults. `will-navigate`, `will-attach-webview`, and `setWindowOpenHandler`
deny navigation away from app origins and renderer-initiated window creation
outright (`src/main/security/`).

## The IPC contract

Every renderer → main call is a name, a Zod request schema, and a Zod
response schema, declared once in `src/shared/ipc/`:

- `channels.ts` — every channel name as a typed constant (`IPC_CHANNELS`).
  No string literal channel name is ever used at a call site.
- `contracts.ts` — `ipcContracts` maps each invokable channel to its request
  and response schema, plus the `{ ok: true, data } | { ok: false, error }`
  result envelope every call resolves to.
- `events.ts` — `ipcEventContracts` maps each *broadcast* channel (main →
  renderer, no request/response pairing) to its payload schema.

`src/main/ipc/registerHandler.ts` wraps `ipcMain.handle`: the incoming
payload is parsed against the channel's request schema before the handler
ever runs (a parse failure short-circuits into `INVALID_PAYLOAD` without
invoking the handler), the handler's return value is parsed against the
response schema, and any thrown error is normalized into a structured
failure envelope rather than crossing the process boundary as a raw
exception with a leaked stack trace.

Broadcasts (state revisions, streaming run events, consent requests, update
availability) go out via `BrowserWindow.getAllWindows().forEach(w =>
w.webContents.send(channel, payload))`; the renderer's `subscribe` validates
every inbound payload against the channel's event schema and silently drops
anything malformed.

Application state itself (`src/shared/state/`) follows the same
single-writer discipline: the main process holds the one authoritative
store with a monotonically increasing revision id; every renderer's Zustand
store is a read-only projection, hydrated on mount and updated by applying
broadcast revisions, dropping any payload whose revision is not strictly
newer than what it already has.

## Orchestration topology

### Agent backends

`src/main/orchestrator/` (backend abstraction in `src/main/agents/`,
`AgentBackend`) treats a directly-invoked model and an ACP connector
identically: both expose `run`/`stream`/`cancel`. An agent profile
(`src/main/agents/agentProfile.ts`) references one or the other via a
discriminated `backend` field (`{ kind: 'sdk', modelConfig }` or `{ kind:
'acp', connectorId }`), so every orchestration mode below is written once
against the abstraction, not against either concrete backend.

### The core loop

One agent run (`src/main/loop/`) is a state machine (`AgentRunStateMachine`)
cycling through `streaming → executing-tool → streaming` (or `awaiting-consent`
in between, or `delegating` while a subordinate run handles a
`delegate_to_agent` call) until the model stops emitting tool calls or the
step cap is hit. Each step: stream the model's response, intercept any tool
call, validate its arguments against the tool's Zod schema, gate it through
consent (`src/main/consent/`), dispatch it, and reinject the result as the
next turn's observation (`src/main/loop/reinjectToolResults.ts`).

### Delegation and orchestration modes

`delegate_to_agent` is a dynamically constructed tool (its `target_agent`
enum is rebuilt from the currently available agent roster every turn) that
suspends the calling agent's run and spins up a subordinate with its own
isolated history, tool allowlist, and step budget
(`src/main/orchestrator/subAgentRunContext.ts`). Delegation depth and
re-entrancy are bounded (`src/main/orchestrator/`) so a chain can't recurse
indefinitely or cycle back into an agent already active in it.

Beyond ad hoc delegation, `src/main/orchestrator/` implements four
higher-level modes behind one `OrchestrationMode` interface
(`plan`/`execute`/`summarize`):

- **Chain** — sequential pipeline; each stage's output feeds the next.
- **Parallel** — the same task dispatched to several agents concurrently,
  independently isolated, with a scoring stage selecting the winning result.
- **Review/critique duo** — a producer and a critic iterate until the critic
  approves or the round cap is reached.
- **Swarm** — role-based agents (project manager, architect, developer,
  devops) sharing one transcript, turn-taking until consensus, a round cap,
  or stall detection ends it.

### Concurrency safety

Multiple agents editing a shared workspace go through one centralized lock
manager (`src/main/locks/`): every write-capable tool acquires an exclusive,
path-keyed lock before touching disk and releases it in a `finally` block —
on completion, abort, or an owning process crash. A blocked agent gets a
descriptive contention error naming the holder rather than corrupting state;
a fair FIFO wait queue with a wait-for-graph cycle check prevents deadlock.

Drift detection (`src/main/drift/`) snapshots the workspace at the start of a
multi-agent run and periodically diffs the live filesystem against that
baseline, surfacing a scored divergence signal per file with Accept/Revert
actions in the UI.

### Memory

`src/main/memory/` is a per-workspace knowledge graph in the same SQLite
database as everything else: `kg_nodes` (files, symbols, durable
agent-authored findings), `kg_edges` (defines/imports/references
relationships), `kg_chunks` (indexed text spans), and `kg_embeddings` (one
vector per chunk per provider). Retrieval fuses FTS5 keyword search and
cosine-similarity vector search via weighted reciprocal rank fusion, then
expands the result one to two hops across the graph so a matched symbol
pulls in its definition and dependents. A debounced filesystem watcher keeps
the index current incrementally; `search_memory` exposes the same retrieval
path to agents as a tool, and per-turn context injection uses it to seed the
system prompt under a token budget, deduplicated against what the run has
already read.

### External tools: ACP and MCP

- **ACP** (`src/main/acp/`) — JSON-RPC 2.0 over stdio or HTTP to a peer
  agent process (Codex CLI, Gemini CLI, Copilot CLI, or another Claude
  agent). A supervisor tracks health and restarts a crashed connector with
  capped exponential backoff.
- **MCP** (`src/main/mcp/`) — the same stdio/HTTP transport duality, but for
  tool/resource/prompt *servers* rather than peer agents. Discovered tools
  are namespaced (`mcp__<serverId>__<toolName>`) so a server can never shadow
  a built-in capability, adapted into the internal `Tool` interface with a
  Zod schema derived from their declared JSON Schema, cached with a TTL to
  keep per-turn discovery cheap, and isolated per server — a hung or
  malformed server is logged and skipped rather than failing the turn.

## Security model

- **Hardened windows and CSP** — see Process segregation above; a strict
  `Content-Security-Policy` forbids remote script, inline eval, and connect
  targets outside the configured provider allowlist.
- **Credential vault** — provider API keys are encrypted at rest with
  Electron's `safeStorage` (OS keychain-backed) and never leave the main
  process in plaintext; the vault's IPC surface returns presence/metadata
  only, never a key (`src/main/security/`, `src/main/db` `settings` table).
- **Path sandbox** — every filesystem-touching tool resolves its path
  argument through `resolveWorkspacePath` (`src/main/tools/pathSandbox.ts`),
  which follows symlinks (including on ancestors of a not-yet-existing path)
  and rejects anything that resolves outside the workspace root.
- **Consent gate** — a tool's `defaultConsent` (`always`/`ask`/`never`)
  resolves through session override → user preference → the tool's own
  default, with `never` an inescapable floor no override can relax. `ask`
  suspends the run and prompts; a timeout defaults to declined.
- **No plaintext secrets in logs** — the shared logging pipeline
  (`src/main/logging/`) redacts secret-shaped values (API keys, bearer
  tokens, long hex/base64 blobs) before anything is written to disk or
  printed.

## Persistence

One SQLite database (WAL mode, foreign keys on) under `app.getPath('userData')`
holds everything durable: sessions/messages/tool calls, agent profiles, the
knowledge graph, MCP server configs, and per-tool outcome telemetry. Every
migration (`src/main/db/migrations/`) is forward-only and applied inside its
own transaction; `user_version` only advances once a migration's `up`
completes without throwing.

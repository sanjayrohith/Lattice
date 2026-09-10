# Lattice

<div align="center">

**A multi-agent desktop orchestration environment built on Electron**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)
![Electron](https://img.shields.io/badge/electron-44.0.0-47848F)

</div>

---

## Overview

Lattice is a secure, production-ready desktop application that orchestrates multiple AI coding agents against local workspaces. It bridges model providers (Anthropic, OpenAI, Google), external agent processes via the Agent Client Protocol (ACP), and extensible tool servers through the Model Context Protocol (MCP) — all unified under a hardened Electron architecture with persistent knowledge-graph memory.

## Motivation

Modern AI-assisted development demands more than single-agent workflows:

- **Complexity** — Real-world tasks benefit from specialized agents working together: architects designing systems, developers implementing features, reviewers validating quality
- **Interoperability** — Existing agent ecosystems (Claude Desktop, Codex CLI, Gemini CLI, Copilot CLI) operate in isolation without a unified orchestration layer
- **Safety** — Direct model SDK integration and external agent connections both need enterprise-grade sandboxing, credential management, and consent controls
- **Context** — Agents need persistent memory across sessions, not just ephemeral chat history

Lattice addresses these challenges with a desktop-first architecture that treats security, concurrency, and extensibility as first-class concerns.

## Goals & Implementation

### 1. **Multi-Agent Orchestration**
**Goal:** Enable multiple agents to collaborate on complex tasks through delegation, parallel execution, review cycles, and role-based workflows.

**Implementation:**
- **Four orchestration modes** (`src/main/orchestrator/`):
  - *Chain* — Sequential pipeline where each stage feeds the next
  - *Parallel* — Same task distributed to multiple agents with scoring-based selection
  - *Review/Critique* — Producer-critic iteration until approval
  - *Swarm* — Role-based agents (PM, architect, developer, DevOps) collaborating on shared context
- **Dynamic delegation** via `delegate_to_agent` tool with bounded depth and cycle prevention
- **Concurrency-safe execution** through centralized lock manager with fair FIFO queuing and deadlock detection

### 2. **Unified Agent Protocol Support**
**Goal:** Support both direct model SDK calls and external agent processes (ACP) through a single abstraction.

**Implementation:**
- **Backend abstraction** (`src/main/agents/AgentBackend`) treats SDK models and ACP connectors identically
- **ACP integration** (`src/main/acp/`) supports JSON-RPC 2.0 over stdio/HTTP with automatic health monitoring and crash recovery
- **Agent profiles** configure backend, system prompt, tool allowlist, and orchestration role independently of runtime

### 3. **Extensible Tool Ecosystem (MCP)**
**Goal:** Allow agents to access custom tools and resources without modifying core code.

**Implementation:**
- **MCP server management** (`src/main/mcp/`) with stdio/HTTP transport
- **Namespaced tool discovery** (`mcp__<serverId>__<toolName>`) prevents conflicts with built-in tools
- **Schema adaptation** from JSON Schema to Zod with automatic validation
- **Fault isolation** — crashed or malformed servers are logged and skipped, not fatal

### 4. **Enterprise-Grade Security**
**Goal:** Protect credentials, sandbox filesystem access, and enforce consent boundaries.

**Implementation:**
- **Process isolation** — Chromium renderer sandboxed with `contextIsolation`, `nodeIntegration: false`, strict CSP
- **Credential vault** (`src/main/security/`) encrypts API keys at rest via OS keychain (`safeStorage`)
- **Path sandbox** (`src/main/tools/pathSandbox.ts`) rejects all filesystem operations outside workspace root
- **Consent gate** (`src/main/consent/`) with per-tool policies (`always`/`ask`/`never`) and session overrides
- **Log redaction** strips secrets (API keys, tokens, base64 blobs) before persistence

### 5. **Persistent Knowledge Graph**
**Goal:** Give agents long-term memory across sessions with semantic search and relationship traversal.

**Implementation:**
- **SQLite-backed knowledge graph** (`src/main/memory/`) with nodes (files, symbols, findings), edges (imports, defines, references), and vector embeddings
- **Hybrid retrieval** fuses FTS5 keyword search and cosine-similarity vector search via reciprocal rank fusion
- **Incremental indexing** via debounced filesystem watcher keeps graph current without full re-indexing
- **Context injection** seeds agent prompts with retrieved relevant chunks under token budget

### 6. **Type-Safe IPC Contract**
**Goal:** Eliminate IPC vulnerabilities from malformed or malicious renderer payloads.

**Implementation:**
- **Zod-validated channels** (`src/shared/ipc/`) with compile-time name registry, request/response schemas
- **Structured error envelopes** (`{ ok: true, data } | { ok: false, error }`) replace raw exception propagation
- **Broadcast validation** drops malformed main → renderer events silently
- **Single-writer state** with monotonic revision IDs prevents stale updates

## Key Features

✅ **Multi-backend support** — Anthropic Claude, OpenAI GPT, Google Gemini via SDK; external agents via ACP  
✅ **Four orchestration patterns** — Chain, parallel, review/critique, swarm  
✅ **MCP tool servers** — Extend agent capabilities without core modifications  
✅ **Concurrency-safe workspace** — Path-keyed locks prevent race conditions across agents  
✅ **Drift detection** — Track unintended workspace changes during multi-agent runs  
✅ **Persistent memory** — Knowledge graph with hybrid semantic search  
✅ **Enterprise security** — Sandboxed renderer, encrypted credentials, consent gating  
✅ **Auto-update** — `electron-updater` with in-app restart prompt  
✅ **Cross-platform** — Linux, macOS, Windows with native packaging

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (Sandboxed Chromium)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Chat UI    │  │  Agent Panel │  │ Memory Panel │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │ IPC (Zod)       │                  │              │
└─────────┼─────────────────┼──────────────────┼──────────────┘
          │                 │                  │
┌─────────▼─────────────────▼──────────────────▼──────────────┐
│  Main Process (Node.js, full system access)                 │
│                                                              │
│  ┌──────────────────┐      ┌─────────────────────────────┐ │
│  │  Orchestrator    │◄────►│  Agent Loop (State Machine) │ │
│  │  (Chain/Parallel)│      │  streaming → tool → consent │ │
│  └────────┬─────────┘      └─────────┬───────────────────┘ │
│           │                          │                      │
│  ┌────────▼──────────┐    ┌──────────▼─────────────────┐   │
│  │  Agent Backend    │    │   Tool Registry            │   │
│  │  ├─ SDK (Claude)  │    │   ├─ Built-in (fs, git)   │   │
│  │  └─ ACP (stdio)   │    │   └─ MCP (namespaced)     │   │
│  └───────────────────┘    └────────────────────────────┘   │
│                                                              │
│  ┌───────────────────┐    ┌────────────────────────────┐   │
│  │  Memory (SQLite)  │    │  Security                  │   │
│  │  ├─ KG nodes      │    │  ├─ Credential vault       │   │
│  │  ├─ KG edges      │    │  ├─ Path sandbox           │   │
│  │  └─ Embeddings    │    │  └─ Consent gate           │   │
│  └───────────────────┘    └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

For deep technical details, see [`ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quick Start

### Prerequisites

- Node.js ≥ 20.0.0
- npm (or equivalent)
- On Linux: `build-essential` for native module compilation

### Installation & Development

```bash
# Install dependencies and rebuild native modules for Electron
npm install

# Start development server with HMR
npm run dev
```

### Configuration

1. **Provider Credentials** — Open Provider Credentials panel, add API keys for Anthropic/OpenAI/Google
2. **Agent Profiles** — Create agents with SDK backends or ACP connectors
3. **MCP Servers (optional)** — Add tool servers in MCP Server Manager
4. **Workspace** — Select a local directory to index and orchestrate against

See [`OPERATOR_GUIDE.md`](docs/OPERATOR_GUIDE.md) for detailed setup instructions.

### Build & Package

```bash
# Run tests and linting
npm run lint
npm run typecheck
npm run test
npm run audit:security

# Package for your platform
npm run package

# Cross-platform packaging
npm run package:mac
npm run package:win
npm run package:linux
```

## Project Structure

```
lattice/
├── src/
│   ├── main/           # Main process (Node.js)
│   │   ├── orchestrator/   # Multi-agent coordination
│   │   ├── agents/         # Backend abstraction (SDK/ACP)
│   │   ├── acp/            # Agent Client Protocol connectors
│   │   ├── mcp/            # Model Context Protocol servers
│   │   ├── loop/           # Agent run state machine
│   │   ├── memory/         # Knowledge graph & retrieval
│   │   ├── tools/          # Tool registry & execution
│   │   ├── security/       # Credentials, sandbox, consent
│   │   ├── ipc/            # Zod-validated IPC handlers
│   │   └── db/             # SQLite schema & migrations
│   ├── preload/        # Context bridge (IPC exposure)
│   ├── renderer/       # UI (React, sandboxed)
│   └── shared/         # Types, state, IPC contracts
├── docs/               # Architecture & operator guides
└── scripts/            # Security audit tooling
```

## Technology Stack

**Core Framework:** Electron 44, Node.js 20+, TypeScript 5  
**UI:** React 18, Zustand (state), Dockview (panels)  
**AI SDKs:** Vercel AI SDK (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`)  
**Protocols:** MCP SDK (`@modelcontextprotocol/sdk`)  
**Database:** better-sqlite3 (WAL mode)  
**Validation:** Zod schemas for IPC, tool arguments, config  
**Testing:** Vitest, ESLint, Prettier, Electronegativity  
**Build:** electron-vite, electron-builder, GitHub Actions CI

## Security Practices

- **No remote code** — Strict CSP prevents inline scripts and remote resources
- **Sandboxed renderer** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **Encrypted credentials** — OS keychain-backed via `safeStorage`
- **Path validation** — All filesystem operations restricted to workspace root
- **Consent enforcement** — Per-tool policies with `never` as unoverridable floor
- **Secret redaction** — Logs strip API keys, tokens, and base64 blobs

Audited via `npm audit` + Electronegativity configuration scan.

## Documentation

- **[Architecture Reference](docs/ARCHITECTURE.md)** — Process model, orchestration topology, security model
- **[Operator Guide](docs/OPERATOR_GUIDE.md)** — Setup, configuration, packaging, auto-update

## Contributing

Contributions are welcome. Please:

1. Follow existing code style (ESLint + Prettier configured)
2. Add Zod schemas for new IPC channels or tool arguments
3. Run `npm run typecheck` and `npm test` before submitting
4. Update relevant docs if changing architecture or operator-facing behavior

## License

MIT © sanjayrohith

---

<div align="center">
Built with ❤️ for the AI-assisted development community
</div>

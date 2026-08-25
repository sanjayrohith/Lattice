# Lattice — Operator Setup Guide

Practical setup and operation instructions. For how the application is put
together, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Prerequisites

- Node.js 20 or later (`engines.node` in `package.json`).
- npm (the repository ships a `package-lock.json`).
- On Linux, the usual native-module build toolchain (`build-essential` or
  equivalent) for `better-sqlite3`'s native addon.

## First run

```bash
npm install       # also rebuilds native modules for Electron's ABI (postinstall)
npm run dev        # electron-vite dev — renderer HMR, main process restarts on change
```

`npm run dev` opens the app pointed at the Vite dev server. Nothing else is
required to start: the SQLite database, migrations, and default preferences
are created automatically under Electron's per-OS `userData` directory on
first launch.

## Configuring model providers

Open the Provider Credentials panel and paste a key for whichever
provider(s) you intend to use (Anthropic, OpenAI, Google). Keys are
encrypted at rest via `safeStorage` and never displayed again once saved —
the panel only ever shows a configured/not-configured indicator, plus a
delete action. A model call for a provider with no stored key fails fast
with a typed `MISSING_CREDENTIAL` error rather than silently falling back to
another provider.

## Configuring agents

The Agent Roster panel creates, edits, duplicates, and deletes agent
profiles: display name, backend (a direct SDK model config, or an ACP
connector reference), system prompt, tool allowlist, step budget, and
orchestration role. At least one agent with a working backend is required
before starting a run.

## Configuring ACP connectors (optional)

If you want to delegate to an external coding agent (Codex CLI, Gemini CLI,
Copilot CLI, or another Claude agent) rather than only calling a model SDK
directly, add it as an ACP connector in the ACP Connectors panel: stdio
(command, args, env) or HTTP (url, headers). "Test connection" spawns/
connects it once and reports whether it came up; live health (starting /
running / restarting / unavailable / stopped) is shown for every configured
connector thereafter.

## Configuring MCP servers (optional)

The MCP Server Manager panel adds, enables, disables, and removes MCP
servers (the same stdio/HTTP transport shapes as ACP connectors, but for
tool/resource servers rather than peer agents). "Inspect" lists a connected
server's discovered tools and resources; each tool can be given a per-tool
consent override (`always`/`ask`/`never`) so a trusted server's tools don't
prompt on every call.

## Memory / indexing

The workspace is indexed into the knowledge graph automatically once an
embedding provider is configured — a local dependency-free hashing provider
works out of the box with no setup; a remote provider (for higher-quality
embeddings) can be configured with an endpoint, API key, and model name. The
Memory Inspector panel runs manual hybrid searches, previews a matched
chunk, and offers a "Full Reindex" button to force a complete re-index if
the incremental watcher is ever suspected stale.

## Running the test suite

```bash
npm run lint         # eslint
npm run typecheck    # tsc --noEmit across main/preload/renderer
npm run test          # vitest run
npm run audit:security  # npm audit + Electronegativity configuration scan
```

CI (`.github/workflows/`) runs all of the above on push and pull request
across Linux, macOS, and Windows.

## Packaging

```bash
npm run package        # build + package for the host platform
npm run package:mac    # force a macOS build
npm run package:win    # force a Windows build
npm run package:linux  # force a Linux build
```

Configuration lives in `electron-builder.yml`: ASAR packaging with
`better-sqlite3`'s native addon unpacked (a native addon cannot load from
inside an asar archive), and a reproducible artifact name
(`${productName}-${version}-${platform}-${arch}.${ext}`) with no
build-machine-specific or timestamp-derived component.

### Code signing

Signing picks up the identity from the standard `CSC_LINK` /
`CSC_KEY_PASSWORD` environment variables on both mac and Windows (or
`CSC_IDENTITY_AUTO_DISCOVERY` on a Windows machine with a certificate
already installed). Unset, `npm run package` still succeeds — the artifact
is simply unsigned, which is expected for a local dev build.

### macOS notarization

Set all three of:

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```

`build/notarize.cjs` (electron-builder's `afterSign` hook) submits the
signed `.app` for notarization via `@electron/notarize` when all three are
present, and logs why it's skipping — without failing the build — when any
are missing.

### Auto-update

`electron-updater` checks `publish.url` in `electron-builder.yml` (a generic
provider, driven by the `PUBLISH_URL` environment variable at build time —
point it at wherever release artifacts and the update feed are actually
hosted before shipping). The update check, download, and in-app "restart to
update" prompt are all gated behind the `autoUpdateEnabled` preference
(on by default) — turning it off makes every update operation a no-op.

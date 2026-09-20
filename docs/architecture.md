# Tethys — Architecture & Technical Design

| Field | Value |
|---|---|
| Status | Draft v0.2 (tech stack, repo layout, ACP v2, Zed learnings) |
| Date | 16 September 2026 |
| Companion docs | [prd.md](./prd.md) · [milestone.md](./milestone.md) |

This document explains **how** Tethys meets the PRD. Requirement IDs (e.g. `WT‑03`) refer to the PRD. Architecture decisions are tracked as **AD‑n** (§15). Items marked **(verify)** must be rechecked at implementation time: crate names, versions, and draft‑protocol details move quickly.

---

## 1. Principles

1. **Library first.** All logic lives in Rust crates that know nothing about Tauri. Tauri is a thin host; a headless daemon (`tethysd`) reuses the same crates.
2. **One API, two transports.** Tauri IPC in‑process; JSON‑RPC over WebSocket remotely. Same method names, same generated types.
3. **Rust owns side effects.** Processes, files, git, terminals, network, secrets.
4. **The webview renders only.** It never receives more data than it can show.
5. **One internal event model.** Every agent, whatever protocol version it speaks, is normalized into the same append‑only, upsert‑style event log (§7.3).
6. **Protocol versions are adapters, not forks.** ACP v1 and v2 are supported side by side behind one internal interface.
7. **Tethys is a control plane, not a git or forge client.** It orchestrates agents over folders. Git is one capability a folder may have (§10.6), and the UI reads a resolved capability set instead of assuming it. Forge interaction is delegated to the user's own installed `gh` / `glab`: Tethys reads a remote's status for display and never authenticates to, clones from, or browses a forge.
8. **Address by id, resolve in Rust.** A method that reads or writes the filesystem takes a `WorkspaceId` or `ThreadId`, never a path. Core resolves the root from the workspace table, which holds only folders that were added and trusted (TRU‑01). A path may appear in a request only as a *source* the user chose (a skill folder or archive) or in `workspace.add`, which is the trust flow itself.

### 1.1 Vocabulary

One name per concept, from the database column to the button. The product terms are the ACP three-tier model in [pages-views-spec.md](./pages-views-spec.md) §0.

| Concept | Product / UI term | Schema · API · store | Notes |
|---|---|---|---|
| A folder Tethys runs agents in | **Workspace** | `Workspace`, `WorkspaceId`, `workspace.*`, `workspaces` table, `workspace_id` | Formerly `project` / `projects`; retired. `<workspace>` in paths |
| One ACP connection | **Provider** | `AgentProfile`, `agent.*`, `ConnectionEntry` | Kept: ACP's own word for it is "agent". UI copy says Provider |
| One ACP conversation | **Session** | `Thread` wraps one `session_id`; `thread.*` | Kept: a Thread is Tethys's wrapper. Hub, tabs and columns say Session |
| Registry and config scope | global · **workspace** | `Scope::{Global, Workspace}` | Formerly `Project` |
| A vendor config file surface | *file projection* | `ProjectionTarget` (`claude-code`, `codex`, `opencode`, …) | Files only. The session handoff is not a target |
| Which Providers receive a server | Provider columns in the MCP grid | `x-tethys.providers` (profile ids; omitted = all) | Replaces `x-tethys.targets` |

---

## 2. Tech Stack at a Glance

| Layer | Choice | Why |
|---|---|---|
| Monorepo orchestration | **Turborepo** + **pnpm** workspaces | Caches and orders JS tasks (codegen → packages → app); one command to run everything |
| Rust workspace | **Cargo** workspace | Cargo already does incremental Rust builds well; Turborepo calls into it but does not replace it |
| Desktop engine | **Tauri v2** | Native window, system webview, typed IPC, capability‑based permissions, updater, small bundles |
| Backend core | **Rust** on **tokio** | Many agent subprocesses, git I/O, and file watching concurrently, with no GC pauses |
| Agent protocol | **ACP** via the official **`agent-client-protocol`** crate (1.x); **v1 stable + v2 draft** | Official SDK (Rust and TS SDKs reached 1.0 in June 2026); v2 is still labelled draft, so both versions are supported (§7) |
| Tool protocol | **MCP** via **`rmcp`** | Health checks for configured servers; optional Tethys‑hosted MCP server (§7.7) |
| File search | **FFF** (`fff-search` crate, verify name) | Rust‑native, frecency‑ranked, git‑aware file and folder search for `@` tags |
| Git | **git CLI** for writes, **gitoxide (`gix`)** for reads | Exact user config and hooks on writes; fast in‑process reads |
| Persistence | **SQLite** (`rusqlite`, bundled) + content‑addressed blob store | Single file, reliable, fast append‑only event log |
| Frontend | **React 19** + **TypeScript** + **Vite** | Largest ecosystem for diff, terminal, and virtualization components |
| Frontend libraries | **TanStack** Router, Query, Virtual, Store, Form, Table, Pacer | One coherent, type‑safe family covering routing, server state, lists, streaming state, forms, grids, throttling |
| Styling / components | **Tailwind CSS v4** + **shadcn/ui** (BaseUI primitives) | Accessible primitives, owned component code |
| Terminal rendering | **xterm.js** (`@xterm/xterm`) | Class C terminals and ACP display terminals |
| Type bridge | **specta** + **tauri‑specta** | TypeScript types and command bindings generated from Rust |
| Quality | **Biome** (lint/format), **Vitest**, **Playwright** (UI in browser mode), `cargo nextest`, **insta** snapshots | Fast, consistent tooling across both languages |

---

## 3. Repository Layout

```
tethys/
├─ apps/
│  └─ desktop/                      # Tauri v2 application
│     ├─ src/                       # React entry: router, providers, app shell
│     │  ├─ routes/                 # TanStack Router file-based routes
│     │  └─ main.tsx
│     ├─ src-tauri/                 # crate: tethys-desktop (thin host)
│     │  ├─ src/{main.rs,commands.rs,channels.rs}
│     │  ├─ capabilities/           # Tauri permission files
│     │  └─ tauri.conf.json
│     ├─ index.html · vite.config.ts · package.json
│
├─ packages/                        # TypeScript workspace packages
│  ├─ bindings/        @tethys/bindings    # GENERATED by specta (do not edit)
│  │  ├─ src/index.ts          # hand-written re-export (stable import path)
│  │  └─ src/generated/        # specta output (`bindings.ts`) — do not edit
│  ├─ client/          @tethys/client      # transport-agnostic API client (Tauri | WebSocket)
│  ├─ state/           @tethys/state       # TanStack Store stores for live thread streams
│  ├─ ui/              @tethys/ui          # design system: shadcn components, tokens
│  ├─ features/        @tethys/features    # screens: explorer, threads, inspector, sync, settings
│  ├─ composer/        @tethys/composer    # / $ @ editor, chips, popups
│  ├─ diff/            @tethys/diff        # git-patch parser, virtualized diff view, highlight worker
│  ├─ markdown/        @tethys/markdown    # incremental markdown rendering (worker)
│  ├─ terminal/        @tethys/terminal    # xterm.js wrappers (interactive + display-only)
│  └─ config/          @tethys/config-{ts,biome,tailwind}
│
├─ crates/                          # Rust workspace members
│  ├─ tethys-schema/                # shared types + specta export
│  ├─ tethys-api/                   # service trait, method routing, subscriptions
│  ├─ tethys-core/                  # orchestrator: workspaces, threads, policies, event log
│  ├─ tethys-thread/                # AgentConnection trait + Thread state machine
│  ├─ tethys-acp/                   # ACP v1/v2 negotiation + normalization into events
│  ├─ tethys-agent-servers/         # launch specs, registry, ConnectionStore (leases)
│  ├─ tethys-supervisor/            # process groups / job objects, cancel ladder, sampling
│  ├─ tethys-pty/                   # interactive PTYs (Class C)
│  ├─ tethys-git/                   # worktrees, checkpoints, diff engine, watcher
│  ├─ tethys-sync/                  # MCP registry, skills, config projectors
│  ├─ tethys-search/                # per-worktree FFF index manager
│  ├─ tethys-store/                 # SQLite + blobs + migrations
│  ├─ tethys-mcp/                   # optional Tethys-hosted MCP server (rmcp)
│  ├─ tethysd/                      # headless daemon binary (WebSocket API)
│  └─ xtask/                        # codegen, fixture recording, release helpers
│
├─ fixtures/acp/{v1,v2}/            # recorded JSON-RPC transcripts for conformance tests
├─ fixtures/projectors/             # golden config files per target
├─ docs/                            # PRD, ARCHITECTURE, ROADMAP, ADRs
├─ Cargo.toml                       # [workspace] members = ["crates/*", "apps/desktop/src-tauri"]
├─ package.json · pnpm-workspace.yaml · turbo.json · biome.json
└─ rust-toolchain.toml
```

**Dependency direction.** `features` → `composer`/`diff`/`markdown`/`terminal`/`ui` → `state` → `client` → `bindings`. On the Rust side: hosts (`tethys-desktop`, `tethysd`) → `tethys-api` → `tethys-core` → domain crates → `tethys-schema`. Domain crates never depend on Tauri.

### 3.1 Turborepo pipeline

Turborepo runs JavaScript tasks and the one Rust step the frontend depends on: type generation.

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "codegen": {
      "inputs": ["$TURBO_ROOT$/crates/tethys-schema/**", "$TURBO_ROOT$/crates/tethys-api/**"],
      "outputs": ["src/generated/**"]
    },
    "build":     { "dependsOn": ["^build", "codegen"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build", "codegen"] },
    "lint":      {},
    "test":      { "dependsOn": ["^build"] },
    "dev":       { "dependsOn": ["codegen"], "cache": false, "persistent": true },
    "//#cargo:check": { "cache": false },
    "//#cargo:test":  { "cache": false }
  }
}
```

- `codegen` runs `cargo xtask bindings`, which exports specta types into `@tethys/bindings` at `packages/bindings/src/generated/bindings.ts` (re-exported from `src/index.ts`). It is cached on Rust schema inputs, so frontend work doesn't rebuild Rust unnecessarily.
- `apps/desktop` `dev` runs `tauri dev`, which starts Vite and builds the host crate.
- Rust build caching is left to Cargo (optionally `sccache` in CI). Root‑level `cargo:*` tasks exist so `turbo run check test` covers both languages.
- CI matrix: macOS, Windows, Linux, each running `turbo run lint typecheck test cargo:check cargo:test`, then Tauri bundling on release tags.

---

## 4. Rust Dependencies

Versions are indicative; pin exact versions in `Cargo.toml` and verify at setup.

| Area | Crates | Used for |
|---|---|---|
| Desktop host | `tauri` 2, `tauri-build`, `tauri-specta`, `specta`, `specta-typescript` | App shell, typed commands and events |
| Tauri plugins | `tauri-plugin-dialog`, `-notification`, `-opener`, `-updater`, `-window-state`, `-single-instance`, `-log`, `-clipboard-manager`, `-process` | Pickers, OS notifications, open in editor, updates, window state, single instance, logs |
| Async runtime | `tokio` (full), `tokio-util` (codecs, `CancellationToken`), `futures`, `async-trait` | Concurrency, framing, cancellation |
| Agent protocol | `agent-client-protocol` 1.x (verify v2 feature flags) | ACP client side |
| MCP | `rmcp` (client + server features) | Server health checks; `tethys-mcp` |
| Serialization | `serde`, `serde_json`, `serde_with` | Wire types; three‑state patch fields (§7.3) |
| Config editing | `toml_edit`, `jsonc-parser` (CST feature, verify) | Format‑preserving edits of vendor configs |
| Schema | `schemars`, `jsonschema` (verify) | JSON Schema for `mcp.json` and community-contributed agent config schemas (SYN‑11); editor autocompletion + pre-apply validation |
| Processes | `process-wrap` (process groups on Unix, Job Objects on Windows, verify), `sysinfo`, `which`, `shell-words` | Spawning agents, killing whole trees, resource sampling |
| Terminals | `portable-pty`, `vte` (optional, for sanitized transcripts) | Interactive PTYs; safe text from display terminals |
| Git | `gix` (reads), `imara-diff` (diffing) | Status, trees, blobs, hunks |
| File watching | `notify`, `notify-debouncer-full` | Change detection per worktree |
| Search | `fff-search` (verify crate name) | `@` tags |
| Filesystem | `ignore`, `globset`, `dunce`, `tempfile`, `fs-err` | Gitignore‑aware walks, globs, Windows‑safe canonical paths |
| Storage | `rusqlite` (bundled), `rusqlite_migration`, `tokio-rusqlite` | Event log and metadata |
| Hashing / IDs | `blake3`, `uuid` (v7), `jiff` | Blob addresses, sortable IDs, timestamps |
| Secrets | `keyring` | OS keychain for MCP server secrets |
| Network | `reqwest` (rustls), `url` | ACP Registry, GitHub skill import |
| Archives | `zip`, `flate2`, `tar` | `.skill` files, GitHub tarballs |
| Daemon | `axum` (ws feature), `tower`, `tower-http`, `rustls` | `tethysd` WebSocket and blob endpoints |
| Errors / logs | `thiserror`, `anyhow` (binaries only), `tracing`, `tracing-subscriber`, `tracing-appender` | Structured errors and logs |
| Paths | `etcetera` or `directories` | OS‑correct config/data dirs |
| Versions | `semver` | Registry and protocol version handling |
| Testing | `insta`, `proptest`, `assert_fs`, `wiremock`, `cargo-nextest` | Snapshots, fuzzing patch semantics, fs tests, HTTP mocks |

---

## 5. Frontend Stack

### 5.1 TanStack roles

| Library | Role in Tethys |
|---|---|
| **TanStack Router** | File‑based, type‑safe routes (`/workspaces`, `/thread/$threadId`), search‑param state (diff mode, filters), hash history for the Tauri webview |
| **TanStack Query** | All request/response data: workspaces, profiles, thread lists, diff summaries, hunks, sync plans. Query functions call generated Tauri commands. Server‑pushed events invalidate or patch cache entries |
| **TanStack Store** | Live, high‑frequency thread state (messages, tool calls, plans, terminals). Kept out of the Query cache so streaming doesn't trigger broad re‑renders; components subscribe with narrow selectors |
| **TanStack Virtual** | Turn timeline, thread lists, diff lines, `@` results |
| **TanStack Pacer** | Throttling stream flushes to animation frames; debouncing search and watchers (verify API) |
| **TanStack Form** | Agent profile editor, MCP server editor, agent native-settings forms (SYN‑11, schema-driven), settings |
| **TanStack Table** | MCP/skill sync matrix, activity panel, audit log |
| **TanStack Devtools** | Router and Query inspection in dev builds |

TanStack DB is a candidate for client‑side collections once stable; not required for MVP (AD‑11).

### 5.2 Other frontend libraries

| Need | Choice | Notes |
|---|---|---|
| Components | shadcn/ui + Radix, Tailwind v4, **Geist Icons** | Owned code, accessible primitives. Icon set is Geist only — never `lucide-react` or any other set (DESIGN §Iconography, decided) |
| Command palette | `cmdk` | ⌘K / Ctrl+K |
| Composer editor | TipTap (ProseMirror) or Lexical, with mention‑style chips | AD‑9 |
| Diff rendering | Custom virtualized renderer over parsed git patches; CodeMirror 6 merge view for single‑file deep dives | AD‑10 |
| Syntax highlighting | Shiki in a Web Worker | Output cached by blob hash |
| Markdown | Incremental markdown renderer in a worker (evaluate `streamdown` vs `react-markdown` + remark‑gfm) | Must tolerate unterminated blocks while streaming |
| Terminal | `@xterm/xterm` + fit and web‑links addons | Interactive (Class C) and read‑only (ACP display terminals) |
| Resizable layout | `react-resizable-panels` | Four‑region layout |
| ACP UI components | `@acp-components/*`: evaluated 2026‑09‑18, **rejected as runtime deps — reference only** | Its stores run off a JS-side ACP client (bypasses the Rust core, event log, and policy engine); Ant Design icons break the Geist-only rule; LoginDialog lacks URL+code; PermissionPrompt isn't options-driven; session grouping contradicts §0 model. Revisit post‑V1 only if a headless, store-free version ships (M1.6 plan D9) |

### 5.3 Data flow in the webview

```
Tauri command ──▶ TanStack Query cache ──▶ screens
Tauri Channel (thread events, seq) ──▶ rAF-batched reducer ──▶ TanStack Store (per thread)
                                                    └──▶ Query invalidation for summaries (diff stats, state badges)
Large payloads ──▶ tethys://blob/<hash> fetch ──▶ worker (highlight / markdown) ──▶ view
```

`@tethys/client` hides the transport: the same hooks work against the in‑process core (Tauri) or a remote `tethysd` (WebSocket).

---

## 6. Rust Core Architecture

### 6.1 Layering (informed by Zed)

Zed separates external‑agent support into three layers: `agent_servers` launches processes and implements the connection; `acp_thread` defines an `AgentConnection` trait and an `AcpThread` entity that holds UI‑facing conversation state; `agent_ui` owns a connection store and the panel. Zed's native agent implements the same trait, so both paths converge on one thread type. Tethys adopts the same shape:

| Zed | Tethys | Responsibility |
|---|---|---|
| `agent_servers` (`AcpConnection`) | `tethys-agent-servers` + `tethys-acp` | Launch, handshake, version negotiation, normalization |
| `acp_thread` (`AgentConnection`, `AcpThread`) | `tethys-thread` | Transport‑independent connection trait; per‑thread state machine and entries |
| `agent_ui` (`AgentConnectionStore`) | `tethys-agent-servers` (`ConnectionStore`) | Connection lifetimes, reconnects, reaping |

```rust
#[async_trait]
pub trait AgentConnection: Send + Sync {
    fn info(&self) -> &AgentInfo;
    fn capabilities(&self) -> &NormalizedCapabilities;
    async fn new_session(&self, req: NewSession) -> Result<SessionHandle>;
    async fn resume_session(&self, req: ResumeSession) -> Result<SessionHandle>;   // v1 load/resume, v2 resume(+replay)
    async fn list_sessions(&self, cwd: &Path) -> Result<Vec<SessionSummary>>;
    async fn close_session(&self, id: &SessionId) -> Result<()>;
    async fn prompt(&self, id: &SessionId, blocks: Vec<PromptBlock>) -> Result<()>; // returns on acceptance
    async fn cancel(&self, id: &SessionId) -> Result<()>;
    async fn set_config_option(&self, id: &SessionId, config_id: &str, value: ConfigValue) -> Result<Vec<ConfigOption>>;
    async fn login(&self, method_id: &str) -> Result<()>;
    fn events(&self, id: &SessionId) -> EventStream;                               // normalized TurnEvents
    // Optional capability sub-traits, in the style of Zed's model_selector():
    fn session_deleter(&self) -> Option<&dyn SessionDeleter> { None }
}
```

Class C (terminal host) implements a reduced `WorkspaceOnlyConnection`, not `AgentConnection`, so the UI can never assume protocol features for it.

### 6.2 Lessons from Zed's implementation

| Observation | Tethys design response |
|---|---|
| `session/close` is session‑scoped and does not stop the agent process. In Zed the process exits only when the last connection handle drops and the whole process group is killed; the child is started in its own session so its PID equals its process‑group ID. | Every agent starts in a new process group (Unix) or Job Object (Windows). Closing the last session does not kill the process by itself; the ConnectionStore decides. |
| Zed's store held connections for the window's lifetime, leaving idle agent bridges and their children resident (one report: about 1.25 GB). The open fix uses **leases** with **two‑phase reaping** (30 s grace) and evicts idle retained threads after 10 minutes, but only if they can be reloaded. | `ConnectionStore` hands out `ConnectionLease`s. Unused connections are reaped after a grace period; idle threads are suspended only when the agent supports resume. Both timeouts are settings. |
| Reconnects replace the entry under live holders; a fresh lease token made the new entry look unused. | Leases are tied to the logical entry (profile + host), not the process instance, and survive restarts. |
| A reported case where the panel kept a dead connection and never respawned it. | Transport close moves the entry to `Error`; the next lease request respawns with backoff. The UI always offers "Restart agent". |
| In a downstream Zed fork, two concurrent `new_session` calls on one connection made an adapter start duplicate children. | Session lifecycle calls (`new`, `resume`, `close`) are serialized per connection (single‑flight queue). |
| The same fork found an adapter wedged after a mid‑stream cancel and recovered by force‑closing the session and resuming from the agent's transcript. | Recovery ladder: cancel → force close → resume with replay → restart process → mark Interrupted. |
| Adapters may start MCP server processes per session; archived sessions kept them alive (Zed issue #56747). | Archive and suspend always close the session; resource sampling covers the whole process tree. |
| Optional features are exposed as capability sub‑traits rather than one large interface. | Same pattern; the UI queries capabilities, not agent names. |

### 6.3 Runtime and threading

- One multi‑threaded tokio runtime in the core.
- Each agent connection runs its reader, writer, and dispatcher tasks under one `CancellationToken`.
- **SDK threading (verify).** A third‑party wrapper of the pre‑1.0 SDK describes a local, `!Send` task model. If the 1.x connection futures are still `!Send`, each connection runs on a dedicated thread with a current‑thread runtime and `LocalSet`, bridged to the core with channels. This is contained inside `tethys-acp`.
- The Tauri host only forwards commands to `tethys-api` and pumps events into Channels. It holds no domain state.

---

## 7. ACP Integration (v1 + v2)

### 7.1 Version strategy (AD‑8)

ACP v2 is published as a draft. Its migration guide tells implementers to keep v1 working, negotiate the version per connection, and put v2 behind feature flags until it stabilizes. Tethys therefore:

- Sends `protocolVersion: 2` only when the `acp-v2` flag is on; otherwise sends 1.
- Accepts whichever version the agent answers with and selects the matching adapter for that connection.
- Uses a **v2‑shaped internal model** for everything above `tethys-acp`. The v1 adapter translates v1 traffic into it. This keeps the UI and store on one model and makes eventual v1 removal a deletion, not a rewrite.

### 7.2 What changes in v2, and what it means for Tethys

| v2 change | Tethys impact |
|---|---|
| `session/prompt` response only acknowledges acceptance; progress and the stop reason arrive as `state_update` (`running`, `idle`, `requires_action`) | Thread state is driven only by `StateChanged` events. Prompt queueing (CMP‑05) maps directly onto this |
| Messages, tool calls, and plans are upserts by ID: omitted = unchanged, `null` = cleared, value = replaced, chunks append | `Patch<T>` type in Rust (§7.3); reducers in `@tethys/state` implement the same rules |
| Required `messageId` on all messages; `tool_call` removed (first `tool_call_update` creates) | Entry identity comes from the agent; the v1 adapter synthesizes IDs |
| Client `fs/*` and `terminal/*` methods removed; client‑side tools should be offered as MCP servers | No client file or terminal execution on v2 connections; optional `tethys-mcp` instead (§7.7) |
| Agent‑owned, display‑only terminals (`terminal_update` snapshots, base64 `terminal_output_chunk`s) | Read‑only xterm.js view; bytes decoded per chunk; snapshot replaces history |
| Structured diffs: `changes` list plus optional `git_patch` text | Diff UI consumes one format (git patch) for agent diffs and checkpoint diffs; the v1 adapter converts `oldText`/`newText` into a git patch |
| `session/load` removed; `session/resume` with `replayFrom: start` replays history | Resume after restart uses replay; the event log de‑duplicates by ID |
| `session/list` and `session/close` required when sessions are supported | "Import existing sessions" and reliable cleanup without capability probing |
| Session modes removed; modes, models, and thought level are config options with categories | Action Bar renders from `configOptions` by `category` (`mode`, `model`, `model_config`, `thought_level`) |
| Permission requests carry a required `title`, optional `description`, and a `tool_call` or `command` subject | Richer approval dialogs; policy rules can match on `command` + `cwd` |
| `authenticate` → `auth/login`; `auth/logout` required when auth methods exist | Login/logout buttons per profile; still delegated to the agent (AGT‑07) |
| MCP configs need a `type`; SSE removed; `stdio` support is an explicit capability | Session injection filters by `session.mcp.stdio` / `session.mcp.http` |
| Open enums everywhere; `_`‑prefixed values are extensions | Unknown variants preserved in the event log and rendered generically |
| JSON‑RPC batches allowed on stdio | Framing layer accepts arrays; lifecycle messages are never batched by Tethys |
| Remote transport (streamable HTTP / WebSocket) specified separately | Transport trait stays pluggable; remote agents remain Phase 3 |

**Provider extensions.** A Provider may send vendor-specific JSON-RPC notifications under a `_`-prefixed method — Kiro CLI's `_kiro.dev/mcp/oauth_request`, raised when an MCP server needs authentication, is the first concrete case. These are neither `session/request_permission` nor `elicitation/create`, so they are not transcript entries. The connection preserves them as a typed `ProviderExtension { method, params }` event (an append-only `TurnEventBody` variant), and the webview resolves them through `registerProviderSurface(providerId, method, surface)`, the fourth registry beside `registerEntryRenderer`, `registerInspectorSlot` and `registerActionBarSlot`. An extension with no registered surface is preserved in the event log and rendered generically, the same rule as any open enum above. A Provider integration therefore contributes a handler without editing shared code. `TurnEventBody::Unknown { raw }` is not this: it carries unrecognised `session/update` variants as a raw string with no method to key a surface by, and `tethys-acp` currently registers no handler for vendor notifications at all.

### 7.3 Normalized event model

```rust
/// Three-state field for v2 patch semantics.
pub enum Patch<T> { Unchanged, Clear, Set(T) }

pub enum TurnEventBody {
    StateChanged { state: SessionState /* Running | Idle{stop_reason} | RequiresAction */ },
    MessageUpsert { message_id: String, role: Role /* User | Agent | Thought */, content: Patch<Vec<ContentBlock>> },
    MessageChunk  { message_id: String, role: Role, block: ContentBlock },
    ToolCallUpsert { tool_call_id: String, patch: ToolCallPatch },
    ToolCallContentChunk { tool_call_id: String, item: ToolCallContent },
    TerminalUpsert { terminal_id: String, patch: TerminalPatch },       // snapshot bytes → blob
    TerminalOutputChunk { terminal_id: String, bytes: BlobRef },
    PlanUpsert { plan_id: String, plan: PlanContent },
    ConfigOptionsChanged { options: Vec<ConfigOption> },
    CommandsAvailable { commands: Vec<AgentCommand> },
    SessionInfo { title: Option<String>, .. },
    Usage { snapshot: UsageSnapshot },
    PermissionRequested { req_id: ReqId, title: String, description: Option<String>,
                          subject: Option<PermissionSubject>, options: Vec<PermOption> },
    PermissionResolved { req_id: ReqId, outcome: PermOutcome, decided_by: Decider },
    FileWrite { path: PathBuf, before: Option<BlobHash>, after: BlobHash, via: WriteVia }, // v1 fs or watcher
    Checkpoint { oid: Oid, kind: CheckpointKind },
    Error { code: String, message: String, retryable: bool },
    Unknown { raw: serde_json::Value },
}
```

**v1 → internal translation:** `tool_call` → `ToolCallUpsert`; chunks without `messageId` get a synthetic ID per contiguous run; the prompt response's `stopReason` → `StateChanged(Idle)`; a pending permission → `RequiresAction`; `plan` → `PlanUpsert` with plan ID `default`; `current_mode_update` → a synthesized `mode` config option; diff `oldText`/`newText` → git patch computed in Rust.

**Thread-view contract additions.** The event model above is the transcript's wire contract, and `docs/pages-views-spec.md` §4.1 maps every `session/update` variant to the surface that renders it. Comparing the two found fields the surfaces need and the model does not carry. All are append-only (a new field or variant, never a change of meaning) and land once, in M1.6c, so no worktree defines a piece of them:

| Where | Addition | Why a surface needs it |
|---|---|---|
| `ToolCallPatch.kind` | a closed enum of ACP's ten tool kinds (`read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, `switch_mode`, `other`) with an open fallback, in place of a free `String` | one icon per kind and the `activity-ledger`'s grouping; an unrecognised kind maps to `other` |
| `ToolCallPatch.origin` | `Builtin` \| `Mcp { server }` \| `Skill { name }` \| `Subagent`; absent means `Builtin` | `tool-origin-tag`, `subagent-card`, the ledger's `Skills used` and MCP-by-server rows. ACP has no first-class field for this, so the Provider adapter fills it from `_meta` and tool naming (Wave 2.5) and the webview never infers it from a title |
| `ToolCallPatch.parent_tool_call_id` | `Option<String>` | nests a subagent's child entries under the call that started it |
| `ToolCallPatch.locations` | `Vec<{ path, line }>` in place of `Vec<String>` | `path:line` chips; the line is in ACP's location and `location_label` drops it today |
| `ToolCallContent::Diff` mapping | the v1 mapper fills `Diff { path, patch }` (the patch computed in Rust, as the translation paragraph above already states) instead of `Unknown` | `tool_content_v1` maps ACP `diff` content to `Unknown(raw)` today, so the `tool-accordion` diff excerpt has nothing to render. No schema change: the variant already exists |
| `ConfigOption` | `category` (`mode`, `model`, `model_config`, `thought_level`, or a vendor string), a select/boolean kind, and for each value its id, display name and optional description in place of the bare id | routes Model and Effort to their composer chips and everything else to the full panel; a boolean option needs a switch. Only the value id survives `config_option` today, so a Model chip would read `claude-sonnet-…` rather than the name the Provider supplied |
| `UsageSnapshot` | context window `size` and cost currency, and `total_tokens` documented as what it is | `usage-bar` is `used ÷ size`; without `size` it can only show a number. The `usage_update` mapper stores ACP's `used` (tokens currently in context) in `total_tokens` and leaves input and output at 0, so the field is not the cumulative total its name suggests |
| `StopReason` | `MaxTurnRequests` | one of ACP's five stop reasons is missing; `turn-notice` covers each |
| `TurnEventBody` | an appended `Compaction` variant | the `Context compacted` divider. A Provider sends it only if the Client advertised the compaction capability, which M1.17 decides |

`ProviderExtension` (above) is the other appended variant. Old payloads without the new fields still deserialize; the mock Provider carries a fixture for each addition.

### 7.4 Connection lifecycle

```
Resolved → Spawned → Initialized(v1|v2) → [auth/login] → Ready
Ready → new | resume(replay?) → Idle ⇄ Running ⇄ RequiresAction
Running → cancel → (updates drain) → Idle(cancelled)
transport closed → Error → (lease request) → respawn with backoff
no leases for grace period → Draining → Terminated
```

- **initialize.** Sends `info` and (v2) empty `capabilities`. On v1, advertises `fs` only if the profile opts into tracked writes, and never advertises `terminal` by default (AD‑12).
- **new / resume.** `cwd` = worktree root (absolute); `mcpServers` from the sync engine; `additionalDirectories` only if supported.
- **prompt.** Resolves on acceptance (v2) or on turn end (v1, adapter emits the state events).
- **cancel.** Notification, then wait for `Idle(cancelled)`; late tool updates are still applied; pending permissions are answered `cancelled`.

### 7.5 Supervisor

| Concern | Design |
|---|---|
| Process tree | New process group / Job Object with kill‑on‑close |
| Framing | Newline‑delimited JSON‑RPC, batch‑aware, bounded buffers |
| Error output | 2 MB ring buffer per process |
| Cancel ladder | `session/cancel` → 5 s → force close session → SIGINT → SIGTERM → SIGKILL (Windows: CTRL_BREAK → TerminateJobObject) |
| Recovery | §6.2 ladder; crashed threads → *Interrupted* with a checkpoint |
| Backpressure | Bounded channels; coalesce chunks under pressure; never drop state, tool, or permission events |
| Resources | Whole‑tree CPU/RSS every 2 s |
| Environment | Minimal inherited env + profile env + user‑bound secrets only |
| Orphans | PID + start‑time records checked at launch |

### 7.6 Permission engine

Rules match on tool kind, command and `cwd` (from `command` subjects), path globs (from tool‑call locations), MCP server, and profile. Outcomes map to the agent's options. Agent config options such as `mode` sit inside Tethys policy: Tethys may reject what the agent's mode allows, never the reverse. Unknown outcomes are never treated as approval. Every decision is logged with its decider.

### 7.7 Tethys‑hosted MCP server (optional, P1)

Because v2 removes client‑provided file and terminal methods, anything Tethys wants to *offer* an agent goes through MCP. `tethys-mcp` (built on `rmcp`) runs per thread over stdio and can expose:
- worktree‑jailed `@`‑style search (FFF),
- "request checkpoint",
- "open file in user's editor",
- thread and worktree metadata.

It is off by default and injected like any other server.

### 7.8 Composer resolution

| Sigil | Resolution |
|---|---|
| `/` Tethys | `~/.tethys/commands/<name>.md` or `<workspace>/.tethys/commands/<name>.md`, expanded by the Tethys composer; nested `$`/`@` resolved in the same pass as plaintext references |
| `/` agent | From `available_commands_update`; command `input` is a tagged union in v2 (unknown types fall back to plain text) |
| `$` skill | Plaintext instruction naming the skill and pointing at its `SKILL.md` (description included when present); the skill body is never inlined, for any agent. The reference is shown on the message |
| `@` path | FFF index per worktree → plaintext `@<relative-path>` token in the prompt; `name`, `is_dir`, MIME, and size are carried as UI metadata only, never the file contents; optional line range echoed in text (P1) |

**Reference-only rule.** Composer resolution never injects referenced content into the prompt.
Every block it emits is plaintext (`ContentBlock::Text`): a `/` command body expands (CMP-01), but
`$` skill bodies and `@` file contents are only referenced. This makes the sent turn uniform across
all agents regardless of embedded-context or skill-loading capabilities; structured metadata is used
for chips and method badges, not sent.

**Search index lifecycle.** One FFF index per worktree root, opened lazily and keyed by canonical
root. Opening does not block on the initial scan: a query waits a short bounded deadline (150 ms)
and returns `INDEX_WARMING` if the scan is still running, so no command path can stall. FFF watches
each root by default; `invalidate` forces a rescan and `drop_index` removes an index when the
worktree is deleted or archived.

### 7.9 Class C (terminal host)

Interactive PTY via `portable-pty`, `cwd` = worktree. State comes from process status and file activity only. This is separate from v2 display terminals, which are agent‑owned and read‑only.

---

## 8. Tauri Host & IPC

### 8.1 Host responsibilities

`tethys-desktop` registers tauri‑specta commands that forward to `tethys-api`, streams subscriptions through `tauri::ipc::Channel`, serves blobs through a custom `tethys://` protocol, and configures plugins and capability files. Capability files restrict each window to the commands it needs; the webview has no direct shell or filesystem plugin access.

### 8.2 Primitives

| Primitive | Desktop | Remote |
|---|---|---|
| Request/response | tauri‑specta command | JSON‑RPC request |
| Ordered stream | `Channel<T>` with `seq` | JSON‑RPC notifications with `subscriptionId` + `seq` |
| Bulk / binary | `tauri::ipc::Response` or `tethys://blob/<hash>` | Authenticated HTTP GET, same path |

Rules:
- Clients resume streams with `since=seq`.
- Chunks are coalesced to ≤ 30 flushes/s per thread.
- Messages are capped at 256 KB; anything larger becomes a blob reference.
- Only visible or pinned threads stream full events; background threads send state changes only.

**Phase 0 benchmarks.**
- Round trips at 1 KB, 100 KB, and 1 MB.
- Channel throughput at 200‑byte messages.
- 10 MB binary transfer.
- Byte‑to‑paint latency with 8 concurrent streams.

**Pass criteria:** ≥ 5 k msgs/s at 60 fps and ≤ 50 ms p95 byte‑to‑paint.

### 8.3 UI data bindings

What each surface reads and writes. Surface behaviour is specified in [pages-views-spec.md](./pages-views-spec.md); the methods are the §12.1 namespaces.

| UI | Reads | Writes |
|---|---|---|
| Selector provider column | `agent.connections.list`, registry profiles (`AGT‑01/02`), negotiated `initialize` result | — |
| `session-config-panel` | that Provider's own session-config schema (§7.2); shape varies per Provider | `thread.setConfigOption` (narrowed by policy, `PRM‑04`) |
| Catalog cards / drawer | `workspace.list/status`, `workspace.capabilities` (§10.6), `thread.list` (Sessions grouped by Provider), `git.worktree.*`, `checkpoint.*`, diff summary | `thread.create` (explicit `cwd` + workspace `mcpServers`; own worktree by default where the capability exists, `WT‑01`), `git.init` (upsell chip), `thread.fork` (V1) |
| Workspace add / trust | trust store by resolved path + host id (mode, scope, timestamp) | `workspace.add` gated on trust grant; revoke removes the card (`TRU‑01`) |
| Shell sessions / inspector | `events.subscribe {sinceSeq}`, `entries` materialized, `turns`, local transcript cache (independent of Provider `session/resume` support) | `thread.prompt/queue.*/cancel/resume` |
| `plan-panel` | `session/update` plan notifications (optional per Provider) | — |
| `tool-accordion`, `tool-run-group`, `tool-origin-tag`, `subagent-card` | `entries` tool calls: `kind`, `status`, `origin`, `parent_tool_call_id`, `locations`, content (§7.3 contract additions); the `Tool call density` preference | `permission.respond` for a child request; density preference |
| `activity-ledger` | `entries` tool calls grouped by `kind` and `origin`; `Usage` totals when reported | — |
| `working-indicator`, `turn-notice` | `StateChanged` stop reason, `Error`, `Compaction`, connection health | `thread.prompt` (`Continue`, `Retry`), `agent.connections.restart` (`Reconnect`) |
| `composer-config-chip` | `ConfigOptionsChanged` by `category` (`model`, `thought_level`) with value display names | `thread.setConfigOption` (narrowed by policy, `PRM‑04`), applying from the next turn |
| `message-actions`, `attachment-chip` | `entries` messages and content blocks; the Provider's negotiated image-prompt capability | the session `Fork`; attachment content blocks on `thread.prompt` |
| Permission requests / inbox | `events` permission requests **including the Provider's `options` array**, `permission.rules.*` | `permission.respond` (selected option id), OS notify |
| `elicitation-card` | `elicitation/create` request schema (Providers declaring `elicitation`) | elicitation response |
| `usage-bar` | Session token usage as reported by the Provider (`MON‑03`; hidden when unreported) | — |
| Diff / review | `git.diff.summary/file`, `checkpoint.*`, gated on `workspace.capabilities` | `git.stage/unstage/discard/commit` |
| Composer `/ $ @` | `commands.list`, `search.files`, skill strategy | `commands.expand`, `thread.queue.*` |
| MCP attachment / skills | `mcp.registry/effective` (per Workspace), Provider `mcpCapabilities`, `skills.list` | attach via `mcpServers` on `thread.create`; `mcp.projection.plan/apply/rollback` on the fallback path only; `skills.trust/enable` |
| Profiles / monitor | `agent.profiles/registry/connections.*`, process sampling | `agent.registry.install/update`, `connections.restart`, `agent.login` |
| Terminal / onboarding | `terminal.list/attach`, `workspace.list` | `terminal.write/resize`, `workspace.add` |
| Provider rows | `agent.profiles.*`, `agent.connections.list`, `mcp.health` (`SYN‑09`) | toggle → profile enable; stepper → health interval; exec/protocol/env → launch spec |
| Provider accordion | `agent.config.schema/get/validate` (`SYN‑11`), negotiated capabilities (`session/resume`, MCP transports, `elicitation`), declared `authMethods` | `agent.config.plan/apply/rollback`; login via `agent.login` per method (`AGT‑07`, `G7`) |
| General / keybindings settings | theme manifests, font list, trust store, shortcut table | theme id, font prefs, notification toggle, shortcut rebind |
| Workspaces without git | `workspace.capabilities` (`vcs: none`, `restore: no`, `max_concurrent_sessions: 1`) | `git.init` upsell (convenience); revert/diff/stage UI hidden with a `no git · no revert` explanation when unavailable — no snapshot fallback in MVP |

---

## 9. Footprint Targets

| Metric | Target |
|---|---|
| Core RSS, idle | ≤ 50 MB (hard) |
| Core RSS, 8 active threads (excluding agents) | ≤ 150 MB |
| Webview RSS, idle | ≤ 120 MB macOS/Linux, ≤ 180 MB Windows (provisional) |
| Cold start | ≤ 600 ms |
| Installer | ≤ 20 MB |

Agent processes usually dominate total memory. The design response is lease‑based reaping, idle suspension, and whole‑tree monitoring.

---

## 10. Git Engine

### 10.1 Library split (AD‑5)

Mutations (worktree add/remove, commit, merge, rebase, push) use the **git CLI**, so user config, hooks, credentials, LFS, and signing behave as expected. Reads (status, trees, blobs) use **gix**, with CLI `--porcelain=v2 -z` fallback where coverage is thin. *M1.3 deviation (2026‑09‑18): reads ship CLI-only behind a `read.rs` seam; Spike S0.4 measured the full CLI pipeline at 122 ms p95, so the gix port lands when profiling demands it.*

### 10.2 Worktrees

- Default path `~/.tethys/worktrees/<repo-id>/<slug>` (PD‑6), on branch `tethys/<slug>`; `<repo-id>` is a hash of the canonical common git dir, so all worktrees of one repository share it.
- Bootstrap copies configured untracked globs, then runs the setup script through the supervisor-bound runner (headless until the terminal surface lands).
- Heavy directories are symlinked only when the user opts in.

### 10.3 Checkpoints (WT‑03)

```
GIT_INDEX_FILE=<tmp> git read-tree HEAD
GIT_INDEX_FILE=<tmp> git add -A
tree=$(GIT_INDEX_FILE=<tmp> git write-tree)
commit=$(git commit-tree $tree -p <prev> -m "tethys turn <n>")
git update-ref refs/tethys/checkpoints/<thread>/<turn>/<start|end> $commit
```

- The user's index and branch are untouched, and no hooks run.
- `refs/tethys/*` are not pushed by default; restore captures an undo pair under
  `refs/tethys/checkpoints/<thread>/restores/<n>/{worktree,index}` before it writes.
- Large untracked binaries are skipped, and the UI says so.
- Refs are pruned on delete and compacted on archive.

**Turn start and end** are taken from `StateChanged(Running)` and from any exit out of
`Running` (Idle, Error, Interrupted, Suspended), so crashed turns keep their work.

### 10.4 Diff pipeline

```
watcher (150 ms debounce) ─┐
agent diff content ────────┼─▶ change detector ─▶ diff engine (imara-diff) ─▶ summary
checkpoint at Idle ────────┘                               │
                               hunk cache (blob-pair hash) ◀── visible files, paged
                                                           ▼
                               git-patch-shaped hunks ─▶ @tethys/diff worker ─▶ virtualized view
```

- During a turn, agent diffs (v2 `changes` + `git_patch`, or converted v1 diffs) give live previews.
- At `Idle`, the checkpoint diff is authoritative.
- Files > 1 MB or > 20 k changed lines load collapsed; binary files, symlinks, and directories render from `changes` metadata only.

### 10.5 Non-git folders and plain mode (WT‑11, PD‑9)

Git is a feature, not enforcement: any folder can be a workspace. When a workspace sets `isolation: plain`, `tethys-git` is bypassed for every thread in that workspace even when the folder is git-initialized:

- No worktree add, no branch, no bootstrap copy/setup script; `Thread.worktree` stays `None` and the thread root is the workspace folder itself (PD‑9 decides root vs. per-thread subfolder).
- Checkpoint calls are no-ops returning `GIT_DISABLED`; the watcher still feeds live file activity to the UI, but there is no authoritative checkpoint diff and no restore.
- The `git.*` API namespace returns `GIT_DISABLED` for those threads; the frontend hides the worktree picker, diff/restore actions, and merge/push/PR entries. Both follow from the workspace's resolved capabilities (§10.6), not from the `isolation` setting alone.

The same UI hiding applies to threads in non-git folders without any setting — their git UI is simply unavailable, explained with a `no git · no revert` state, and the hub offers in-place `git init` as the upgrade path. There is no app-managed snapshot fallback in MVP.
- `@` search still works: the FFF index runs in non‑git mode (no gitignore-aware ranking from worktree metadata).

### 10.6 Workspace capability resolution (AD‑15)

Git, isolation and forge access are properties a workspace *has*, not assumptions the product makes. One resolver in `tethys-core` computes a workspace's capability set, exposed as `workspace.capabilities`; every gate reads it and no surface re-derives VCS status itself.

```rust
pub struct WorkspaceCapabilities {
    vcs: Vcs,                          // None | GitLocal | GitRemote { host: GitHost /* GitHub | GitLab | Other */ }
    restore: bool,                     // checkpoints exist and the session can restore
    max_concurrent_sessions: Option<u32>, // Some(1) where no worktree mechanism isolates parallel sessions
    isolation: Isolation,              // Worktree | Plain            (V1 input)
    forge_cli: ForgeCli,               // None | Gh | Glab             (V1 input)
}
```

| Input | Source | Lands |
|---|---|---|
| VCS status and remote host | read-only `tethys-git` reads (`git remote get-url` sets `host`; nothing is fetched) | MVP |
| Session restore support | the Provider's `initialize` result plus checkpoint availability | MVP |
| `isolation` (`worktree` \| `plain`) and submodule/LFS detection | workspace `.tethys/config.json` (§10.5, WT‑11) | V1 |
| Forge CLI presence | `which gh` / `which glab` | V1 |

- **`git.*` derives from it.** `GIT_DISABLED` is returned whenever `vcs` is `None` or `isolation` is `Plain`, so the exhaustive namespace test has one rule to assert.
- **Concurrency is enforced here, not in the UI.** `thread.create` consults `max_concurrent_sessions` and refuses a second session where it is `Some(1)`; the hub's disabled `+ New Thread` reflects the same value. A second window or a direct API caller cannot bypass it.
- **Forge access is delegated and read-only.** The remote host drives the source badge. Push and PR (`git.push`, `git.pr.create`, WT‑08) shell out to the user's own `gh` / `glab`, are gated on `forge_cli`, register with the permission engine and default to *ask* (§7.6). Tethys stores no forge token and never clones, browses, or authenticates to a forge.
- **Capability is not the same as backend class.** Class A/B/C (§7) describes the agent process; the capability set describes the folder. They vary independently.

---

## 11. Sync Engine

### 11.1 Canonical MCP registry

```jsonc
// ~/.tethys/mcp.json  (and <workspace>/.tethys/mcp.json)
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "github-mcp-server",
      "args": ["stdio"],
      "env": { "GITHUB_TOKEN": { "secretRef": "keychain:tethys/github" } },
      "x-tethys": { "scope": "global", "providers": ["claude-code", "codex"], "enabled": true }
    },
    "linear": { "type": "http", "url": "https://mcp.linear.app/mcp" }
  }
}
```

`providers` is an allow-list of Provider ids (`AgentProfile.id`); omitted means every Provider. The file carries `"version": 2`. Version 1 used `targets` (including a synthetic `session` value); the reader still accepts it, mapping vendor names to the Provider ids they coincide with, and the writer only emits v2.

The canonical file uses `type` on every entry to match ACP v2. Legacy `sse` entries are imported but flagged, since v2 sessions cannot receive them.

Workspace-level files (`<workspace>/.tethys/…`, `<workspace>/.agents/…`) live at the workspace root, which need not be a git repository. They are "committable" only where the folder is one.

### 11.2 Session injection

Attaching servers to `session/new` is the primary path (SYN‑02): it changes no file and needs no apply step. It applies to ACP Classes A and B.

1. **Effective set** = global ∪ workspace (workspace overrides by name), restricted to entries whose `providers` include this Provider, − thread disables. The workspace file is read from the **workspace root** held on the thread, never from the thread's `cwd`: for a git thread `cwd` is a worktree that need not contain an uncommitted or unmerged copy.
2. **Filter** by the agent's advertised MCP transports:
   - v2: `session.mcp.stdio` / `session.mcp.http`
   - v1: `mcpCapabilities`, with stdio mandatory
   - A connection with no negotiated capabilities is an error (`CapabilitiesNotNegotiated`), never an empty set.
3. **Resolve secrets** at spawn time and pass them only to that session.

`mcp.attachments(workspace_id)` returns the Servers × Providers grid the MCP page renders. Each cell is `Attached` (will be passed on the next `session/new`), `UnsupportedTransport { needs }`, `FileProjection { target, state }`, `Excluded` (the server's `providers` list omits this Provider) or `NotNegotiated` (never shown as attached). `FileProjection` appears only for a Provider that negotiated no transport at all and has a `projection_target`; a Provider that accepts stdio but not http is `UnsupportedTransport`.

### 11.3 Config projection

Projection is the **compatibility path**, not the primary one: it serves Class C terminal-hosted agents (AGT‑03, which have no `session/new` to attach to) and any Provider that cannot accept `mcpServers`, and it is the foundation the native-settings forms (SYN‑11) reuse. A Provider maps to a projection target through `AgentCompat.projection_target`.

Each target implements `Projector` (`target`, `detect`, `read`, `plan → ProjectionPlan`, `apply`, `verify`, plus `schema` for SYN‑11 targets).

- **Safety:** preview diff first, timestamped backups, and format‑preserving `toml_edit` / JSONC editing (each agent config UI projects json/toml schema for seamless editing).
- **Ownership:** the `projections` table in `~/.tethys/state.db` (§12) records the per‑entry hash of what Tethys last wrote; apply re‑reads the file and refuses a stale plan, and only an owned entry that drifted outside Tethys becomes a conflict. Full-file settings forms (SYN‑11) preserve unknown keys and reuse the same preview/backup/rollback path.
- **Secrets:** use `${VAR}` / `{env:VAR}` / `bearer_token_env_var` references where the target supports them; otherwise the secret is omitted and the entry is flagged `unsupported`, never written in plain text (G7).

| Target | Config | Format | Skills folder |
|---|---|---|---|
| ACP session | `session/new` / `session/resume` `mcpServers` | ACP schema | via composer strategy |
| Claude Code | `.mcp.json` (workspace); `~/.claude.json` (import only) | JSON `mcpServers` | `.claude/skills/` |
| Claude Desktop | `claude_desktop_config.json` | JSON `mcpServers` | n/a |
| Codex CLI | `~/.codex/config.toml` | TOML `[mcp_servers.<name>]` | `.agents/skills/` |
| OpenCode | `opencode.json(c)` | JSON `mcp.servers` (legacy flat `mcp` read only) | `.agents/skills/` |
| Antigravity CLI | `~/.gemini/config/mcp_config.json` (global); `<workspace>/.agents/mcp_config.json` (workspace) | JSON `mcpServers` (remote uses `serverUrl`, not `url`) | `.agents/skills/` (workspace); `~/.gemini/antigravity-cli/skills/` (global) |
| Gemini CLI | `.gemini/settings.json` | JSON `mcpServers` | verify |
| Cursor | `.cursor/mcp.json` | JSON `mcpServers` | verify |
| Kiro CLI | `.kiro/settings/mcp.json`; `.kiro/agents/*` | JSON `mcpServers` | verify (`skill://` resources) |

All paths **verify**; skill folders marked `.agents/skills/` are read natively by Codex, OpenCode, and Antigravity CLI (verified 2026‑09‑18). `~/.claude.json` is Claude's private state: read‑only for import, no `${VAR}` expansion there. **First full‑support agents: OpenCode, Antigravity CLI, Kiro CLI** — their projection, skills, and native‑settings paths are verified first and land before the remaining targets. Claude Code and Codex ship MCP-only projection in MVP (SYN-03); their full support (native settings, skills materialization, terminal hosting) is post-MVP.

### 11.4 Skills

- **Storage:** Agent Skills layout under `~/.agents/skills/<name>/` and `<workspace>/.agents/skills/<name>/`; this home is the single source of truth and is never moved — updates swap the skill directory atomically in place.
- **Imports:**
  - `.skill` files are validated and extracted to staging.
  - GitHub imports download the archive of the resolved commit, pinned by SHA.
  - `skills` CLI lockfiles (`skills-lock.json`, `~/.agents/.skill-lock.json`) are read‑only provenance sources (unpinned); Tethys never writes them.
- **Validation:** frontmatter, size limits, name collisions, script detection for trust prompts, and archive guards (no absolute or `..` paths, no links, entry/size caps).
- **Projection:** relative symlinks on macOS/Linux (worktree‑safe); junctions or copies on Windows. Agents that read the canonical home natively (Codex, OpenCode, Antigravity CLI workspace) need no copy; Claude Code links `.claude/skills/`, and global Antigravity skills link `~/.gemini/antigravity-cli/skills/`.
- **Per‑workspace enablement:** via an allow‑list, never by deleting files.

### 11.5 Agent native-settings forms (SYN‑11)

Initial full-file targets — and the first agents to reach full support: OpenCode, Antigravity CLI, Kiro CLI (MCP-only projection in §11.3 stays for the SYN‑03/SYN‑05 targets). Claude Code and Codex native forms are post-MVP.

- **Schemas are community-contributed and must follow the native schema.** Each schema bundle records `{ schema_id, agent_version_range, source (official docs/schema URL), contributor, updated_at }` and ships with golden files under `fixtures/projectors/<target>/`.
- **Flow:** `agent.config.schema(target)` → frontend renders a `TanStack Form` from the JSON Schema; advanced sections (hooks, steering, plugins, etc.) show a link to the official docs/schema alongside the fields. Submit → `agent.config.validate` → `plan` (preview diff) → `apply` with backup/rollback. A raw text tab is always available and round-trips unknown keys losslessly.
- **Drift handling:** detected agent version outside the schema's range → banner warning, apply still allowed; schema validation failure → inline errors, apply blocked except as explicit raw apply (logged in audit). Unknown keys are never dropped by form applies.
- **Secrets:** same rule as §11.3 — `${VAR}`/keychain refs only; no plain-text secret writes.

---

## 12. Data Model & Persistence

Types live in `tethys-schema` (serde + specta). The event model is in §7.3; the other core entities:

```rust
pub enum BackendClass { AcpNative, AcpAdapter, NativeTerminal }

pub struct AgentProfile {
    id: AgentProfileId, name: String, class: BackendClass,
    launch: LaunchSpec, registry_ref: Option<RegistryRef>,
    secret_bindings: Vec<SecretBinding>, default_policy: PermissionPolicyId,
    compat: AgentCompat,               // multi-session ok, skill strategy, known quirks, preferred protocol
}

pub struct ConnectionEntry {           // ConnectionStore row (per profile + host)
    key: ConnectionKey, state: ConnState /* Connecting | Connected | Error | Draining */,
    protocol: Option<ProtocolVersion>, info: Option<AgentInfo>,
    capabilities: Option<NormalizedCapabilities>,
    leases: LeaseToken, pid: Option<u32>, restarts: u32, stale: bool,
}

pub struct Thread {
    id: ThreadId, workspace_id: WorkspaceId, title: String,
    agent_profile_id: AgentProfileId, session_id: Option<String>,
    worktree: Option<WorktreeRef>, // None = main-checkout thread (flagged), non-git folder, or explicit-plain workspace (WT-11)
    state: ThreadState,
    permission_mode: PermissionMode, config_options: Vec<ConfigOption>,
    overrides: ThreadOverrides, forked_from: Option<(ThreadId, TurnIndex)>,
}

pub struct Turn {
    thread_id: ThreadId, index: TurnIndex, composer_source: String,
    prompt: Vec<PromptBlock>, user_message_id: Option<String>,
    stop_reason: Option<StopReason>,
    checkpoint_start: Option<Oid>, checkpoint_end: Option<Oid>,
    usage: Option<UsageSnapshot>, diff_stats: Option<DiffStats>,
}
```

**SQLite** (WAL) at `~/.tethys/state.db`:

| Table | Contents |
|---|---|
| `workspaces`, `agent_profiles`, `threads`, `turns` | Core metadata |
| `events` | Append‑only `(thread_id, seq)` |
| `entries` | Materialized latest state per message, tool call, plan, and terminal ID, so threads open without replaying everything |
| `permission_rules` | Policy rules |
| `workspace_trust` | Workspace trust decisions (resolved path + host, mode, scope, timestamp) |
| `audit` | Decision and action history |
| `projections`, `skills_state` | Projection manifest and skill trust/enablement |

The blob store lives at `~/.tethys/blobs/`, keyed by blake3.

### 12.1 API surface

| Namespace | Methods |
|---|---|
| `host` | `info`, `pair`, `health` |
| `workspace` | `list`, `add`, `remove`, `settings.*`, `status`, `capabilities` (§10.6) |
| `agent` | `profiles.*`, `registry.list/install/update`, `connections.list/restart`, `login`, `logout`, `stderr`, `config.schema/get/validate/plan/apply/rollback` (SYN‑11; `plan/apply/rollback` reuse the §11.3 safety path) |
| `thread` | `create`, `list`, `get`, `prompt`, `queue.*`, `cancel`, `resume`, `importSessions`, `fork`, `archive`, `delete`, `setConfigOption`, `setPermissionMode` |
| `events` | `subscribe {threadId, sinceSeq}`, `unsubscribe`, `inbox.subscribe` |
| `permission` | `respond`, `rules.*` |
| `git` | `worktree.*`, `checkpoint.*`, `diff.summary`, `diff.file`, `stage`, `unstage`, `discard`, `commit`, `merge`, `push`, `pr.create` (all return `GIT_DISABLED` where the workspace has no git capability or sets `isolation: plain`, §10.6) |
| `search` | `files` |
| `mcp` | `registry.*`, `effective`, `attachments`, `projection.plan/apply/verify/rollback`, `import.*`, `health` |
| `skills` | `list`, `import`, `update.*`, `trust`, `enable` |
| `commands` | `list`, `expand` |
| `terminal` | `list`, `attach`, `write`, `resize` |

**Addressing.** Every method above that touches the filesystem (`mcp.*`, `skills.*`, `search.files`, `commands.*`, `git.worktree.create`) takes a `workspace_id` or `thread_id` and never a path (principle 8). Core resolves the root, and an unknown id is `NotFound`.

---

## 13. Remote Mode

`tethysd` (axum + WebSocket) runs the same core headless.

- **Security:** localhost bind by default; SSH tunnel recommended; optional TLS with one‑time pairing tokens, scoped per client and revocable.
- **Resilience:**
  - Agents keep running while clients are disconnected.
  - Clients replay from `seq`.
  - Approvals with no client attached wait, then time out to *reject* (AD‑7).
- **Remote agents** wait for ACP's separate remote‑transport specification.

---

## 14. Technical Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| ACP v2 is still draft and may change | H | M | v2 behind a flag; v2‑shaped internal model with thin adapters; separate v1/v2 fixtures; track spec releases in CI |
| Agents lag on v2 adoption | H | L | v1 adapter is first‑class, not legacy |
| SDK threading model (`!Send`) complicates tokio integration | M | M | Contain inside `tethys-acp`; dedicated thread + `LocalSet` per connection if needed |
| Leaked agent processes (as seen in Zed) | M | H | Leases, two‑phase reaping, whole‑tree kill, idle suspension |
| IPC bottleneck on large payloads | M | H | Rust‑side diffs, visible hunks only, 256 KB cap, binary channels, Phase 0 benchmarks |
| Webview differences (WKWebView, WebView2, WebKitGTK) | H | M | Oldest‑WebKit baseline; visual regression on all three; IME and clipboard tests; Linux best‑effort until budgets pass |
| Three‑state patch bugs (omitted vs `null`) | M | M | Single `Patch<T>` type; proptest round‑trips; shared fixtures for Rust and TS reducers |
| Tauri end‑to‑end testing gaps (WebDriver support varies by OS) | M | L | Most UI tests run in the browser against a mock client; small native smoke suite per OS |
| Adapter churn | H | M | Registry pinning; per‑release smoke tests; compatibility table |
| Git edge cases | M | M | CLI mutations; detection and warnings; size thresholds; Windows long paths |
| Upstream crate maturity (FFF, gix, process‑wrap) | M | M | Internal traits with fallbacks (`ignore` + `nucleo`; git CLI; manual process groups) |
| Community settings schemas drift from vendor releases | M | M | Version-pinned bundles following the native schema; warning on version mismatch, error on validation failure; golden files per target; raw fallback preserves unknown keys |

---

## 15. Architecture Decisions

| ID | Decision | Options | Status / needed by |
|---|---|---|---|
| AD‑1 | Node sidecar trigger | Never · **documented trigger** | **Decided** (Spike S0.8) |
| AD‑2 | Managed runtime for npm/Python adapters | Detect only (MVP) · optional managed Node/uv | V1 |
| AD‑3 | UI framework | **React 19 + TanStack** | **Decided** |
| AD‑4 | Process model | Per thread · **pooled per profile with leases (Zed‑style)** | **Decided** (Spike S0.2b) |
| AD‑5 | Git read library | **gix for reads + CLI mutations** · git2 · CLI only | **Decided** (Spike S0.4); M1.3 ships CLI-only reads behind the `read.rs` seam, gix port deferred (revised 2026‑09‑18) |
| AD‑6 | HTTP MCP servers for agents without HTTP support | Skip with warning · local stdio bridge | V1 |
| AD‑7 | Remote approval notifications | None · webhook · mobile companion | Phase 3 |
| AD‑8 | ACP versions | **v1 + v2 side by side, v2‑shaped internal model** | **Decided** (Spike S0.2) |
| AD‑9 | Composer editor | TipTap · Lexical · custom contenteditable | MVP |
| AD‑10 | Diff renderer | **Custom virtualized over git patches** · CodeMirror merge only | **Decided** (Spike S0.1) |
| AD‑11 | Client data layer | Query + Store (proposed) · add TanStack DB when stable | V1 |
| AD‑12 | v1 client `fs` capability | Off by default, per‑profile opt‑in (proposed) · always on | MVP |
| AD‑13 | SQLite access | **`rusqlite` + `tokio-rusqlite`** · `sqlx` | **Decided** (Spike S0.8) |
| AD‑14 | Agent settings schema source | Community-contributed, following the native schema, version-pinned with warning/error on drift (**decided**) · Tethys-authored only · upstream-official | V1 |
| AD‑15 | Where git/forge availability is decided | **One resolved capability set (`workspace.capabilities`, §10.6), read by every gate** · each surface checks VCS status itself | **Decided** in M1.6b — needed before the MVP review and catalog chunks; V1 adds the `isolation` and `forge_cli` inputs |

---

## References (verify before implementation)

- ACP v2 overview: https://agentclientprotocol.com/protocol/v2/overview
- ACP v2 migration guide: https://agentclientprotocol.com/protocol/v2/migration
- ACP Rust library: https://agentclientprotocol.com/libraries/rust
- Rust/TS SDK 1.0 announcement: https://agentclientprotocol.com/announcements/sdk-1-0-releases
- Zed PR #62922 (connection leases and reaping): https://github.com/zed-industries/zed/pull/62922
- Zed ACP connection layer overview (DeepWiki): https://deepwiki.com/zed-industries/zed/8.2-acp-protocol-and-connection
- FFF: https://github.com/dmtrKovalenko/fff
- Tauri v2: https://v2.tauri.app
- Turborepo: https://turbo.build
- TanStack: https://tanstack.com
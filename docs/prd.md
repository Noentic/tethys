# Tethys — Product Requirements Document

**Native, ACP‑first workspace for running many coding agents across many repos**

| Field | Value |
|---|---|
| Status | Draft v0.2 (narrowed) |
| Date | 16 September 2026 |
| Companion docs | [ARCHITECTURE.md](./architecture.md) (how it is built) · [milestone.md](./milestone.md) (when it ships) |

This document defines **what** Tethys does and **for whom**. Implementation choices live in the architecture doc; sequencing lives in the roadmap. Requirement priority: **P0** = MVP, **P1** = V1, **P2** = later. Items marked **(verify)** depend on fast‑moving vendor behaviour.

---

## 1. Overview

### 1.1 Vision

One lightweight desktop window to run, supervise, and review coding agents from any vendor, across any number of repositories, in parallel. Each agent runs as its own official process and signs itself in. Tethys handles everything around the agent: isolated workspaces, turn‑by‑turn review, permissions, and one shared setup for MCP servers and skills.

### 1.2 Problem

- **Too many terminals.** It's hard to tell which of several agents is waiting for you.
- **Collisions.** Agents sharing a checkout overwrite each other and dirty working branches.
- **Weak review.** Seeing what an agent changed *in one turn*, and undoing just that turn, is manual.
- **Config drift.** MCP servers and skills are set up separately for each tool, in different formats.
- **Account risk.** Routing several vendor subscriptions through one third‑party agent can violate vendor terms. Anthropic, for example, states that consumer‑plan OAuth is meant for its own apps and directs Agent SDK products to API keys. Its billing rules for SDK use on subscriptions changed in 2026 and are still in flux.

### 1.3 Goals

| ID | Goal | Success measure |
|---|---|---|
| G1 | Run many agent threads across many repos at once | ≥ 8 active threads with smooth UI (p95 frame < 16 ms) |
| G2 | Work with any standard agent | Any ACP Registry agent can be added without code changes |
| G3 | No collisions | Write‑capable threads get their own worktree by default; no writes outside it |
| G4 | Review and undo by turn | Every turn has a diff and a restore point, ready within 300 ms for typical changes |
| G5 | Configure once | One MCP and skill setup reaches every supported agent, with preview and rollback |
| G6 | Stay light | Tethys's own core stays ≤ 50 MB idle (full targets in the architecture doc) |
| G7 | Respect vendor terms | Tethys never reads, stores, proxies, or reissues vendor credentials |

### 1.4 Non‑goals

Tethys is not an editor or IDE, not an agent or model runtime, not an LLM proxy, and not a cloud service. It does not unify billing across vendors and does not automate vendor login.

### 1.5 Personas

- **Multi‑agent power developer (primary).** Holds several agent subscriptions or API keys, works across many repos, is comfortable with git worktrees. Wants throughput and control.
- **Agent / tool builder.** Builds agents, MCP servers, or skills and wants a standards‑compliant client to test against, including remotely.
- **Small‑team lead.** Wants a repeatable, reviewable workflow shared through project‑level config committed to the repo.
- **Non‑developer workspace owner (secondary).** Uses Tethys for non‑code work (writing, research, ops) in a plain folder with no git; wants worktrees and git UI gone entirely per workspace.

### 1.6 Differentiation

| | Typical multi‑agent desktop tools | Tethys |
|---|---|---|
| Agent integration | Vendor wrappers or output scraping | Standard protocol (ACP); official binaries; terminal fallback |
| Credentials | Sometimes imported or proxied | Never touched |
| Footprint | Electron + Node backend | Native Rust core + system webview |
| Isolation | Optional worktrees | Worktree per thread + per‑turn restore points |
| MCP / skills | Per tool | One registry, pushed to every agent |

---

## 2. Agent Backends and the Credential Principle

Tethys supports three ways to run an agent. The user picks one per agent profile, and Tethys shows compliance notes for each.

| Class | What runs | Integration depth | Notes |
|---|---|---|---|
| **A — ACP‑native** | The vendor's own binary, speaking ACP | Full | Cleanest case: the vendor supports the protocol directly |
| **B — ACP adapter** | A separate adapter wrapping the vendor's agent or SDK | Full | Compliance depends on how the adapter signs in. The Claude adapter path defaults to API‑key sign‑in in onboarding (PD‑1) |
| **C — Native terminal** | The vendor's unmodified CLI in an embedded terminal | Workspace only (worktrees, restore points, diffs, config sync) | Tethys never parses or injects into the agent's output. Acceptability per vendor must be confirmed (PD‑2) |

Tethys maintains a published **vendor compliance matrix**: backend class × sign‑in method × vendor statement × last‑verified date, with source links. It is product guidance, not legal advice.

---

## 3. Functional Requirements

### 3.1 Agents and threads

| ID | Requirement | Pri |
|---|---|---|
| AGT‑01 | Create agent profiles manually or install them from the ACP Registry, with version pinning and opt‑in updates | P0 |
| AGT‑02 | Support backend classes A and B | P0 |
| AGT‑03 | Support backend class C for vendors confirmed under PD‑2 | P1 |
| AGT‑04 | Run multiple concurrent threads per repo, across multiple repos | P0 |
| AGT‑05 | Resume threads after app restart or agent crash; crashed threads are marked *Interrupted* with history intact | P0 |
| AGT‑06 | Stop a thread, or stop all threads in a repo or host | P0 |
| AGT‑07 | Sign‑in is always delegated to the vendor's own flow (for example, opening its login command in a terminal) | P0 |
| AGT‑08 | Suspend idle threads to free memory and resume them on demand | P1 |

### 3.2 Permissions

| ID | Requirement | Pri |
|---|---|---|
| PRM‑01 | Three modes: **Supervised** (ask for everything, default), **Auto‑edit** (file edits inside the worktree allowed; commands and network ask), **YOLO** (all allowed, all logged) | P0 |
| PRM‑02 | YOLO is allowed only in worktree threads unless the user opts a repo in explicitly, with a warning | P0 |
| PRM‑03 | Approval dialogs show the tool type, exact command or diff, and affected paths, with "remember for this thread / project" | P0 |
| PRM‑04 | Agent‑provided settings (mode such as plan, model, thinking level) are shown and switchable; Tethys's policy can still block what the agent's mode would allow, never the reverse | P0 |
| PRM‑05 | Custom rules by tool type, command pattern, path, or MCP server → allow / ask / reject | P1 |
| PRM‑06 | Audit log of approvals, file writes, and commands run, exportable | P1 |

### 3.3 Worktrees and review

| ID | Requirement | Pri |
|---|---|---|
| WT‑01 | Each new thread gets its own git worktree and branch by default (naming template configurable); main‑checkout threads are allowed but flagged | P0 |
| WT‑02 | Worktree setup: copy chosen untracked files (such as `.env*`) and run an optional project setup script | P0 |
| WT‑03 | A restore point is taken at the start and end of every turn; restoring is itself undoable. Works for every backend class | P0 |
| WT‑04 | Turn diff and cumulative diff (vs. base branch), in unified and split views, fast on large changes | P0 |
| WT‑05 | Stage, unstage, discard by file or hunk; commit with an optional agent‑drafted message | P0 |
| WT‑06 | Archive and delete threads with guards against losing uncommitted work | P0 |
| WT‑07 | Merge back to base (merge, squash, or rebase); conflicts can be handed to an agent as a new turn | P1 |
| WT‑08 | Push and open a PR using the user's installed `gh` / `glab`; Tethys never stores forge tokens | P1 |
| WT‑09 | Line comments on a diff can be sent back to the agent as a follow‑up | P1 |
| WT‑10 | Submodules and Git LFS: warn in MVP, fully supported in V1 | P1 |
| WT‑11 | Plain‑directory workspaces: project-level `isolation: worktree \| plain` (default `worktree`); when `plain`, no worktree/branch is created and all git features are disabled for every thread in that workspace | P1 |

#### 3.3.1 Plain‑directory workspaces (WT‑11)

For non‑developer workspaces the worktree-per-thread model is wrong: there may be no repo at all, just a folder of docs. Setting `isolation: plain` at project scope is a behavioural kill-switch:

- Thread creation skips worktree/branch setup entirely; the thread's root is the workspace folder itself.
- All git UI and actions are hidden/disabled for those threads: restore points (WT‑03), turn/cumulative diffs (WT‑04), stage/unstage/discard/commit (WT‑05), archive guards that depend on git state (WT‑06), merge (WT‑07), push/PR (WT‑08).
- No checkpoints means no per‑turn undo. The thread-creation and settings UI must say so explicitly.
- PRM‑02's "YOLO only in worktrees" guard does not apply in `plain` workspaces (there are no worktrees); YOLO there requires the same explicit opt‑in as a main‑checkout thread.
- Stored in `<repo>/.tethys/config.json` (or alongside the workspace root for non‑git folders); project overrides the global default. Changing it applies to new threads only — existing worktree threads keep their worktree until archived/deleted.

### 3.4 MCP and skill sync

| ID | Requirement | Pri |
|---|---|---|
| SYN‑01 | One MCP registry at global and project scope (project file is committable); secrets stored in the OS keychain, never in the file | P0 |
| SYN‑02 | ACP threads receive the effective MCP servers at session start, with no files changed | P0 |
| SYN‑03 | Push MCP config into Claude Code, Codex, and OpenCode's own config files, with a preview diff, backups, rollback, and conflict detection; Tethys only edits entries it created (verify paths) | P0 |
| SYN‑04 | Import existing MCP servers from any detected tool during onboarding | P0 |
| SYN‑05 | Same push for Antigravity CLI, Kiro CLI, Claude Desktop, Gemini CLI, and Cursor (verify paths); Antigravity CLI and Kiro CLI land first as part of the first full‑support agents | P1 |
| SYN‑06 | Skill library following the Agent Skills format and the `.agents/skills` convention (global and project); import from a folder, a `.skill` file, or a GitHub link (pinned to a commit, updates shown as a diff) | P0 |
| SYN‑07 | Skills containing scripts need an explicit trust decision and are excluded from YOLO threads until trusted | P0 |
| SYN‑08 | Make skills available in agent‑specific skill folders | P1 |
| SYN‑09 | MCP server health check (starts, lists tools, latency) | P1 |
| SYN‑10 | Per‑thread disable of any MCP server or skill | P1 |
| SYN‑11 | Agent native-settings forms: per-agent config UI renders the full native config file as a form from a versioned, community-contributed schema that follows the agent's official schema; form + raw fallback, with preview diff, backups, rollback, version-drift warnings/errors, and a link to the official docs/schema for advanced areas (hooks, steering, plugins, etc.) | P1 |

The sync view is a grid of servers × targets, each cell showing *in sync*, *pending*, *drifted*, *conflict*, or *unsupported*. Agent native settings (SYN‑11) live in a separate per-agent settings view, not in the sync grid.

#### 3.4.1 Agent native settings (SYN‑11)

SYN‑03/SYN‑05 only project MCP blocks. SYN‑11 covers the whole native config file so users never leave Tethys for routine setup:

- Initial targets — the first agents to reach full support: OpenCode, Antigravity CLI, Kiro CLI. Each target gets one form over its native json/toml config file. Claude Code and Codex full support is post-MVP; their MVP surface is MCP-only projection (SYN‑03).
- "Full" means the full file the schema knows about, bounded by the agent's official docs/schema. Advanced areas (hooks, steering, plugins, etc.) stay editable but the form links out to the official schema/docs; anything the form doesn't understand stays available via raw text fallback with no data loss.
- Schemas are community-contributed and must follow the native schema, pinned per agent version (schema id + agent version range + source link).
- Drift handling: unknown keys preserved on write; version mismatch shows a warning, schema validation failure shows an error and blocks apply until fixed or explicitly applied as raw.
- Same safety as SYN‑03: preview diff, timestamped backups, format-preserving edits, ownership tracking, one-click rollback. Credentials follow G7 — secrets stay as `${VAR}`/keychain refs, never written in plain text.

### 3.5 Composer: `/`, `$`, `@`

| ID | Requirement | Pri |
|---|---|---|
| CMP‑01 | **`/` Tethys commands.** Plain markdown files with no frontmatter, in a global folder and a project folder; the filename is the command name; project overrides global. On send, the body replaces the command; any text after the command is appended, or fills an `{{args}}` placeholder if present (PD‑3). Bodies may contain `$` and `@` references | P0 |
| CMP‑02 | **`/` agent commands.** Commands the agent advertises are listed separately and passed through unchanged; name clashes show as `/agent:name` | P0 |
| CMP‑03 | **`$` skills.** Picking a skill guarantees it is used this turn. For agents that load skills themselves, Tethys adds an explicit instruction plus a link to the skill; for others, it includes the skill text. The chosen method is visible on the message | P0 |
| CMP‑04 | **`@` tags.** Fast fuzzy search over files *and* folders in the thread's worktree (FFF). A tag sends a reference to the path, never its contents | P0 |
| CMP‑05 | Prompts typed while an agent is working are queued, editable, and reorderable | P0 |
| CMP‑06 | Line ranges on tags (`@src/auth.rs:40-80`) | P1 |

### 3.6 Layout and navigation

```
┌──────────────┬──────────────────────┬──────────────────────────────────────┐
│ PROJECTS     │ THREADS              │ TURN INSPECTOR                       │
│ hosts > repos│ state, agent, +/-    │ messages · thoughts · plan · tools   │
│ > worktrees  │ filters, search      │ approvals · diffs · restore points   │
├──────────────┴──────────────────────┴──────────────────────────────────────┤
│ ACTION BAR  agent ▾  mode ▾  permissions ▾  worktree  queue  ⏹ Stop        │
│ COMPOSER    /command  $skill  @path …                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

| ID | Requirement | Pri |
|---|---|---|
| UI‑01 | Four resizable regions as above, command palette (⌘K / Ctrl+K), full keyboard access | P0 |
| UI‑02 | Thread states: *Idle, Running, Awaiting approval, Error, Interrupted, Suspended, Archived* | P0 |
| UI‑03 | Global "waiting on you" inbox and OS notifications when a thread needs approval | P0 |
| UI‑04 | Turn Inspector shows streamed messages, collapsible thoughts, live plan, tool calls (with inline diff or terminal), approvals, errors, and per‑turn actions: view diff, restore to before this turn | P0 |
| UI‑05 | Fork a thread from any turn (PD‑4) | P1 |

### 3.7 Monitoring and control

| ID | Requirement | Pri |
|---|---|---|
| MON‑01 | Live agent output, thoughts, plans, and tool call status; clicking a file location opens it | P0 |
| MON‑02 | Activity panel: every agent process with state, CPU, memory, uptime, error output; restart and suspend | P1 |
| MON‑03 | Usage and cost shown only when the agent reports it | P1 |
| MON‑04 | Export a thread as markdown or an event log | P1 |
| MON‑05 | User hooks on events (turn end, needs approval, error) | P2 |

### 3.8 Remote (post‑V1)

| ID | Requirement | Pri |
|---|---|---|
| REM‑01 | Attach to headless Tethys hosts (workstation, VM, dev container) and see them alongside local projects; agents keep running while disconnected | P2 |
| REM‑02 | Remote approvals from a lightweight companion (notification or mobile) | P2 |

---

## 4. Quality Targets

| Area | Target |
|---|---|
| Streaming | 8 visible threads streaming, p95 frame ≤ 16 ms |
| Diff | 5 k‑line turn diff: first paint ≤ 200 ms, smooth scroll |
| `@` search | ≤ 30 ms per keystroke on a 200 k‑file repo |
| Thread switch | ≤ 100 ms |
| Startup | ≤ 600 ms to interactive (excluding agent start) |
| Platforms | macOS and Windows fully supported in MVP; Linux best‑effort until it meets these targets |
| Safety | No agent file writes outside the thread's root; every config push reversible |

---

## 5. Product Risks and Open Decisions

| Risk | Mitigation |
|---|---|
| Vendor terms change or are enforced without warning | Credential principle (G7); three backend classes; compliance matrix with dates; legal review before public launch |
| Config push damages user files | Preview, ownership tracking, backups, one‑click rollback |
| Community settings schemas drift from vendor releases | Version-pinned schemas that follow the native schema; warning on version mismatch, error on validation failure; raw fallback never drops unknown keys |
| Skills and MCP servers run arbitrary code, amplified by YOLO | Trust prompts; YOLO limited to worktrees; per‑thread disable; audit log |
| Many agents exhaust memory | Idle suspension, activity panel, concurrency caps |

| ID | Open product decision | Options |
|---|---|---|
| PD‑1 | Sign‑in guidance for Claude via adapter | **API key by default with notice** (Decided in Spike S0.7) · neutral with notice · hide subscription path |
| PD‑2 | Which vendors accept terminal (Class C) hosting | Confirm per vendor; ship only for confirmed ones |
| PD‑3 | Slash command arguments | Append only · `{{args}}` placeholder (proposed) · positional |
| PD‑4 | Fork behaviour | New worktree + new session with summary · restore point only |
| PD‑5 | Resuming agents that can't reload sessions | Start fresh · user‑approved summary of prior turns |
| PD‑6 | Default worktree location | **`~/.tethys/worktrees/<repo-id>/<slug>`** (Decided in M1.3) · next to the repo |
| PD‑7 | Canonical skill home | `.agents/skills` (proposed) · Tethys folder with links |
| PD‑8 | Licensing and telemetry | OSS license choice · opt‑in anonymous performance data |
| PD‑9 | Plain-directory scope and root | Project-only vs. global default + project override (proposed: global `worktree`, project override) · thread root = workspace root vs. per-thread plain subfolder |

---

## References (verify before implementation)

- ACP Registry: https://agentclientprotocol.com/get-started/registry
- Claude Code legal & compliance: https://code.claude.com/docs/en/legal-and-compliance
- Claude Agent SDK on Claude plans: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- FFF file search: https://github.com/dmtrKovalenko/fff
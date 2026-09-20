# Pages & Views Specification

This document owns **page composition, component behaviour, copy, and flows**. [`DESIGN.md`](../DESIGN.md) owns the design contract: tokens, scales, and per-component metrics (size, radius, padding, colour). Where a component appears below without numbers, its metrics are in DESIGN's `components:` block. Milestone ownership lives in [`milestone.md`](./milestone.md); the API each surface reads and writes lives in [`architecture.md`](./architecture.md) §8.3.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Window Header & Tab Strip (40px)                                  [_][□][×] │
├────┬──────────────┬──────────────────────┬──────────────────────────────────┤
│Rail│ Workspaces   │ Threads Column       │ Stage / Inspector / Diff         │
│48px│ 264px → 48px │ 280px (collapsible)  │ (flex stage)                     │
│    │              │                      ├──────────────────────────────────┤
│    │              │                      │ Action Bar (56px) + Composer     │
└────┴──────────────┴──────────────────────┴──────────────────────────────────┘
```

## 0. ACP Session Model (read first — everything below maps onto this)

Tethys is an ACP Client, not a custom agent runtime. Every page in this spec is a view onto the same three-tier state model, so the terminology needs to be exact before the pages make sense:

- **Provider** = one ACP connection (what the protocol calls an "Agent" — Claude Code, Codex, OpenCode, etc.). Tethys opens one persistent connection per *enabled* provider at launch, in parallel, via `initialize` capability negotiation and `auth/login` if the provider advertises `authMethods`. One provider's connection failing (missing binary, expired auth) never blocks the others — each is isolated, so aggregate health chrome (rail daemon dot, `provider-row` dots) is per-Provider, never all-or-nothing.
- **Workspace** = a directory (`cwd`). This is the unit shown as a `workspace-card` in the hub (§2). A workspace can host concurrent sessions from *different* providers at once — e.g. Claude Code drafting a fix while Codex reviews it in the same folder — so "workspace" and "provider" are orthogonal, not nested.
- **Session** = one `session/new` conversation, belonging to exactly one Provider + one Workspace. A Tethys "thread" (tab, `session-list-row`) is a UI-level wrapper around one Session. Starting a thread means calling `session/new` with `cwd` (the workspace's git-worktree path, or the workspace folder itself where there is no worktree — see §0.1) and the `mcpServers` relevant to that workspace.

Two consequences that change earlier assumptions in this doc, corrected in the sections below:

1. **Permission resolution lives entirely in Tethys, never in a vendor CLI's own terminal.** Every tool call a Provider wants to run surfaces via `session/request_permission`, with the Provider supplying its own `options` array (its exact allow/reject choices — not a fixed pair Tethys invents). Tethys's permission mode (Supervised / Auto-edit / YOLO) decides whether to auto-pick an option or surface it to the user. Because ACP routes every consent decision through the Client by design, there is no separate CLI-level prompt to "de-dupe" against — an earlier draft of this doc got that wrong.
2. **"Agent" no longer means "running thread."** Where earlier language said things like "2 agents running" on a workspace card, it reads "2 sessions" (and, where it matters, names the providers) — "agent" is reserved for the Provider connection itself. This is a copy rule, not just terminology: counts read `2 sessions`, `Provider` labels appear in the selector and settings, and `Session` labels appear in the hub, tabs, and the sessions column.

### 0.1 Workspace capabilities (read second — git is a feature, not a prerequisite)

A Workspace is a folder. Any folder can be one, git-initialized or not. What Tethys can do with it is a **resolved capability set** (`architecture.md` §10.6), and every surface reads that set instead of assuming git or re-deriving it:

| Capability | Values | What it gates |
|---|---|---|
| `vcs` | `none` · `git-local` · `git-remote` (host: GitHub / GitLab / other) | Source badge, canvas mode, `git-init-upsell-chip`, worktree isolation |
| `restore` | yes / no | `Revert Turn`, restore triggers, per-turn checkpoints |
| `max_concurrent_sessions` | 1 (no worktree mechanism to isolate parallel sessions) · many | `+ New Thread`, fork |
| `isolation` (V1) | `worktree` · `plain` | Worktree creation; `plain` hides git UI even in a git folder |
| `forge_cli` (V1) | none · `gh` · `glab` | Push / PR actions |

Rules that apply on every page:

- **Degrade explicitly, never silently.** A surface that needs a capability the workspace lacks is hidden or disabled with a stated reason (`no git · no revert`), not left blank and not faked. There is no app-managed snapshot fallback in MVP — reversion follows the session's own capabilities.
- **The cap is enforced in core, not by a disabled button.** The UI reflects `max_concurrent_sessions`; `thread.create` refuses a second session where it is 1.
- **Tethys is a control plane, not a git or forge client.** GitHub and GitLab appear only as **remote status** — the badge on a workspace that already has a remote, and (V1) ahead/behind and an existing PR for a branch when the user's own `gh`/`glab` reports one. They are never an entry point: Tethys does not clone, browse remote repositories, authenticate to a forge, or review PRs in-app. The one forge *action* (push / open PR, WT‑08, V1) is handed to the user's own CLI and only renders when `forge_cli` is present.
- **Two different "remotes".** `Local | Remote` in the hub is *where the folder lives* (this machine vs. an SSH/container host). A git remote is *where the repository is pushed*. They are orthogonal: a folder can be Local + git-remote, Local + no-VCS, Remote + git, or Remote + no-VCS.

---

## 1. App Shell & Global Chrome (`UI-01`)

The global application shell wraps all windows in a native, lightweight window frame optimized for parallel workflows.

**Layout**

- **Activity Rail (Left)**: Fixed `48px` width, background `{semantic.surface-rail}`. Structural border on the right (`{semantic.hairline-structural}`).
- **Hub list**: collapsible workspace list beside the rail, `264px` → collapsed `48px`. Rows are workspace icon + name (`body-sm`) + status dot. Collapsing preserves the rail; `Esc` never collapses it while the palette is open.
- **Window Header & Tab Strip (Top)**: Height `40px`, background `{semantic.surface-rail}`. Structural border along the bottom. Insets `~70px` left padding on macOS for traffic lights, or reserves `140px` right padding on Windows for native caption controls. Linux uses an in-app header bar with minimize/maximize/close (`16px` glyphs, `32px` targets). The header doubles as the window drag region.
- **Splitters**: every column edge is a `1px` structural line with a `6px` transparent hit area. Hover recolors only — width never changes, so the layout never shifts. Dragging shows the focus accent; double-click resets to the token width. `separator` role with `aria-valuenow`.
- **Command Palette Modal (`command-palette`)**: Centered overlay (`600px × 400px`, Level 4 elevation) triggered anywhere via `Ctrl/Cmd + K`. An input row over a grouped list (commands, files, threads, actions) with `36px` rows and `mono-micro` hints. `↑↓` moves, `Enter` runs, `Esc` unstacks. Empty shows `No results`; loading shows skeleton rows. First-result target is sub-millisecond via FFF-backed `search.files`.

**Components**

- `nav-rail`: Contains top cluster (Workspaces `grid` icon, New Thread `compose` icon) and bottom cluster (Global Settings `gear` icon, daemon health dot). Icons use `{icons.sizes.rail}` (20px) with `36px` hit targets. The selected item carries a `2px` accent bar on its left edge.
- `tab-bar` & `tab-item`: Horizontally scrollable tab strip supporting multi-workspace tabs. The Workspaces hub is pinned permanently at index 0 with no close affordance. Sibling tabs render as `[Icon] [workspace / branch] [×]`; a session with no branch (a non-git folder) shows `[Icon] [workspace / session title] [×]`.
- `approval-inbox-pill`: Persistent tab-bar pill `Waiting on you (N)` rendered with a `{semantic.status-warning}` pulse dot and a `mono-micro` count. Hidden when the queue count is 0. The hub's `Needs attention (N)` filter chip reuses it in its selected state — same component, different placement.
- `status-dot`: one shared dot for every state surface (rail daemon health, hub rows, session rows, provider rows, topology nodes), so `UI-02` states map exactly once. `Idle` → agent-idle, `Running` → agent-active filled disc (pulse), `Awaiting approval` → warning **ring** (pulse), `Error` → danger, `Interrupted` → muted, `Suspended` → strong hairline, `Archived` → hairline. Provider and daemon health reuse it: `Healthy` → success, `Authentication required` → warning filled disc (no pulse), `Not found` → danger. Shape is part of the encoding, not decoration: the ring is what separates "blocked, needs you" from "working" and from `Authentication required` once pulses are suspended (`prefers-reduced-motion`, unfocused window), so `Awaiting approval` never shares both hue and shape with another state. An unrecognized state renders the neutral idle dot rather than failing.

**Behaviour**

- Switching tabs never unmounts background execution streams or uncommitted diff state.
- Window blur dimming: inactive window dims background surfaces to `60%` opacity while preserving hairline structure, and suspends accent pulses.
- Daemon health dot reflects aggregate provider connection health (any healthy connection = green), not an all-or-nothing state — one provider being down doesn't turn the whole app red, per §0's connection-isolation rule.

**UX Flow**

- `Ctrl/Cmd + 1..9` jumps instantly to open workspace/thread tabs.
- Clicking the `Waiting on you` tab pill slides out the `approval-queue-drawer` without interrupting the active conversation.

---

## 2. Workspace Catalog Hub (`/workspaces`)

A Railway-style catalog presenting workspaces — any folder, git-tracked or not — and the sessions running in them as self-contained operational tiles.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Workspaces   [ Local | Remote ]     [Search ⌘K] [Needs attention ●2] [⊞][≡] │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐  │
│ │ certificate-gen    ☆ │ │ vocasia-next    ⚠ ☆  │ │ geep-itb          ☆ │  │
│ │ ┌──────────────────┐ │ │ ┌──────────────────┐ │ │ ┌──────────────────┐ │  │
│ │ │   ●─┬─●          │ │ │ │   ●─┬─◐ (amber)  │ │ │ │      ○           │ │  │
│ │ │  ····└─●····     │ │ │ │  ····└─●····     │ │ │ │  ···········     │ │  │
│ │ └──────────────────┘ │ │ └──────────────────┘ │ │ └──────────────────┘ │  │
│ │ main · 2 sessions    │ │ main · 1 waiting ⚠  │ │ main · idle          │  │
│ │[◆fix-auth +34-12 T8]│ │ [◇api-v2 +9-2 T3]   │ │                      │  │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Layout**

- Top bar: Title `{typography.heading-lg}`, Segmented Control (`Local` | `Remote`), search bar (`Ctrl/Cmd K`), `Needs attention (N)` filter chip, sort selector (`Recent Activity`), Grid/List toggle, and `+` Add workspace (opens `workspace-trust-dialog`, §2.1). List view reuses `session-item-row` at full width.
- Content Area: Responsive CSS grid `repeat(auto-fill, minmax(320px, 1fr))` with `{spacing.lg}` (16px) gap and `{spacing.xl}` (24px) padding.
- Slide-over Peek Drawer: `380px` wide flyout from the right window edge (`workspace-peek-drawer`).

**Components**

- `segmented-control` (`Local` | `Remote`): `Local` = folders on this machine; `Remote` = SSH, containers, cloud workspaces (post-V1, shows an empty state until `REM-01`). Says nothing about version control — VCS status is carried per card by the source badge.
- `workspace-card`: 220px height. Top bar: workspace title (`{typography.heading-md}`), `workspace-source-badge`, favorite star, and a card-level `⚠` badge mirroring the highest-severity node state. Body: the topology canvas (below) in one of two modes decided by VCS status — never a static centered vendor logo. Footer, two lines: a status line (`{branch} · N sessions` in `mono-micro`; `● N sessions` in the running accent while running, `1 waiting ⚠` in warning when a `session/request_permission` is pending, `idle` otherwise — never "N agents") and a session cluster (as many `session-item-chip` pills as fit at the chip's `minWidth`, capped at 3, plus a `+N more` overflow chip — a card at the 320px grid floor fits 2; the `git-init-upsell-chip` instead of chips on a no-VCS card with no running session). Hover → `surface-card-hover` and a stronger border. While its `workspace-peek-drawer` is open the card renders `workspace-card-selected` (the left accent bar); it clears when the drawer closes.
- `workspace-source-badge`: Small top-left glyph + label pair identifying the workspace kind — `Git · GitHub`, `Git · GitLab`, `Git · local` (git-initialized, no remote configured), or `Folder · no VCS`. The GitHub/GitLab value is the **git remote's host**, read from the folder's existing remote; it says nothing about where the folder lives and is never a way to add a workspace. A secondary `Remote` tag appends when the folder lives on an SSH/container host rather than the local disk. Vendor logos (GitHub/GitLab) are the sanctioned non-Geist exception; the folder and local-git glyphs are Geist.
- `session-topology-canvas` — inset dot-matrix well (`{semantic.grid-dot}` at 12px intervals). Every node carries a small provider glyph (Claude Code / Codex / OpenCode) because a single workspace can run concurrent Sessions from different Providers — a first-class scenario under ACP's session model (§0), not an edge case. Node encodes state by hue **and shape**: `{semantic.accent-agent-active}` filled disc (pulsing) = running, `{semantic.status-warning}` **ring** (pulsing) = waiting on approval, `{semantic.grid-dot}` outline = idle, `{semantic.status-danger}` = errored/blocked turn. The ring is what keeps "working" and "blocked, needs you" distinguishable at a distance once pulses are suspended. Pulses respect `prefers-reduced-motion` and window focus (DESIGN.md Platform States). Two modes:
  - **git-topology mode** (`vcs` ≠ `none`): a trunk node (`main`) and one branch node per active Session, joined by thin edges. The card-level `⚠` mirrors the highest-severity node so it's scannable without opening the card.
  - **single-node mode** (`vcs` = `none`): the same dot-matrix background and a single centered node — there's no worktree mechanism to isolate parallel Sessions in a plain folder, so there's only ever one Session to represent. The node keeps the running/waiting/idle/error color coding and its provider glyph.
- `session-item` — one component, two density variants that bind the same fields (`provider_id`, `branch_name`, `session_status` (`running | idle | awaiting | error`), `turn_count`, `diff_stats` (`+added -removed`), `has_uncommitted`):
  - **`session-item-chip`** (card footer): provider glyph, branch name, live diff stat (`+34 -12`), and turn checkpoint (`T8`). A chip with a pending approval renders an amber outline instead of the default hairline **and** a `statusMarker` on the provider glyph (amber ring = awaiting, filled sky disc = running), so awaiting reads without colour or motion. In single-node mode it collapses to one unnamed session chip (no branch name to show). The overflow chip uses identical metrics and opens the peek drawer. Legacy alias: `thread-chip`.
    - **Truncation and tooltip**: the branch name truncates with an ellipsis and the full name is the chip's tooltip. A long real branch such as `feature/JIRA-4821-fix-auth-token-refresh` (40 characters, ~273px in `mono-micro`) cannot fit a chip and always truncates. When the chip is narrow, the turn count drops first, then the diff stat; the glyph, marker and branch never drop.
    - **Slot priority**: when there are more sessions than chip slots, chips are ordered awaiting-approval first, then running, then most recently active; the overflow chip takes the rest. A pending approval never folds into `+N more` while a lower-priority chip holds a slot.
    - **State precedence** (capability-gated, pending, hovered, selected together) follows DESIGN.md State Precedence.
  - **`session-item-row`** (peek drawer, list view): full-density row — agent pulse dot, branch slug, turn checkpoint counter, diff badge, and a trailing rollback button on hover/focus. Where the workspace has no git or no restore capability, the diff badge and rollback are hidden and the row shows `no git · no revert` subtext.
  - Chips and rows are `button`/`option` roles; `Enter` activates, arrow keys move within the cluster/list. Reused everywhere a session appears — never a second chip style.
- `git-init-upsell-chip`: Shown only on no-VCS cards, inline in the footer — `Initialize git →`. Running it performs a local `git init` plus an initial commit of the folder's current state in place, then hot-swaps the card from single-node to git-topology mode without navigating away. It adds no remote. `loading` uses the standard skeleton pulse; failure raises a toast and leaves the card in single-node mode.
- `workspace-peek-drawer`: `380px` slide-over, Level 3. Header: workspace title + source badge + close `×`. Tabs: `Sessions` (default) and `Approvals` (opened directly when the workspace has pending requests). Sessions are grouped by Provider as `session-item-row`s with turn checkpoint counters and uncommitted diff stats, plus a footer `+ New Thread` action (disabled per the concurrency gate below). Slides with the base motion; the scrim appears only on narrow windows, otherwise the drawer is modeless and the catalog stays interactive. Focus moves into the drawer on open, returns to the invoking card on close, and `Esc` closes.

**Behaviour**

- Single-clicking a card body or header opens the `workspace-peek-drawer` (modeless; catalog stays interactive). If the workspace has pending approvals, the drawer opens directly to its `Approvals` tab. A card never performs full-window navigation.
- Clicking a `session-item-chip` spawns a dedicated top-level tab for that session, immediately focused.
- Double-clicking a card opens or focuses the primary/most-recent thread for that workspace.
- Hovering an idle card surfaces a `+ New Thread` overlay button in the canvas, so starting work on a dormant workspace doesn't require opening the drawer first.
- **Concurrency gate**: where `max_concurrent_sessions` is 1 and a session is already running, `+ New Thread` is disabled (tooltip: "This folder isn't version-controlled, so only one agent can run here at a time. Initialize git to run threads in parallel.") rather than silently allowing a second agent to write into the same tree. Core enforces the same limit (§0.1).
- The catalog stays mounted while a session tab is open; switching tabs never unmounts it.
- Card footers show only as many chips as fit at the chip `minWidth` (never more than 3); further sessions collapse into a `+N more` chip that opens the peek drawer. Never crowd the footer. The figures behind this (a 320px card leaves ~286px inside its padding and border) are indicative — the implementing chunk verifies them against the rendered font.
- Cards stay on `{semantic.surface-card}`; no colorful fills.

**UX Flow**

- User lands on Catalog → clicks a `fix-auth` chip → a new tab `[ ⌗ vocasia-next / fix-auth × ]` slides in smoothly next to the pinned `Workspaces` tab → user immediately enters the thread execution view.
- User has three workspaces running sessions in parallel → clicks `Needs attention (2)` → grid filters to only the `vocasia-next`-style cards with a pending approval → user works the queue card by card without hunting across an unfiltered grid.
- User drops a scratch folder with no git history into Tethys → card renders in single-node mode, footer reads `no version control · 1 agent (max)` with an `Initialize git →` chip → user clicks it once they're ready to parallelize, and the card upgrades in place.

### 2.1 Add Workspace Flow & Trust (`workspace-add-flow`, `workspace-trust-dialog`)

Adding a workspace and trusting it are treated as one flow, not two — the folder never appears as a usable card, and no Provider process is spawned against it, until trust has been granted.

**Trigger points**

- `+` action in the Workspaces hub top bar, or the rail's `compose` icon with no active workspace context.
- Native OS folder picker (local) or a remote path + existing SSH/container connection picker (remote) resolves a target directory. A directory dropped onto the catalog opens the same flow.
- Tethys inspects the resolved path — git-initialized or not, has a remote or not, local or remote host — and opens `workspace-trust-dialog` before creating a card or spawning any agent process against it. Inspection is read-only: it never clones, fetches, or writes.

**`workspace-trust-dialog` — layout & copy**

- A focus-trapped modal (`480px`, Level 4).
- Header: shield glyph + `Trust this folder?`
- Path row: resolved absolute path, home-dir shortened (`~/dev/vocasia-next`), monospaced.
- `workspace-source-badge` echoed inline so the trust decision is made with full context (git+remote / git local-only / no VCS; local disk / remote host).
- Body copy branches by source:
  - **Local, git-tracked**: "Coding agents will be able to read, edit, and run commands inside this folder and its subfolders. Tethys creates an isolated git worktree per thread so parallel agents can't collide."
  - **Local, no VCS**: "This folder isn't tracked by git yet, so Tethys can't isolate agent runs into separate worktrees — only one thread can run here at a time until you initialize git." Inline `Initialize git now` checkbox lets the user opt into git-topology mode as part of trusting, instead of doing it later from the card.
  - **Remote (SSH/container)**: adds a heavier-weight warning line — "This folder lives on `{host}`. Trusting it means agent commands run directly on that machine; Tethys does not sandbox execution on remote hosts." Rendered with `{semantic.status-warning}` emphasis, not the default body color.
- Permission mode radio — `Supervised` (default) / `Auto-edit` / `YOLO`, the modes of PRM‑01. `Auto-edit` allows file edits inside the thread root and still asks for commands and network.
- Trust scope checkbox: `Just this folder` (default) vs `This folder and subfolders opened later`.
- Footer: `Cancel` (secondary) / `Trust & Add Workspace` (primary; disabled until a path is resolved).

**Behaviour**

- Trust decisions persist in a local trust store keyed by resolved absolute path (plus host identifier for remote folders), alongside the chosen permission mode and a timestamp.
- Re-prompts automatically if the folder's git remote changes or its resolved path changes underneath it (e.g. a symlink swap) — both are treated as a new, unverified target even if the display name is unchanged.
- Trusted folders are listed and revocable from `Settings / General` (`Trusted Folders` list) — see §5.1. A workspace whose trust was revoked renders as destructive in the selector pill and is not selectable.
- **Single consent surface, by protocol construction**: the permission mode chosen here becomes Tethys's local policy for resolving every `session/request_permission` call from that workspace's Sessions (§0) — auto-picking an option for Auto-edit/YOLO, or surfacing the Provider-supplied options to the user for Supervised. Because ACP routes all tool-call consent through the Client, there's no separate vendor-CLI prompt to suppress here; the one exception is a Provider's one-time `auth/login` (§5.2), which is a distinct, earlier step handled by the Provider's own connection, not by this dialog.

**UX Flow**

- User clicks `+` in the Workspaces hub → picks a local folder that has no `.git` → `workspace-trust-dialog` opens, source badge reads `Folder · no VCS`, body warns about the single-thread cap, user ticks `Initialize git now` and confirms → card lands in the grid already in git-topology mode with a fresh initial commit.
- The same flow with `Initialize git now` left unticked is fully supported: the card lands in single-node mode and stays there until the user chooses otherwise. Nothing in Tethys requires git.

**Design rationale — vs. the Railway reference**

Railway's card is optimized to answer "is this service up?" — a static, mostly-boolean question, so a single centered glyph plus a footer stat line is enough. A Tethys workspace is running N autonomous Sessions concurrently, possibly across several Providers, some of which are actively blocked waiting on a human decision — that's the thing the hub exists to surface. So the canvas itself became a small live topology (trunk + branch nodes) instead of one icon, and "needs attention" got promoted from a footer detail to a first-class filter, since triaging across workspaces is the primary loop, not just monitoring uptime.

A second divergence: Railway's projects are always fully-formed, connected git repos by construction. Tethys workspaces are just folders — some git-tracked with a remote, some git-tracked locally only, some not version-controlled at all, local or remote in any combination. The topology canvas is therefore a *capability the folder has earned*, not a default — a plain folder gets a single-node canvas and a one-thread-at-a-time cap until it's git-initialized, and the safety guarantees that depend on git (isolated parallel worktrees, instant Revert Turn) degrade explicitly rather than silently.

---

## 3. New Thread Canvas (`/thread/new`)

The distraction-free orchestration stage for composing the `session/new` call that starts a thread: which Workspace, which Provider, and that Provider's own session config options.

```
                             What are we building today?

         ┌─────────────────────────────────────────────────────────────┐
         │ [⌗ vocasia-next ∨]                                          │
         │ Ask Anything....                                            │
         │                                                             │
         │ ┌──────────────────────────────────┐                    (↑) │
         │ │ [▲ Claude Code  Sonnet  Medium ∨]│                        │
         └─┴─┬────────────────────────────────┴──────────────────────┴─┘
             │ Provider (200px) │ Config (varies) │
             │ ● Claude Code    │ Model: Sonnet ∨  Effort: Medium ∨    │
             │ ● OpenCode       │ (schema below is per-Provider —      │
             │ ○ Codex CLI ⚠    │  see note)                          │
```

**Layout**

- Centered prompt canvas under a `{typography.display-lg}` header ("What are we building today?"): vertically centered with a `12vh` optical lift (bottom padding). No fixed top offset.
- `workspace-selector-pill` sits above the textarea as the first field in the prompt card — defaults to the last-active workspace, but is never silently assumed: no thread is created without an explicit `cwd`. Opening this canvas by double-clicking a workspace card pre-fills it; opening it from the rail's global `compose` icon leaves it for the user to pick.
- Prompt Card: `min({layout.prompt-width}, 100% - 96px)` width (820px max), `{rounded.2xl}` (20px), background `{semantic.surface-elevated}`, `1px {semantic.hairline-strong}` border with a `{semantic.edge-highlight}` top edge.
- Two-Column Flyout Popover (`model-selector-popover`): left column is the fixed `Provider (200px)` list; the right column's contents are **not** a fixed `Model | Effort` grid — see Behaviour. Total width `560px`, anchored below the pill and left-aligned to the card; never clips the card's bounds, and flips above the pill only if viewport space requires.

**Components**

- `prompt-card`: Auto-expanding textarea (`{typography.body-md}`, placeholder `Ask Anything…` in muted text). The lower bar is a flex row: `model-selector-pill` left, submit action right. **With no selectable Provider** (none enabled and healthy — including the case where the only Providers need `auth_required` login) the textarea is disabled, its placeholder becomes `Connect a provider in Settings to send a message`, and submit is disabled. The placeholder names the missing precondition and where to fix it, so the empty state reads before the popover is ever opened.
- `workspace-selector-pill`: Compact trigger showing the workspace's `workspace-source-badge` icon + name; opens the same peek-style picker used in §2. Selected shows the resolved path as a `mono-code` tooltip. Submit stays disabled while it is unresolved.
- `model-selector-pill`: Compact trigger `[Provider icon] [Provider name] [config summary] ∨`. The config summary is whatever that Provider's own session config schema returns (often model + effort, but not guaranteed to be exactly that shape): `[▲ Claude Code  Sonnet · Medium ∨]`, `[◈ OpenCode  gpt-5-codex ∨]`, `[◇ Codex CLI ∨]` (no configurable options). A field label dims to muted when the schema marks it unavailable for the current selection; the Provider name never dims. **Zero-provider state**: with no selectable Provider the pill reads `No provider available` in place of the Provider name and config summary. It is the one control in the composer that stays actionable — it remains focusable and opens the popover, whose empty column links to `Settings / Providers` — while the textarea and submit are disabled (see `prompt-card`).
- `model-selector-popover`: Left column fixed-width (`Provider 200px`) listing connected Providers, each with a connection dot (running accent = streaming, success = ready/idle, warning = `auth_required`, idle = unreachable) and a protocol pill (`ACP v2`) where applicable. The right column renders `session-config-panel` (the remaining ~357px of the `560px` popover) for whichever Provider is selected, one `schema-field-group` per declared field; control types come from the schema (listbox for enums, stepper for numbers, toggle for booleans) and long lists scroll inside the panel — the Provider column never resizes. A Provider with an auth problem shows an inline `⚠` and is not selectable until resolved.
- `action-icon-button`: Circular submit pill (`32px`), shifting from `{semantic.surface-hover}` to a primary high-contrast fill when input is present.

**Behaviour**

- **Config options are fetched per-Provider, not hardcoded.** Each Provider's `initialize` response and session config schema determine what's shown on the right — one Provider might expose Model + Effort, another just a Model list, another nothing configurable at all (the panel shows `No session options for this provider`, which is a valid state). The popover renders whatever fields that schema declares rather than assuming the Model/Effort shape universally; that shape (shown in the wireframe above) is illustrative for Claude Code specifically, not a Tethys-wide constant.
- **Auth gate**: selecting a Provider that requires `auth/login` and hasn't completed it opens `LoginDialog` (§5.2) inline in the popover before that Provider becomes selectable — never lets a prompt submit against an unauthenticated connection.
- States: an empty Provider column reads `No connected providers — add one in Settings / Providers`; the panel shows a three-row loading skeleton within its width; a handshake error renders a danger row with retry. This is the second level of the zero-provider state — the first is the composer itself (`prompt-card` placeholder and `model-selector-pill` label above), so a first-run user is told before opening anything. Submit is disabled by any of: an unresolved workspace pill, the auth gate, or no selectable Provider.
- Selector writes narrow within Tethys policy, never widen it (`PRM-04`).
- Keyboard navigation: `Enter/Space` opens the popover from the pill; `↑/↓` navigates the active column; `→` drills in, `←` steps back; type-ahead filters the active column; `Tab` cycles regions as an accessibility fallback; `Enter` confirms selection and focuses back to the prompt textarea; `Esc` cancels, closes, and returns focus to the textarea (with the popover closed, `Esc` is a no-op).

**UX Flow**

- User types query → confirms the workspace pill (or leaves the pre-filled default) → picks a Provider → the config panel updates to that Provider's own schema → presses `Ctrl + Enter` to submit → Tethys calls `session/new` with the chosen `cwd`, that workspace's `mcpServers`, and the selected config → canvas transitions into the Active Thread Workspace once the Session is created, and the typed prompt is delivered as the session's first turn.

---

## 4. Active Thread Workspace (`/thread/:id`)

The four-region control plane for executing turns, inspecting thought streams, approving commands, and — where the workspace has git — reviewing worktree diffs (`UI-01`, `UI-04`, `WT-04`).

```
┌────┬──────────────┬─────────────────────────────┬───────────────────────────┐
│Rail│ Sessions Col │ Main Conversation Stage     │ Turn Inspector & Diff     │
│    │ (280px)      │                             │ (360px collapsible)       │
│    ├──────────────┤ User: Fix the auth tokens   ├───────────────────────────┤
│    │▾ vocasia-next│                             │ ▶ Plan (3/5 steps)        │
│    │  ◆ Claude Code Agent: Inspecting jwt.rs... │ ▶ Thought Stream (14s)    │
│    │  ● fix-auth  │ ┌─────────────────────────┐ │ ▼ cargo test --auth       │
│    │    +42-12 T8 │ │ [Tool: read_file src/..]│ │   stdout: [PASS] 4 tests  │
│    │  ◇ Codex     │ └─────────────────────────┘ │ ├───────────────────────────┤
│    │  ○ review    │ ⚠ Approve file edit?        │ Branch Changes (+42 -12) †│
│    │    clean T2  │ [Allow once][Allow always]  │ src/jwt.rs (unified/split)│
│    │              │ [Reject]                    ├───────────────────────────┤
│    │              │                             │ [Stage Hunk][Revert Turn]†│
│    │              │ [◆Claude·Sonnet·Med][●●○12k]│ ⚙ Auto-edit (this session)│
└────┴──────────────┴─────────────────────────────┴───────────────────────────┘
† git-only: rendered per §0.1. With no git the inspector ends after the tool calls,
  session rows show turn count only, and the Action Bar's isolation pill reads `no git`.
```

**Layout**

- **Sessions Column (`280px`)**: three-level grouping — Workspace → Provider → Session — rather than a flat list, since one workspace can hold Sessions from several Providers at once (§0). Provider sub-grouping is required, not cosmetic. `session-group-header` rows sit above `session-list-row` entries; collapsing a Workspace header collapses its Provider groups, and roving `tabindex` spans the flattened visible list (`Enter` focuses the stage). Below `800px` the column collapses to an icon strip.
- **Main Stage (Center-Flex, min 560px)**: Streamed Markdown turns, collapsible thought blocks, plan panel, inline tool-call cards, and inline permission-request cards. Below `560px` the stage switches to overlay mode rather than shrinking.
- **Turn Inspector & Diff Panel (`360px`, Right)**: Collapsible sidebar housing the plan, turn telemetry, raw JSON payloads, and — where the workspace has git — patch inspection and the checkpoint footer. Collapses to an overlay drawer when the viewport drops below `1100px`.
- **Action Bar & Composer (Bottom Docked, `56px`)**: Provider/config pill, mode pill, permission-mode pill (scoped to this Session, overridable from the workspace-level default set in `workspace-trust-dialog`), **isolation pill** (the branch when the session has a worktree, `no git` when it doesn't), `usage-bar` (rendered only when the Provider reports token usage), queue count, and `Stop`. **The bar folds by priority as it narrows toward `stage-min` (560px)**: `usage-bar` folds first, then the queue count, then the mode pill, into a trailing `•••` overflow popover; `Stop` and the isolation pill never fold, and a folded queue count leaves a warning dot on the `•••` trigger so queued prompts are not silently hidden. Pills contributed through `registerActionBarSlot` declare a priority and fold by the same rule (an undeclared slot folds before `usage-bar`). Full priority order in DESIGN.md `action-bar`. The composer docks centered at `{layout.prompt-width}`, with a floating `560px` variant inside the peek and queue drawers; fixed and floating share `prompt-card` + `composer-chip` tokens.

**Components**

- `session-list-row` (replaces `thread-list-row`): Workspace header (collapsible) → Provider sub-header → Session rows, each with a status dot, provider glyph, title, branch (`mono-micro`), turn count (`T8`), a dirty dot, a running pulse, and a `Fork` action. Branch, dirty dot and diff stat are present only where the session has a worktree; turn count always shows. `Fork` opens a new Session in the same Provider + Workspace — `session/resume` with `replayFrom: start` where the Provider supports it, otherwise a fresh `session/new` with the transcript summarized into the first message — and its tooltip states which path applies, read from the Provider's negotiated capabilities. It is subject to `max_concurrent_sessions`.
- `turn-message` & `thought-block`: Distinguishes user prompts from internal agent thought streams (collapsible panel in `{semantic.surface-panel}`), sourced from `session/update` message chunks.
- `plan-panel`: Renders the Provider-reported plan (a `session/update` plan notification) as a checklist of steps with pending/in-progress/completed status and a `(3/5 steps)` header count. Optional per Provider — hidden entirely for a Provider that never sends one, rather than shown empty.
- `tool-accordion`: Collapsible execution log keyed by `toolCallId`, on `{semantic.surface-nested}`. Header: tool icon, name, and `status-dot`. Body: the command line in `mono-code`, a collapsible input JSON, and streamed content in a sunken code block (`{semantic.surface-sunken}`) with a cap and a `View full` link to the blob. It shows the tool's `kind` (read/edit/execute/etc.) and `status` (pending/in_progress/completed/failed). Built from `tool_call` / `tool_call_update` notifications, so partial updates patch the same card in place rather than appending a new one. A footer offers `View diff` / `Restore to before this turn` where the capability exists.
- `permission-request-card`: Renders a `session/request_permission` call inline in the stage at the point it was requested, plus a mirrored entry in the `approval-queue-drawer` (§1), both from one source of truth. Title and description come from the request, with the command or diff excerpt in `mono-code` and the affected paths. **Buttons are generated from the Provider's own `options` array** (commonly `Allow once` / `Allow always` / `Reject`, but Tethys renders whatever the Provider sends, including custom option kinds and counts, in the order the Provider sent them) — never a hardcoded Approve/Reject pair; an option whose kind rejects uses destructive tokens. In Auto-edit/YOLO mode Tethys picks a matching option itself per the workspace's trust policy and renders the card resolved and read-only, showing which option was auto-picked and why; policy can only narrow, never widen, what an agent mode would allow. An OS notification mirrors the inbox count. This is a distinct control from `Approve & Commit` below: this card authorizes a tool call *before* it runs; `Approve & Commit` is Tethys's own post-hoc git staging step once a turn's diff is on screen.
- `elicitation-card`: Handles the rarer case of a Provider asking the user for structured input mid-turn (`elicitation/create`) — rendered as a small inline form generated from the requested schema, distinct from a permission request (it collects data; it does not authorize a tool call). Providers that don't declare `elicitation` never render it.
- `diff-viewer` *(git only)*: Unified or split patch viewer (scroll anchor preserved across the toggle) on a sunken well, with per-file headers (path, `+a −b`, stage toggle), per-hunk `Stage` and `Discard` buttons (discard is destructive), and turn checkpoint restore triggers (`Restore worktree to before this turn`). A commit box takes input plus `Draft with agent` → a synthesized message preview → stage/unstage/discard/commit; its primary action is `Approve & Commit`, which never reuses `permission-request-card` copy. Diffs past `1MB` / `20k` lines collapse with a `Load file` affordance.
- `composer` (docked `prompt-card` + `composer-chip` pills, `CMP-01..05`): a `/` Tethys command chip (filename = command name, `{{args}}` fills or appends) is listed apart from `/agent:name` commands the Provider advertises, which pass through unchanged and render a clash as `/agent:name`; a `$` skill chip carries a visible injection-method badge — Tethys adds a plaintext instruction naming the skill and pointing at its `SKILL.md`, and the skill body is never inlined for any agent (CMP‑03); an `@` path chip (FFF `search.files`) sends a plaintext reference to the path, never its contents, with a `path:line` echo where line ranges apply (V1). Prompts typed while a session is running are queued — editable, reorderable, persisted — and sending appends without interrupting the stream.
- `usage-bar`: Small SVG ring in the Action Bar showing this Session's token usage against its context budget, when the Provider reports it. Hidden when unreported; never estimated.

**Behaviour**

- Turn execution streams live via `session/update` notifications without freezing the UI. Turn states: `Running` (sky filled dot, pulse) / `Idle` / `RequiresAction` (amber **ring**, pulse — a ring, not a disc, so it stays distinct from `Running` when the pulse is suspended) / `Error` (danger + retry) / `Interrupted` (muted + resume).
- **Cancellation is two layers, not one**: `session/cancel` is sent first as a clean protocol-level interrupt and the Agent is expected to acknowledge with a `cancelled` stop reason. The `SIGINT → grace period → SIGTERM → SIGKILL` escalating ladder is a *fallback* for a Provider subprocess that doesn't respond to `session/cancel` within the grace window — it's Tethys's safety net underneath the protocol-level cancel, not a replacement for it. `Stop` therefore renders as a neutral pending control after the first press, and takes destructive styling only once that grace period has actually elapsed.
  - **Grace window and how it is surfaced.** The cancel grace window is **5s by default** (the core's `cancel_grace` option); on the process ladder a fixed 100ms separates `SIGTERM` from `SIGKILL`. A press must visibly register: `stop-control` enters its pending phase immediately, labelled `Cancelling…`, with a fill that depletes across the grace window so the time remaining is legible without a number (DESIGN.md `stop-control`). At 5s a numeric countdown is noise; the numeric `m:ss` readout belongs to `LoginDialog`'s ~300s codes (§5.2).
  - **The backend, not the webview, owns the clock.** `cancel_requested` carries a grace deadline timestamp, and `grace_elapsed` / `terminating` arrive as backend state events — the UI renders from the deadline and never runs its own timer as the authority, and a second click does not advance the ladder. (Whether the ladder then runs on its own or waits for the `Force kill` press is decided with that backend contract.)
  - Reduced motion: the fill is a width change, not a looping animation, so it is unaffected; the pending spinner is suspended like every other looping animation (DESIGN.md Platform States).
- **History doesn't depend on what a Provider can replay.** `session/resume` and history replay (`replayFrom`) are optional, per-Provider capabilities (§5.2 shows which Providers support them) — Tethys keeps its own local transcript cache of every Session regardless, so reopening a tab always shows full history from that cache. Resume is used only to reconnect a *live* Provider-side session when supported; when it isn't, reopening a tab starts a fresh `session/new` and displays the cached transcript as read history above the new live turns, divided by a hairline labelled `Earlier history (read-only)`.
- **Review is capability-driven.** Revert, diff, stage and commit affordances render only when the workspace's `vcs` is git and (for revert) `restore` is yes. Otherwise they are hidden or disabled with a `no git · no revert` explanation, so a fresh session never looks broken. Git is a feature, not enforcement: the hub accepts any folder, and there is no app-managed snapshot fallback in MVP. In-place `git init` is the upgrade path to full worktree behaviour, and `isolation: plain` (WT‑11, V1) is the explicit opt-out that hides git UI even where it would otherwise be available.

> **Open design decision — commit/diff visibility from the composer.** The isolation pill pins *branch context* to the action bar, but `Approve & Commit` lives only in the Inspector's `diff-viewer`: `360px`, docked, collapsing to an overlay drawer below `1100px` viewport. In an overlay-mode window (a half-width window, a small display) with an uncommitted diff, the commit action is off-screen until the user opens the drawer. The stage/inspector split is a deliberate architectural choice, so this records the question rather than changing it. Options for the team: **(a)** a summary chip in the action bar when a diff exists that opens the Inspector — cheapest; it can show a changed-file count and `+a −b` from the diff summary today, but *not* a staged-hunk count, because `git.stage` is path-level and only `git.discard` is hunk-granular; **(b)** hoist `Approve & Commit` into the action bar itself; **(c)** keep the split and auto-open the Inspector on a turn's first diff. Needs a decision before M1.9 fixes the inspector layout. Separately unspecified: between `1100px` and the width where all four regions plus `stage-min` (560px) fit, the Inspector is docked but the stage can fall below its minimum, and "overlay mode" for the stage (§4 Layout) is not defined.

**UX Flow**

- Where the workspace has git: agent suggests edits → diff renders automatically in the right inspector → user reviews hunks inline → clicks `Approve & Commit` (Tethys's own git staging action) or, where restore is available, `Revert Turn` to cleanly roll back the git temporary index in under 150ms.
- Where it doesn't: agent edits files in place → the turn completes with its tool calls and messages in the transcript and no diff section → the isolation pill reads `no git`, with `Initialize git` offered from the card.
- Agent wants to run a shell command → `permission-request-card` appears inline with the Provider's own options → user picks one (or, in Auto-edit/YOLO mode, Tethys picks on their behalf per the workspace's trust policy) → the tool call proceeds or is rejected accordingly.

---

## 5. Settings Surface (`/settings`)

A unified configuration surface: a left-hand navigation column of `settings-nav-item` rows (`General`, `Providers`, `Skills & Commands`, `MCP Servers`, `Keybindings`), a breadcrumb (`Settings / <page>`), and a per-page header with right-cluster controls. Subpages open inside the central settings stage.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings / Providers                                              [_][□][×] │
├──────────────────┬──────────────────────────────────────────────────────────┤
│ Settings         │ Providers                            Checked 1m ago ↻ [+]│
│                  │ Health check interval: [-] 300 [+] seconds               │
│ ⚙ General        ├──────────────────────────────────────────────────────────┤
│ 🔌 Providers     │ ◉ Claude Code  [ACP v2]                           (∨) [●]│
│ 🧩 Skills & Cmds │   Healthy — ACP handshake verified                       │
│ 🌐 MCP Servers   │ ┌──────────────────────────────────────────────────────┐ │
│ ⌨ Keybindings   │ │ Executable: [/usr/local/bin/claude                ]  │ │
│                  │ │ Mode: [ ACP v2 ∨ ]   [Launch Vendor Login]           │ │
│                  │ └──────────────────────────────────────────────────────┘ │
│                  │ ⊘ Codex CLI                                       (∨) [○]│
│                  │   Not found — binary missing from PATH                   │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

### 5.1 General Settings (`Settings / General`)

**Layout**: Two-column form layout inside the central settings stage.

**Components**

- Appearance selector: `Color scheme` (System, Light, Dark) dropdown.
- Theme Picker: Dropdown reading installed JSON manifests (`Default Dark`, `Default Light`, `Acme Sand`, etc.) with instant hot-swapping (<50ms).
- Typography pickers: UI Font, Code Font, Terminal Font (defaults to Geist Sans and Geist Mono).
- System notifications toggle: Desktop alert toggle for approvals and agent completion.
- `Trusted Folders` list: every workspace trust decision made via `workspace-trust-dialog` (§2.1), one `trusted-folder-row` each — path (`mono-code`), source badge, permission mode, and date trusted — with a destructive `Revoke` action per row. Revoking removes the card from the Workspaces hub and requires re-trusting through the same dialog before it can be reopened.

**UX Flow**: User selects a custom theme → CSS custom properties update on `:root` instantly without app reload. An invalid manifest keeps the current theme and raises a toast.

### 5.2 Providers & Agent Runtimes (`Settings / Providers`)

**Layout**: Header with the breadcrumb, the title, and a right cluster — telemetry label (`Checked 1m ago`, `mono-micro` muted), `+ Add Custom ACP Server`, a `↻ Manual Health Check` icon button, and a health-check interval stepper (`[-] 300 [+] seconds`, clamped `0–3600`; `0` disables background pinging and the label reads `Manual only`; invalid input reverts with a tooltip). Below is a high-density vertical stack of provider rows — single column, separated by hairlines, with no card chrome per row.

**Health re-check triggers**: a Provider is re-checked (executable, version, handshake, auth status) on any of: the background interval (global — the header stepper applies to every Provider; `Manual only` disables it); the `↻ Manual Health Check` button (all Providers); **the close of any login surface — `LoginDialog` or `terminal-sheet` — by any route (success, cancel, `Esc`, code expiry, the vendor process exiting), whether or not login appeared to succeed**; an edit to the executable path; a runtime toggle switched on; app cold start; and network reconnect. The login-close trigger is the one that matters most: because Tethys never reads vendor tokens (G7), a fresh handshake is the *only* way to learn whether a CLI login worked, so without it the amber dot would stay stale until the next interval tick (300s by default) or indefinitely under `Manual only`. A triggered re-check is scoped to that Provider's row. While a re-check is in flight the row shows a loading state on its dot, and the telemetry label reads `Checking…` until the first check completes and `Checked {n} ago` after.

**Components**

- `provider-row`: vendor icon, name, status dot, protocol pills (`ACP v2`, `Early Access`, adapter name), a monospace status subtext (`Not found — Codex CLI ('codex') is not installed or not on PATH`), optional `health-badge` telemetry (`12ms` ping latency plus the handshake protocol; hidden on `Not found`), an expand chevron, and a runtime toggle switch. The dot: Red = missing CLI / connection failed, Amber = detected but disabled or `auth_required`, Green = healthy handshake, Sky = one or more active Sessions (overrides green while leased). The chevron and toggle are separately focusable: `Space` toggles, `Enter` expands.
- `provider-accordion`: Inline collapsible configuration panel that slides down under its row with zero layout shift (sibling rows translate, never reflow text). Contains:
  1. Executable path override input with `Browse…` file picker; a validation error renders in danger `mono-micro`.
  2. Protocol & mode select — `ACP v1` | `ACP v2` | `CLI Subprocess Wrapper`; options the binary can't support show `Unsupported by this binary`.
  3. Injected environment variable key-value manager (`KEY = value` rows, a remove `×` per row, a `+ Add variable` affordance). Values never echo secrets in plain text; secret refs render as `keychain:tethys/…`.
  4. `LoginDialog` trigger: **adapts to whatever the Provider's `initialize` response declares in `authMethods`**, rather than assuming a PTY CLI login is the only path — an env-var-based method renders a key/value form; a URL-based method shows a "Sign in with {Provider} →" link plus a code-confirmation field with a visible countdown (many implementations expire around 300s); a CLI-passthrough method opens the isolated PTY `terminal-sheet` running the vendor's own login command (`claude login`, `codex auth`). If a Provider declares no `authMethods` at all, this control is hidden entirely — there's nothing to log into. Tethys never reads or caches vendor tokens (G7); forms and sheets are input-only, and closing returns focus to the invoking control. Login always opens the surface the Provider's `authMethods` declare — a `LoginDialog` or the `terminal-sheet` — never an inline row form. Closing either surface immediately re-checks that Provider (see Health re-check triggers above); on a successful re-check the row's dot flips amber → green and the Provider becomes selectable in `model-selector-popover` (§3). The URL+code method's countdown is a numeric `m:ss` readout (DESIGN.md `login-dialog`); at 0 the code field reads `Code expired` and offers `Request new code`.
  5. **Negotiated capabilities panel**: read-only summary of what `initialize` returned for this Provider — `session.resume` (yes/no; if no, that Provider's Sessions rely entirely on Tethys's local transcript cache per §4, and `Fork` degrades to a summarized `session/new`), MCP transport support (`stdio` / `sse` / `http`), whether it supports `elicitation`, plus `Last check`, `Latency` and `Detected version`. This turns "Healthy — ACP handshake verified" from a boolean into something the user can actually act on when a feature (like Fork, which leans on resume) behaves differently per Provider. MVP renders negotiated values with static health; V1 wires live re-check without changing the container.
  6. **Native-settings slot** (entry point now, runtime post-MVP): a reserved group headed `Native config (full file)` with an `Open schema form` button and a `View raw` link, so a generated form (SYN‑11) drops in without altering vertical rhythm; includes a version-drift banner slot and a `Preview diff / Rollback` action row.
- `toggle-switch`: instant runtime enable/disable, `Space` toggles, `aria-checked` bound to the profile's enabled state.
- `terminal-sheet`: isolated interactive terminal overlay for vendor login, an xterm surface on the sunken well. Its title shows the exact command being run; no copy-out of secrets; closing returns focus to `Launch Vendor Login`.

**UX Flow**: Missing CLI detected → user expands accordion → pastes custom binary path → clicks `Manual Health Check` → status dot flips to green. Auth-required Provider detected → user expands accordion → `LoginDialog` renders the method that Provider actually declared → the user completes or dismisses it → on close Tethys re-checks that Provider at once → on a successful re-check the status dot flips from amber to green and the Provider becomes selectable in `model-selector-popover` (§3).

#### 5.2.1 Profiles & activity

- `profile-card`: icon, name, version pin, an `Update available` pill, and an `Install`/`Update` button (`agent.registry.*`). The launch-spec editor (executable, protocol, env) reuses the provider-accordion tokens.
- Provider actions: `Login` (`LoginDialog` or `terminal-sheet` per declared `authMethods`), `Restart`, and `View stderr` (a sunken well).
- Activity table of `process-row`s: PID, CPU%, RSS, uptime, state, plus the cancellation ladder. The ladder is presented as two layers, matching the runtime: `session/cancel` is the protocol-level interrupt and renders neutral while awaiting the `cancelled` stop reason; `SIGINT → SIGTERM → SIGKILL` is the fallback for a subprocess that misses the grace window and only takes destructive styling once that window has actually elapsed.

### 5.3 Skills & Commands (`Settings / Skills & Commands`)

**Layout**: Anthropic-inspired catalog layout with segmented sub-filtering.

- Top bar: Category tabs (`Skills` | `Connectors` | `Plugins`) and segment toggle (`Yours` | `Discover`).
- Action cluster: Search input, filter/sort triggers, and a dropdown `+ Add` menu (`Upload skill`, `Create a skill`, `Create with agent`, and `Import from URL` — a pinned GitHub link is downloaded as a tarball, not browsed; this is not a forge integration).

**Components**

- `skill-row`: Icon, skill slug (`{typography.mono-code}`), `category-pill` (e.g., `Marketing`, `DevOps`), author/origin annotation, and a trailing `•••` action menu.
- Trust Toggle: Toggle switch allowing users to grant or restrict execution trust for auto-running without manual prompts. Untrusted script skills are excluded from YOLO threads (SYN‑07).
- Two-Way Sync Indicator (V1, SYN‑08, `M2.4`): shows whether local changes in `.agents/skills` are cleanly synchronized with vendor configuration files. The MVP skill library has no projection to report on, so it renders no indicator.

**UX Flow**: User clicks `+ Add` → selects `Upload skill` → drops a skill definition file → Tethys validates the manifest, writes to `.agents/skills/`, and projects the skill to all active agents.

### 5.4 Model Context Protocol Registry (`Settings / MCP`)

**Layout**: Matrix grid mapping configured MCP servers (rows) across connected Providers (columns).

> **Open product decision — matrix vs list.** This is the only two-dimensional surface in Settings; Providers (§5.2) and Skills (§5.3) are flat lists on the same nav rail. The matrix may be correct because attachment is genuinely many-to-many. Proposal under consideration: default to a list of servers with an attachment-count badge (e.g. `3/4 providers`) and make the matrix a drill-in. This is presentation only — `mcp.attachments` returns the full grid either way. Whichever wins, these are open: grid container tokens (sticky header row, frozen server column, column minimum width, horizontal scroll as Providers are added); a two-dimensional keyboard model with `grid`/`gridcell` roles (the roving tabindex in DESIGN.md is one-dimensional); the empty state with zero rows and zero columns; and the axes themselves — the Layout says servers × Providers, but the mechanism paragraph below and *Workspace scoping* describe workspaces as a third dimension with no affordance.

**Primary mechanism, revised for ACP**: for an ACP-native Provider, Tethys doesn't need to project MCP config into that vendor's own files at all — it attaches the relevant servers directly as the `mcpServers` array on each `session/new` call for that workspace. The matrix in this page is therefore really "which MCP servers get attached to new Sessions in which workspaces," not a vendor-file sync target. Vendor-file projection is kept only as a compatibility fallback, and only for a Provider whose `mcpCapabilities` can't accept `mcpServers` at session creation. Attachment needs no apply step — it takes effect at the next session start. The server set is read from the workspace root, so a git session sees the same servers as a plain-folder one.

**Components**

- `sync-grid-cell`: Status badge per cell, supplied by `mcp.attachments` (never derived in the webview) — `Attached {status-success}` (will be passed on the next `session/new` for that Provider+workspace pair), `Unsupported transport {status-warning}` (Provider's `mcpCapabilities` doesn't support this server's transport), or `File projection {semantic.surface-hover}` (fallback path: a Class C terminal-hosted agent, or a Provider that negotiated no `mcpServers` transport at all). A Provider that accepts stdio but not http reads `Unsupported transport`, not `File projection`. A server scoped away from a Provider shows an empty cell, and a Provider with no live connection yet never reads `Attached`. Only on the fallback path do the projection states apply: `pending` muted / `drifted {status-warning}` / `conflict {status-danger}`.
- Server Configuration Card: Server name, transport type (`stdio`, `sse`, or `http` — matching ACP's declared transports), command path, arguments array, and environment variables. Secrets render as `keychain:…` refs only.
- Workspace scoping: servers can be attached globally or scoped to specific workspaces, since not every MCP server is relevant to every workspace.
- Projection Action Bar (fallback path only): `Preview diff → Apply → Rollback` buttons for the vendor-file compatibility case. The webview requests a projection plan via `mcp.projection.plan(workspace_id, target, scope)`. The response includes `providers: string[]` naming which configured Providers depend on this Target file, and the webview renders that list in the preview dialog before applying.
- Import wizard (detect → preview → apply), shown alongside the skill rows in §5.3.

**UX Flow**: User adds an MCP server → matrix shows which Providers will actually receive it (attached at their next `session/new`) versus which can't (unsupported transport) versus which need the file-projection fallback → for the fallback case only, clicking `Apply All` writes updates into that vendor's own config file.

### 5.5 Keybindings (`Settings / Keybindings`)

**Layout**: Searchable keybinding table with real-time shortcut conflict detection.

**Components**

- `keybinding-row`: Action description (`{typography.body-sm}`), scope (`Global`, `Editor`, `Terminal`), `keycap-pill` combination (e.g., `Ctrl K`), and a conflict warning badge in `{semantic.status-warning}`.
- Custom shortcut recorder: Input field that captures physical keydown events.

**UX Flow**: User searches for "toggle diff" → double-clicks the keycap pill → presses `Cmd + D` → shortcut saves with instant global dispatch.

---

## 6. Terminal & Onboarding

- **Class C terminal**: an interactive PTY `terminal-sheet` (full xterm on the sunken well, correct resize/reflow) is workspace-only per `WorkspaceOnlyConnection` — no output parsing, and no protocol-only affordance in the UI. Its feature set is capability-driven like every other surface, so in a folder with no git it offers config sync only. The headless alternative is a read-only stream viewer (snapshot + tail, `mono-code`).
- **Onboarding**: a zero-state of three `onboarding-step` cards (`24px` hero icon, `heading-md` + `body-sm` + action): `Add workspace → Install agent → Start first thread`. Progress persists; skipping returns to the catalog's empty state. The first step goes through the same trust flow as §2.1 and never requires git — a plain folder completes onboarding as-is.

---

## 7. Behavioural Guardrails

Rules that hold across pages. Visual and token rules are in DESIGN's Do's and Don'ts.

**Do**

- Segment workspaces cleanly into `Local` and `Remote` to avoid mixing local worktrees with SSH/container agents.
- Retain the top tab bar: open threads directly into persistent tabs while keeping the `Workspaces` hub intact.
- Say `2 sessions` (naming Providers where it matters), never `2 agents` — "agent" means the Provider connection.
- Render permission buttons from the Provider's own `options` array on `session/request_permission`, in the order the Provider sent them.
- Keep the selector popover at `560px` with a fixed `200px` Provider column and a `session-config-panel` that takes the remaining width; render whatever fields that Provider's schema declares and scroll inside the panel rather than resizing.
- Reuse `status-dot` for every state indicator, and the `session-item` chip/row variants everywhere a session appears; never invent a second style.
- Gate every newly added folder behind `workspace-trust-dialog` before a card exists or a Provider process starts.
- Gate every git-dependent surface on the workspace's capabilities (§0.1) and explain what is unavailable.
- Return focus on every dismiss (`Esc` in popover/drawer/sheet → invoker) and trap focus in palette, dialogs and sheets.

**Don't**

- Don't navigate the entire window to a full screen when clicking a card; use the side-peek drawer or open a dedicated thread tab.
- Don't crowd the card footer with more chips than fit at the chip `minWidth` (never more than 3); show an overflow indicator (`+N more`) that opens the side-peek drawer, and never let a pending approval fold into it while a lower-priority chip holds a slot.
- Don't use a single-pane breadcrumb drilldown for the model selector; Tethys is a desktop control plane — use the side-by-side flyout.
- Don't assume every Provider exposes Model + Effort; the config panel is generated from that Provider's schema.
- Don't dim the Provider name when a config field is unsupported; dim only the affected field label.
- Don't hardcode an Approve/Reject pair, a button count, or a button order on a permission request; Tethys renders the Provider's `options`.
- Don't project MCP config into a vendor's own config file for an ACP-native Provider; attach servers as `mcpServers` on `session/new` and keep file projection for the fallback path only.
- Don't show the destructive `SIGINT/SIGTERM/SIGKILL` ladder before `session/cancel`'s grace window has elapsed.
- Don't read or cache vendor tokens in any login surface (`LoginDialog` or `terminal-sheet`); launch the vendor's own flow and close.
- Don't let a vendor logo imply a workspace source or an entry point. GitHub and GitLab report where an existing folder's git remote points — they are never a way to add, clone or browse a workspace.
- Don't assume git. A surface that needs it checks the capability set; it does not test for a `.git` directory itself.
- Don't adopt foreign component runtimes (e.g. ACP UI kits) that bring their own stores, providers, or icon sets; borrow presentational ideas only and re-implement against `@tethys/state` and semantic tokens.

---

## Page & Component Mapping Summary

| Page / Route | Primary View Type | Key Tokens & Sizes | Distinctive UX / Behaviours |
|---|---|---|---|
| **`/workspaces`** | Card Grid + Peek Drawer | Cards: `220px`, Drawer: `380px` | Dual canvas modes (git-topology / single-node), Local vs. Remote switch, "Needs attention" filter, trust dialog gating every new folder, zero-click thread chips. |
| **`/thread/new`** | Centered Prompt Canvas | Card: `820px` max, Popover: `560px` | Explicit workspace picker, per-Provider config schema (not a fixed Model/Effort grid), auth-gated Provider selection. |
| **`/thread/:id`** | Four-Region IDE Shell | Sessions col: `280px`, Inspector: `360px` | Workspace → Provider → Session grouping, plan panel, protocol-native permission requests, dual-layer cancellation, capability-driven review (turn rollback in <150ms, unified/split diffs, only where git exists). |
| **`/settings/providers`** | Accordion Registry List | Rows: `12px 16px` padding | Per-Provider auth method adapts (env var / URL+code / CLI passthrough), negotiated-capabilities panel (resume, MCP transports, elicitation). |
| **`/settings/skills`** | Categorized Skill Catalog | Cards / Rows: `36px` height | Yours vs. Discover filter, format-preserving two-way sync to `.agents/skills`. |
| **`/settings/mcp`** | Session-Attachment Grid | Cells: `sync-grid-cell` | MCP servers attached per `session/new` for ACP-native Providers; vendor-file projection kept only as a compatibility fallback. |
| **`/settings/general`** | Two-Column Settings Form | Inputs: `40px` height | Instant hot-swappable JSON custom themes, font pickers, OS alerts, Trusted Folders. |

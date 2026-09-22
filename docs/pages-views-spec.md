# Pages & Views Specification

This document owns **page composition, component behaviour, copy, and flows**. [`DESIGN.md`](../DESIGN.md) owns the design contract: tokens, scales, and per-component metrics (size, radius, padding, colour). Where a component appears below without numbers, its metrics are in DESIGN's `components:` block. Milestone ownership lives in [`milestone.md`](./milestone.md); the API each surface reads and writes lives in [`architecture.md`](./architecture.md) §8.3.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Window Header & Tab Strip (40px)                                  [_][□][×] │
├────┬──────────────────────────────────────────┬──────────────────────────────┤
│Rail│ Main Conversation Stage                  │ Thread Inspector & Diff      │
│48px│ (flex stage)                             │ (360px collapsible)          │
│    ├──────────────────────────────────────────┤                              │
│    │ Prompt Card (pills: git, model, mode)    │                              │
└────┴──────────────────────────────────────────┴──────────────────────────────┘
```

## 0. ACP Session Model (read first — everything below maps onto this)

Tethys is an ACP Client, not a custom agent runtime. Every page in this spec is a view onto the same three-tier state model, so the terminology needs to be exact before the pages make sense:

- **Provider** = one ACP connection (what the protocol calls an "Agent" — Claude Code, Codex, OpenCode, etc.). Tethys opens one persistent connection per *enabled* provider at launch, in parallel, and records health, current auth state, and negotiated capabilities separately. Declared auth methods do not imply that login is required. One provider's connection failing (missing binary, expired auth) never blocks the others — each is isolated, so aggregate health chrome (rail daemon dot, `provider-row` dots) is per-Provider, never all-or-nothing.
- **Workspace** = a directory (`cwd`). This is the unit shown as a `workspace-card` in the hub (§2). A workspace can host concurrent sessions from *different* providers at once — e.g. Claude Code drafting a fix while Codex reviews it in the same folder — so "workspace" and "provider" are orthogonal, not nested.
- **Session** = one `session/new` conversation, belonging to exactly one Provider + one Workspace. A Tethys "thread" (tab, `session-list-row`) is a UI-level wrapper around one Session. The UI sends a `workspace_id`; core resolves `cwd` to the workspace's git-worktree path, or the workspace folder itself where there is no worktree, and attaches the MCP servers from the workspace root.

Two consequences that change earlier assumptions in this doc, corrected in the sections below:

1. **Permission resolution lives entirely in Tethys, never in a vendor CLI's own terminal.** Every tool call a Provider wants to run surfaces via `session/request_permission`, with the Provider supplying its own `options` array (its exact allow/reject choices — not a fixed pair Tethys invents). Tethys's permission mode (Supervised / Auto-edit / YOLO) decides whether to auto-pick an option or surface it to the user. Because ACP routes every consent decision through the Client by design, there is no separate CLI-level prompt to "de-dupe" against — an earlier draft of this doc got that wrong.
2. **"Agent" no longer means "running thread."** Where earlier language said things like "2 agents running" on a workspace card, it reads "2 sessions" (and, where it matters, names the providers) — "agent" is reserved for the Provider connection itself. This is a copy rule, not just terminology: counts read `2 sessions`, `Provider` labels appear in the selector and settings, and `Session` labels appear in the hub, tabs, and the sessions column.

### 0.1 Workspace capabilities (read second — git is a feature, not a prerequisite)

A Workspace is a folder. Any folder can be one, git-initialized or not. What Tethys can do with it is a **resolved capability set** (`architecture.md` §10.6), and every surface reads that set instead of assuming git or re-deriving it:

| Capability | Values | What it gates |
|---|---|---|
| `vcs` | `none` · `git-local` · `git-remote` (host: GitHub / GitLab / other) | Source badge, workspace-card variant, `git-init-upsell-chip`, worktree isolation |
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
- **Sessions drawer (on demand)**: not a docked region. A titlebar toggle opens `sessions-column` (`280px`) as a Level 3 overlay drawer over the Stage with a `{semantic.overlay-scrim}`; `Esc`, a scrim click or choosing a session closes it, and focus returns to the toggle. Session switching is a moment of navigation, not a standing surface, so the Stage keeps its width; everyday switching runs through the tab strip and the Workspaces catalog. There is no docked workspace list: the Workspaces catalog (§2) is a view on the Stage.
- **Window Header & Tab Strip (Top)**: Height `40px`, background `{semantic.surface-rail}`. Structural border along the bottom. Insets `~70px` left padding on macOS for traffic lights, or reserves `140px` right padding on Windows for native caption controls. Linux uses an in-app header bar with minimize/maximize/close (`16px` glyphs, `32px` targets). The header doubles as the window drag region.
- **Splitters**: every column edge is a `1px` structural line with a `6px` transparent hit area. Hover recolors only — width never changes, so the layout never shifts. Dragging shows the focus accent; double-click resets to the token width. `separator` role with `aria-valuenow`.
- **Command Palette Modal (`command-palette`)**: Centered overlay (`600px × 400px`, Level 4 elevation) triggered anywhere via `Ctrl/Cmd + K`. An input row over a grouped list (commands, files, threads, actions) with `36px` rows and `mono-micro` hints. `↑↓` moves, `Enter` runs, `Esc` unstacks. Empty shows `No results`; loading shows skeleton rows. First-result target is sub-millisecond via FFF-backed `search.files`. **Status (22 September 2026):** the palette ships its Commands and Actions groups only — the files and threads groups have no destination surface yet, so the file row was removed rather than left dead and `search.files` reaches the composer's `@` popup alone. The pre-Wave-2.5 repair record is in [milestone.md](./milestone.md).

**Components**

- `nav-rail`: Contains top cluster (Workspaces `grid` icon, New Thread `compose` icon) and bottom cluster (Global Settings `gear` icon, daemon health dot). Icons use `{icons.sizes.rail}` (20px) with `36px` hit targets. The selected item carries a `2px` accent bar on its left edge.
- `tab-bar` & `tab-item`: Horizontally scrollable tab strip supporting multi-workspace tabs. The Workspaces hub is pinned permanently at index 0 with no close affordance. Sibling tabs render as `[Icon] [workspace / branch] [×]`; a session with no branch (a non-git folder) shows `[Icon] [workspace / session title] [×]`.
- `approval-inbox-pill`: Persistent tab-bar pill `Waiting on you (N)` rendered with a `{semantic.status-warning}` breathing dot and a `mono-micro` count. Hidden when the queue count is 0. The hub's `Needs attention (N)` filter chip reuses it in its selected state — same component, different placement.
- `status-dot`: one shared dot for every state surface (rail daemon health, workspace rows, session rows, provider rows), so `UI-02` states map exactly once. `Idle` → agent-idle, `Running` → agent-active filled disc (breathe), `Awaiting approval` → warning **ring** (breathe), `Error` → danger, `Interrupted` → `status-interrupted`, `Suspended` → `status-suspended`, `Archived` → `status-archived` (all static, and quiet by design, so each is also named in words in its row, P2). Provider and daemon health reuse it: `Healthy` → success, `Authentication required` → warning filled disc (no breathe), `Not found` → danger. Shape is part of the encoding, not decoration: the ring is what separates "blocked, needs you" from "working" and from `Authentication required` once motion is suspended (`prefers-reduced-motion`, unfocused window), so `Awaiting approval` never shares both hue and shape with another state. An unrecognized state renders the neutral idle dot rather than failing.

**Behaviour**

- Switching tabs never unmounts background execution streams or uncommitted diff state.
- Window blur dimming: inactive window dims background surfaces to `60%` opacity while preserving hairline structure, and suspends accent motion.
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
│ │ [⌗] acme-api☆ │ │ [⌗] acme-web ⚠ ☆ │ │ [📁] scratch-notes ☆ │  │
│ │                      │ │                      │ │                      │  │
│ │ main                 │ │ fix-auth             │ │ Local folder · no VCS│  │
│ │ 2 sessions active    │ │ 1 waiting ⚠          │ │                      │  │
│ │ [◆fix-auth +34-12]   │ │ [◇api-v2 +9-2 T3]    │ │ [Initialize git →]   │  │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Layout**

- Top bar: Title `{typography.heading-lg}`, Segmented Control (`Local` | `Remote`), search bar (`Ctrl/Cmd K`), `Needs attention (N)` filter chip, sort selector (`Recent Activity`), Grid/List toggle, and `+` Add workspace (opens `workspace-trust-dialog`, §2.1). List view reuses `session-item-row` at full width.
- Content Area: Responsive CSS grid `repeat(auto-fill, minmax(320px, 1fr))` with `{spacing.lg}` (16px) gap and `{spacing.xl}` (24px) padding.
- Slide-over Peek Drawer: `380px` wide flyout from the right window edge (`workspace-peek-drawer`).

**Components**

- `segmented-control` (`Local` | `Remote`): `Local` = folders on this machine; `Remote` = SSH, containers, cloud workspaces (post-V1, shows an empty state until `REM-01`). Says nothing about version control — VCS status is carried per card by the source badge.
- `workspace-card`: 176–220px height, clean modular tile layout on `{semantic.surface-card}`. Header: source icon (git branch `i5eIp` or folder `hOUm5`), workspace title (`{typography.heading-md}`), favorite star, and an attention badge when a session is awaiting approval. Body: active branch name in `mono-code` and session status line (`● 2 sessions active` in running accent, `1 waiting ⚠` in warning, `idle` otherwise). Footer: session cluster chips (`session-item-chip`) with live diff stats rendered in `{semantic.diff-added}` (`+green`) and `{semantic.diff-removed}` (`-red`). Hover → `surface-card-hover` and a stronger border. While its `workspace-peek-drawer` is open the card renders `workspace-card-selected` (the left accent bar).
- `workspace-card-no-vcs`: Dedicated variant for unversioned folders. Uses a folder icon (`hOUm5`), unversioned metadata description (`Local folder · no VCS`), and displays an inline `Initialize git →` upsell chip in place of branch and session chips.
- `workspace-source-glyph`: Icon-only indicator identifying workspace kind — Git branch icon (`i5eIp`) for git-initialized repos, folder icon (`hOUm5`) for unversioned workspaces, and remote indicators where applicable. Eliminates noisy redundant text strings like "Folder · No vcs".
- `session-item` — one component, two density variants that bind the same fields (`provider_id`, `branch_name`, `session_status` (`running | idle | awaiting | error`), `turn_count`, `diff_stats` (`+added -removed`), `has_uncommitted`):
  - **`session-item-chip`** (card footer): provider glyph, branch name, live diff stat (`+34 -12` using `{semantic.diff-added}` and `{semantic.diff-removed}`), and turn checkpoint (`T8`). A chip with a pending approval renders an amber outline instead of the default hairline **and** a `statusMarker` on the provider glyph (amber ring = awaiting, filled sky disc = running), so awaiting reads without colour or motion. The overflow chip uses identical metrics and opens the peek drawer.
    - **Truncation and tooltip**: the branch name truncates with an ellipsis and the full name is the chip's tooltip. When the chip is narrow, the turn count drops first, then the diff stat; the glyph, marker and branch never drop.
    - **Slot priority**: when there are more sessions than chip slots, chips are ordered awaiting-approval first, then running, then most recently active; the overflow chip takes the rest. A pending approval never folds into `+N more` while a lower-priority chip holds a slot.
    - **State precedence** follows DESIGN.md State Precedence.
  - **`session-item-row`** (peek drawer, list view): full-density row — agent breathing dot, branch slug, turn checkpoint counter, diff badge, and a trailing rollback button on hover/focus. Where the workspace has no git or no restore capability, the diff badge and rollback are hidden and the row shows `no git · no revert` subtext.
  - Chips and rows are `button`/`option` roles; `Enter` activates, arrow keys move within the cluster/list.
- `git-init-upsell-chip`: Shown only on no-VCS cards, inline in the footer — `Initialize git →`. Running it performs a local `git init` plus an initial commit of the folder's current state in place, then hot-swaps the card to the git workspace layout without navigating away.
- `workspace-peek-drawer`: `380px` slide-over, Level 3. Header: workspace title + source glyph + close `×`. Tabs: `Sessions` (default) and `Approvals` (opened directly when the workspace has pending requests). Sessions are grouped by Provider as `session-item-row`s with turn checkpoint counters and uncommitted diff stats, plus a footer `+ New Thread` action (disabled per the concurrency gate below). Focus moves into the drawer on open, returns to the invoking card on close, and `Esc` closes.

**Behaviour**

- Single-clicking a card body or header opens the `workspace-peek-drawer` (modeless; catalog stays interactive). If the workspace has pending approvals, the drawer opens directly to its `Approvals` tab. A card never performs full-window navigation.
- Clicking a `session-item-chip` spawns a dedicated top-level tab for that session, immediately focused.
- Double-clicking a card opens or focuses the primary/most-recent thread for that workspace.
- Hovering an idle card surfaces a `+ New Thread` overlay button on the card, so starting work on a dormant workspace doesn't require opening the drawer first.
- **Concurrency gate**: where `max_concurrent_sessions` is 1 and a session is already running, `+ New Thread` is disabled (tooltip: "This folder isn't version-controlled, so only one agent can run here at a time. Initialize git to run threads in parallel.") rather than silently allowing a second agent to write into the same tree. Core enforces the same limit (§0.1).
- The catalog stays mounted while a session tab is open; switching tabs never unmounts it.
- Card footers show only as many chips as fit at the chip `minWidth` (never more than 3); further sessions collapse into a `+N more` chip that opens the peek drawer. Never crowd the footer. The figures behind this (a 320px card leaves ~286px inside its padding and border) are indicative — the implementing chunk verifies them against the rendered font.
- Cards stay on `{semantic.surface-card}`; no colorful fills.

**UX Flow**

- User lands on Catalog → clicks a `fix-auth` chip → a new tab `[ ⌗ acme-web / fix-auth × ]` slides in smoothly next to the pinned `Workspaces` tab → user immediately enters the thread execution view.
- User has three workspaces running sessions in parallel → clicks `Needs attention (2)` → grid filters to only the `acme-web`-style cards with a pending approval → user works the queue card by card without hunting across an unfiltered grid.
- User drops a scratch folder with no git history into Tethys → card renders as a `workspace-card-no-vcs`, footer reads `no version control · 1 agent (max)` with an `Initialize git →` chip → user clicks it once they're ready to parallelize, and the card upgrades in place.

### 2.1 Add Workspace Flow & Trust (`workspace-add-flow`, `workspace-trust-dialog`)

Adding a workspace and trusting it are treated as one flow, not two — the folder never appears as a usable card, and no Provider process is spawned against it, until trust has been granted.

**Trigger points**

- `+` action in the Workspaces hub top bar, or the rail's `compose` icon with no active workspace context.
- Native OS folder picker (local) or a remote path + existing SSH/container connection picker (remote) resolves a target directory. A directory dropped onto the catalog opens the same flow.
- Tethys inspects the resolved path — git-initialized or not, has a remote or not, local or remote host — and opens `workspace-trust-dialog` before creating a card or spawning any agent process against it. Inspection is read-only: it never clones, fetches, or writes.

**`workspace-trust-dialog` — layout & copy**

- A focus-trapped modal (`480px`, Level 4).
- Header: shield glyph + `Trust this folder?`
- Path row: resolved absolute path, home-dir shortened (`~/dev/acme-web`), monospaced.
- `workspace-source-badge` echoed inline so the trust decision is made with full context (git+remote / git local-only / no VCS; local disk / remote host).
- Body copy branches by source:
  - **Local, git-tracked**: "Coding agents will be able to read, edit, and run commands inside this folder and its subfolders. Tethys creates an isolated git worktree per thread so parallel agents can't collide."
  - **Local, no VCS**: "This folder isn't tracked by git yet, so Tethys can't isolate agent runs into separate worktrees — only one thread can run here at a time until you initialize git." Inline `Initialize git now` checkbox lets the user opt into a git workspace as part of trusting, instead of doing it later from the card.
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

- User clicks `+` in the Workspaces hub → picks a local folder that has no `.git` → `workspace-trust-dialog` opens, source badge reads `Folder · no VCS`, body warns about the single-thread cap, user ticks `Initialize git now` and confirms → card lands in the grid already as a git `workspace-card` with a fresh initial commit.
- The same flow with `Initialize git now` left unticked is fully supported: the card lands as a `workspace-card-no-vcs` and stays there until the user chooses otherwise. Nothing in Tethys requires git.

**Design rationale — vs. the Railway reference**

Railway's card is optimized to answer "is this service up?" — a static, mostly-boolean question, so a single centered glyph plus a footer stat line is enough. A Tethys workspace is running N autonomous Sessions concurrently, possibly across several Providers, some of which are actively blocked waiting on a human decision — that's the thing the hub exists to surface. So the card carries the sessions themselves — a cluster of `session-item-chip`s with live diff stats, awaiting-approval first — instead of one icon, and "needs attention" got promoted from a footer detail to a first-class filter, since triaging across workspaces is the primary loop, not just monitoring uptime.

A second divergence: Railway's projects are always fully-formed, connected git repos by construction. Tethys workspaces are just folders — some git-tracked with a remote, some git-tracked locally only, some not version-controlled at all, local or remote in any combination. Session-level detail is therefore a *capability the folder has earned*, not a default — a plain folder gets the no-VCS card (an `Initialize git →` chip instead of branch and session chips) and a one-thread-at-a-time cap until it's git-initialized, and the safety guarantees that depend on git (isolated parallel worktrees, instant Revert Turn) degrade explicitly rather than silently.

---

## 3. New Thread Canvas (`/thread/new`)

The distraction-free orchestration stage for composing the `session/new` call that starts a thread: which Workspace, which Provider, and that Provider's own session config options.

```
                             What are we building today?

         ┌─────────────────────────────────────────────────────────────┐
         │ [⌗ acme-web ∨]                                          │
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
- `workspace-selector-pill` sits above the textarea as the first field in the prompt card — defaults to the last-active workspace, but is never silently assumed: no thread is created without an explicit workspace selection. Opening this canvas by double-clicking a workspace card pre-fills it; opening it from the rail's global `compose` icon leaves it for the user to pick. Core alone resolves that id to a `cwd`.
- Prompt Card: `min({layout.prompt-width}, 100% - 96px)` width (820px max), `{rounded.2xl}` (20px), background `{semantic.surface-elevated}`, `1px {semantic.hairline-strong}` border with a `{semantic.edge-highlight}` top edge.
- Two-Column Flyout Popover (`model-selector-popover`): left column is the fixed `Provider (200px)` list; the right column's contents are **not** a fixed `Model | Effort` grid — see Behaviour. Total width `560px`, anchored below the pill and left-aligned to the card; never clips the card's bounds, and flips above the pill only if viewport space requires.

**Components**

- `prompt-card`: Auto-expanding textarea (`{typography.body-md}`, placeholder `Ask Anything…` in muted text). The lower bar is a flex row: `model-selector-pill` left, submit action right. **With no selected prepared Provider session** the textarea and submit are disabled and the placeholder names the first missing precondition: workspace, Provider setup/auth, or session preparation. **With nothing selected** — the cold start from the rail's global `compose` icon — it reads `Choose a folder to start a thread`; after a folder is chosen but no Provider is ready it reads `Connect a provider in Settings to send a message`; during preparation it reads `Connecting to {Provider}…`; a setup failure keeps both selections and offers Retry. The lower bar drops the attachment-and-guide cluster while disabled. Both selector pills stay focusable; submit does not.
- `workspace-selector-pill`: Compact trigger showing the workspace's `workspace-source-badge` icon + name; opens the same peek-style picker used in §2. Selected shows the resolved path as a `mono-code` tooltip. Submit stays disabled while it is unresolved. **Unresolved** (nothing picked yet) it drops the source badge and reads `Choose a folder` — an instruction, not a status — and remains the one control in the composer that is both live and unselected.
- `model-selector-pill`: Compact trigger `[Provider icon] [Provider name] [config summary] ∨`. The config summary is whatever that Provider's own session config schema returns (often model + effort, but not guaranteed to be exactly that shape): `[▲ Claude Code  Sonnet · Medium ∨]`, `[◇ Codex CLI  gpt-5-codex · Medium ∨]`, `[◈ OpenCode ∨]` (no configurable options). A field label dims to muted when the schema marks it unavailable for the current selection; the Provider name never dims. **Zero-provider state**: with no selectable Provider the pill reads `No provider available` in place of the Provider name and config summary. It is the one control in the composer that stays actionable — it remains focusable and opens the popover, whose empty column links to `Settings / Providers` — while the textarea and submit are disabled (see `prompt-card`).
- `model-selector-popover`: Left column fixed-width (`Provider 200px`) listing connected Providers, each with a connection dot (running accent = streaming, success = ready/idle, warning = `auth_required`, idle = unreachable) and a protocol pill (`ACP v2`) where applicable. The right column renders `session-config-panel` (the remaining ~357px of the `560px` popover) for whichever Provider is selected, one `schema-field-group` per declared field; control types come from the schema (listbox for enums, stepper for numbers, toggle for booleans) and long lists scroll inside the panel — the Provider column never resizes. A Provider with an auth problem shows an inline `⚠` and is not selectable until resolved.
- `action-icon-button`: Circular submit pill (`32px`), shifting from `{semantic.surface-hover}` to a primary high-contrast fill when input is present.

**Behaviour**

- **Config options are fetched per session, not hardcoded.** Selecting a ready Provider and trusted workspace prepares `session/new`; its returned mode/config options determine what's shown on the right. One Provider might expose Model + Effort, another just a Model list, another nothing configurable at all (the panel shows `No session options for this provider`, which is a valid state). Changing workspace or Provider discards the unprompted prepared session. The popover renders the returned fields rather than assuming the Model/Effort shape universally; that shape is illustrative for Claude Code specifically, not a Tethys-wide constant.
- **Auth gate**: selecting a Provider that requires `auth/login` and hasn't completed it opens `LoginDialog` (§5.2) inline in the popover before that Provider becomes selectable — never lets a prompt submit against an unauthenticated connection.
- States: an empty Provider column reads `No connected providers — add one in Settings / Providers`; the panel has explicit `connecting`, `ready`, `auth required`, and `setup error` states. `connecting` uses a three-row skeleton; `setup error` keeps workspace, Provider, and prompt text and offers Retry. Submit is enabled only for the selected prepared draft. When more than one prerequisite is missing the composer names only the first in workspace → Provider/auth → session-setup order.
- Selector writes narrow within Tethys policy, never widen it (`PRM-04`).
- Keyboard navigation: `Enter/Space` opens the popover from the pill; `↑/↓` navigates the active column; `→` drills in, `←` steps back; type-ahead filters the active column; `Tab` cycles regions as an accessibility fallback; `Enter` confirms selection and focuses back to the prompt textarea; `Esc` cancels, closes, and returns focus to the textarea (with the popover closed, `Esc` is a no-op).

**UX Flow**

- User confirms the workspace pill → picks a ready Provider → Tethys resolves the worktree/plain root and prepares `session/new` with that workspace's MCP servers → the panel renders the returned session options → the user types/configures and presses `Ctrl + Enter` → Tethys hydrates `thread.get`, subscribes after its `latest_seq`, promotes the draft, dispatches the first prompt without awaiting turn completion, and navigates to the already-live Active Thread Workspace.

---

## 4. Active Thread Workspace (`/thread/:id`)

The three-region control plane (Rail | Stage | Inspector, with Sessions opened on demand as a drawer) for executing turns, inspecting thought streams, approving commands, and — where the workspace has git — reviewing worktree diffs (`UI-01`, `UI-04`, `WT-04`).

```
┌────┬─────────────────────────────────────────────┬───────────────────────────┐
│Rail│ Main Conversation Stage                     │ Thread Inspector & Diff   │
│48px│ (flex stage)                                │ (360px collapsible)       │
│    ├─────────────────────────────────────────────┼───────────────────────────┤
│    │ User: Fix the auth tokens                   │ ▶ Plan (3/5 steps)        │
│    │                                             │ ▶ Thought Stream (14s)    │
│    │ Agent: Inspecting jwt.rs...                 │ ▼ cargo test --auth       │
│    │ ┌─────────────────────────────────────────┐ │   stdout: [PASS] 4 tests  │
│    │ │ [Tool: read_file src/..]                │ │ ├─────────────────────────┤
│    │ └─────────────────────────────────────────┘ │ Branch Changes (+42 -12) †│
│    │ ⚠ Approve file edit?                        │ src/jwt.rs (unified/split)│
│    │ [Allow once][Allow always][Reject]          ├───────────────────────────┤
│    │                                             │ [Stage Hunk][Revert Turn]†│
│    │ ┌─────────────────────────────────────────  │ Activity Ledger (Rollup)  │
│    │ │ [git: fix-auth +42-12] [Claude Sonnet]    │ │ 12 files · 5 cmds · 3 mcp │
│    │ │ Type / for commands · @ for files... (■)│ ├───────────────────────────┤
│    │ └─────────────────────────────────────────┘ │ ⚙ Supervised Mode         │
└────┴─────────────────────────────────────────────┴───────────────────────────┘
† git-only: rendered per §0.1. With no git the inspector ends after the tool calls,
  and the git context pill reads unversioned.
```

**Layout**

- **Main Stage (Center-Flex, min 560px)**: Streamed Markdown turns, collapsible thought blocks, plan panel, inline tool-call cards, and inline permission-request cards. The Stage never shrinks below `stage-min` and has no overlay mode: the Inspector docks only at `1100px` and wider, and `48 + 560 + 360 = 968px`, so the Stage always has at least 560px. Thread and workspace switching runs through the top tab strip and the Workspaces catalog (`/workspaces`); a titlebar toggle opens the Sessions drawer (§1) to browse every session on demand.
- **Thread Inspector & Diff Panel (`360px`, Right)**: Collapsible sidebar housing session-level rollup telemetry, active plan steps, raw payloads, and — where the workspace has git — patch inspection and checkpoint restore triggers. Operates on a **thread-wide scope** (aggregating tool runs, edited files, and cumulative diffs across all turns of the session), rather than being locked to a single turn. Collapses to an overlay drawer when the viewport drops below `1100px`.
- **Unified Prompt Card (Docked Bottom, `{layout.prompt-width}`)**: Consolidates composer input, session context pills, and runtime actions into a single control surface, replacing the separate 56px Action Bar. Features:
  - Top Context Bar: Collapsible pills for Git Context (`isolation-pill`: `branch`, or `no git`), Provider & Model Selector (`[Glyph] Provider · Model ∨`), Permission Mode (`Supervised` / `Auto-edit` / `YOLO`), the ACP `mode` (`mode-pill`), the queue count, and the `diff-summary-pill` (`+a −b` in `{semantic.diff-added}` and `{semantic.diff-removed}`). When the row does not fit, pills fold into a `•••` overflow, lowest priority first; the isolation pill and the stop control never fold (DESIGN.md `prompt-card.contextBarFold`).
  - Textarea: Auto-expanding composer with quiet inline guide (`Type / for commands · @ for files · $ for skills`).
  - Lower bar: attachment chips, and the Model and Effort chips (`composer-config-chip`), taken from the Provider's config options by `category`.
  - Action Button: Single state-switching trigger on the right — Send up-arrow (`ez7XI`) when idle/typing; Stop square (`mfejm`) when an agent turn is actively executing.

**Components**

- `prompt-card`: The unified command center. Hosts the top context pills, input area, and dynamic send/stop action button. A change made to provider or mode options applies cleanly from the next turn.
- `composer-suggestion-popover`: Single unified popover component (`hSlJB` / `iL4JQ`) triggered by mention sigils (`/`, `$`, `@`). Avoids tab fragmentation; renders a single clean container with a section title and detected Table of Contents (TOC) list:
  - `@` references: Files & artifacts indexed per worktree via FFF.
  - `$` references: Skills catalog loaded from `~/.agents/skills/`.
  - `/` references: Built-in Tethys commands and ACP agent-advertised commands.
- `stop-control`: Integrated directly into the Prompt Card's action button. When a turn is active, clicking changes state from active to cancelling, sending `session/cancel` while observing the protocol-first cancel ladder.
- `thread-inspector`: Aggregate right sidebar providing full-thread visibility. A 40px header names the panel and the session's live state (`state-badge`: the `status-dot` plus the state name, both in the state's own token per theme), with a `Collapse` control beside it; collapsing leaves a 40px rail that keeps the breathing marker, so a pending request is never hidden by collapsing (the tab strip's `approval-inbox-pill` and the stage's inline card keep it answerable either way). Below the header, a rollup band — files modified, diff lines, commands executed, duration — then the sections:
  - Rollup band (`thread-inspector.rollup`): every number is something the session reported, from tool-call entries and the git diff summary; a metric the session did not report is omitted rather than estimated. The diff-lines metric is two colours: `+N` in `{semantic.diff-added}`, `−N` in `{semantic.diff-removed}`.
  - Plan checklist (`plan-panel`) with progress counters.
  - Collapsible tool runs (`tool-run-group` & `tool-accordion`).
  - Patch viewer (`diff-viewer`) with unified/split views and `{semantic.diff-added}` / `{semantic.diff-removed}` tokens.
  - Session Activity Ledger (`activity-ledger`): Aggregate rollup of files read, commands run, MCP calls, and token usage.
  - An idle session with nothing to report renders the header (badge `Idle`) and the ledger's `No tool calls yet`; the band renders nothing rather than a row of zeroes, and no plan or diff section appears.
- `turn-message` & `thought-block`: Distinguishes user prompts from internal agent thought streams (collapsible panel in `{semantic.surface-panel}`), sourced from `session/update` message chunks.
- `permission-request-card`: Renders a `session/request_permission` call inline in the stage at the point it was requested, plus a mirrored entry in the `approval-queue-drawer` (§1). Buttons are dynamically generated from the Provider's `options` array. While pending the card keeps its `{semantic.hairline}` border and takes the attention treatment — a `{semantic.status-warning-soft}` wash, a 2px `{semantic.status-warning}` left rule, and the breathing `status-dot` — rather than a saturated perimeter stroke (DESIGN.md `pendingTreatment`).
- `elicitation-card`: Handles structured input requests mid-turn (`elicitation/create`) via inline schema forms.
- `provider-popover`: Displays Provider-emitted vendor extension notifications (e.g. OAuth requests) anchored to the provider selector pill.
- `diff-viewer` *(git only)*: Unified or split patch viewer on a sunken well, with per-file headers, per-hunk `Stage`/`Discard` actions, and checkpoint restore triggers. Added lines strictly use `{semantic.diff-added}` and removed lines use `{semantic.diff-removed}` for high-contrast legibility, and the `+N` / `−N` stat is split across those same two tokens in the file header and the inspector rollup band — never rendered in one colour, which would make the reader parse the sign to tell the sides apart.
- `working-indicator`, `turn-notice`: Real-time streaming indicator with elapsed time, transitioning to structured notices (`refusal`, `max_tokens`, `cancelled`, `error`) upon completion.

**Behaviour**

- Turn execution streams live via `session/update` notifications without freezing the UI. Turn states: `Running` (agent-active filled dot, breathing) / `Idle` (muted, static) / `RequiresAction` (amber **ring**, breathing slower — a ring, not a disc, so it stays distinct from `Running` when the breathe is suspended) / `Error` (danger + retry, **static**) / `Interrupted` (muted + resume, static). Motion is the third channel after hue and shape and is never load-bearing: only `Running` and `RequiresAction` breathe, because a stopped agent that keeps breathing reads as still working (`motion.stateMotion`). Every state colour is one family at two intensities — a saturated tone for the marker, label, rule and stat, and a 10–14% `status-*-soft` wash for the surface behind it — so no state paints a full perimeter around a card or row.
- **Cancellation is two layers, not one**: `session/cancel` is sent first as a clean protocol-level interrupt and the Agent is expected to acknowledge with a `cancelled` stop reason. The `SIGINT → grace period → SIGTERM → SIGKILL` escalating ladder is a *fallback* for a Provider subprocess that doesn't respond to `session/cancel` within the grace window — it's Tethys's safety net underneath the protocol-level cancel, not a replacement for it. `Stop` therefore renders as a neutral pending control after the first press, and takes destructive styling only once that grace period has actually elapsed.
  - **Grace window and how it is surfaced.** The cancel grace window is **5s by default** (the core's `cancel_grace` option); on the process ladder a fixed 100ms separates `SIGTERM` from `SIGKILL`. A press must visibly register: `stop-control` enters its pending phase immediately, labelled `Cancelling…`, with a fill that depletes across the grace window so the time remaining is legible without a number (DESIGN.md `stop-control`). At 5s a numeric countdown is noise; the numeric `m:ss` readout belongs to `LoginDialog`'s ~300s codes (§5.2).
  - **The backend, not the webview, owns the clock.** `cancel_requested` carries a grace deadline timestamp, and `grace_elapsed` / `terminating` arrive as backend state events — the UI renders from the deadline and never runs its own timer as the authority, and a second click does not advance the ladder. (Whether the ladder then runs on its own or waits for the `Force kill` press is decided with that backend contract.)
  - Reduced motion: the fill is a width change, not a looping animation, so it is unaffected; the pending spinner is suspended like every other looping animation (DESIGN.md Platform States).
- **The stage follows the tail only while pinned.** Streaming never moves the viewport while the user is reading: scrolling up unpins, `jump-to-latest` appears, and reaching the tail or activating it re-pins. A permission or elicitation request that is out of view puts a warning dot on the pill, so a request that asks for the user is never off-screen and silent.
- **Every turn ends in something visible.** `working-indicator` runs from prompt to stop reason. A normal end leaves nothing; every other stop reason (`refusal`, `max_tokens`, `max_turn_requests`, `cancelled`) and every `Error` becomes a `turn-notice`, so a turn never just stops. An ACP `refusal` means the prompt and everything after it is excluded from the next prompt, and the UI says so.
- **An idle thread is a complete view, not a broken one.** With no turn running the stage shows the history and nothing else: no `working-indicator`, no `jump-to-latest` (the viewport is already at the tail because nothing is arriving), and the composer at rest. The Inspector drops to its empty state rather than a row of zeroes, and its header badge reads `Idle` statically. A thread that has never run is the same view with an empty transcript.
- **Mid-session configuration follows the categories.** ACP session config options carry a `category` (`mode`, `model`, `model_config`, `thought_level`, or a vendor's own). The Model and Effort chips write `thread.setConfigOption` (ACP `session/set_config_option`, narrowed by Tethys policy and never widened, `PRM‑04`) for their category; a change made while a turn is running applies from the next turn and the control says so. A Provider that rejects a mid-session change reverts the chip and shows a `provider-capability-notice`. After a rejection the full panel shows that option read-only for the rest of the session, for the same reason.
- **Tool calls are summarised by default and exact on demand.** `Tool call density` (§5.1) defaults to `Summary`. Whatever the setting, a failed call, a call awaiting permission and any subagent child awaiting approval are open.
- **History doesn't depend on what a Provider can replay.** Tethys keeps its own durable transcript for every Session. Reconnect uses `session/resume` when negotiated, otherwise `session/load` when negotiated; when neither exists, reopening starts a fresh `session/new` and displays the cached transcript as read history above the new live turns, divided by a hairline labelled `Earlier history (read-only)`.
- **Review is capability-driven.** Revert, diff, stage and commit affordances render only when the workspace's `vcs` is git and (for revert) `restore` is yes. Otherwise they are hidden or disabled with a `no git · no revert` explanation, so a fresh session never looks broken. Git is a feature, not enforcement: the hub accepts any folder, and there is no app-managed snapshot fallback in MVP. In-place `git init` is the upgrade path to full worktree behaviour, and `isolation: plain` (WT‑11, V1) is the explicit opt-out that hides git UI even where it would otherwise be available.

> **Decided — commit/diff visibility from the composer (option a).** The isolation pill pins *branch context* to the prompt card's context bar, but `Approve & Commit` lives only in the Inspector's `diff-viewer`: `360px`, docked, collapsing to an overlay drawer below `1100px` viewport, where the commit action is off-screen until the user opens the drawer. **Decision:** when a turn has a diff and the workspace's `vcs` is git, a **diff-summary pill** in that context bar shows the changed-file count and `+a −b` from the diff summary and opens the Inspector; `Approve & Commit` stays in the Inspector's `diff-viewer`. *Why:* it needs no new surface and no shell edit — `registerComposerContextSlot` (named `registerActionBarSlot` while the 56px action bar existed) is the sanctioned seam and slots carry a priority. The alternatives were rejected: hoisting `Approve & Commit` into the context bar (b) duplicates the commit surface and spends width the fold order has already budgeted, and auto-opening the Inspector on a turn's first diff (c) moves focus mid-turn, which contradicts "switching tabs never unmounts background execution streams". The pill carries **no staged-hunk count**: `git.stage` is path-level and only `git.discard` is hunk-granular, so the count is not computable. It sits between the Provider/config pill and the mode pill in the priority order (DESIGN.md `prompt-card.contextBarFold`), so it folds after the queue count and the mode pill and before the stop control and the isolation pill. The `d0-rc5` limitation (a docked Inspector leaving the Stage below `stage-min` between `1100px` and `1512px`) is closed by the three-region shell: with no docked Sessions or Hub column, `48 + 560 + 360 = 968px` fits under the `1100px` threshold.

**UX Flow**

- Where the workspace has git: agent suggests edits → diff renders automatically in the right inspector → user reviews hunks inline → clicks `Approve & Commit` (Tethys's own git staging action) or, where restore is available, `Revert Turn` to cleanly roll back the git temporary index in under 150ms.
- Where it doesn't: agent edits files in place → the turn completes with its tool calls and messages in the transcript and no diff section → the isolation pill reads `no git`, with `Initialize git` offered from the card.
- Agent wants to run a shell command → `permission-request-card` appears inline with the Provider's own options → user picks one (or, in Auto-edit/YOLO mode, Tethys picks on their behalf per the workspace's trust policy) → the tool call proceeds or is rejected accordingly.

### 4.1 Thread view inventory

Every ACP `session/update` variant and client-side request a thread can receive, the normalized event it becomes (`docs/architecture.md` §7.3), the surface that renders it, and the chunk that builds that surface. A source with no row here has no owner; add a row before adding a component.

| ACP source | Normalized | Surface (DESIGN.md) | Owner | Contract change |
|---|---|---|---|---|
| `user_message_chunk` | `MessageChunk` (User) | `turn-message`, `attachment-chip` | M1.7 | none; audio and embedded-resource blocks arrive as `Unknown` and show a `provider-capability-notice` |
| `agent_message_chunk` | `MessageChunk` (Agent) | `turn-message` body, `code-block`, `message-actions` | M1.7 | none |
| `agent_thought_chunk` | `MessageChunk` (Thought) | `thought-block` | M1.7 | none |
| `tool_call`, `tool_call_update` | `ToolCallUpsert` | `tool-accordion`, `tool-run-group`, `tool-origin-tag`, `subagent-card` | M1.7 | **`kind` becomes a closed enum; `origin` and `parent_tool_call_id` added; `locations` carry `path` and `line`** |
| tool content `diff` | `ToolCallContent::Diff` | excerpt in `tool-accordion`; `diff-viewer` in the Inspector | M1.7, M1.9 | **the v1 mapper fills `Diff` (it maps ACP `diff` to `Unknown` today); no schema change** |
| tool content `terminal`, `terminal/*` | `Terminal*` | inline well, `terminal-sheet` | M1.7 | none |
| `plan` | `PlanUpsert` | `plan-panel` | M1.7 | none (`plan_update` / `plan_removed` are unstable and not in MVP) |
| `available_commands_update` | `CommandsAvailable` | `composer-command-group` | M1.10 | none |
| `current_mode_update` | synthesized `mode` option | `mode-pill` (prompt-card context bar) | M1.10 | none (see `category` below) |
| `config_option_update` | `ConfigOptionsChanged` | `composer-config-chip`, `session-config-panel` | M1.10 | **`ConfigOption` gains `category`, a select/boolean kind, and per value an id, display name and optional description (only the id survives today)** |
| `session_info_update` | `SessionInfo` | session row and tab title | M1.6 shell | none |
| `usage_update` | `Usage` | `usage-bar`; totals in `activity-ledger` | M2.10 (values) | **`UsageSnapshot` gains context `size` and cost currency** |
| `compaction_update` (unstable) | new `Compaction` event | `turn-notice` `compaction` | M1.7 (fixture) | **new append-only event variant.** The Provider sends it only if the Client advertised the capability; whether Tethys advertises it is M1.17's decision |
| prompt `stopReason` | `StateChanged(Idle)` | `working-indicator` ends; `turn-notice` | M1.7 | **`MaxTurnRequests` added to `StopReason`** |
| `Error` | `Error` | `turn-notice` `error` | M1.7 | none |
| connection lost | connection health | `turn-notice` `connection-lost` | M1.7 renders; M1.12 supplies the state | none |
| `session/request_permission` | `PermissionRequested` | `permission-request-card`, approval inbox | M1.8 | none |
| `elicitation/create` | elicitation entry | `elicitation-card` | M1.7 | added by M1.7 itself |
| vendor `_`-prefixed request/notification | `ProviderExtension` with kind + request correlation id | thread-scoped `provider-popover`; request actions return through `thread.respond_extension` | M1.17 router/transport; Provider registration supplies the surface | defined by M1.6c, completed by M1.17 |
| Provider artifact | entry | `provider-artifact` | M1.7 | none |
| checkpoint, file write | `Checkpoint`, `FileWrite` | per-turn `View diff` / `Restore`; `diff-viewer` | M1.7, M1.9 | none |
| *(derived)* tool-call kinds | — | `activity-ledger` | M1.7 (Inspector slot) | none; needs the fields above |
| queued prompts | queue | composer queue, context-bar queue count | M1.10 | none |

**Contract additions are append-only** — a new field or a new variant, never a change of meaning — and land once, in M1.6d, so worktrees A and C build against the final types instead of each defining a piece. Provider adapters populate `origin`, `parent_tool_call_id`, `category` and the usage `size` in Wave 2.5; until then the webview renders fixtures and an entry with no `origin` renders as a built-in call.

**Not in MVP:** audio output, embedded-resource content blocks, `plan_update` / `plan_removed`, `Edit & resend`, a second nesting level for subagents.

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
- `Tool call density`: `Summary` (default) or `Full`, with the consequence written under it — `Summary` groups consecutive tool calls into `tool-run-group` rows; `Full` shows every call as its own row. Applies to every open thread immediately, and a failed call or one awaiting permission is open under either.
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
  4. `LoginDialog` trigger: lists every method declared by the initialized agent or selected registry distribution and opens the matching vendor-owned flow. Agent Auth shows a waiting state with Cancel; Terminal Auth opens the isolated `terminal-sheet` using the registry method's replacement args/env. Env-var and URL+code shapes remain available to manual profiles. Declared methods do not themselves mean auth is required: the row uses the separate current auth state, and logout appears only when advertised. Tethys never reads or caches vendor tokens (G7); input values go once to `agent.env_secret_set`, which stores only a keychain reference. Closing any login surface re-checks that Provider and restores focus.
  5. **Negotiated capabilities panel**: read-only summary of the grouped M1.17 connection/session capabilities — lifecycle, prompt content, MCP transports, config/mode, auth, client callbacks, extensions — plus `Last check`, `Latency` and `Detected version`. Optional actions throughout the app use the same snapshot and disappear when unsupported; re-check/reconnect replaces stale values.
  6. **Native-settings slot** (entry point now, runtime post-MVP): a reserved group headed `Native config (full file)` with an `Open schema form` button and a `View raw` link, so a generated form (SYN‑11) drops in without altering vertical rhythm; includes a version-drift banner slot and a `Preview diff / Rollback` action row.
- `toggle-switch`: instant runtime enable/disable, `Space` toggles, `aria-checked` bound to the profile's enabled state.
- `terminal-sheet`: isolated interactive terminal overlay for vendor login, an xterm surface on the sunken well. Its title shows the exact command being run; no copy-out of secrets; closing returns focus to `Launch Vendor Login`.

**UX Flow**: Missing CLI detected → user expands accordion → pastes custom binary path → clicks `Manual Health Check` → status dot flips to green. Auth-required Provider detected → user expands accordion → `LoginDialog` renders the method that Provider actually declared → the user completes or dismisses it → on close Tethys re-checks that Provider at once → on a successful re-check the status dot flips from amber to green and the Provider becomes selectable in `model-selector-popover` (§3).

#### 5.2.1 Profiles & activity

- `profile-card`: icon, name, version pin, an `Update available` pill, and an `Install`/`Update` button (`agent.registry.*`). The launch-spec editor (executable, protocol, env) reuses the provider-accordion tokens.
- Provider actions: `Login` (method picker leading to `LoginDialog` or `terminal-sheet`), negotiated `Logout`, `Restart`, and `View stderr` (a sunken well).
- Activity table of `process-row`s: PID, CPU%, RSS, uptime, state, plus the cancellation ladder. The ladder is presented as two layers, matching the runtime: `session/cancel` is the protocol-level interrupt and renders neutral while awaiting the `cancelled` stop reason; `SIGINT → SIGTERM → SIGKILL` is the fallback for a subprocess that misses the grace window and only takes destructive styling once that window has actually elapsed.

### 5.3 Skills & Commands (`Settings / Skills & Commands`)

**Two composer assets, one page.** The composer's `$` and `/` are siblings, so they share a page behind a kind switch. Skills live at `~/.agents/skills/<name>/` (global) or `<workspace>/.agents/skills/<name>/` (workspace) — `architecture.md` §11.4. Tethys commands are plain markdown files with no frontmatter at `~/.tethys/commands/<name>.md` (global) or `<workspace>/.tethys/commands/<name>.md` (workspace) — CMP‑01, CMP‑07. Scope is the only classification for both: `SkillInfo` carries no category field, and a skill's provenance (`folder` / `archive` / `git-hub` / `lockfile`) is shown as data, never a filter axis. The old category tabs (`Skills | Connectors | Plugins`) and the `category-pill` are gone. **Agent-advertised `/agent:*` commands (CMP‑02) never appear here**: they are read-only, exist only while a session is live, and stay in the composer popup.

**Layout**: Two-pane. A page header with the kind switch (`segmented-control`: `Skills` / `Commands`), the scope selector (`segmented-control`: `Global` / `Workspace ▾`, where `Workspace` reveals the workspace picker), a search input, and `+ Add`; a list on the left; the detail pane on the right. Kind and scope persist across visits.

#### Skills kind

- Top bar: search, filter/sort triggers, and the `+ Add` menu (`Upload skill`, `Create a skill`, `Create with agent`, `Import from URL` — a pinned GitHub link is downloaded as a tarball, not browsed; this is not a forge integration).
- Left pane: `skill-row`s in the resolved scope, most-recently-updated first.
- Right pane: `skill-detail` for the selected row, or the pane's empty state.

**Components**

- `skill-row`: icon, skill slug (`{typography.mono-code}`), a `scope-badge` (`Global` / the workspace name), a `provenance-badge` (`folder` / `archive` / `git-hub` / `lockfile`), a trust toggle where the skill ships scripts, and a trailing `•••` action menu. Selecting a row opens its `skill-detail`; the row keeps the `selected` left bar while the pane shows it.
- `skill-detail`: the right pane. Header: skill name (`{typography.heading-md}`, from frontmatter) with its `scope-badge` and `provenance-badge`, and actions `Update` (where provenance can be re-fetched), `Remove` (destructive, confirms) and `Export`. Body: the frontmatter `description`, the rendered `SKILL.md` body via the markdown worker, the file tree (`SKILL.md`, `scripts/`, assets), and the trust + per-workspace enablement controls. Scripts detected in the bundle are called out, since they are what the trust decision is about.
- Trust Toggle: toggle switch granting or restricting execution trust for auto-running without manual prompts. Untrusted script skills are excluded from YOLO threads (SYN‑07).
- Per-workspace enablement: an allow-list toggle for a global skill within a workspace, never a file delete (`architecture.md` §11.4).
- Two-Way Sync Indicator (V1, SYN‑08, `M2.4`): shows whether local changes in `.agents/skills` are cleanly synchronized with vendor skill folders. The MVP skill library has no projection to report on, so it renders no indicator.

**Upload flow**

`+ Add` → `Upload skill` opens `skill-upload-dialog`: drop a `.skill` file, a skill folder, or a pinned GitHub tarball onto the `file-dropzone`. Tethys validates the bundle (frontmatter, size caps, name collisions, script detection, archive guards: no absolute or `..` paths, no links, entry and size caps) and lists one row per extracted entry. A failure row reads its reason and the confirm action stays disabled until the bundle is valid. A valid bundle is written to the selected scope's `.agents/skills/<name>/`; the canonical home is never moved, and an update swaps the directory atomically in place (`architecture.md` §11.4). `Create a skill` (an empty skeleton) and `Create with agent` (a prompt that produces a `SKILL.md`) share the dialog shell.

**UX Flow**: User selects `Global` → clicks `+ Add` → `Upload skill` → drops `deploy.skill` → validation shows the frontmatter, one detected script, and no collision → confirms → the row appears under Global with a trust prompt → user grants trust → selects the row to read its rendered `SKILL.md` in `skill-detail`.

#### Commands kind

- Top bar: search and the `+ Add` menu (`New command` — an empty body with a `{{args}}` starter line). Import/export of command files is V1, not MVP.
- Left pane: `command-row`s in the resolved scope, by name. The list is read with `commands.list(includeShadowed = true)`, so a global command that a workspace command shadows still appears in the Global scope with the `shadowed by workspace` note — otherwise the user could not open the file that loses.
- Right pane: `command-editor` for the selected row, or the pane's empty state.

**Components**

- `command-row`: a `/` glyph, the command name (`{typography.mono-code}`), a `scope-badge`, an `args-tag` when the body contains `{{args}}`, and a trailing `•••` menu (`Rename`, `Duplicate`, `Delete`). No trust toggle: commands ship no scripts. A global row a workspace command overrides renders its name and provenance muted plus the `shadowed by workspace` note (text, never colour alone). Selecting a row opens its `command-editor`; the row keeps the `selected` left bar while the pane shows it.
- `command-editor`: the right pane. Header: `/name` (`{typography.heading-md}`) with its `scope-badge`, and actions `Save` (disabled until the body is dirty) and `Delete` (destructive, confirms). Body: the name field (editable on create, read-only after, because the filename is the name), the body `code-editor-well` in its `Markdown` mode with a `Markdown | Preview` toggle, and the helper line: `Use {{args}} where the typed text goes; otherwise it is appended. $skill and @path resolve to plaintext.` When the edited global command is shadowed, a note reads `Workspace overrides this in <workspace>`; when a rename collides with a name already present in the same scope, the name field shows the collision inline and `Save` stays disabled.
- Empty state: `No commands in this {scope} scope` with a `New command` action and the resolved folder beneath it, so the fix is named (`P6`).
- Consequence footer: `Available in every thread's / menu`.
- Validation: a name must be lowercase letters, digits, `-` or `_` (`commands.write` rejects the rest with `InvalidConfig`), and `Rename` is create-then-delete, so it is atomic or it does not happen.

**UX Flow**: User switches the kind switch to `Commands` → scope is `Global` → clicks `+ Add` → `New command` → types `review` → body `Review {{args}} and list blockers.` → `Save` → the row appears under Global with an `args-tag` → in a thread, `/review the staged diff` expands to the body with the args substituted.

### 5.4 MCP Servers (`Settings / MCP`)

**A per-Provider config editor.** Most Providers configure MCP through their own config file — JSON for all but Codex CLI, which is TOML — and each has its own schema. Settings / MCP is therefore a scoped, per-Provider visualizer over that file: choose a scope (Global or a workspace), choose a Provider, and read or edit the servers in that Provider's own file.

> **Decided — Provider config editor, not a matrix (`d0-rc6`).** The previous Servers × Providers `sync-grid` is removed. It answered "which Provider receives which server at `session/new`", but the question a user arrives with is "where do I add this server for this tool", and only the Provider's own file answers it. Attachment at `session/new` (`architecture.md` §11.2) remains the runtime path for ACP-native Providers; the editor's footer states the consequence (`Applies to new sessions`) and edits the Provider's own file, so a Provider that consumes its file directly is covered either way. The one thing the matrix carried that a file view does not — "will this Provider actually accept this transport" — is shown as a `provider-capability-notice` in the footer, fed by `mcp.attachments`.

**Layout**: Page header (breadcrumb, title, right cluster: scope `segmented-control` (`Global` / `Workspace ▾`), `+ Add Server`), then a `provider-tab` strip, then the `config-file-row`, then the `code-editor-well`, then the footer note.

**Components**

- `provider-tab`: one tab per Provider Tethys can configure — Claude Code, Codex CLI, OpenCode, then later verified Providers — with the Provider glyph and a `status-dot` marker (healthy / `auth_required` / not found). The strip scrolls horizontally inside its own region as Providers are added; the page never scrolls horizontally. A Provider that is not installed still appears so its file can be inspected and prepared, read-only.
- `config-file-row`: the exact resolved path the well reads and writes, home-shortened, with a `format-badge` (`JSON` / `JSONC` / `TOML`) and a `scope-badge`. `~/.claude.json` is marked `read-only — import only` (`architecture.md` §11.3).
- `code-editor-well`: the Provider's file as a line-numbered, syntax-highlighted well, editable, with a tree/raw toggle. A save happens only on an explicit `Save`: it preserves formatting (JSONC comments and key order) and unknown keys, previews a diff, keeps a timestamped backup, and refuses a stale plan (`architecture.md` §11.3). The well scrolls inside its own region and never soft-wraps; long lines scroll horizontally.
- `mcp-server-form`: the structured `+ Add Server` / row-edit form. It writes one entry into the well's document; its fields follow the target Provider's schema, never a universal shape (see the table below).
- Footer note: the effective-injection sentence (`Attached to new {Provider} sessions at session start`), and a `provider-capability-notice` where `mcp.attachments` reports a configured server as `UnsupportedTransport` for this Provider.
- Import wizard (detect → preview → apply): imports existing servers from a detected tool's file into the current scope (`SYN‑04`), reached from the `+ Add Server` menu, not a separate page.

**Per-Provider schema.** Each tab renders only the fields its Provider declares; a saved entry uses that Provider's exact keys. Paths are `verify` at implementation time (`architecture.md` §11.3).

| Provider | File — global / workspace | Root | `stdio` entry | remote entry |
|---|---|---|---|---|
| Claude Code | `~/.claude.json` (read-only) / `<workspace>/.mcp.json` | `mcpServers` | `{ "type": "stdio", "command", "args", "env" }` | `{ "type": "http", "url", "headers" }`; `${VAR}` expansion |
| OpenCode | `opencode.json(c)` | `mcp.servers` | `{ "type": "local", "command": [...], "cwd", "environment", "disabled" }` | `{ "type": "remote", "url", "headers", "oauth" }` |
| Codex CLI | `~/.codex/config.toml` | `[mcp_servers.<name>]` — **TOML** | `command`, `args`, `env` | `url`, `bearer_token_env_var`, `http_headers`, `env_http_headers` |
| Antigravity CLI | `~/.gemini/config/mcp_config.json` / `<workspace>/.agents/mcp_config.json` | `mcpServers` | `{ "command", "args", "env", "cwd" }` | `{ "serverUrl", "headers", "authProviderType", "oauth" }` — **`serverUrl`, never `url`** |
| Gemini CLI | `.gemini/settings.json` | `mcpServers` | `{ "command", "args", "env", "cwd", "timeout", "trust" }` | `{ "url" \| "httpUrl", "headers", "timeout", "trust" }` |
| Cursor | `~/.cursor/mcp.json` / `<workspace>/.cursor/mcp.json` | `mcpServers` | `{ "type": "stdio", "command", "args", "env", "envFile" }` | `{ "url", "headers", "auth" }`; `${env:…}`, `${workspaceFolder}` interpolation |
| Kiro CLI | `~/.kiro/settings/mcp.json` / `<workspace>/.kiro/settings/mcp.json` | `mcpServers` | `{ "command", "args", "env" }` | `{ "url", "headers" }`; `${TOKEN}` |

- Secrets are entered as `keychain:` / `${VAR}` / `{env:VAR}` references only, resolved at `session/new` (or launch) time; a plain-text secret is never written to a config file (`architecture.md` §11.3, G7). Codex stores a `bearer_token_env_var` reference, not the token itself.
- Empty state: `No MCP servers in this {Provider} {scope} file` with a `+ Add Server` action and the resolved path beneath it, so the fix is named (`P6`).
- Validation: an invalid line marks its gutter in `{semantic.status-danger}` and the message renders in the well's footer (`role=alert`); `Save` stays disabled until the document is valid.

**UX Flow**: User opens Settings / MCP → scope is `Global` → picks the `opencode` tab → the well shows `opencode.jsonc` with two servers → clicks `+ Add Server` → the form asks for a name and `local` / `remote`, then only the fields OpenCode declares → user enters `type: local` and `command: ["npx", "-y", "@modelcontextprotocol/server-everything"]` → the entry is inserted into the document → `Save` → footer reads `Attached to new OpenCode sessions at session start`. Switching the scope to a workspace re-opens the same tab against the workspace file (for Cursor, `.cursor/mcp.json`), showing that scope's servers.

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
- Keep the stage pinned to the tail only while the user is at the tail, and end every turn with something visible (`working-indicator`, then a `turn-notice` for any stop reason other than a normal end).
- Give every config category one home: `mode` in the prompt card's `mode-pill`, `model` and `thought_level` as composer chips, everything else in the full panel.

**Don't**

- Don't navigate the entire window to a full screen when clicking a card; use the side-peek drawer or open a dedicated thread tab.
- Don't crowd the card footer with more chips than fit at the chip `minWidth` (never more than 3); show an overflow indicator (`+N more`) that opens the side-peek drawer, and never let a pending approval fold into it while a lower-priority chip holds a slot.
- Don't use a single-pane breadcrumb drilldown for the model selector; Tethys is a desktop control plane — use the side-by-side flyout.
- Don't assume every Provider exposes Model + Effort; the config panel is generated from that Provider's schema.
- Don't infer a tool call's origin (MCP server, skill, subagent) from its title; render the `origin` field the adapter supplied, or treat the call as built-in.
- Don't hide a request that asks for the user inside a collapsed group, subagent card or out-of-view region without a visible signal (`awaiting` ring, forced-open parent, `jump-to-latest` dot).
- Don't invent a trade-off line or description for an elicitation option; ACP sends a value and a title only.
- Don't send an image to a Provider that did not declare image prompts; refuse it at attach time.
- Don't dim the Provider name when a config field is unsupported; dim only the affected field label.
- Don't hardcode an Approve/Reject pair, a button count, or a button order on a permission request; Tethys renders the Provider's `options`.
- Don't render a vendor-extension request as an inline `permission-request-card` or `elicitation-card`, and don't give a surface its own "this Provider can't" copy; use `provider-popover` and `provider-capability-notice`.
- Don't derive MCP attachment or server state in the webview. The effective set comes from `mcp.attachments` (runtime) and the per-Provider file editor writes that Provider's own config file; the two are never merged, re-derived or inferred in the UI.
- Don't show the destructive `SIGINT/SIGTERM/SIGKILL` ladder before `session/cancel`'s grace window has elapsed.
- Don't read or cache vendor tokens in any login surface (`LoginDialog` or `terminal-sheet`); launch the vendor's own flow and close.
- Don't let a vendor logo imply a workspace source or an entry point. GitHub and GitLab report where an existing folder's git remote points — they are never a way to add, clone or browse a workspace.
- Don't assume git. A surface that needs it checks the capability set; it does not test for a `.git` directory itself.
- Don't adopt foreign component runtimes (e.g. ACP UI kits) that bring their own stores, providers, or icon sets; borrow presentational ideas only and re-implement against `@tethys/state` and semantic tokens.

---

## Page & Component Mapping Summary

| Page / Route | Primary View Type | Key Tokens & Sizes | Distinctive UX / Behaviours |
|---|---|---|---|
| **`/workspaces`** | Card Grid + Peek Drawer | Cards: `220px`, Drawer: `380px` | Git and no-VCS card variants, Local vs. Remote switch, "Needs attention" filter, trust dialog gating every new folder, zero-click thread chips. |
| **`/thread/new`** | Centered Prompt Canvas | Card: `820px` max, Popover: `560px` | Explicit workspace picker, per-Provider config schema (not a fixed Model/Effort grid), auth-gated Provider selection. |
| **`/thread/:id`** | Three-Region IDE Shell | Sessions drawer: `280px`, Inspector: `360px` | Workspace → Provider → Session grouping, plan panel, grouped tool-call summaries with skill / MCP / subagent origin, category-aware Model and Effort chips, an activity ledger, a visible ending for every turn, protocol-native permission requests, dual-layer cancellation, capability-driven review (turn rollback in <150ms, unified/split diffs, only where git exists). |
| **`/settings/providers`** | Accordion Registry List | Rows: `12px 16px` padding | Per-Provider auth method adapts (env var / URL+code / CLI passthrough), negotiated-capabilities panel (resume, MCP transports, elicitation). |
| **`/settings/skills`** | Two-Pane Skill & Command Browser | List + detail pane: `360px`; rows: `44px` | Kind switch `Skills` / `Commands`; scope (`Global` / `Workspace`) is the only classification. `skill-row` with `scope-badge` and provenance, `skill-detail` viewer with rendered `SKILL.md`, trust and per-workspace allow-list; `command-row` with `args-tag` and shadow note, `command-editor` with a `Markdown | Preview` body. `/agent:*` commands stay composer-only. |
| **`/settings/mcp`** | Per-Provider Config Editor | `code-editor-well`, `provider-tab` strip | Read/edit each Provider's own MCP file (JSON / JSONC / TOML) scoped Global or Workspace, with `mcp-server-form`; the retired `sync-grid` matrix is replaced by a footer injection note. |
| **`/settings/general`** | Two-Column Settings Form | Inputs: `40px` height | Instant hot-swappable JSON custom themes, font pickers, OS alerts, Trusted Folders. |

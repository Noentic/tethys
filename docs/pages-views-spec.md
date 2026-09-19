# Pages & Views Specification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Window Header & Tab Strip (40px)                                  [_][□][×] │
├────┬──────────────┬──────────────────────┬──────────────────────────────────┤
│Rail│ Hub/Projects │ Threads Column       │ Stage / Inspector / Diff         │
│48px│ 264px → 48px │ 280px (collapsible)  │ (flex stage)                     │
│    │              │                      ├──────────────────────────────────┤
│    │              │                      │ Action Bar (56px) + Composer     │
└────┴──────────────┴──────────────────────┴──────────────────────────────────┘
```

## 0. ACP Session Model (read first — everything below maps onto this)

Tethys is an ACP Client, not a custom agent runtime. Every page in this spec is a view onto the same three-tier state model, so the terminology needs to be exact before the pages make sense:

- **Provider** = one ACP connection (what the protocol calls an "Agent" — Claude Code, Codex, OpenCode, etc.). Tethys opens one persistent connection per *enabled* provider at launch, in parallel, via `initialize` capability negotiation and `auth/login` if the provider advertises `authMethods`. One provider's connection failing (missing binary, expired auth) never blocks the others — each is isolated.
- **Workspace** = a directory (`cwd`). This is the unit shown as a `workspace-card` in the hub (§2). A workspace can host concurrent sessions from *different* providers at once — e.g. Claude Code drafting a fix while Codex reviews it in the same folder — so "workspace" and "provider" are orthogonal, not nested.
- **Session** = one `session/new` conversation, belonging to exactly one Provider + one Workspace. A Tethys "thread" (tab, `thread-list-row`) is a UI-level wrapper around one Session. Starting a thread means calling `session/new` with `cwd` (the workspace's git-worktree path, or the plain folder path for no-VCS workspaces — see §2) and the `mcpServers` relevant to that workspace.

Two consequences that change earlier assumptions in this doc, corrected in the sections below:

1. **Permission resolution lives entirely in Tethys, never in a vendor CLI's own terminal.** Every tool call a Provider wants to run surfaces via `session/request_permission`, with the Provider supplying its own `options` array (its exact allow/reject choices — not a fixed pair Tethys invents). Tethys's permission mode (Supervised / Auto / YOLO) decides whether to auto-pick an option or surface it to the user. Because ACP routes every consent decision through the Client by design, there is no separate CLI-level prompt to "de-dupe" against — an earlier draft of this doc got that wrong.
2. **"Agent" no longer means "running thread."** Where earlier language said things like "2 agents running" on a workspace card, it should read "2 sessions" (and, where it matters, name the providers) — "agent" is reserved for the Provider connection itself.

---

## 1. App Shell & Global Chrome (`UI-01`)

The global application shell wraps all windows in a native, lightweight window frame optimized for parallel workflows.

**Layout**

- **Activity Rail (Left)**: Fixed `48px` width, background `{semantic.surface-rail}`. Border: `1px solid {semantic.hairline}` on the right.
- **Window Header & Tab Strip (Top)**: Height `40px`, background `{semantic.surface-rail}`. Border: `1px solid {semantic.hairline}` along the bottom. Insets `~70px` left padding on macOS for traffic lights, or reserves `140px` right padding on Windows for native caption controls.
- **Command Palette Modal (`command-palette`)**: Centered overlay (`600px × 400px`, Level 4 elevation) triggered anywhere via `Ctrl/Cmd + K`.

**Components**

- `nav-rail`: Contains top cluster (Workspaces `grid` icon, New Thread `compose` icon) and bottom cluster (Global Settings `gear` icon, daemon health dot). Icons use `{icons.sizes.rail}` (20px) with `36px` hit targets.
- `tab-bar` & `tab-item`: Horizontally scrollable tab strip supporting multi-repo tabs. Workspaces hub is pinned permanently at index 0. Sibling tabs render as `[Icon] [repo / branch] [×]`.
- `approval-inbox-pill`: Persistent tab-bar pill `Waiting on you (N)` rendered with `{semantic.status-warning}` pulse dot. Hidden when queue count is 0.

**Behaviour**

- Switching tabs never unmounts background execution streams or uncommitted diff state.
- Window blur dimming: inactive window dims background surfaces to `60%` opacity while preserving hairline structure.
- Daemon health dot reflects aggregate provider connection health (any healthy connection = green), not an all-or-nothing state — one provider being down doesn't turn the whole app red, per §0's connection-isolation rule.

**UX Flow**

- `Ctrl/Cmd + 1..9` jumps instantly to open workspace/thread tabs.
- Clicking the `Waiting on you` tab pill slides out the `approval-queue-drawer` without interrupting the active conversation.

---

## 2. Workspace Catalog Hub (`/workspaces`)

A Railway-style catalog presenting repositories and parallel git worktrees as self-contained operational tiles.

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

- Top bar: Title `{typography.heading-lg}`, Segmented Control (`Local` | `Remote`), search bar, `Needs attention (N)` filter chip, sort dropdown, and Grid/List toggle.
- Content Area: Responsive CSS grid `repeat(auto-fill, minmax(320px, 1fr))` with `{spacing.lg}` (16px) gap and `{spacing.xl}` (24px) padding.
- Slide-over Peek Drawer: `380px` wide flyout from the right window edge (`workspace-peek-drawer`).

**Components**

- `segmented-control` (`Local` | `Remote`): Switches between local checkouts and SSH/container environments. Orthogonal to VCS status — a folder can be Local + git, Local + no-VCS, Remote + git, or Remote + no-VCS.
- `workspace-card`: 220px height. Features repo title, `workspace-source-badge`, favorite star, a canvas that renders in one of two modes depending on VCS status, and a two-line status footer.
- `workspace-source-badge`: Small top-left glyph + label pair identifying the workspace kind — `Git · GitHub`, `Git · GitLab`, `Git · local` (git-initialized, no remote configured), or `Folder · no VCS`. A secondary `Remote` tag appends when the folder lives on an SSH/container host rather than the local disk.
- `worktree-topology-canvas` (**git-topology mode** — used when the folder is git-initialized): Dot-matrix background (`{semantic.grid-dot}` at 12px intervals) with a trunk node (`main`) and one branch node per active Session, connected by thin edges. Node color encodes state: `{semantic.status-info}` pulse = session running, `{semantic.status-warning}` pulse = waiting on approval, `{semantic.grid-dot}` outline = idle worktree, `{semantic.status-danger}` = errored/blocked turn. Each node also carries a small provider glyph (Claude Code / Codex / OpenCode icon) since a single workspace can run concurrent Sessions from different Providers — that's a first-class scenario under ACP's session model (§0), not an edge case. Card-level `⚠` badge mirrors the highest-severity node state so it's scannable without opening the card.
- **single-node mode** (used when the folder has no git initialized): same dot-matrix background, but a single centered node instead of a trunk/branch graph — there's no worktree mechanism to isolate parallel Sessions in a plain folder, so there's only ever one Session to represent. The node still carries the running/waiting/idle/error color coding and its provider glyph.
- `worktree-session-item-chip`: Footer chips showing active Sessions with a leading provider glyph, branch name, live diff stat (`+34 -12`), and turn checkpoint (`T8`). A chip with a pending approval renders with an amber outline instead of the default hairline. In single-node mode this collapses to a single unnamed session chip (no branch name to show).
- `worktree-session-item-row`: Full-density row variant used in the peek drawer displaying provider glyph, branch name, turn checkpoints, live status dot, diff stats, and instant rollback buttons.
- `git-init-upsell-chip`: Shown only on no-VCS cards, inline in the footer — `Initialize git →`. Running it performs `git init` + an initial commit of the folder's current state in place, then hot-swaps the card from single-node to git-topology mode without navigating away from the hub.

**Behaviour**

- Single-clicking a card body opens the `workspace-peek-drawer` (modeless; catalog stays interactive). If the workspace has pending approvals, the drawer opens directly to an `Approvals` tab instead of the default `Sessions` tab.
- Clicking a `worktree-session-item-chip` spawns a dedicated top-level tab for that branch session.
- Double-clicking a card opens or focuses the primary/most-recent thread for that repository.
- Hovering an idle card surfaces a `+ New Thread` overlay button in the canvas, so starting work on a dormant repo doesn't require opening the drawer first.
- **Concurrency gate on no-VCS folders**: a single-node card with an already-running session disables `+ New Thread` (tooltip: "This folder isn't version-controlled, so only one agent can run here at a time. Initialize git to run threads in parallel.") rather than silently allowing a second agent to write into the same tree.

**UX Flow**

- User lands on Catalog → clicks a `fix-auth` chip → a new tab `[ ⌗ vocasia-next / fix-auth × ]` slides in smoothly next to the pinned `Workspaces` tab → user immediately enters the thread execution view.
- User has three repos running agents in parallel → clicks `Needs attention (2)` → grid filters to only the `vocasia-next`-style cards with a pending approval → user works the queue card by card without hunting across an unfiltered grid.
- User drops a scratch folder with no git history into Tethys → card renders in single-node mode, footer reads `no version control · 1 agent (max)` with an `Initialize git →` chip → user clicks it once they're ready to parallelize, and the card upgrades in place.

### 2.1 Add Workspace Flow & Trust (`workspace-add-flow`, `workspace-trust-dialog`)

Adding a workspace and trusting it are treated as one flow, not two — the folder never appears as a usable card until trust has been granted.

**Trigger points**

- `+` action in the Workspaces hub top bar, or the rail's `compose` icon with no active workspace context.
- Native OS folder picker (local) or a remote path + existing SSH/container connection picker (remote) resolves a target directory.
- Tethys inspects the resolved path — git-initialized or not, has a remote or not, local or remote host — and opens `workspace-trust-dialog` before creating a card or spawning any agent process against it.

**`workspace-trust-dialog` — layout & copy**

- Header: shield glyph + `Trust this folder?`
- Path row: resolved absolute path, home-dir shortened (`~/dev/vocasia-next`), monospaced.
- `workspace-source-badge` echoed inline so the trust decision is made with full context (git+remote / git local-only / no VCS; local disk / remote host).
- Body copy branches by source:
  - **Local, git-tracked**: "Coding agents will be able to read, edit, and run commands inside this folder and its subfolders. Tethys creates an isolated git worktree per thread so parallel agents can't collide."
  - **Local, no VCS**: "This folder isn't tracked by git yet, so Tethys can't isolate agent runs into separate worktrees — only one thread can run here at a time until you initialize git." Inline `Initialize git now` checkbox lets the user opt into git-topology mode as part of trusting, instead of doing it later from the card.
  - **Remote (SSH/container)**: adds a heavier-weight warning line — "This folder lives on `{host}`. Trusting it means agent commands run directly on that machine; Tethys does not sandbox execution on remote hosts." Rendered with `{semantic.status-warning}` emphasis, not the default body color.
- Permission mode radio (reuses the existing Supervised / Auto-approve reads / YOLO modes from the PRD) — defaults to `Supervised`.
- Trust scope checkbox: `Just this folder` (default) vs `This folder and subfolders opened later`.
- Footer: `Cancel` (secondary) / `Trust & Add Workspace` (primary; disabled until a path is resolved).

**Behaviour**

- Trust decisions persist in a local trust store keyed by resolved absolute path (plus host identifier for remote folders), alongside the chosen permission mode and a timestamp.
- Re-prompts automatically if the folder's git remote changes or its resolved path changes underneath it (e.g. a symlink swap) — both are treated as a new, unverified target even if the display name is unchanged.
- Trusted folders are listed and revocable from `Settings / General` (`Trusted Folders` list) — see §5.1.
- **Single consent surface, by protocol construction**: the permission mode chosen here becomes Tethys's local policy for resolving every `session/request_permission` call from that workspace's Sessions (§0) — auto-picking an option for Auto/YOLO, or surfacing the Provider-supplied options to the user for Supervised. Because ACP routes all tool-call consent through the Client, there's no separate vendor-CLI prompt to suppress here; the one exception is a Provider's one-time `auth/login` (§5.2), which is a distinct, earlier step handled by the Provider's own connection, not by this dialog.

**UX Flow**

- User clicks `+` in the Workspaces hub → picks a local folder that has no `.git` → `workspace-trust-dialog` opens, source badge reads `Folder · no VCS`, body warns about the single-thread cap, user ticks `Initialize git now` and confirms → card lands in the grid already in git-topology mode with a fresh initial commit.

**Design rationale — vs. the Railway reference**

Railway's card is optimized to answer "is this service up?" — a static, mostly-boolean question, so a single centered glyph plus a footer stat line is enough. A Tethys workspace is running N autonomous Sessions concurrently, possibly across several Providers, some of which are actively blocked waiting on a human decision — that's the thing the hub exists to surface. So the canvas itself became a small live topology (trunk + branch nodes) instead of one icon, and "needs attention" got promoted from a footer detail to a first-class filter, since triaging across repos is the primary loop, not just monitoring uptime.

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

- Centered prompt canvas: vertically centered with a `12vh` optical lift (bottom padding). No fixed top offset.
- `workspace-selector-pill` sits above the textarea as the first field in the prompt card — defaults to the last-active workspace, but is never silently assumed: no thread is created without an explicit `cwd`. Opening this canvas by double-clicking a workspace card pre-fills it; opening it from the rail's global `compose` icon leaves it for the user to pick.
- Prompt Card: `min({layout.prompt-width}, 100% - 96px)` width (820px max), `{rounded.2xl}` (20px), background `{semantic.surface-elevated}`, `1px {semantic.hairline-strong}` border with `{semantic.edge-highlight}` top edge.
- Two-Column Flyout Popover (`model-selector-popover`): left column is the fixed `Provider (200px)` list; the right column's contents are **not** a fixed `Model | Effort` grid — see Behaviour.

**Components**

- `prompt-card`: Auto-expanding textarea (`{typography.body-md}`).
- `workspace-selector-pill`: Compact trigger showing the workspace's `workspace-source-badge` icon + name; opens the same peek-style picker used in §2.
- `model-selector-pill`: Compact trigger `[Provider icon] [Provider name] [config summary] ∨`. The config summary is whatever that Provider's own session config schema returns (often model + effort, but not guaranteed to be exactly that shape).
- `model-selector-popover`: Left column fixed-width (`Provider 200px`); right column renders `session-config-panel` (below) for whichever Provider is selected. A Provider with an auth problem shows an inline `⚠` and is not selectable until resolved.
- `action-icon-button`: Circular submit pill (`32px`), shifting from `{semantic.surface-hover}` to primary high-contrast fill when input is present.

**Behaviour**

- **Config options are fetched per-Provider, not hardcoded.** Each Provider's `initialize` response and session config schema determine what's shown on the right — one Provider might expose Model + Effort, another just a Model list, another nothing configurable at all. The popover renders whatever fields that schema declares rather than assuming the Model/Effort shape universally; that shape (shown in the wireframe above) is illustrative for Claude Code specifically, not a Tethys-wide constant.
- **Auth gate**: selecting a Provider that requires `auth/login` and hasn't completed it opens `LoginDialog` (§5.2) inline in the popover before that Provider becomes selectable — never lets a prompt submit against an unauthenticated connection.
- Keyboard navigation: `Enter/Space` opens popover; `↑/↓` navigates the active column; `→` drills in, `←` steps back; `Enter` confirms selection and focuses back to the prompt textarea.

**UX Flow**

- User types query → confirms the workspace pill (or leaves the pre-filled default) → picks a Provider → the config panel updates to that Provider's own schema → presses `Ctrl + Enter` to submit → Tethys calls `session/new` with the chosen `cwd`, that workspace's `mcpServers`, and the selected config → canvas transitions into the Active Thread Workspace once the Session is created.

---

## 4. Active Thread Workspace (`/thread/:id`)

The four-region control plane for executing turns, inspecting thought streams, approving commands, and reviewing git worktree diffs (`UI-01`, `UI-04`, `WT-04`).

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
│    │  ○ review    │ ⚠ Approve file edit?        │ Branch Changes (+42 -12)  │
│    │    clean T2  │ [Allow once][Allow always]  │ src/jwt.rs (unified/split)│
│    │              │ [Reject]                    ├───────────────────────────┤
│    │              ├─────────────────────────────┤ [Stage Hunk][Revert Turn] │
│    │              │ [◆Claude·Sonnet·Med][●●○12k]│ ⚙ Auto (this session)    │
└────┴──────────────┴─────────────────────────────┴───────────────────────────┘
```

**Layout**

- **Sessions Column (`280px`)**: three-level grouping — Workspace → Provider → Session — rather than a flat list, since one workspace can hold Sessions from several Providers at once (§0). A Session row shows its provider glyph, branch/label, live diff stat, and turn count.
- **Main Stage (Center-Flex, min 560px)**: Streamed Markdown turns, collapsible thought blocks, plan panel, inline tool-call cards, and inline permission-request cards.
- **Turn Inspector & Diff Panel (`360px`, Right)**: Collapsible sidebar housing the plan, turn telemetry, raw JSON payloads, and git patch inspection. Collapses to an overlay drawer when the viewport drops below `1100px`.
- **Action Bar & Composer (Bottom Docked, `56px`)**: Provider/config summary pill, permission-mode pill (scoped to this Session, overridable from the workspace-level default set in `workspace-trust-dialog`), token usage indicator, cancellation trigger, and composer input.

**Components**

- `session-list-row` (replaces `thread-list-row`): Workspace header (collapsible) → Provider sub-header → Session rows, each with a running pulse, branch/label, turn count (`T8`), dirty status, and a `Fork` action (opens a new Session in the same Provider + Workspace, seeded via `session/resume` with `replayFrom: start` where supported, or a fresh `session/new` with the transcript summarized into the first message where it isn't).
- `turn-message` & `thought-block`: Distinguishes user prompts from internal agent thought streams (collapsible panel in `{semantic.surface-panel}`), sourced from `session/update` message chunks.
- `plan-panel`: Renders the Provider-reported plan (a `session/update` plan notification) as a checklist of steps with pending/in-progress/completed status. Optional per Provider — hidden entirely for a Provider that never sends one, rather than shown empty.
- `tool-accordion`: Collapsible execution log keyed by `toolCallId`, showing the tool's `kind` (read/edit/execute/etc.), `status` (pending/in_progress/completed/failed), and streamed content in a sunken code block (`{semantic.surface-sunken}`). Built from `tool_call` / `tool_call_update` notifications, so partial updates patch the same card in place rather than appending a new one.
- `permission-request-card`: Renders a `session/request_permission` call inline in the stage at the point it was requested, plus a mirrored entry in the `approval-queue-drawer` (§1). Title and description come from the request; **buttons are generated from the Provider's own `options` array** (commonly `Allow once` / `Allow always` / `Reject`, but Tethys renders whatever the Provider sends, including custom option kinds) — never a hardcoded Approve/Reject pair. This is a distinct control from `Approve & Commit` below: this card authorizes a tool call *before* it runs; `Approve & Commit` is Tethys's own post-hoc git staging step once a turn's diff is on screen.
- `elicitation-card`: Handles the rarer case of a Provider asking the user for structured input mid-turn (`elicitation/create`) — rendered as a small inline form matching the requested schema, distinct from a permission request.
- `diff-viewer`: Unified or split patch viewer with per-hunk `Stage` and `Discard` buttons, plus turn checkpoint restore triggers (`Restore worktree to before this turn`).
- `usage-bar`: Small SVG ring in the Action Bar showing this Session's token usage against its context budget, when the Provider reports it.

**Behaviour**

- Turn execution streams live via `session/update` notifications without freezing the UI.
- **Cancellation is two layers, not one**: `session/cancel` is sent first as a clean protocol-level interrupt and the Agent is expected to acknowledge with a `cancelled` stop reason. The `SIGINT → grace period → SIGTERM → SIGKILL` escalating ladder is a *fallback* for a Provider subprocess that doesn't respond to `session/cancel` within the grace window — it's Tethys's safety net underneath the protocol-level cancel, not a replacement for it, and the UI should only show the destructive-styling ladder once that grace period has actually elapsed.
- **History doesn't depend on what a Provider can replay.** `session/resume` and history replay (`replayFrom`) are optional, per-Provider capabilities (§5.2 shows which Providers support them) — Tethys keeps its own local transcript cache of every Session regardless, so reopening a tab always shows full history from that cache. Resume is used only to reconnect a *live* Provider-side session when supported; when it isn't, reopening a tab starts a fresh `session/new` and displays the cached transcript as read history above the new live turns, clearly divided.

**UX Flow**

- Agent suggests edits → diff renders automatically in the right inspector → user reviews hunks inline → clicks `Approve & Commit` (Tethys's own git staging action) or clicks `Revert Turn` to cleanly roll back the git temporary index in under 150ms.
- Agent wants to run a shell command → `permission-request-card` appears inline with the Provider's own options → user picks one (or, in Auto/YOLO mode, Tethys picks on their behalf per the workspace's trust policy) → the tool call proceeds or is rejected accordingly.

**Architecture note — Revert Turn on no-VCS folders**: `Revert Turn` as specified is a git worktree reset, which doesn't exist for a folder that isn't git-initialized. Git is a feature, not enforcement: the hub accepts the folder anyway (single-node canvas, one session at a time), and revert/diff UI is capability-driven — hidden or disabled with a `no git · no revert` explanation when the folder has no git history or the session can't restore. There is no app-managed snapshot fallback in MVP; in-place `git init` is offered as the upgrade path to full worktree behavior, and `isolation: plain` (WT‑11, P1) is the explicit opt-out that hides git UI even where it would otherwise be available.

---

## 5. Settings Surface (`/settings`)

A unified configuration surface structured with a left-hand navigation sidebar and dedicated subpages.

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
- `Trusted Folders` list: every workspace trust decision made via `workspace-trust-dialog` (§2.1), showing path, source badge, permission mode, and date trusted, with a `Revoke` action per row. Revoking removes the card from the Workspaces hub and requires re-trusting through the same dialog before it can be reopened.

**UX Flow**: User selects a custom theme → CSS custom properties update on `:root` instantly without app reload.

### 5.2 Providers & Agent Runtimes (`Settings / Providers`)

**Layout**: Header with health-check interval stepper (`[-] 300 [+] seconds`) and refresh action, above a high-density vertical stack of provider rows.

**Components**

- `provider-row`: Displays vendor icon, name, status dot (Red = missing CLI / connection failed, Amber = `auth_required`, Green = healthy handshake, Sky = one or more active Sessions), protocol pills (`ACP v2`), and runtime toggle switch.
- `provider-accordion`: Inline collapsible configuration panel. Contains:
  1. Executable path override input with `Browse…` file picker.
  2. Injected environment variable key-value manager.
  3. `LoginDialog` trigger: **adapts to whatever the Provider's `initialize` response declares in `authMethods`**, rather than assuming a PTY CLI login is the only path — an env-var-based method renders a key/value form; a URL-based method shows a "Sign in with {Provider} →" link plus a code-confirmation field with a visible countdown (many implementations expire around 300s); a CLI-passthrough method opens the isolated PTY `terminal-sheet` running the vendor's own login command (`claude login`, `codex auth`). If a Provider declares no `authMethods` at all, this control is hidden entirely — there's nothing to log into.
  4. **Negotiated capabilities panel**: read-only summary of what `initialize` returned for this Provider — `session.resume` (yes/no; if no, that Provider's Sessions rely entirely on Tethys's local transcript cache per §4), MCP transport support (`stdio` / `sse` / `http`), and whether it supports `elicitation`. This turns "Healthy — ACP handshake verified" from a boolean into something the user can actually act on when a feature (like Fork, which leans on resume) behaves differently per Provider.

**UX Flow**: Missing CLI detected → user expands accordion → pastes custom binary path → clicks `Manual Health Check` → status dot flips to green. Auth-required Provider detected → user expands accordion → `LoginDialog` renders the method that Provider actually declared → on success, status dot flips from amber to green and the Provider becomes selectable in `model-selector-popover` (§3).

### 5.3 Skills & Commands (`Settings / Skills & Commands`)

**Layout**: Anthropic-inspired catalog layout with segmented sub-filtering.

- Top bar: Category tabs (`Skills` | `Connectors` | `Plugins`) and segment toggle (`Yours` | `Discover`).
- Action cluster: Search input, filter/sort triggers, and a dropdown `+ Add` menu (`Upload skill`, `Create a skill`, `Create with agent`).

**Components**

- Skill Item Row: Icon, skill slug (`{typography.mono-code}`), category pill (e.g., `Marketing`, `DevOps`), author/origin annotation, and a trailing `•••` action menu.
- Trust Toggle: Toggle switch allowing users to grant or restrict execution trust for auto-running without manual prompts.
- Two-Way Sync Indicator: Shows whether local changes in `.agents/skills` are cleanly synchronized with vendor configuration files.

**UX Flow**: User clicks `+ Add` → selects `Upload skill` → drops a skill definition file → Tethys validates the manifest, writes to `.agents/skills/`, and projects the skill to all active agents.

### 5.4 Model Context Protocol Registry (`Settings / MCP`)

**Layout**: Matrix grid mapping configured MCP servers (rows) across connected Providers (columns).

**Primary mechanism, revised for ACP**: for an ACP-native Provider, Tethys doesn't need to project MCP config into that vendor's own files at all — it attaches the relevant servers directly as the `mcpServers` array on each `session/new` call for that workspace. The matrix in this page is therefore really "which MCP servers get attached to new Sessions in which workspaces," not a vendor-file sync target. Vendor-file projection is kept only as a compatibility fallback, and only for a Provider whose `mcpCapabilities` can't accept `mcpServers` at session creation.

**Components**

- `sync-grid-cell`: Status badge per cell — `Attached {status-success}` (will be passed on the next `session/new` for that Provider+workspace pair), `Unsupported transport {status-warning}` (Provider's `mcpCapabilities` doesn't support this server's transport), or `File projection {semantic.surface-hover}` (fallback path, non-ACP Provider).
- Server Configuration Card: Server name, transport type (`stdio`, `sse`, or `http` — matching ACP's declared transports), command path, arguments array, and environment variables.
- Workspace scoping: servers can be attached globally or scoped to specific workspaces, since not every MCP server is relevant to every repo.
- Projection Action Bar (fallback path only): `Preview diff → Apply → Rollback` buttons for the vendor-file compatibility case.

**UX Flow**: User adds an MCP server → matrix shows which Providers will actually receive it (attached at their next `session/new`) versus which can't (unsupported transport) versus which need the file-projection fallback → for the fallback case only, clicking `Apply All` writes updates into that vendor's own config file.

### 5.5 Keybindings (`Settings / Keybindings`)

**Layout**: Searchable keybinding table with real-time shortcut conflict detection.

**Components**

- Keybinding Row: Action description (`{typography.body-sm}`), scope (`Global`, `Editor`, `Terminal`), keycap pill combination (e.g., `Ctrl K`), and conflict warning badge.
- Custom shortcut recorder: Input field that captures physical keydown events.

**UX Flow**: User searches for "toggle diff" → double-clicks the keycap pill → presses `Cmd + D` → shortcut saves with instant global dispatch.

---

## Page & Component Mapping Summary

| Page / Route | Primary View Type | Key Tokens & Sizes | Distinctive UX / Behaviours |
|---|---|---|---|
| **`/workspaces`** | Card Grid + Peek Drawer | Cards: `220px`, Drawer: `380px` | Dual canvas modes (git-topology / single-node), Local vs. Remote switch, "Needs attention" filter, trust dialog gating every new folder, zero-click thread chips. |
| **`/thread/new`** | Centered Prompt Canvas | Card: `820px` max, Popover: `560px` | Explicit workspace picker, per-Provider config schema (not a fixed Model/Effort grid), auth-gated Provider selection. |
| **`/thread/:id`** | Four-Region IDE Shell | Sessions col: `280px`, Inspector: `360px` | Workspace → Provider → Session grouping, plan panel, protocol-native permission requests, dual-layer cancellation, turn rollback in <150ms, unified/split diffs. |
| **`/settings/providers`** | Accordion Registry List | Rows: `12px 16px` padding | Per-Provider auth method adapts (env var / URL+code / CLI passthrough), negotiated-capabilities panel (resume, MCP transports, elicitation). |
| **`/settings/skills`** | Categorized Skill Catalog | Cards / Rows: `36px` height | Yours vs. Discover filter, format-preserving two-way sync to `.agents/skills`. |
| **`/settings/mcp`** | Session-Attachment Grid | Cells: `sync-grid-cell` | MCP servers attached per `session/new` for ACP-native Providers; vendor-file projection kept only as a compatibility fallback. |
| **`/settings/general`** | Two-Column Settings Form | Inputs: `40px` height | Instant hot-swappable JSON custom themes, font pickers, OS alerts. |
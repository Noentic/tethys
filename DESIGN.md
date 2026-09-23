---
version: d0-rc12
changelog:
  d0-rc12: "Accepted 23 Sep 2026. Composer and thread redesign (proposal: claude.ai/artifact/ML7Bm74AEEsZNV9dnov6B2). The prompt card reads where / what / how in both views: a new `branch-worktree-pill` puts branch and an opt-in `New worktree` checkbox in the New Thread where band (current checkout is the default, sticky per workspace; PRD WT‑01 amended), and a new `branch-bar` is its in-thread form, absorbing `isolation-pill` and `diff-summary-pill` and becoming the one home of `Commit…` (replacing `Approve & Commit`, which named a commit as an approval). `mode-pill` becomes the single Mode control with two sections, the Provider's working modes and Tethys's approvals, with Full auto behind its own `Enable` and disabled on the current checkout (PRM‑02). A new `request-dock` holds the pending permission or elicitation card above the composer, leaving an anchor row in the transcript. The Inspector becomes a `side-panel` with `Overview` (the old `thread-inspector`, minus its rollup band) and a resizable `changes-panel` (`layout.changes-min` 480px, up to half the window) with turn / thread / uncommitted scopes and batched line comments. A `turn-receipt` ends each turn that changed files, replacing the per-entry `View diff` / `Restore`. `composer-suggestion-popover` grows to 400px, opens above the caret and groups `/` by source; `composer-command-group` drops the always-on `/agent:` prefix for provenance headings and dims Provider built-ins Tethys handles itself. Interaction Patterns P4 and P8 are amended and P14–P18 added."
  d0-rc11: "Accepted 21 Sep 2026. Token ratification: the pen's values are ported into the contract, and the contrast gates, not the pen, now decide the final numbers. `text-muted` (`#71717a` in both themes) is retired as a text value because it measured 3.3-4.2:1 in dark and 3.8:1 on the light well against the contract's own 4.5:1 rule; it becomes `#8e8e98` / `#63636c` and is now under test on every surface. Dark `hairline-strong` (`#27272a`, 1.08:1 on `surface-overlay`) becomes `#3f3f46` / `#c2c2ca` and stops being a control stroke. Nine tokens the pen already used and the contract only referenced are defined: `border-control` (the input, textarea, toggle-track, radio and checkbox stroke, 3:1), the `text-on-sunken` family with `hairline-on-sunken` and `wash-on-sunken` (the previously dangling `*-on-sunken` reference), and `status-interrupted` / `status-suspended` / `status-archived` so those dots stop borrowing border tokens as fills. Two values differ from the pen because the gates rejected them: light `text-muted` / `text-on-sunken-muted` `#686871` measured 4.35:1 on the slate well and is `#63636c` (4.69:1), and light `status-archived` `#d4d4d8` measured 1.40:1 on panel and is `#c8c8cf` (1.58:1); the pen is updated to match. Dark `diff-removed` is `#ff8a84` (`signal-red-bright`), as d0-rc9 already said in the theme table; `manifest.ts` and `tokens.css` had kept the pre-soften `#fe6c66`. `tokens.test.ts` now reads the semantic names, CSS variables and both default themes from this front matter instead of a hand-copied list, and `design-refs.test.ts` fails on any `{...}` reference here that names nothing. Shell: the thread view is three regions, Rail | Stage | Inspector. The four-region diagram was never built (no Hub column exists in the pen or in code), and Sessions leaves the docked layout to become an on-demand overlay drawer, which closes the d0-rc5 open limitation: with the Inspector docked only at 1100px or wider, the Stage holds its 560px minimum at every width (48 + 560 + 360 = 968px). The 56px action bar is removed from the contract, not just deprecated in it: its controls live in the `prompt-card` context bar and lower bar, the fold order it carried moves to `prompt-card.contextBarFold`, and `layout.shell-actionbar`, `layout.shell-left`, `layout.shell-left-collapsed` and `breakpoints.sessions-icon` are deleted. `mode-pill` and `diff-summary-pill`, referenced since d0-rc5 and never defined, are defined. `sync-grid` and `session-topology-canvas` are marked deprecated-but-shipping instead of removed, because their replacements are not built; d0-rc5's 2-D grid roving applied only to `sync-grid` and is superseded by the `provider-tab` tablist (one tab stop, arrows, `Home` / `End`). State on content surfaces: the toast gains an icon and a left rule instead of a perimeter (`toast.stateTreatment`), the workspace card takes a wash and the `awaiting` ring with no rule (`workspace-card.attention`), the session row, drawer callout and trust-dialog callout follow the wash + 2px left rule grammar, and `provider-popover` finally carries the `pendingTreatment` d0-rc9 gave it in the contract, as a wash over its overlay surface."
  d0-rc10: "Accepted 21 Sep 2026. New Thread cold start. The canvas gains an explicit nothing-selected state, derived rather than invented: P6 already required a disabled control to name its fix, and §3 already required submit to stay disabled while the workspace pill was unresolved. What is new is the order — with several preconditions missing the composer names only the first, workspace → provider, so the empty state gives one instruction rather than three. `workspace-selector-pill` gains an `unresolved` state (source badge dropped, label `Choose a folder` — an instruction, not a status) and the prompt card drops its attachment-and-guide cluster when its input is disabled, because `/ for commands` is a lie against a dead textarea. Revisits M1.10's New Thread canvas. Also retires `motion.skeleton` (`d0-rc4`): it was documented at 1200ms and shipped as a `--motion-skeleton` variable, but no component ever read it — the skeleton has always run the 2000ms `motion.pulse`, which is now the single loading-loop token. Closing the gap this way rather than retiming the shipped animation keeps d0-rc9's calmer direction (breathe 2400ms > pulse 2000ms) and changes no rendered pixel."
  d0-rc9: "Accepted 21 Sep 2026. State colour and motion. State colour is split into two tiers: a saturated `status-*` tone for markers, labels and rules, and a new low-chroma `status-warning-soft` / `status-danger-soft` surface tier for cards, rows and rules. The pen's rebalanced signal palette is ratified into the contract (it had drifted: `DESIGN.md` still shipped `#f59e0b` / `#ef4444` / `#10b981` / `#38bdf8`, whose Default Light values failed AA as text at 2.9 / 4.4 / 3.4 / 3.7), with `status-warning` and `status-danger` softened one further notch in dark. `motion.breathe` replaces the 50%-opacity pulse for liveness: `running` and `awaiting` breathe at 2400ms / 3200ms on a new `status-dot` halo, and stopped, errored, interrupted, suspended, archived and idle states are deliberately static. State colour no longer paints a full perimeter: `permission-request-card` / `elicitation-card` / `provider-popover` trade `pendingBorder` for a `pendingTreatment` (hairline + soft tint + 2px left rule + breathing dot), matching `turn-notice.warningRule`. New `state-badge` and `thread-inspector` components; `diff-viewer` gains a two-colour stat."
  d0-rc8: "Accepted 21 Sep 2026. Light-mode wells. `surface-sunken` is no longer dark in Default Light: the terminal, code and diff wells recess with `slate-200` instead of obsidian, so light mode has no black blocks. `diff-added` / `diff-removed` gain a deeper light pair (`green-700` / `red-700`) because the bright dark-well values lose contrast on a slate well; the dark pair is unchanged. xterm's own canvas reads the well tokens, so a terminal follows the theme instead of painting black."
  d0-rc7: "Accepted 21 Sep 2026. Commands management joins Skills on Settings / Skills & Commands. New `command-row`, `args-tag` and `command-editor`; `code-editor-well` gains a `Markdown` mode (Markdown | Preview) for the command body; `provenance-badge` gains command values (`user`, `imported`). Commands are classified by scope only, exactly like skills; agent-advertised `/agent:*` commands stay composer-only and never appear in Settings (docs/pages-views-spec.md §5.3, CMP-07)."
  d0-rc6: "Accepted 21 Sep 2026. Skills and MCP settings revamp. Skills classify by scope (`scope-badge`: Global / Workspace), never category; `category-pill` becomes `provenance-badge`; new `skill-detail` two-pane viewer and `skill-upload-dialog` / `file-dropzone`. MCP leaves the servers x Providers matrix: `sync-grid` / `sync-grid-cell` deprecated, replaced by the per-Provider `provider-tab` strip + `config-file-row` + `code-editor-well` (JSON / JSONC / TOML) + `mcp-server-form` (docs/pages-views-spec.md §5.4)."
  d0-rc5: "Accepted 20 Sep 2026. `sync-grid` (MCP matrix) with 2-D grid roving; `stacking` scale, Esc unstack order derived from it (drawers now dismiss last); Inspector overlay mode defined (1100-1512px gap left open); provider surfaces (`provider-popover`, `provider-artifact`, `provider-capability-notice`, `composer-command-group`); thread-view completion (tool-run/origin/subagent, turn notices, message actions, config chips, activity ledger; docs/pages-views-spec.md §4.1); Interaction Patterns section; streaming-transcript a11y rules."
  d0-rc4: "Accepted 20 Sep 2026. `awaiting` ring; State Precedence; reduced-motion clause and `motion.pulse`; `stop-control`, `isolation-pill`; action-bar priority and collapse order; `workspace-card-selected`; session-item-chip sizing; login-dialog countdown; `diff-added`/`diff-removed` and `diff-viewer` tokens; config panel takes the remaining popover width; terminal-sheet Level 4 chrome."
  d0-rc3: "Re-homing only: prose-only metrics moved into the YAML, page layouts and behaviour moved to docs/pages-views-spec.md, data bindings to docs/architecture.md §8.3, `worktree-*` renamed `session-*`, stale colour values removed."
  d0-rc2: "Reconciled with pages-views-spec: per-Provider config selector, session-list-row / permission-request-card naming, MCP attachment replaces vendor-file projection."
name: Tethys-Precision-Monochromatic
description: |
  The design contract for a native, high-performance desktop control plane that runs autonomous coding agents over any folder, in parallel. Built around a Tabular paradigm (icon rail + tab strip + Workspace Catalog) that expands into a three-region IDE shell (Rail | Stage | Inspector) with the composer docked at the foot of the Stage and Sessions opened on demand as a drawer. All color is a swappable Semantic Theme Contract (primitives → semantic → CSS vars); default themes are Default Dark (Obsidian Zinc) and Default Light (Clean Zinc/Slate); users ship JSON theme manifests. Precision Monochromatic chrome, Geist typography/icons, 1px hairlines, and restrained accents reserved for agent telemetry and health states. Terminology follows the ACP three-tier model — Provider (one ACP connection) / Workspace (one `cwd`) / Session (one `session/new`); see docs/pages-views-spec.md §0.

primitives:
  zinc-950: "#09090b"
  obsidian-1000: "#050507"
  obsidian-960: "#0b0b0d"
  obsidian-940: "#0f0f12"
  obsidian-920: "#111114"
  obsidian-900: "#131316"
  obsidian-880: "#161619"
  obsidian-860: "#17171a"
  obsidian-840: "#1b1b1e"
  obsidian-800: "#212124"
  zinc-400: "#a1a1aa"
  zinc-450: "#8e8e98"
  zinc-500: "#71717a"
  zinc-600: "#52525b"
  zinc-300: "#bfbfc9"
  zinc-50: "#f4f4f5"
  slate-0: "#ffffff"
  slate-25: "#f9f9fa"
  slate-50: "#fafafa"
  slate-100: "#f4f4f5"
  slate-200: "#e4e4e7"
  slate-300: "#d4d4d8"
  slate-325: "#c8c8cf"
  slate-350: "#c2c2ca"
  slate-500: "#71717a"
  slate-600: "#63636c"
  slate-700: "#3f3f46"
  slate-900: "#18181b"
  blue-500: "#3b82f6"
  # Signal palette: the one family every state colour is drawn from. `bright` is
  # the dark-theme tone, `deep` the light-theme tone. Each pair clears 4.5:1 as
  # text on every surface of its theme (DESIGN.md Colors / State colours).
  signal-green-bright: "#5bcc80"
  signal-green-deep: "#00803a"
  signal-amber-bright: "#ecc15a"
  signal-amber-deep: "#9e6000"
  signal-red-bright: "#ff8a84"
  signal-red-deep: "#cd3437"
  signal-cyan-bright: "#56cde3"
  signal-cyan-deep: "#007991"
  green-700: "#046c4e"
  red-700: "#b91c1c"

themes:
  default-dark:
    canvas: "{primitives.obsidian-960}"
    surface-rail: "{primitives.obsidian-880}"
    surface-panel: "{primitives.obsidian-920}"
    surface-elevated: "{primitives.obsidian-840}"
    surface-card: "{primitives.obsidian-900}"
    surface-card-hover: "{primitives.obsidian-860}"
    surface-nested: "{primitives.obsidian-940}"
    surface-overlay: "{primitives.obsidian-800}"
    surface-sunken: "{primitives.obsidian-1000}"
    surface-hover: "rgba(255, 255, 255, 0.04)"
    surface-active: "rgba(255, 255, 255, 0.08)"
    overlay-scrim: "rgba(0, 0, 0, 0.50)"
    hairline: "rgba(255, 255, 255, 0.08)"
    hairline-strong: "{primitives.slate-700}"
    hairline-structural: "rgba(255, 255, 255, 0.13)"
    edge-highlight: "rgba(255, 255, 255, 0.055)"
    grid-dot: "rgba(255, 255, 255, 0.12)"
    text-primary: "{primitives.zinc-50}"
    text-secondary: "{primitives.zinc-300}"
    text-muted: "{primitives.zinc-450}"
    text-inverse: "{primitives.zinc-950}"
    primary: "{primitives.zinc-50}"
    on-primary: "{primitives.zinc-950}"
    accent-focus: "{primitives.blue-500}"
    accent-toggle-active: "{primitives.blue-500}"
    accent-agent-active: "{primitives.signal-cyan-bright}"
    accent-agent-idle: "{primitives.zinc-500}"
    status-active-session: "{primitives.signal-cyan-bright}"
    status-success: "{primitives.signal-green-bright}"
    status-warning: "{primitives.signal-amber-bright}"
    status-danger: "{primitives.signal-red-bright}"
    diff-added: "{primitives.signal-green-bright}"
    diff-removed: "{primitives.signal-red-bright}"
    status-success-soft: "rgba(91, 204, 128, 0.14)"
    status-warning-soft: "rgba(236, 193, 90, 0.14)"
    status-danger-soft: "rgba(255, 138, 132, 0.14)"
    status-interrupted: "{primitives.zinc-400}"
    status-suspended: "{primitives.zinc-600}"
    status-archived: "{primitives.slate-700}"
    border-control: "{primitives.zinc-500}"
    text-on-sunken: "{primitives.zinc-50}"
    text-on-sunken-secondary: "{primitives.zinc-300}"
    text-on-sunken-muted: "{primitives.zinc-450}"
    hairline-on-sunken: "rgba(255, 255, 255, 0.10)"
    wash-on-sunken: "rgba(255, 255, 255, 0.05)"
  default-light:
    canvas: "{primitives.slate-100}"
    surface-rail: "{primitives.slate-0}"
    surface-panel: "{primitives.slate-25}"
    surface-elevated: "{primitives.slate-0}"
    surface-card: "{primitives.slate-0}"
    surface-card-hover: "{primitives.slate-100}"
    surface-nested: "{primitives.slate-100}"
    surface-overlay: "{primitives.slate-0}"
    surface-sunken: "{primitives.slate-200}"
    surface-hover: "rgba(0, 0, 0, 0.04)"
    surface-active: "rgba(0, 0, 0, 0.08)"
    overlay-scrim: "rgba(0, 0, 0, 0.30)"
    hairline: "rgba(0, 0, 0, 0.08)"
    hairline-strong: "{primitives.slate-350}"
    hairline-structural: "rgba(0, 0, 0, 0.12)"
    edge-highlight: "rgba(255, 255, 255, 0.90)"
    grid-dot: "rgba(0, 0, 0, 0.12)"
    text-primary: "{primitives.slate-900}"
    text-secondary: "{primitives.slate-700}"
    text-muted: "{primitives.slate-600}"
    text-inverse: "{primitives.slate-50}"
    primary: "{primitives.slate-900}"
    on-primary: "{primitives.slate-0}"
    accent-focus: "{primitives.blue-500}"
    accent-toggle-active: "{primitives.blue-500}"
    accent-agent-active: "{primitives.signal-cyan-deep}"
    accent-agent-idle: "{primitives.slate-500}"
    status-active-session: "{primitives.signal-cyan-deep}"
    status-success: "{primitives.signal-green-deep}"
    status-warning: "{primitives.signal-amber-deep}"
    status-danger: "{primitives.signal-red-deep}"
    diff-added: "{primitives.green-700}"
    diff-removed: "{primitives.red-700}"
    status-success-soft: "rgba(0, 128, 58, 0.10)"
    status-warning-soft: "rgba(158, 96, 0, 0.10)"
    status-danger-soft: "rgba(205, 52, 55, 0.10)"
    status-interrupted: "{primitives.zinc-600}"
    status-suspended: "{primitives.zinc-400}"
    status-archived: "{primitives.slate-325}"
    border-control: "{primitives.slate-500}"
    text-on-sunken: "{primitives.slate-900}"
    text-on-sunken-secondary: "{primitives.slate-700}"
    text-on-sunken-muted: "{primitives.slate-600}"
    hairline-on-sunken: "rgba(0, 0, 0, 0.10)"
    wash-on-sunken: "rgba(0, 0, 0, 0.05)"

semantic:
  canvas: { var: "--tethys-canvas", role: "Global canvas background" }
  surface-rail: { var: "--tethys-surface-rail", role: "Activity rail and window chrome" }
  surface-panel: { var: "--tethys-surface-panel", role: "Segmented frames, stepper, side columns" }
  surface-elevated: { var: "--tethys-surface-elevated", role: "Prompt card, popovers, drawers, tabs" }
  surface-card: { var: "--tethys-surface-card", role: "Workspace catalog card" }
  surface-card-hover: { var: "--tethys-surface-card-hover", role: "Card hover" }
  surface-nested: { var: "--tethys-surface-nested", role: "Accordion / nested form interior" }
  surface-overlay: { var: "--tethys-surface-overlay", role: "Command palette, modal sheets" }
  surface-sunken: { var: "--tethys-surface-sunken", role: "Terminal / code / diff wells; recessed below the plane it sits on (obsidian in dark, slate in light)" }
  surface-hover: { var: "--tethys-surface-hover", role: "Hover wash" }
  surface-active: { var: "--tethys-surface-active", role: "Pressed / selected wash" }
  overlay-scrim: { var: "--tethys-overlay-scrim", role: "Dismiss scrim" }
  hairline: { var: "--tethys-hairline", role: "1px default divider" }
  hairline-strong: { var: "--tethys-hairline-strong", role: "Drawer edge and Level 3-4 surface borders. Structure only; control edges use border-control" }
  hairline-structural: { var: "--tethys-hairline-structural", role: "Shell region dividers only: titlebar, rail, inspector edge, splitters" }
  edge-highlight: { var: "--tethys-edge-highlight", role: "Lit top 1px of a Level 2+ surface border. Border treatment, not a shadow" }
  grid-dot: { var: "--tethys-grid-dot", role: "Dot-matrix canvas dots" }
  text-primary: { var: "--tethys-text-primary", role: "Primary text" }
  text-secondary: { var: "--tethys-text-secondary", role: "Secondary text" }
  text-muted: { var: "--tethys-text-muted", role: "Tertiary / placeholder / telemetry" }
  text-inverse: { var: "--tethys-text-inverse", role: "Text on primary fills" }
  primary: { var: "--tethys-primary", role: "Primary fill" }
  on-primary: { var: "--tethys-on-primary", role: "Text on primary fill" }
  accent-focus: { var: "--tethys-accent-focus", role: "Focus rings, toggle-on" }
  accent-toggle-active: { var: "--tethys-accent-toggle", role: "Toggle-on alias of focus" }
  accent-agent-active: { var: "--tethys-agent-active", role: "Live streaming / running" }
  accent-agent-idle: { var: "--tethys-agent-idle", role: "Idle / unreachable" }
  status-active-session: { var: "--tethys-status-session", role: "Leased session alias of agent-active" }
  status-success: { var: "--tethys-status-success", role: "Healthy handshake. Marker/text tier" }
  status-warning: { var: "--tethys-status-warning", role: "Disabled / unauthenticated / awaiting. Marker/text tier" }
  status-danger: { var: "--tethys-status-danger", role: "Missing binary / destructive / failed. Marker/text tier" }
  status-success-soft: { var: "--tethys-status-success-soft", role: "Healthy surface tier: the wash behind a healthy or resolved row. Background only, never text" }
  status-warning-soft: { var: "--tethys-status-warning-soft", role: "Attention surface tier: the wash behind a pending approval or a warning row. Background only, never text, never a full perimeter" }
  status-danger-soft: { var: "--tethys-status-danger-soft", role: "Failure surface tier: the wash behind a destructive or failed row. Background only, never text" }
  status-interrupted: { var: "--tethys-status-interrupted", role: "Dot of a session that was cut off and can be resumed. Inactive-state tier: quiet by design, 3:1 on panel and card" }
  status-suspended: { var: "--tethys-status-suspended", role: "Dot of a session that is parked. Inactive-state tier, 2:1 on panel and card; its reason is also in words (P2)" }
  status-archived: { var: "--tethys-status-archived", role: "Dot of a session put away. Inactive-state tier, the quietest, 1.5:1 on panel and card; its reason is also in words (P2)" }
  border-control: { var: "--tethys-border-control", role: "The stroke of an input, textarea, toggle track, radio and checkbox. Clears 3:1 on every boundary surface (WCAG 1.4.11); hairline-strong no longer does this job" }
  text-on-sunken: { var: "--tethys-text-on-sunken", role: "Primary text drawn on surface-sunken. Equals text-primary in both default themes; separate so a custom theme can keep a dark well on a light base" }
  text-on-sunken-secondary: { var: "--tethys-text-on-sunken-secondary", role: "Secondary text drawn on surface-sunken" }
  text-on-sunken-muted: { var: "--tethys-text-on-sunken-muted", role: "Muted text drawn on surface-sunken: line numbers, hunk headers, terminal prompt" }
  hairline-on-sunken: { var: "--tethys-hairline-on-sunken", role: "1px divider inside a well: gutter rule, diff hunk edge" }
  wash-on-sunken: { var: "--tethys-wash-on-sunken", role: "Hover / hunk-header wash inside a well; surface-hover reads wrong on a well whose tone does not follow the theme" }
  diff-added: { var: "--tethys-diff-added", role: "Added lines and `+` gutter mark in diff-viewer. Separate from status-success so a theme can restyle diffs (e.g. colour-blind-safe) without touching health colours" }
  diff-removed: { var: "--tethys-diff-removed", role: "Removed lines and `−` gutter mark in diff-viewer. Separate from status-danger for the same reason" }

cssVars:
  prefix: "--tethys-"
  runtime: "hot-swap via inline style on :root / window element; no reload; target <50ms paint"
  consumer: "Tailwind v4 `@theme inline` + shadcn/BaseUI primitives read vars; Rust never holds color"

theming:
  manifestFormat: "JSON only"
  manifestPath: "~/.tethys/themes/<id>.json or <workspace>/.tethys/themes/<id>.json"
  baseThemes: ["default-dark", "default-light"]
  customThemeKeys: "any subset of semantic keys; missing keys inherit from `base` field"
  hotSwap: "validate → set CSS vars atomically → persist `theme.id` → repaint; invalid manifest keeps prior theme + toast error"
  contrast: "WCAG AA minimum: 4.5:1 normal text, 3:1 large text/borders/focus; CI blocks M1.6 on failure"
  authorRule: "components MUST ref {semantic.*} only; primitives/themes are author space, never component space"

typography:
  display-lg:
    fontFamily: Geist Sans
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.025em
  heading-lg:
    fontFamily: Geist Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.015em
  heading-md:
    fontFamily: Geist Sans
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.01em
  body-md:
    fontFamily: Geist Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Geist Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  label-md:
    fontFamily: Geist Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  label-sm:
    fontFamily: Geist Sans
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.01em
  mono-code:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  mono-micro:
    fontFamily: Geist Mono
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.02em

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 20px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  rail: 48px
  titlebar: 40px

layout:
  shell-threads: 280px      # the Sessions drawer's width
  shell-inspector: 360px
  splitter-hit: 6px
  palette-width: 600px
  palette-height: 400px
  drawer-peek: 380px
  drawer-queue: 420px
  prompt-width: 820px
  changes-min: 480px       # the Changes tab's minimum; it grows to 50% of the window, never leaving the Stage below stage-min
  stage-measure: 760px
  stage-min: 560px
  popover-selector: 560px
  breakpoints: { inspector-overlay: 1100px }

# Paint order. Higher paints above lower. The Esc unstack order (Accessibility & Keyboard Map)
# is derived from this table, topmost first, and is not maintained separately.
stacking:
  base: 0            # canvas, rails, stage, docked Inspector, prompt card
  drawer-scrim: 10   # {semantic.overlay-scrim} behind an overlay Inspector, Sessions drawer, peek drawer, approval drawer
  drawer: 20         # overlay Inspector, Sessions drawer, workspace-peek-drawer, approval-queue-drawer
  dialog-scrim: 30
  dialog: 40         # modal-dialog, workspace-trust-dialog, login-dialog
  sheet: 50          # terminal-sheet (opens from login-dialog CLI passthrough, so above dialog)
  palette: 60        # command-palette
  popover: 70        # model-selector-popover, context-bar overflow, provider-popover
  toast: 80
  tooltip: 90

motion:
  instant: 100ms
  fast: 150ms
  base: 200ms
  easing: ease-out
  pulse: { duration: 2000ms, easing: "cubic-bezier(0.4, 0, 0.6, 1)", opacityLow: 50% }
  pulseScope: "the loading and skeleton loop, alternating `{semantic.surface-hover}` ↔ `{semantic.surface-active}`. `pulse` was the liveness channel until `d0-rc9`; liveness is now `breathe`, because a state that has stopped must not pulse"
  breathe: { duration: 2400ms, easing: "cubic-bezier(0.4, 0, 0.6, 1)", opacityLow: 45% }
  breatheAwaiting: 3200ms
  rules: "accordion/splitter fast; drawer/palette base; thumb slide fast; content fade after 100ms; no layout shift"
  stateMotion: "`breathe` is the one animation that encodes liveness, and only `running` and `awaiting` use it: `running` at {motion.breathe.duration}, `awaiting` at {motion.breatheAwaiting} so waiting reads as slower than busy. `healthy`, `error`/`failed`, `interrupted`, `suspended`, `archived`, `idle` and `auth_required` are static — a state that has stopped must not keep pulsing, and a fact is not liveness. Motion is the third channel after hue and shape, never the only one"
  reducedMotion: "under prefers-reduced-motion: reduce, every looping animation (breathe, pulse, spinner) is suspended to a static frame; no state may depend on motion alone (see Universal State Matrix / State Precedence)"

icons:
  set: "Geist Icons"
  sizes: { micro: 12px, ui: 16px, rail: 20px, hero: 24px }
  stroke: 1.5px
  hitTargets: { compact: 28px, default: 32px, rail: 36px }

components:
  nav-rail:
    backgroundColor: "{semantic.surface-rail}"
    width: "{spacing.rail}"
    borderRight: "1px solid {semantic.hairline-structural}"
    selected: "surface-active fill + 2px accent-focus left bar"
  sessions-column:
    backgroundColor: "{semantic.surface-panel}"
    width: "{layout.shell-threads}"
    edge: "1px {semantic.hairline-strong} on its trailing edge, like every Level 3 drawer"
    header: "12px padding, 1px hairline bottom"
    presentation: "the body of the Sessions drawer (Level 3, `{stacking.drawer}` with `{semantic.overlay-scrim}` at `{stacking.drawer-scrim}`), never a docked region. Opened from the titlebar Sessions toggle; focus is trapped and returns to the toggle on close; `Esc`, a scrim click, or choosing a session dismisses it. Session switching is a moment of navigation, not a standing surface, so the Stage keeps its width"
  stage:
    backgroundColor: "{semantic.canvas}"
    measure: "{layout.stage-measure}"
    padding: "{spacing.xl}"
    gap: "{spacing.md}"
  inspector:
    backgroundColor: "{semantic.surface-panel}"
    width: "{layout.shell-inspector}"
    borderLeft: "1px solid {semantic.hairline-structural}"
    padding: "{spacing.lg}"
    body: "{components.thread-inspector}"
  thread-inspector:
    backgroundColor: "{semantic.surface-panel}"
    borderLeft: "1px solid {semantic.hairline-structural}"
    scope: "The `Overview` tab of {components.side-panel}. Its header is the side panel's header"
    statusLine: "the first row: the {components.state-badge}, elapsed time and `Provider · model` in {typography.mono-micro} / {semantic.text-muted}"
    rollup: "retired in d0-rc12. Its numbers now sit where they are acted on: the thread's diff stat in {components.branch-bar}, a turn's in {components.turn-receipt}, counts in {components.activity-ledger}"
    sections: "the status line, then the registered Overview slots in order: `plan-panel`, `usage-bar`, `activity-ledger`, and Outputs (`provider-artifact` summaries). The diff and commit are not here: they are the Changes tab and the branch bar. Sections are separated by a {semantic.hairline}, not by cards — the panel is one column, not a stack of boxes"
    collapsed: "collapses to a 40px rail on {semantic.surface-panel} with the {semantic.hairline-structural} left edge, carrying the breathing `status-dot` and an expand chevron. `aria-expanded` on the toggle, `Ctrl/Cmd+I` toggles. A pending request is never *only* reachable here: the tab strip's {components.approval-inbox-pill} and the stage's inline card both keep it answerable (State Precedence rule 5)"
    empty: "an idle session with nothing to report renders the header (badge `Idle`) and the ledger's `No tool calls yet`; no plan section and no outputs section appear — an absent section is not rendered as an empty box (P6, P9). The panel never disappears: it says it has nothing yet rather than looking broken"
    motion: "the header dot and any `status-dot` inside follow {motion.stateMotion}; the panel itself never animates on open or collapse beyond the shell's own drawer transition"
    a11y: "the `tabpanel` of the side panel's `Overview` tab; the collapse toggle is a `button` with `aria-expanded` and `aria-controls`"
  side-panel:
    backgroundColor: "{semantic.surface-panel}"
    borderLeft: "1px solid {semantic.hairline-structural}"
    header: "40px row: a `tablist` of `Overview` and `Changes N` (N, the changed-file count, in {typography.mono-micro} / {semantic.text-muted}; the Changes tab is absent without git), a {components.state-badge} naming the live state, `⤢` (expands Changes over the Stage at {stacking.drawer}; `Esc` returns) and a `Collapse` ghost button. The badge is the one place the panel's state is named in words, so collapsing can never hide *that* a request is pending"
    width: "`Overview` {layout.shell-inspector}; `Changes` clamp({layout.changes-min}, 50%, viewport − {spacing.rail} − {layout.stage-min}), user-resizable within that range and remembered per window. Below {layout.changes-min} of available width Changes opens as an overlay; below {layout.breakpoints.inspector-overlay} the whole panel is an overlay drawer"
    tabs: "{components.thread-inspector} (Overview) and {components.changes-panel} (Changes). `⌘⇧D` toggles Changes; `Ctrl/Cmd+I` collapses the panel"
    collapsed: "{components.thread-inspector.collapsed}"
    a11y: "a `region` labelled `Thread side panel`; tabs are `tab` / `tabpanel` with roving arrows"
  changes-panel:
    scope: "The `Changes` tab of {components.side-panel}, git only. The review surface: it shows and edits the diff but never commits — commit's one home is {components.branch-bar}"
    toolbar: "a scope selector (`This turn` / `Thread (vs <base>)` / `Uncommitted`, a `listbox` popover) and a unified/split {components.segmented-control}, on a 36px row with a {semantic.hairline} bottom"
    fileTree: "left column, 160px, per-file `+a −b` in two colours, folders collapsible; hidden when the panel is narrower than 640px, leaving a file select in the toolbar"
    body: "{components.diff-viewer}, with per-file stage/unstage in the file header and per-hunk `Discard`"
    comments: "clicking a line opens a one-line comment field under it; comments collect in a 36px footer, `N comments · Send to agent`, which attaches them to the composer as one chip (WT‑09). `Add to prompt` on a line selection makes an `@path:a-b` chip"
    empty: "`No changes in this turn` (or `in this thread` / `uncommitted`) in {typography.body-sm} / {semantic.text-muted}; never a blank well"
  action-bar:
    deprecated: "Re-homed into `prompt-card` for thread execution views. The 56px bottom bar is removed to reduce vertical chrome and consolidate provider, mode, isolation, diff summary, and execution controls into the unified prompt card."
    legacyAlias: shell-actionbar
  toast:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
    maxWidth: 384px
    typography: "{typography.body-sm}"
    stateTreatment: "a state (`success`, `warning`, `danger`) is a 16px leading Geist icon in the state's own token and a 2px left rule in the same token. The perimeter stays the neutral `{semantic.hairline-strong}` on every side, exactly as on the other Level 4 surfaces, and a `default` toast has neither icon nor rule. The icon means a state is never carried by hue alone"
  tooltip:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.xs}"
    padding: 4px 8px
    typography: "{typography.mono-micro}"
  tab-bar:
    backgroundColor: "{semantic.surface-rail}"
    height: "{spacing.titlebar}"
    borderBottom: "1px solid {semantic.hairline-structural}"
  tab-item:
    backgroundColor: "transparent"
    backgroundActive: "{semantic.surface-elevated}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 4px 10px
    height: 28px
    statusMarker: "inline {components.status-dot.sizeInline} telemetry dot displaying live thread lifecycle state: running (agent-active disc, breathing), awaiting (amber ring, breathing slower), error (danger disc, static), idle (transparent/omitted). A tab whose state needs words renders {components.state-badge} instead of the bare dot"
  status-dot:
    size: 8px
    sizeInline: 6px
    rounded: "{rounded.full}"
    idle: "{semantic.accent-agent-idle}"
    running: "{semantic.accent-agent-active}"
    awaiting: "{semantic.status-warning}"
    healthy: "{semantic.status-success}"
    error: "{semantic.status-danger}"
    interrupted: "{semantic.status-interrupted}"
    suspended: "{semantic.status-suspended}"
    archived: "{semantic.status-archived}"
    unknown: "{semantic.accent-agent-idle}"
    authRequired: "{semantic.status-warning}"
    shape: "filled disc for every state except `awaiting`"
    awaitingShape: "ring — {ringWidth} stroke in {semantic.status-warning}, transparent centre, same outer size as the disc"
    ringWidth: 2px
    ringWidthInline: 1.5px
    halo: "a soft ring at 20% of the state colour, built with `color-mix` from the marker's own token so it needs no extra variable, drawn in a box one step larger than the marker (`size` + 4px). The halo is what animates; the marker itself stays crisp at full opacity, so 'alive' never means 'blurry'. Rendered only for states that breathe"
    motion: "`running` and `awaiting` breathe the halo per {motion.breathe} / {motion.breatheAwaiting}; every other state is static ({motion.stateMotion}). Motion is decoration: state must stay legible with it suspended (prefers-reduced-motion, unfocused window), so the permitted differentiators between `running` and `awaiting` are hue AND shape together, with rate a third channel that is never load-bearing"
    rule: "`awaiting` (ring) is a session/turn state. Provider amber (`auth_required`, detected-but-disabled) stays a filled disc so the two amber meanings never collapse when the breathe is off. Applies identically on chips, session rows and the rail; `provider-row` additionally keeps its status subtext"
    a11y: "role=status with aria-label and title carrying the state name — unchanged; shape is for glanceable, non-hover reading"
  state-badge:
    backgroundColor: "{semantic.surface-hover}"
    rounded: "{rounded.full}"
    padding: 2px 8px
    height: 20px
    typography: "{typography.label-md}"
    geometry: "{components.approval-inbox-pill} minus the count — `status-dot.sizeInline` + the state name"
    colour: "the dot and the label take the state's own token per theme: `running` {semantic.accent-agent-active}, `awaiting` {semantic.status-warning}, `error` {semantic.status-danger}, `interrupted` {semantic.status-interrupted}, `idle` {semantic.text-muted}. `suspended` and `archived` take their own dot token but keep the label in {semantic.text-muted}: those dots sit below text contrast by design, so the label is what makes the state legible. Never a fixed colour, and never `text-primary` — the badge's whole job is to carry the state"
    motion: "the dot breathes for `running` / `awaiting` and is static otherwise ({motion.stateMotion})"
    scope: "The labelled form of `status-dot`: used by the `thread-inspector` header, the `tab-item.statusMarker` on the active tab, and the `session-list-row`. A surface that needs the state named in words renders this, not a bare dot"
    a11y: "the state name is text, so the badge is legible with the dot ignored; the dot keeps `role=status` and its own label"
  approval-inbox-pill:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    dotColor: "{semantic.status-warning}"
    rounded: "{rounded.full}"
    padding: 2px 8px
    height: 20px
  stop-control:
    height: 28px
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    idle: "neutral secondary control, label `Stop`"
    pending: "after the first press the control stays neutral (never destructive) and non-interactive with `aria-busy`. Label `Cancelling…`; a static fill in {semantic.surface-active} behind the label depletes left-to-right across the cancel grace window (5s default, see docs/pages-views-spec.md §4) so the press reads as registered and shows how much grace remains. No numeric readout — at 5s it is noise; the numeric `login-dialog.countdownTypography` readout is reserved for ~300s codes. The fill is a width change, not an animation loop, so it is unaffected by reduced motion"
    graceElapsed: "destructive styling begins only when the grace window has actually elapsed: label `Force kill`, `{semantic.status-danger}` border/text per the Universal State Matrix `destructive` row; this is an explicit second press"
    terminating: "destructive, label `Terminating (SIGKILL)`, non-interactive, `aria-busy`"
    advance: "the grace timer, not a second click, moves `cancel_requested` to `grace_elapsed`; the backend supplies the deadline (see docs/pages-views-spec.md §4)"
    a11y: "one polite live-region announcement per phase change (`Cancelling`, `Force kill available`), never per tick"
  isolation-pill:
    deprecated: "d0-rc12: in-thread, absorbed by {components.branch-bar}; before a thread exists, {components.branch-worktree-pill}. The `noGit` wording below carries over to both"
    height: 20px
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    branch: "outline pill, 1px {semantic.hairline} border, {semantic.text-secondary} text, the session's branch; `maxWidth` 160px, ellipsis truncation with the full name as tooltip"
    noGit: "muted pill, {semantic.surface-hover} fill, {semantic.text-muted} text, reads `no git`. Not a button. Tooltip: `No git — edits are applied in place and cannot be reverted`. This is a first-class state, not an error: no danger or warning colour"
    priority: "never folds into the context-bar overflow"
  mode-pill:
    backgroundColor: "{semantic.surface-hover}"
    backgroundHover: "{semantic.surface-active}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    height: 20px
    padding: 0 6px
    label: "both axes, `<working mode> · <approval>`, for example `Plan · Ask first`; only the approval when the Provider declares no working mode"
    scope: "The one home of how the agent may act (P5): the ACP `mode` category and Tethys's approval level for the thread. A Provider's `mode` option is never a `composer-config-chip` and never a row in the `session-config-panel`. Sits at the left of the prompt card's how band, in the New Thread canvas and in a thread alike"
    absent: "never absent: a Provider that declares no `mode` option still has Approvals"
    popover: "a 300px popover at `{stacking.popover}` opening upward, two sections under {typography.mono-micro} headings, rows numbered continuously so `1`–`9` pick one. **Working mode · <Provider>**: the Provider's non-permission modes as radio rows (name, then its consequence in {typography.body-sm} / {semantic.text-muted}). **Approvals · Tethys**: `Ask first` (Supervised) and `Auto-edit`. Below a {semantic.hairline} divider, `Full auto` with its own `Enable` button (Interaction Patterns P16) — disabled with `Full auto needs a new worktree` on the current checkout (PRM‑02). Footer caption `Applies to this thread · Make default for <workspace>` (P11)"
    roles: "adapter metadata classifies each Provider mode id as `working` or `approval(level)`; an approval-role mode is never listed under Working mode. Tethys sets the narrowest Provider mode matching its own level, never a wider one (PRM‑04)"
    shortcut: "`⌘⇧M`"
    priority: "folds at 40 (`prompt-card.contextBarFold`)"
    a11y: "a `button` with `aria-haspopup=dialog` and `aria-expanded`; each section is a `radiogroup`"
  diff-summary-pill:
    deprecated: "d0-rc12: absorbed by {components.branch-bar}, whose stat keeps this content rule. Kept defined so older references resolve"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    border: "1px solid {semantic.hairline-strong}"
    backgroundHover: "{semantic.surface-hover}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    content: "`N files`, then `+a` in {semantic.diff-added} and `−b` in {semantic.diff-removed}, two colours as in `diff-viewer.stat`. Never a staged-hunk count: `git.stage` is path-level"
    action: "opened the Inspector; superseded by the branch bar's `Review`"
    absent: "not rendered without a git or review capability, nor while the session has no changed files: never an empty `0 files` pill"
    priority: "folds at 50 (`prompt-card.contextBarFold`)"
  shell-splitter:
    backgroundColor: "{semantic.hairline-structural}"
    hitArea: "{layout.splitter-hit}"
    hoverColor: "{semantic.text-muted}"
    dragColor: "{semantic.accent-focus}"
    hoverRule: "recolor only; width never changes on hover (motion.rules: no layout shift)"
  command-palette:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.lg}"
    width: "{layout.palette-width}"
    rowHeight: 36px
  segmented-control:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: 2px
    height: 32px
  segmented-item:
    backgroundColor: "transparent"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 4px 12px
  segmented-item-active:
    backgroundColor: "{semantic.surface-elevated}"
    textColor: "{semantic.text-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 4px 12px
  workspace-card:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    height: 220px
    attention: "while a session in the workspace is awaiting approval the card takes a {semantic.status-warning-soft} wash over its own tone and the header `status-dot` renders as the `awaiting` ring, breathing. It has no left rule: the 2px left bar already means `selected` on this card (`workspace-card-selected`), so attention is carried by the wash and the ring alone. Attention and selection coexist without colliding (State Precedence 3): a selected card in attention shows the accent bar, the wash and the ring"
  workspace-card-hover:
    backgroundColor: "{semantic.surface-card-hover}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.lg}"
    legacyAlias: workspace-card-active
  workspace-card-selected:
    backgroundColor: "{semantic.surface-card-hover}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.lg}"
    selectedBar: "2px {semantic.accent-focus} bar on the card's left edge, inside the border and following the corner radius (Universal State Matrix `selected`)"
    appliesWhen: "the card's `workspace-peek-drawer` is open. The drawer is modeless and the catalog stays interactive, so the bar is the only marker of which card the drawer belongs to; it clears when the drawer closes. At most one card is selected at a time"
    aria: "`aria-current=true` on the card's name button while selected; the card itself is not a focus stop"
  workspace-card-no-vcs:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    height: 220px
    sourceGlyph: "folder icon only; excludes branch badges and VCS metadata"
    action: "renders `git-init-upsell-chip` (`Initialize Git`) in place of git branch controls"
  workspace-source-badge:
    backgroundColor: "transparent"
    textColor: "{semantic.text-muted}"
    iconSize: "{icons.sizes.micro}"
    glyphOnly: "renders icon-only source glyphs (e.g. folder, git branch) without redundant textual labels"
    legacyAlias: workspace-source-glyph
  session-topology-canvas:
    deprecated: "Superseded by clean workspace cards and aggregate thread inspectors. Still rendered by the shipping `workspace-card` until the workspace-card revisit removes it; no new surface references it"
  git-init-upsell-chip:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    height: 20px
  session-item-chip:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    height: 20px
    minWidth: 96px
    maxWidth: 240px
    gap: "{spacing.sm}"
    pendingBorder: "1px solid {semantic.status-warning}"
    statusMarker: "a `{components.status-dot.sizeInline}` marker overlaid on the provider glyph's top-right corner, adding no width. `running` = filled agent-active disc, `awaiting` = amber ring (see status-dot), `error` = filled danger disc, `idle` = none. Present in addition to `pendingBorder`, so an awaiting chip differs from a running one by shape, not only by hue"
    truncation: "the branch name truncates with an ellipsis and the full name is the chip's tooltip (`tooltip` component). `mono-micro` is ~6.8px per character, so a 40-character branch (`feature/JIRA-4821-fix-auth-token-refresh`, ~273px) always truncates at `maxWidth`"
    fieldDropOrder: "when the chip is narrower than its comfortable width, drop the turn count (`T8`) first, then the diff stat; the glyph, marker and branch never drop"
    legacyAlias: thread-chip
  session-item-row:
    backgroundColor: "transparent"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 36px
  session-list-row:
    backgroundColor: "transparent"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 48px
    legacyAlias: thread-list-row
  session-group-header:
    backgroundColor: "transparent"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-sm}"
    padding: 6px 12px
    height: 28px
  prompt-card:
    backgroundColor: "{semantic.surface-elevated}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.lg}"
    width: "{layout.prompt-width}"
    bands: "three bands top to bottom, separated by a {semantic.hairline} inset to the card's padding: **where** (New Thread: `workspace-selector-pill` + {components.branch-worktree-pill}; in a thread: {components.branch-bar}), **what** (the textarea), **how** (left: attach `+`, `mode-pill`; right: `model-selector-pill` or the Model `composer-config-chip`, the Effort chip, queue count, usage ring, `action-icon-button`). A where control never sits in the how band. In a thread, {components.request-dock} stacks above the card while a request is pending"
    topContextPills: "retired in d0-rc12; see `bands`"
    contextBarFold: "the how band folds when it does not fit, lowest priority first, into a 20px `•••` overflow: `usage-bar` 20, `queue-count` 30, the Effort chip 40, `mode-pill` 50, and the Model chip / provider pill 60. The `action-icon-button` / stop control (100) never folds. The branch bar folds on its own row: the isolation tag first, then `Review` (its `⌘⇧D` remains); the branch name and `Commit…` never fold. A slot a Provider surface registers with no declared priority folds before all of them"
    overflowTrigger: "a 20px `•••` button at the end of the context bar, `aria-haspopup=dialog`, opening a `popover` at `{stacking.popover}` that lists the folded items in the same order. When the folded set holds a non-empty `queue-count` the trigger carries the same `{semantic.status-warning}` dot the count does, so a pending queue is never hidden by narrowing the window"
    composerGuide: "the placeholder alone teaches the sigils; there is no hint row under the input. `?` in the how band opens the shortcuts sheet"
    threadLowerBar: "docked in-thread composer's lower bar: mention triggers, attachment chips, and single dual-state `action-icon-button` on the right"
  composer-suggestion-popover:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.md}"
    width: 400px
    maxHeight: 280px
    padding: "{spacing.sm}"
    anchor: "the caret, opening above the composer; flips below only when there is no room above, so it never covers the text being typed"
    sigils:
      files: "@ sigil — files and folders in the thread's root via FFF, with a recent/changed marker; `@path:a-b` line ranges"
      skills: "$ sigil — the Settings / Skills catalog, each row with its `scope-badge` and `provenance-badge`"
      commands: "/ sigil, at the start of a message only — grouped Tethys, then the Provider, then Your commands ({components.composer-command-group})"
    header: "no title bar; group headings carry provenance"
    itemRow: "Keyboard-navigable row: name in {typography.mono-code}, description in {typography.body-sm} / {semantic.text-muted}, and at the trailing edge the argument hint, scope badge or shortcut in {typography.mono-micro}; match highlighting"
    dimRow: "an unavailable row stays listed at {semantic.text-muted} with its reason as the description (a Provider command Tethys handles, a skill this workspace does not allow, an image the Provider cannot take); it is focusable and choosing it opens the fix"
    footer: "a {typography.mono-micro} key hint line: `↑↓ move · ↵ insert · Tab complete · Esc`"
  workspace-selector-pill:
    backgroundColor: "transparent"
    backgroundHover: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.label-md}"
    iconSize: "{icons.sizes.ui}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
    height: 28px
  model-selector-pill:
    backgroundColor: "transparent"
    backgroundHover: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.label-md}"
    effortTypography: "{typography.mono-micro}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
    height: 28px
  model-selector-popover:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.md}"
    width: "{layout.popover-selector}"
    providerColumnWidth: 200px
    configPanelWidth: "the remainder of {layout.popover-selector} after providerColumnWidth, the panel's 1px borderLeft and the popover's own 1px borders (about 357px) — not a second fixed width, which overdraws the total by 3px"
  session-config-panel:
    backgroundColor: "transparent"
    borderLeft: "1px solid {semantic.hairline}"
    padding: "{spacing.md}"
    fieldGroup: "{components.schema-field-group}"
  action-icon-button:
    backgroundColor: "{semantic.surface-hover}"
    backgroundReady: "{semantic.primary}"
    iconColorReady: "{semantic.on-primary}"
    backgroundRunning: "{semantic.surface-elevated}"
    borderColorRunning: "{semantic.hairline-strong}"
    iconColorRunning: "{semantic.text-primary}"
    rounded: "{rounded.full}"
    size: 32px
    dualState: "Single action trigger in prompt card. When idle/ready, renders send arrow icon with backgroundReady; when thread is running, morphs to stop/square icon (Geist stop icon) which triggers the protocol cancellation ladder"
  composer-chip:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  workspace-peek-drawer:
    backgroundColor: "{semantic.surface-elevated}"
    borderLeft: "1px solid {semantic.hairline-strong}"
    width: "{layout.drawer-peek}"
  approval-queue-drawer:
    backgroundColor: "{semantic.surface-elevated}"
    borderLeft: "1px solid {semantic.hairline-strong}"
    width: "{layout.drawer-queue}"
  modal-dialog:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
    width: 480px
    scrim: "{semantic.overlay-scrim}"
  workspace-trust-dialog:
    extends: "{components.modal-dialog}"
    pathTypography: "{typography.mono-code}"
    warningTextColor: "{semantic.status-warning}"
  login-dialog:
    extends: "{components.modal-dialog}"
    width: 420px
    codeTypography: "{typography.mono-code}"
    countdownTypography: "{typography.mono-micro}"
    countdown: "URL+code method only. `m:ss` remaining in `countdownTypography` / {semantic.text-muted}, updating once per second as a text change (not an animation, so reduced motion is unaffected). At 0 the code field is disabled and reads `Code expired` with a `Request new code` action. Numeric because these codes expire on a ~300s scale; contrast `stop-control`, whose 5s grace uses a depleting fill instead"
    onClose: "closing the dialog, by any route (success, cancel, Esc, expiry), triggers an immediate provider health re-check — docs/pages-views-spec.md §5.2"
    agentAuth: "agent-auth method only (the Provider runs its own OAuth and opens the browser): a `{typography.body-sm}` / {semantic.text-muted} line `Waiting for {Provider} to finish sign-in…` and a `Cancel` action. No code field and no countdown — the agent, not Tethys, holds the flow, and Tethys shows nothing it could read as a credential"
  permission-request-card:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    pendingTreatment: "the card keeps its {semantic.hairline} border and gains an attention treatment rather than a perimeter stroke: a {semantic.status-warning-soft} wash in place of the card's own plane (the token is an alpha, so it composites over whatever the card sits on), a 2px {semantic.status-warning} left rule, and the breathing `status-dot` in the header. Same grammar as {components.turn-notice.warningRule}. A saturated perimeter is the loudest possible way to say 'a decision is waiting' and the only way it can be said on a 360px column; the tint plus the rule carry it at a fraction of the ink, and the motion carries the rest"
    pendingHover: "hover never recolours the rule or the wash — the card is not the affordance, its buttons are"
  elicitation-card:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    pendingTreatment: "{components.permission-request-card.pendingTreatment}. The two request shapes are one visual family: a user answering either one is doing the same job"
    fieldGroup: "{components.schema-field-group}"
    decision: "a property with a fixed set of options renders as a numbered decision, one line per option (the option's title; ACP's option type carries a value and a title but no description, so the card never invents a trade-off line — the property's own description is the help text above the options). Keys `1`–`9` select. A free-text `Other` is offered only where the schema permits free text (Interaction Patterns P7)"
    paging: "a request with more than one property may page one per step with an `n of m` counter and `Back`; the counter is text. A single property renders unpaged"
    actions: "the three protocol outcomes stay distinct and labelled: the submit button sends `accept` with the answers, `Skip` sends `decline` (the agent proceeds on its own judgement), and dismissing without answering sends `cancel`. `Skip` is never worded `Cancel`"
    url: "a URL-mode request renders the Provider's title, the host of the URL in {typography.mono-code}, and `Open in browser`; the page is never embedded"
  provider-popover:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    width: 360px
    stacking: "{stacking.popover}"
    scope: "Hosts a request from the Provider that is NOT one of the two ACP-standard shapes — a vendor-extension notification such as `_kiro.dev/mcp/oauth_request`. `session/request_permission` is `permission-request-card` and `elicitation/create` is `elicitation-card`; both are inline stage entries and neither is this component. An extension notification is not anchored to a point in the transcript, so it cannot be an inline entry; it interrupts"
    anchor: "the Provider's `model-selector-pill` in the `prompt-card` context bar, so the request is visibly attributed to the Provider that raised it"
    content: "a title, a body rendered from the request's schema with `schema-field-group` spacing, and the Provider's own action set in the Provider's order — never a hardcoded approve/reject pair, the same rule as `permission-request-card`. A destructive-kind action uses the Universal State Matrix `destructive` row"
    focus: "traps `Tab` while open and restores focus to the invoker on `Esc`/close, unlike the inline cards. Because it traps focus it never opens over another trap: a request that arrives while a dialog or sheet is open waits in the Provider's pending list, the pill shows the pending count, and it opens when the topmost trap closes"
    pendingTreatment: "{components.permission-request-card.pendingTreatment}"
    a11y: "role=dialog, aria-modal=false, aria-labelledby the title. The pending count on the pill is text, not colour alone"
  provider-artifact:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    scope: "A Provider-emitted artifact that is neither a diff nor tool-call output. A stage entry mounted through registerEntryRenderer, so it sits in the transcript at the point it was emitted. Not the `diff-viewer`, which stays git-shaped"
    summaryRow: "collapsed by default: kind glyph, title, size or dimensions in {typography.mono-micro} / {semantic.text-muted}, and an expand affordance. Expanding never changes the entry's position in the transcript"
    contentKinds: "MVP: text (rendered in {typography.mono-code} on {semantic.surface-sunken}) and image (fit to `stage-measure`, alt text required). Any other kind renders the summary row plus a `provider-capability-notice`, never a blank body"
    a11y: "the summary row is a `button` with `aria-expanded`; an image without alt text is announced by its title"
  provider-capability-notice:
    backgroundColor: "transparent"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-sm}"
    padding: "{spacing.sm} 0px"
    scope: "The one treatment for 'this Provider cannot do this' — no resume, no elicitation, an unsupported content kind. Distinct from workspace-capability gating (`no git · no revert`, owned by the workspace capability set): that says the FOLDER cannot, this says the PROVIDER cannot. The two vary independently"
    form: "a muted sentence naming the Provider and the missing capability, with an inline action only if one exists (for example `Open Settings / Providers`). Never an error colour: an absent capability is a fact, not a failure"
    rule: "surfaces do not invent their own 'unsupported' copy or styling; they render this component"
  attachment-chip:
    extends: "{components.composer-chip}"
    thumbnailSize: 20px
    removeSize: 16px
    scope: "An image or file the user attached in the composer, or that a message carries in the transcript. An image block renders a thumbnail chip that opens at up to `stage-measure`; a resource link renders a path chip. Attaching an image to a Provider that did not declare image prompts is refused at attach time with a `provider-capability-notice`, never dropped after send. Audio and embedded-resource blocks are not rendered in MVP; they show the same notice rather than a blank"
    a11y: "a `button` named by its file name; an image without alt text is announced by its file name; `remove` is a separate `button` with `aria-label`"
  branch-worktree-pill:
    height: 28px
    typography: "{typography.label-md}; branch in {typography.mono-micro}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
    scope: "The New Thread where band's git control, beside `workspace-selector-pill`. Git only; absent under `isolation: plain`"
    current: "default. Read-only: `⑂ <branch> · N uncommitted` in {semantic.text-secondary}, then a `New worktree` checkbox ({semantic.border-control} stroke). Tethys never checks out a branch in the user's own tree"
    worktree: "checkbox on: the branch half becomes a base picker `from <base> ▾` whose popover previews an editable `tethys/<slug>`"
    sticky: "the checkbox state is remembered per workspace"
    noGit: "`no git · edits apply in place` on {semantic.surface-hover} / {semantic.text-muted}, with an `Initialize git` link and no checkbox"
    sharedCheckoutNudge: "when another live thread holds the current checkout, a {typography.label-sm} line under the card in {semantic.status-warning}: `1 running thread is already editing this checkout · Use a new worktree`. Advisory, never a block"
  branch-bar:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 12px
    typography: "{typography.label-md}; branch and stat in {typography.mono-micro}"
    scope: "The in-thread where band, git only: branch, isolation tag (`worktree` / `current checkout`, {components.composer-chip} geometry), the thread's stat against its base (`vs main +a −b`, two colours as `diff-viewer.stat`), then `Review` (ghost, opens {components.changes-panel}) and `Commit…` (secondary; primary once the thread has uncommitted changes and no turn is running)"
    commit: "`Commit…` opens a 360px popover: the agent-drafted message (`Draft with agent`), the changed-file count and `Commit`; `Commit & push` only with `forge_cli`. The one place a commit starts (P8)"
    committed: "after a commit: `✓ <sha> · N ahead of <base>` in {semantic.status-success}, with `Merge…` (WT‑07)"
    noGit: "`no git · no revert` in {semantic.text-muted}, nothing else"
    a11y: "a `toolbar` labelled `Branch`"
  request-dock:
    scope: "Holds the live {components.permission-request-card} or {components.elicitation-card} directly above the prompt card while a request is pending, so the decision is always in view (P15). It is not a new card style: the card keeps its own `pendingTreatment`"
    gap: "{spacing.sm} above the card"
    keys: "the Provider's options are numbered `1`–`N` in the Provider's order; the digits select while focus is in the composer or the dock"
    queue: "more than one pending request shows `1 of N` in {typography.mono-micro} in the card header and steps in arrival order"
    anchor: "the transcript keeps a one-line row where the request arose, `Waiting for you ↓` in {semantic.status-warning}, which becomes the record (`Allowed once · <command>`) in {semantic.text-muted} once answered"
    focus: "never traps focus; `Tab` order is dock → branch bar → textarea"
  turn-receipt:
    backgroundColor: "{semantic.surface-nested}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    scope: "The last entry of a turn that changed files: `Changed N files +a −b` in {typography.label-md}, up to three file rows (path in {typography.mono-code}, stat) and `Show N more`, then `View changes` (opens {components.changes-panel} at this turn's scope) and `Revert turn` (only with `restore`). A turn that changed nothing has none"
    reverted: "`Reverted · Undo` in {semantic.text-muted}; the file rows stay, struck through"
  composer-config-chip:
    backgroundColor: "transparent"
    backgroundHover: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
    height: 28px
    scope: "The category-aware Model and Effort controls in the docked composer's lower bar, taken from the Provider's session config options by `category`: `model` becomes the Model chip and `thought_level` the Effort chip. `mode` is not a chip: its one home is the `mode-pill` in the `prompt-card` context bar. `model_config` and every other select or boolean option live only in the full `session-config-panel` behind the Provider pill. Each category has exactly one home; a control is never rendered twice"
    absent: "a Provider that declares no option for a category renders no chip for it — never a disabled empty chip"
    label: "reads the current value; the option name is shown only when the value is ambiguous on its own (`Effort · High`, not bare `High`)"
    orderedScale: "a `thought_level` option renders its popover as a stepped slider in the declared value order, labelled `Faster` and `Smarter` at the ends, the current value named beneath; any other option keeps the listbox"
    shortcut: "`⌘⇧I` opens the Model chip (or `model-selector-popover` before a thread exists), `⌘⇧E` the Effort chip"
    timing: "a change is allowed while a turn is running and applies from the next turn; the popover states this in a one-line consequence caption (Interaction Patterns P11)"
    rejected: "if the Provider rejects a mid-session change, the chip reverts to its previous value and a `provider-capability-notice` says the Provider applies that option only when a session starts"
    a11y: "`combobox` semantics as `model-selector-pill`; the chip's accessible name is `<option name>, <value>`"
  config-option-popover:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
    width: 240px
    stacking: "{stacking.popover}"
    scope: "The small popover behind a `composer-config-chip`: a `listbox` for a select option (the option's own description as a second `{typography.body-sm}` / {semantic.text-muted} line where the Provider supplies one), a `switch` for a boolean. Anchored above the chip because the composer is bottom-docked; flips below only if space requires. `Enter` selects and returns focus to the composer textarea, `Esc` closes. It is not the two-column `model-selector-popover`, which is Provider choice plus the full schema"
  composer-command-group:
    typography: "{typography.label-sm}"
    textColor: "{semantic.text-muted}"
    scope: "Gives a presentation to the grouping the composer `/` popup already requires — Tethys commands are 'listed apart from `/agent:name` commands the Provider advertises' (docs/pages-views-spec.md §4 `composer`), which the spec states but does not draw. Commands the Provider declares through its connection's available-commands list render as a separate group under a heading naming the Provider, after the Tethys commands, so a Provider command is never mistaken for one Tethys resolves itself. The rows reuse the popup's existing item row (`composer-suggestion-popover.itemRow`); only the group heading is new. Not a second popup, and not the Settings `command-row`"
    heading: "the group heading is the provenance: `Tethys`, the Provider's glyph and name, or `Your commands` with a scope badge. Rows under it show plain `/name`"
    clash: "only when two sources share a name does each render qualified (`/claude:review`); there is no always-on `/agent:` prefix"
    handledByTethys: "a Provider built-in that duplicates a Tethys control (adapter metadata `{name → tethys-action}`) renders as a `dimRow` reading `Handled by Tethys → <control>`; choosing it opens that control"
    loading: "before the session is prepared the Provider group shows one skeleton row, `Loading <Provider> commands…`; a Provider that declares none has no group"
    a11y: "the group is a `group` with `aria-label` naming the Provider inside the existing `listbox`"
  turn-message:
    backgroundColor: "transparent"
    textColor: "{semantic.text-primary}"
    typography: "{typography.body-md}"
    userSurface: "a user message sits on {semantic.surface-card} with {rounded.md} and {spacing.md} padding at full measure, left-aligned. No chat-bubble alternation: the stage is a log, not a conversation widget"
    body: "rendered by the incremental markdown worker. A fenced block is a `code-block` from its opening fence (no reflow when the closing fence arrives); a table scrolls horizontally inside `stage-measure` rather than widening it"
    chrome: "`message-actions` on hover and on keyboard focus; `attachment-chip`s under the body"
    replay: "a message restored from history renders exactly as a live one; a replayed user message carries no `Retry`"
  message-actions:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.sm}"
    height: 28px
    iconSize: "{icons.sizes.ui}"
    scope: "An in-flow toolbar at a message's top-right corner: `Copy` (any message), `Fork from here` (where the session's `Fork` is allowed — same capability rule and tooltip as `session-list-row`), and `Retry` (last agent message only, re-sends the prompt that produced it). `Edit & resend` is not in MVP: it needs a restore point, which only some workspaces have"
    reveal: "appears on hover and on keyboard focus of the message, never hover-only; hidden entirely while the message is still streaming"
    a11y: "a `toolbar` with roving `tabindex`; `Copy` announces `Copied` through the polite announcer"
  code-block:
    backgroundColor: "{semantic.surface-sunken}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    typography: "{typography.mono-code}"
    headerTypography: "{typography.mono-micro}"
    headerColor: "{semantic.text-muted}"
    header: "a 28px row: language label left, `Copy` icon button (24px) right. `Copy` confirms by the button label changing to `Copied` as text for a short interval, not a toast"
    overflow: "long lines scroll horizontally and never soft-wrap by default; blocks past the same cap as `tool-accordion` streamed content collapse with `Show all N lines`"
    a11y: "a `region` labelled `<language> code`; the copy button is reachable in tab order"
  thought-block:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    label: "while streaming `Thinking…` with the elapsed seconds and a one-line truncated preview of the latest thought; once the turn ends it collapses to `Thought for 14s ›`. Expansion is the user's: streaming never re-expands a block the user collapsed"
    a11y: "a `button` with `aria-expanded`"
  tool-accordion:
    backgroundColor: "{semantic.surface-nested}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
    kindIcon: "one Geist Icon per ACP tool kind — read, edit, delete, move, search, execute, think, fetch, switch_mode, other; an unrecognised kind renders `other`. The icon is decoration: the tool's title carries the meaning"
    status: "`status-dot` per call state; `failed` also writes the word `Failed` beside the dot, so a failure is never colour alone"
    content: "renders each tool-content item: text and image blocks; a diff as a compact excerpt on `diff-viewer` tokens with `View diff` where the workspace has git; a terminal as an inline sunken well tailing the output with an `Open terminal` action to `terminal-sheet`"
    locations: "`path:line` chips (`composer-chip` tokens) under the header, at most three and then `+N`. Activating one opens the Inspector diff for that path when the turn changed it, otherwise copies the path"
    origin: "a `tool-origin-tag` after the title where the call did not come from the Provider's built-in tools"
    expansion: "collapsed by default. A `failed` call and a call awaiting permission open themselves; after that the user's own toggle wins and streaming updates never reset it"
  tool-origin-tag:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
    scope: "Says where a tool call came from when ACP alone cannot: `mcp · <server>`, `skill · <name>`, `subagent`. A built-in call carries no tag, so the tag is signal, not decoration. The data is the append-only `origin` field on the tool-call entry (docs/architecture.md §7.3); a Provider adapter fills it in (Wave 2.5). An entry with no origin renders as a built-in call — origin is never guessed from the tool's title in the webview"
    truncation: "a server or skill name truncates after 16 characters with an ellipsis; the full name is the tooltip"
    a11y: "text, never colour alone; `aria-label` `From MCP server <server>` / `Skill <name>`"
  tool-run-group:
    backgroundColor: "transparent"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
    height: 28px
    scope: "Collapses a run of consecutive tool calls into one summary row, so a 30-call turn is not 30 rows (Interaction Patterns P1). Reads `Read 3 files · ran 2 commands ›`: counts by tool kind (read → files, execute → commands, edit/delete/move → edits, search → searches, fetch → fetches, anything else → tool calls), in first-seen order, the first three kinds and then `+N more`. A run is a maximal sequence of tool-call entries; any message, plan, notice, permission or elicitation entry ends it"
    live: "while any member is pending or executing the row shows a 16px spinner and the in-flight call's title, and the counts update in place with no layout shift"
    expand: "expanding lists the member `tool-accordion`s, each still individually collapsible. A run containing a failed call or a call awaiting permission renders expanded with only those members open, and does not collapse while a member awaits: something that asks the user is never made unreachable (State Precedence rule 5)"
    density: "Settings / General `Tool call density`: `Summary` (default) groups as above; `Full` renders every call as its own `tool-accordion` with no groups"
    a11y: "a `button` with `aria-expanded` and `aria-controls` on the member list; the summary sentence is its accessible name; an in-flight run sets `aria-busy`"
  subagent-card:
    extends: "{components.tool-accordion}"
    nestIndent: "{spacing.lg}"
    nestRule: "2px solid {semantic.hairline-strong}"
    scope: "A tool call whose origin is `subagent`. The parent row is a `tool-accordion` (title, `status-dot`, elapsed); its body is the child transcript — every entry whose `parent_tool_call_id` is that call — indented `nestIndent` behind a `nestRule` left rule. Collapsed by default with a one-line roll-up (`14 tool calls · 1 permission · running`). Children render through the same registered renderers, so a child permission request is a real `permission-request-card`"
    depth: "one level. A subagent that starts a subagent renders that child flat inside the first, marked `depth 2` by its `tool-origin-tag`, never a third indent: the stage is 760px and every indent costs measure"
    attention: "a child awaiting approval forces the parent open, puts the `awaiting` ring on the parent's `status-dot`, and appears in the approval inbox attributed to the subagent. A request is never hidden inside a collapsed card (State Precedence rule 5)"
    orphan: "a child whose parent is not in the transcript (a replay gap) renders top-level with a `provider-capability-notice` line `Subagent context unavailable`, and is never dropped"
  working-indicator:
    textColor: "{semantic.text-muted}"
    typography: "{typography.mono-micro}"
    height: 20px
    scope: "The turn is running: one row at the transcript tail, `Working · 14s`, with the running `status-dot` and, while a tool is in flight, that tool's title. It is the only 'the agent is alive' signal in the stage, so it is not a `thought-block` (content) or a spinner on one call. Removed when the turn reaches a stop reason; replaced by a `turn-notice` when that stop reason is not a normal end of turn"
    quiet: "after an idle threshold with no event the row appends `No activity for m:ss` in muted text — a fact, not an error; `Stop` stays the affordance. The threshold is an implementation constant recorded in the results doc"
    motion: "the elapsed time updates as text once per second; under reduced motion the dot is static and the text still updates, so nothing depends on motion"
  turn-notice:
    backgroundColor: "transparent"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    typography: "{typography.body-sm}"
    warningRule: "2px solid {semantic.status-warning} left rule"
    errorRule: "2px solid {semantic.status-danger} left rule"
    scope: "One inline stage entry for everything that ends or interrupts a turn other than a permission or elicitation. Kinds: `refusal` (ACP says a refused prompt and everything after it is left out of the next prompt, so the entry says that and the refused message is visibly struck from context); `max_tokens` and `max_turn_requests`, each with a `Continue` action that sends a follow-up prompt through the normal queue; `cancelled` (neutral: the user asked for it); `error` (an Error event, with `Retry` when it is retryable); `connection-lost` (the Provider connection dropped mid-session: `Reconnect`, transcript preserved); `compaction`"
    compaction: "renders as a hairline divider labelled `Context compacted`, with the Provider's summary expandable when it streams one — the same visual grammar as `Earlier history (read-only)`"
    redundancy: "every kind has a leading Geist Icon and a sentence; colour is never the only carrier (Interaction Patterns P2). One primary action at most, no confirm step"
    a11y: "`role=status` for info and warning kinds, `role=alert` for `error` and `connection-lost`; each is announced once and not again on re-render"
  jump-to-latest:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.full}"
    typography: "{typography.label-sm}"
    height: 28px
    scope: "A floating pill at the stage's bottom centre, shown when the user has scrolled away from the tail while the transcript is growing: `↓ Jump to latest`, or `↓ 3 new` once entries have arrived. The stage follows the tail only while pinned to it: scrolling up unpins and streaming never moves the viewport; reaching the tail or activating the pill re-pins"
    attention: "a pending permission or elicitation that is out of view adds a warning dot to the pill (State Precedence rule 5)"
    a11y: "a `button`; the new-entry count is not announced as it changes, to avoid chatter while streaming"
  plan-panel:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    stepTypography: "{typography.body-sm}"
    stepPending: "{semantic.text-muted}"
    stepActive: "{semantic.accent-agent-active}"
    stepComplete: "{semantic.status-success}"
    stepDone: "a completed step collapses to a muted check and its title; only the in-progress step keeps full weight (Interaction Patterns P1)"
  diff-viewer:
    backgroundColor: "{semantic.surface-sunken}"
    border: "1px solid {semantic.hairline-on-sunken}"
    textColor: "{semantic.text-on-sunken}"
    rounded: "{rounded.md}"
    typography: "{typography.mono-code}"
    syntax: "syntax colours follow the active theme and are never a fixed dark palette on a light well. Each token carries a colour for both themes and the stylesheet picks one, so a theme swap repaints without re-highlighting (the hot-swap budget in `theming.hotSwap`). Every token clears 4.5:1 against `{semantic.surface-sunken}` of its own theme, by construction: a palette colour that misses is moved along its own hue until it clears (`packages/diff/src/highlight/shiki.ts`). No bundled light theme clears it on the slate well, which is why the light palette is derived rather than picked"
    stat: "{typography.mono-micro}. `+N` and `−N` are two colours, never one: `+N` in {semantic.diff-added}, `−N` in {semantic.diff-removed}. Rendered in the file header beside the path, on a file operation's action row, in the {components.turn-receipt} and in the {components.branch-bar} (P17). A single-coloured stat makes the reader parse the sign to tell the sides apart"
    statAdded: "{semantic.diff-added}"
    statRemoved: "{semantic.diff-removed}"
    addedFill: "{semantic.diff-added} at 16%"
    removedFill: "{semantic.diff-removed} at 16%"
    addedWordFill: "{semantic.diff-added} at 32%"
    removedWordFill: "{semantic.diff-removed} at 32%"
    gutterMark: "`+` / `−` glyph in solid {semantic.diff-added} / {semantic.diff-removed}; present on every changed line so colour is never the sole carrier"
    lineNumber: "{typography.mono-micro} in {semantic.text-on-sunken-muted}"
    hunkHeader: "{semantic.wash-on-sunken} fill, {typography.mono-micro}, {semantic.text-on-sunken-muted}"
    collapsedContext: "one hunk-header-style row reading `N unmodified lines`, expandable in place; unchanged context never competes with the edit"
  usage-bar:
    size: 16px
    trackColor: "{semantic.hairline-strong}"
    fillColor: "{semantic.text-muted}"
    fillWarning: "{semantic.status-warning}"
    labelTypography: "{typography.mono-micro}"
    fill: "used ÷ context window size, so it needs the window size the Provider reports alongside usage. A Provider that reports tokens but no window size renders the number only, with no ring"
    unreported: "hidden when the Provider reports no usage, and never estimated. A Provider that reports zero renders `0` — unreported and zero are different facts (Interaction Patterns P9)"
    tooltip: "used / size tokens and, where reported, cumulative cost with its currency"
  activity-ledger:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    rowTypography: "{typography.body-sm}"
    countTypography: "{typography.mono-micro}"
    scope: "The Inspector's second index over the same history (Interaction Patterns P10): a rollup grouped by kind rather than by turn — `Files read 12 · Commands run 5 · MCP calls 3 · Searches 2 · Fetches 1 · Edits 4`, plus `Skills used` and `Subagents` where the origin field is present. Counts derive from tool-call entries; nothing is estimated"
    rows: "a kind with zero calls is omitted, but the section as a whole reads `No tool calls yet` on a fresh session rather than disappearing (P9). Each row expands into its ledger — the paths, the commands, MCP tools grouped by server, the URLs — and each item links to the transcript entry that produced it. `+N` overflow expands in place"
    scopeToggle: "whole session by default; a `This turn` toggle narrows it to the selected turn"
    totals: "tokens and cost totals appear only when the Provider reports usage (the `usage-bar` rule)"
    a11y: "a `list` of `button` rows with `aria-expanded`; counts are text"
  snapshot-mode-tag:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  sync-grid:
    deprecated: "Deprecated in `d0-rc6` and still rendered by Settings / MCP until the `provider-tab` editor chunk lands and removes it; no new surface references it. The Servers × Providers attachment matrix is superseded by the per-Provider `provider-tab` + `config-file-row` + `code-editor-well` editor on Settings / MCP (docs/pages-views-spec.md §5.4). Attachment is still a real runtime fact (docs/architecture.md §11.2); it is shown in the editor's footer note rather than as a matrix"
    legacyAlias: mcp-attachment-grid
  sync-grid-cell:
    deprecated: "Deprecated with `sync-grid` (`d0-rc6`) and removed with it. A cell's five attachment states now surface only as the footer's prose summary; the exhaustive `AttachmentState` mapping (`mcp.attachments`) is unchanged in the engine"
    legacyAlias: mcp-attachment-cell
  provider-row:
    backgroundColor: "transparent"
    borderBottom: "1px solid {semantic.hairline}"
    padding: 12px 16px
  provider-accordion:
    backgroundColor: "{semantic.surface-nested}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  profile-card:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  process-row:
    backgroundColor: "transparent"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 36px
  settings-nav-item:
    backgroundColor: "transparent"
    backgroundSelected: "{semantic.surface-active}"
    selectedBar: "2px {semantic.accent-focus} left bar (Universal State Matrix `selected`, vertical list)"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 6px 12px
    height: 32px
  trusted-folder-row:
    backgroundColor: "transparent"
    borderBottom: "1px solid {semantic.hairline}"
    pathTypography: "{typography.mono-code}"
    padding: 12px 16px
  skill-row:
    backgroundColor: "transparent"
    backgroundSelected: "{semantic.surface-active}"
    selectedBar: "2px {semantic.accent-focus} left bar while its `skill-detail` is open (Universal State Matrix `selected`, vertical list)"
    borderBottom: "1px solid {semantic.hairline}"
    slugTypography: "{typography.mono-code}"
    padding: 8px 12px
    height: 44px
    scope: "One skill in the resolved scope. Carries a `scope-badge`, provenance text (`folder | archive | git-hub | lockfile`), a script `trust` toggle where the skill ships scripts, and a `•••` menu. Name carries no category: skills are classified by scope (global / workspace) only"
    a11y: "`option` in a `listbox`; `aria-selected` mirrors `backgroundSelected`; `Enter`/`Space` opens the `skill-detail`"
  provenance-badge:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
    scope: "Reports where a skill, server or command came from (`folder`, `archive`, `git-hub`, `lockfile` for skills; `native file`, `imported` for MCP; `user`, `imported` for commands). Never a taxonomy — a category is not provenance. Renamed from `category-pill` (`d0-rc6`), whose slot M1.11 had already filled with `source.origin` because `SkillInfo` carries no category"
  scope-badge:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
    iconSize: "{icons.sizes.micro}"
    global: "globe glyph + `Global`"
    workspace: "folder glyph + the workspace's name (truncated to 20 chars with the full name as tooltip)"
    a11y: "text, never colour alone; the accessible name is `Global scope` / `Workspace <name> scope`"
  skill-detail:
    backgroundColor: "{semantic.surface-panel}"
    borderLeft: "1px solid {semantic.hairline-structural}"
    width: "{layout.shell-inspector}"
    padding: "{spacing.lg}"
    scope: "The right pane of Settings / Skills, beside the `skill-row` list. Header: skill name (`{typography.heading-md}`) + `scope-badge` + `provenance-badge`. Body sections on `schema-field-group` rhythm: the frontmatter `name` / `description`, the rendered `SKILL.md` body (the markdown worker, in the stage's reading measure), the file tree (`SKILL.md`, `scripts/`, assets), and the trust + per-workspace allow-list controls. Actions `Update` / `Remove` / `Export` in the header's right cluster"
    empty: "no selection renders the Design-system `empty` row (`24px` hero icon + `body-sm` + the `+ Add` primary action), never a blank pane"
    a11y: "a `region` labelled by the skill name; the trust control is a `switch`; removing a skill is destructive and confirms"
  skill-upload-dialog:
    extends: "{components.modal-dialog}"
    width: 520px
    dropzone: "{components.file-dropzone}"
    validatedRows: "one line per extracted entry: name, frontmatter status, size, and any script detected; a validation failure row reads the reason in {typography.mono-micro} / {semantic.status-danger}, and the confirm button stays disabled until the bundle is valid"
    a11y: "traps focus; `Esc` returns to the invoking `+ Add` menu; the dropzone is a labelled `button` that also accepts a file picker"
  command-row:
    backgroundColor: "transparent"
    backgroundSelected: "{semantic.surface-active}"
    selectedBar: "2px {semantic.accent-focus} left bar while its `command-editor` is open (Universal State Matrix `selected`, vertical list)"
    borderBottom: "1px solid {semantic.hairline}"
    slugTypography: "{typography.mono-code}"
    padding: 8px 12px
    height: 44px
    scope: "One `/` Tethys command in the resolved scope (CMP-01, CMP-07). Carries a `/` glyph, the name in {typography.mono-code}, a `scope-badge`, an `args-tag` when the body uses `{{args}}`, and a `•••` menu (`Rename`, `Duplicate`, `Delete`). No trust toggle: commands ship no scripts"
    shadowed: "a global row a workspace command of the same name overrides renders its name and provenance in {semantic.text-muted} plus a `shadowed by workspace` note; the note is text, never colour alone"
    a11y: "`option` in a `listbox`; `aria-selected` mirrors `backgroundSelected`; `Enter`/`Space` opens the `command-editor`"
  args-tag:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
    scope: "Marks a command whose body contains the `{{args}}` placeholder, so the list says at a glance whether typed text substitutes or appends. Never shown for a command without the placeholder"
  command-editor:
    backgroundColor: "{semantic.surface-panel}"
    borderLeft: "1px solid {semantic.hairline-structural}"
    width: "{layout.shell-inspector}"
    padding: "{spacing.lg}"
    scope: "The right pane of Settings / Skills & Commands' Commands kind, beside the `command-row` list. Header: `/name` (`{typography.heading-md}`) + `scope-badge`, with `Save` / `Delete` in the right cluster. Body on `schema-field-group` rhythm: the name field (editable on create, read-only after, because the filename is the name), the body `code-editor-well` in its `Markdown` mode with a `Markdown | Preview` toggle, and a helper line: `Use {{args}} where the typed text goes; otherwise it is appended. $skill and @path resolve to plaintext.` A shadow note (`Workspace overrides this in <name>`) renders when a workspace command shadows the global one being edited"
    empty: "no selection renders the Design-system `empty` row (`24px` hero icon + `body-sm` + the `New command` primary action), never a blank pane"
    a11y: "a `region` labelled by the command name; `Save` is disabled until the body is dirty; deleting is destructive and confirms"
  file-dropzone:
    backgroundColor: "{semantic.surface-nested}"
    border: "1px dashed {semantic.hairline-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
    iconSize: "{icons.sizes.hero}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.body-sm}"
    dragColor: "{semantic.accent-focus}"
    scope: "Shared drop target for `skill-upload-dialog` (`.skill` file, skill folder, pinned GitHub tarball). Denied drop recolours the border to {semantic.status-danger}; a valid drop recolours it to {semantic.accent-focus}"
  code-editor-well:
    backgroundColor: "{semantic.surface-sunken}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    typography: "{typography.mono-code}"
    lineNumberTypography: "{typography.mono-micro}"
    lineNumberColor: "{semantic.text-muted}"
    lineNumberFill: "{semantic.surface-hover}"
    gutterMarkAdded: "`+` glyph in solid {semantic.diff-added} on a line the editor is inserting relative to the file on disk"
    gutterMarkRemoved: "`−` glyph in solid {semantic.diff-removed} on a line the editor is removing"
    errorRow: "an invalid line marks the line number in {semantic.status-danger} plus a `⚠`; the message renders in a 1px-top-bordered footer row, never as a toast"
    scope: "The MCP config viewer/editor on Settings / MCP: the Provider's own config file rendered as a well, one line-numbered row per line, syntax-highlighted. A tree/raw toggle swaps the text for a collapsible JSON/TOML tree without changing the well's metrics. Every line stays on one logical line and scrolls horizontally; the well never soft-wraps. Editable save writes only on an explicit `Save`, and the footer states the consequence (`Applies to new sessions`). A `Markdown` mode reuses the same metrics for the `command-editor` body, with a `Markdown | Preview` toggle instead of tree/raw; Preview renders through the markdown worker and is read-only"
    a11y: "the editable form is a labelled `textarea`-equivalent with `aria-multiline`; the tree is a `tree`; the error footer is `role=alert`"
  config-file-row:
    backgroundColor: "transparent"
    borderBottom: "1px solid {semantic.hairline}"
    pathTypography: "{typography.mono-code}"
    pathColor: "{semantic.text-secondary}"
    padding: 8px 16px
    scope: "Identifies the exact file the `code-editor-well` reads and writes: resolved path (home-shortened), a `format-badge` (`JSON` / `JSONC` / `TOML`), a `scope-badge`, and the Provider's glyph. Writes `read-only` in {semantic.text-muted} for the import-only `~/.claude.json`"
  provider-tab:
    backgroundColor: "transparent"
    backgroundActive: "{semantic.surface-elevated}"
    textColor: "{semantic.text-muted}"
    textColorActive: "{semantic.text-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 6px 10px
    height: 32px
    glyphSize: "{icons.sizes.ui}"
    statusMarker: "a `{components.status-dot.sizeInline}` marker on the Provider glyph; `auth_required` renders amber, `not found` danger, `healthy` success"
    a11y: "`tab` in a `tablist`; the tab strip scrolls horizontally inside its region as Providers are added, the page never does"
  mcp-server-form:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.md}"
    width: 420px
    padding: "{spacing.lg}"
    fieldGroup: "{components.schema-field-group}"
    transportControl: "{components.segmented-control} (`stdio` | `http`)"
    scope: "Structured add/edit of one MCP server that writes an entry into the well's JSON/TOML. Fields are driven by the target Provider's own schema, never a universal shape: `stdio` gives name + command + args + env (and, per target, `cwd` / `envFile` / `type`), `http` gives name + the target's URL key (`url`, `httpUrl`, or Antigravity's `serverUrl`) + headers (and, for Codex, `bearer_token_env_var`). Secrets are entered as `keychain:` / `${VAR}` / `{env:VAR}` references only and are never echoed back"
    validation: "a name collision or a transport the target cannot express renders inline under the offending field in {typography.mono-micro} / {semantic.status-danger}; the confirm action stays disabled"
    a11y: "traps focus; `Esc` returns to the invoking `+ Add Server` / row; the transport segmented control is a `radiogroup`"
  keybinding-row:
    backgroundColor: "transparent"
    borderBottom: "1px solid {semantic.hairline}"
    typography: "{typography.body-sm}"
    padding: 6px 12px
    height: 36px
  keycap-pill:
    backgroundColor: "{semantic.surface-hover}"
    border: "1px solid {semantic.hairline-strong}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  toggle-switch:
    width: 32px
    height: 18px
    thumbSize: 14px
    thumbColor: "{semantic.primary}"
    rounded: "{rounded.full}"
    trackInactive: "{semantic.border-control}"
    trackActive: "{semantic.accent-toggle-active}"
  stepper-input:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.border-control}"
    rounded: "{rounded.sm}"
    typography: "{typography.mono-code}"
    buttonSize: 24px
  health-badge:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  protocol-pill:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  schema-field-group:
    backgroundColor: "transparent"
    borderTop: "1px solid {semantic.hairline}"
    padding: 12px 0px
  terminal-sheet:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.lg}"
    well: "the xterm viewport is a `{semantic.surface-sunken}` well with a 1px `{semantic.hairline}` border and `{rounded.md}`, inset in the sheet; the sheet chrome (title bar showing the command, close) stays Level 4. This is the same Sunken layer the Elevation table already assigns to terminal wells. xterm paints its own canvas, so the surface reads the well's `{semantic.surface-sunken}` and `{semantic.text-secondary}` back from CSS and passes them as the terminal theme — the canvas follows the active theme instead of xterm's built-in black"
  onboarding-step:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
---

## Scope

This document is the design **contract**: tokens, scales, and per-component metrics. It says what things look like and which tokens they use. It does not say what a page contains or how a component behaves.

- Page composition, component behaviour, copy and flows: [`docs/pages-views-spec.md`](docs/pages-views-spec.md). ACP terminology (Provider / Workspace / Session) is normative there, in §0, and workspace capabilities (git as a feature) in §0.1.
- What each surface reads and writes: [`docs/architecture.md`](docs/architecture.md) §8.3.
- Which milestone builds which surface: [`docs/milestone.md`](docs/milestone.md).

The visual style is **Precision Monochromatic**: stepped zinc surfaces, dot-matrix canvas accents, `1px` hairlines, and typography/icons executed entirely with Geist Sans, Geist Mono, and Geist Icons. **All components reference `{semantic.*}` tokens only** — raw hex lives in `primitives`/`themes` and ships as CSS vars (`--tethys-*`) for dynamic retheming.

## Theming Architecture

Two-tier contract: `primitives` (raw palette) → `semantic` interface (`surface-canvas`, `surface-elevated`, `hairline`, `text-primary`, `accent-agent-active`, …) → CSS vars. Components MUST NOT reference `primitives`, `themes`, or hex.

* **Default Dark (Obsidian Zinc)**: the values in `themes.default-dark`, tabulated under Colors below. Source of truth for dark contrast.
* **Default Light (Clean Zinc/Slate)**: the values in `themes.default-light`. Accents are darkened for contrast, and the wells (`surface-sunken`) recess with slate rather than staying dark.
* **User Custom Themes (JSON only)**: manifest `~/.tethys/themes/<id>.json` (or workspace-scoped). Schema: `{ id, name, base: "default-dark"|"default-light", vars: { <semantic>: <hex|rgba> }, meta: { author, version } }`. Missing keys inherit from `base`; unknown keys are errors; invalid file keeps current theme + toast.
* **Hot-swap**: validate → set vars atomically on `:root` (or per-window element) → persist `theme.id` → repaint, target `<50ms`, no reload, honor `prefers-color-scheme` for initial pick.
* **Contrast**: WCAG AA minimum `4.5:1` normal text, `3:1` large text/borders/focus. `M1.6` visual-regression harness blocks on failure for both default themes.

```json
{ "id": "acme-sand", "name": "Acme Sand", "base": "default-dark",
  "vars": { "surface-canvas": "#0c0a09", "hairline": "rgba(255,255,255,0.10)" },
  "meta": { "author": "acme", "version": "1.0.0" } }
```

## Colors (Semantic)

All rows are `{semantic.*}` → `var(--tethys-*)`, resolved per active theme. Hex below shows Default Dark / Default Light.

### Surfaces
The shell is **chrome raised over a deep stage**: titlebar and rail sit above the canvas, the inspector sits between, and the stage is the deepest plane; the Sessions drawer and the prompt card are Level 3 surfaces raised over it. Every pair of surfaces that abut must clear a perceptual gap (CIE L*), enforced by `packages/ui/src/theme/elevation.test.ts`. Depth is tone alone, so the ramp is wide on purpose.

- **Canvas Base** (`{semantic.canvas}` — dark `#0b0b0d` / light `#f4f4f5`): The stage. Deepest plane; default background for empty states and canvas containers.
- **Surface Rail** (`{semantic.surface-rail}` — dark `#161619` / light `#ffffff`): Titlebar and activity rail. Raised chrome, >= 3 L* above the canvas.
- **Surface Panel** (`{semantic.surface-panel}` — dark `#111114` / light `#f9f9fa`): Inspector and the Sessions drawer's list, between chrome and stage.
- **Surface Card** (`{semantic.surface-card}` — dark `#131316` / light `#ffffff`): Workspace card body in the catalog view.
- **Surface Card Hover** (`{semantic.surface-card-hover}` — dark `#17171a` / light `#f4f4f5`): Raised card state on pointer interaction.
- **Surface Elevated** (`{semantic.surface-elevated}` — dark `#1b1b1e` / light `#ffffff`): Active tabs, drawers, prompt containers, active segmented buttons.
- **Surface Overlay** (`{semantic.surface-overlay}` — dark `#212124` / light `#ffffff`): Popovers, command palette, modal sheets, toasts, tooltips. In dark it is strictly above Surface Elevated. Light themes cannot exceed white, so separation there is the border's job.
- **Surface Sunken** (`{semantic.surface-sunken}` — dark `#050507` / light `#e4e4e7`): Terminal wells, diff viewer, code wells. Recessed, not "always dark": the well is the deepest plane of whatever it sits on, so it is obsidian in dark and `slate-200` in light. Light mode therefore has no black blocks — a code well reads as a recessed slate panel, not a hole. A custom theme is free to keep the well dark on a light base; the well's text, hairline and wash are their own tokens for exactly that case (see the `*-on-sunken` family in the state-colour foundations).
- **Surface Nested** (`{semantic.surface-nested}` — dark `#0f0f12` / light `#f4f4f5`): Recessed interior: accordion bodies, thought blocks, tool accordions, cards inside drawers.
- **Dot Matrix Grid** (`{semantic.grid-dot}` — dark `rgba(255,255,255,0.12)` / light `rgba(0,0,0,0.12)`): 1px circular grid dots spaced at 12px intervals inside workspace cards.

### Dividers & Accents
- **Hairline** (`{semantic.hairline}` — dark `rgba(255,255,255,0.08)` / light `rgba(0,0,0,0.08)`): 1px borders surrounding cards, tab borders, panel dividers, popover frames, and provider row separators.
- **Hairline Strong** (`{semantic.hairline-strong}` — dark `#3f3f46` / light `#c2c2ca`): The border of every Level 3 and Level 4 surface (drawers, prompt card, popovers, palette, modals). Structure only: it has to be seen (1.4:1 or more on overlay and elevated), and it no longer draws control edges. That is `{semantic.border-control}`.
- **Hairline Structural** (`{semantic.hairline-structural}` — dark `rgba(255,255,255,0.13)` / light `rgba(0,0,0,0.12)`): Shell region dividers only — titlebar bottom, rail right, inspector left edge, splitters. Heavier than Hairline so the shell skeleton outweighs component borders such as keycaps.
- **Edge Highlight** (`{semantic.edge-highlight}` — dark `rgba(255,255,255,0.055)` / light `rgba(255,255,255,0.9)`): The lit top 1px of a Level 2+ surface, drawn as `inset 0 1px 0`. It is a border treatment, not a shadow: it does not cast, blur, or extend beyond the element.
- **Accent Agent Active** (`{semantic.accent-agent-active}` — dark `#56cde3` / light `#007991`): Agent-active indicator signaling live ACP streaming, active process execution, or an active agent session (`status-active-session` alias).
- **Accent Focus** (`{semantic.accent-focus}` — `#3b82f6` both): Keyboard focus boundaries and toggle active track (`accent-toggle-active` alias).
- **Health States**: `{semantic.status-danger}` (dark `#ff8a84` / light `#cd3437`, CLI missing), `{semantic.status-warning}` (dark `#ecc15a` / light `#9e6000`, disabled/unauthenticated/awaiting), `{semantic.status-success}` (dark `#5bcc80` / light `#00803a`, healthy handshake). Reserved strictly for provider/agent health; never for decorative chrome. Marker/text tier — see *State colour* below.
- **Diff Lines** (`{semantic.diff-added}` / `{semantic.diff-removed}` — dark `#5bcc80` / `#ff8a84`, light `#046c4e` / `#b91c1c`): Added and removed lines in `diff-viewer` only. They are deliberately not the health tokens, so the rule above still holds. Each theme carries its own pair because the tokens are read against `{semantic.surface-sunken}`, which is dark in dark and slate in light: the bright dark-well values only reach 2.0:1 on the slate well, so light deepens them to `green-700` / `red-700` (5.1:1 each). Colour is never the only carrier: every changed line also has a `+` / `−` glyph in the gutter.
- **Overlay Scrim** (`{semantic.overlay-scrim}` — dark `rgba(0,0,0,0.50)` / light `rgba(0,0,0,0.30)`): Dismiss layer behind modal popovers and narrow-window drawers. No blur.

### Muted text, control edges and inactive states

- **Text Muted** (`{semantic.text-muted}` — dark `#8e8e98` / light `#63636c`): Placeholders, telemetry, timestamps, secondary counts. It is read as text, so it clears 4.5:1 on every surface of its theme, `{semantic.surface-sunken}` included (`contrast.test.ts`). The shared `#71717a` it replaces measured 3.3-4.2:1 in dark and 3.8:1 on the light well; that value survives only in `accent-agent-idle` and `border-control`, which are shapes, not text.
- **Border Control** (`{semantic.border-control}` — `#71717a` both): The stroke of an input, textarea, toggle track, radio and checkbox. At 3:1 or more on every boundary surface (WCAG 1.4.11) because it is the only cue that a control is a control. Validation failure still swaps in `{semantic.status-danger}`.
- **On-sunken family** (`{semantic.text-on-sunken}`, `{semantic.text-on-sunken-secondary}`, `{semantic.text-on-sunken-muted}`, `{semantic.hairline-on-sunken}`, `{semantic.wash-on-sunken}`): text, divider and wash for anything drawn on `{semantic.surface-sunken}` — terminal, code block, diff viewer. In both default themes they equal the ordinary text and hairline tokens of that theme's well; they exist so a custom theme can keep a dark well on a light base without the text flipping with the theme. Content on a well reads these, never `text-*`.
- **Inactive states** (`{semantic.status-interrupted}` dark `#a1a1aa` / light `#52525b`, `{semantic.status-suspended}` `#52525b` / `#a1a1aa`, `{semantic.status-archived}` `#3f3f46` / `#c8c8cf`): the dot of a session that is stopped and not running. Quiet by design and ordered interrupted > suspended > archived, each with its own floor on `surface-panel` and `surface-card` rather than one shared ratio: 3:1, 2:1, 1.5:1. A dot below 3:1 is acceptable only because P2 puts the reason in words in the same row (`state-badge`, or `provider-row` subtext); a bare dot for these states is a bug. They never breathe.

### State colour

Every state colour is drawn from one family (`primitives.signal-*`), and it is used at exactly two intensities. Keeping the two apart is what stops the UI shouting: the saturated tone is only ever a small shape, and the large areas get the wash.

- **Marker/text tier** — `{semantic.accent-agent-active}`, `{semantic.status-success}`, `{semantic.status-warning}`, `{semantic.status-danger}`, `{semantic.diff-added}`, `{semantic.diff-removed}`. Used for a `status-dot`, a 1–2px rule, a label, a gutter mark, a `+N` / `−N` stat. Each pair clears **4.5:1 as text** on every surface of its theme (enforced by `packages/ui/src/theme/contrast.test.ts`), which is why Default Light's tones are deep: a "friendlier" light amber at `#d97706` measured 2.9:1 and failed. Lightness in light mode has to come from area, not from the hue.
- **Surface tier** — `{semantic.status-success-soft}`, `{semantic.status-warning-soft}`, `{semantic.status-danger-soft}`. A 10–14% wash of the same hue, for the background of a card, row or rule that is *in* that state. Background only: never text, never a border on its own, and it carries no contrast requirement because nothing is read on top of it that is not already readable on `{semantic.surface-card}`. Where a *border* needs the soft treatment rather than a fill, it is the `border-warning-soft` utility at 45% — a 10% fill is invisible as a 1px line.

**State colour never paints a full perimeter around a content surface** — a card, a panel, or a row that holds content or a decision. It paints the marker, the label, a 2px left rule, or a ≤14% wash (`{components.permission-request-card.pendingTreatment}`). The wash is painted over the surface's own tone, never in place of it (`wash-warning`, an image layer): on an opaque surface such as a card, a session row or a popover, a translucent background would let whatever is behind show through and change the surface's tone. A surface that already sits directly on the canvas (`permission-request-card`, `turn-notice`) is unaffected, since over the canvas the two are the same. A saturated outline is the loudest way to report a state and the most ink for the least information: at a glance it says *something is wrong here* without saying what, and on a column of rows it is pure visual debt. A **compact control** is the exception: on a ≤28px chip, pill or badge (and on an input or button that is itself in the error or `destructive` state) the border *is* the control's shape and stays — `session-item-chip.pendingBorder`, `input` on validation failure, `button` `destructive`, `stop-control.graceElapsed`.

## Typography

The interface relies exclusively on **Geist Sans** for UI hierarchy, **Geist Mono** for telemetry/git/paths, and **Geist Icons** for all glyphs (no emoji, no mixed sets).

| Token | Family | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `{typography.display-lg}` | Geist Sans | 36px | 600 | 1.15 | Centered prompt header ("What are we building today?") |
| `{typography.heading-lg}` | Geist Sans | 20px | 600 | 1.4 | View title ("Workspaces") |
| `{typography.heading-md}` | Geist Sans | 15px | 600 | 1.4 | Workspace card title, drawer headers |
| `{typography.body-md}` | Geist Sans | 14px | 400 | 1.5 | Chat messages, primary prompt input |
| `{typography.body-sm}` | Geist Sans | 13px | 400 | 1.4 | Tab labels, secondary descriptions |
| `{typography.label-md}` | Geist Sans | 12px | 500 | 1.4 | Segmented control buttons, filter toggles |
| `{typography.label-sm}` | Geist Sans | 11px | 500 | 1.3 | Service badges, metadata tags |
| `{typography.mono-code}` | Geist Mono | 12px | 400 | 1.5 | CLI logs, stdout/stderr streams, git hashes, stepper numbers, provider status subtext, diff stats |
| `{typography.mono-micro}` | Geist Mono | 11px | 500 | 1.3 | Hotkey pills, `session-item` chip/row labels, branch names, port numbers, telemetry (`Checked 1m ago`), health latency badges |

## Iconography (Geist Icons, Decided)

* **Set**: Geist Icons exclusively (`{icons.set}`). Vendor logos (GitHub/GitLab) are the only non-Geist exception.
* **Implementation**: `@nebutra/icons` is the sanctioned package that supplies the Geist icon set. UI and app code import glyphs from `@nebutra/icons` and must not introduce another icon family; this ratifies the package rather than silently substituting it.
* **Scales**: `micro 12px` (inline pills/badges), `ui 16px` (default buttons/rows), `rail 20px` (activity rail), `hero 24px` (empty states). See `{icons.sizes}`.
* **Stroke**: `1.5px`, round caps, `2px` grid; never fill unless active recording state.
* **Hit targets**: `compact 28px` (chips/stepper), `default 32px` (rows/buttons), `rail 36px` (rail/tabs). Icon may be smaller than target; padding makes up the difference.
* **States**: default `{semantic.text-muted}` → hover `{semantic.text-primary}` + `{semantic.surface-hover}` → active `{semantic.surface-active}` → disabled `40%` opacity → destructive `{semantic.status-danger}`. Transition `{motion.fast} {motion.easing}`.

## Platform States & Native Chrome

* **macOS**: hidden native titlebar, traffic lights inset; reserve `~70px` left pad in `tab-bar` as drag region; content never underlaps controls.
* **Windows**: native caption buttons right-aligned; reserve `140px` in `tab-bar`; Tethys tabs end before caption; hover uses `{semantic.surface-hover}`, never OS blue.
* **Linux**: header-bar fallback with in-app minimize/maximize/close (`16px` Geist, `32px` targets).
* **Active vs. inactive**: unfocused window dims `surface-*` to `60%` opacity treatment via `tauri-plugin-window-state`, suspends the accent breathe animation, keeps hairlines at full opacity for structure. Focus returns prior accent state.
* **Reduced motion**: `prefers-reduced-motion: reduce` suspends every looping animation — `{motion.breathe}`, `{motion.pulse}` and the button/loading spinner — to a static frame, exactly as an unfocused window does. Single-shot transitions (`fast`/`base`) stay. No state may rely on motion alone: `running` vs `awaiting` differ by shape (disc vs ring) as well as hue, and `Stop`'s pending phase shows its remaining grace as a static fill plus text (see `stop-control`).
* **IME**: composition underline `{semantic.text-secondary}`, caret `{semantic.accent-focus}`; candidate window follows textarea caret; no layout shift during composition.
* **Clipboard / DnD**: paste plain → text; paste rich/file-drop on composer → `@`-chip conversion with `mono-micro` hint (`Pasted file → @path`); directory drop on catalog → `Add workspace` affordance; denied drop shows `status-danger` ring on target only.

## Shell Structure

Four resizable regions (`UI-01`). Widths and breakpoints are the `layout:` tokens; what each region contains is in `docs/pages-views-spec.md` §1 and §4.

```
┌────┬───────────────────────────────┬───────────────────┐
│Rail│ Stage (flex, min 560px)       │ Inspector 360px   │
│48px│   Prompt card docked, 820px   │ (40px when        │
│    │                               │  collapsed)       │
└────┴───────────────────────────────┴───────────────────┘
   Sessions: an on-demand overlay drawer, 280px, from the titlebar toggle
```

* **Rail** `{spacing.rail}`: `nav-rail`, `20px` icons on `36px` targets. There is no docked Hub column: Workspaces is a view rendered on the Stage.
* **Sessions** `{layout.shell-threads}`: not a docked region. `sessions-column` renders inside an overlay drawer at `{stacking.drawer}` (Level 3) over the Stage with a `{semantic.overlay-scrim}` at `{stacking.drawer-scrim}`, opened from the titlebar Sessions toggle, dismissed by `Esc`, a scrim click or choosing a session, with focus trapped inside and restored to the toggle.
* **Stage**: flex, never narrower than `{layout.stage-min}`; text holds to `{layout.stage-measure}`. The Stage itself has no overlay mode. The `prompt-card` docks at its foot, centered, at `min({layout.prompt-width}, 100% - 96px)`, with a floating `{layout.popover-selector}` variant inside the peek and queue drawers.
* **Side panel** (`Overview` `{layout.shell-inspector}`, `Changes` up to 50%, `{components.side-panel}`): docked at `{layout.breakpoints.inspector-overlay}` and wider, and an overlay drawer below it. **Overlay mode is the Inspector's, and only the Inspector's:** it renders at `{stacking.drawer}` (Level 3) over the Stage with a `{semantic.overlay-scrim}` at `{stacking.drawer-scrim}`, is opened from the branch bar's `Review`, a turn receipt's `View changes`, `⌘⇧D` or the tab strip, and dismisses on `Esc` or scrim click. Docked, it collapses to a 40px rail that keeps the session's `status-dot`. **The Stage invariant:** the docked layout needs `48 + 560 + 360 = 968px`, which is below the 1100px threshold, so whenever the Inspector is docked the Stage holds `{layout.stage-min}` with 132px to spare. The Changes tab keeps the invariant by construction: its width is clamped to `viewport − 48 − 560`, and below `{layout.changes-min}` of room it opens as an overlay instead. `d0-rc5` left this open because a docked Sessions column and a Hub column also claimed width; with neither, no collapse ladder is needed. The arithmetic is enforced in `apps/desktop/src/shell/shell-layout.test.ts`.
* **Splitters** are `shell-splitter`; **palette** is `command-palette`, Level 4.

## Elevation & Depth

No ambient shadows are permitted. Depth is achieved through tonal stepped layers, 1px borders, and the `{semantic.edge-highlight}` lit top edge on Level 2 and above. Level 4 is always a strictly lighter tone than Level 3 in dark themes, with the same `{semantic.hairline-strong}` border:

| Layer | Surface | Border | Role |
| :--- | :--- | :--- | :--- |
| Level 0 | `{semantic.canvas}` | None | Global canvas |
| Level 1 | `{semantic.surface-card}` | 1px `{semantic.hairline}` | Default Workspace card |
| Level 2 | `{semantic.surface-card-hover}` | 1px `{semantic.hairline-strong}` | Card hover state; selected card (`workspace-card-selected`, adds the left `2px` `{semantic.accent-focus}` bar) |
| Level 3 | `{semantic.surface-elevated}` | 1px `{semantic.hairline-strong}` | Thread peek drawer, prompt input |
| Level 4 | `{semantic.surface-overlay}` | 1px `{semantic.hairline-strong}` | `model-selector-popover`, `provider-popover`, `terminal-sheet`, palette, modal, toast, tooltip. Paint order within and between levels is the `stacking` scale, not the level number |
| Nested | `{semantic.surface-nested}` | 1px `{semantic.hairline}` | `provider-accordion` interior inside a Level 0/1 settings row |
| Sunken | `{semantic.surface-sunken}` | 1px `{semantic.hairline}` | Terminal, diff viewer wells |

## Shapes

- **`{rounded.xs}` (4px)**: Status badges, `session-item` chips, `health-badge`, `protocol-pill`, git SHA tags.
- **`{rounded.sm}` (6px)**: Segmented control items, search inputs, `model-selector-pill`, `stepper-input`, `session-item-row`.
- **`{rounded.md}` (8px)**: Tab items, segmented control frame, icon hit targets, `model-selector-popover`, `provider-accordion`.
- **`{rounded.lg}` (12px)**: Workspace cards, `terminal-sheet`.
- **`{rounded.2xl}` (20px)**: Central prompt orchestration card.
- **`{rounded.full}` (9999px)**: Action buttons, agent status indicators and their halo, `toggle-switch` track/thumb.

## Universal State Matrix

Every interactive component implements these 7 states + loading/empty with identical tokens:

| State | Token behavior |
| :--- | :--- |
| `default` | As specified per component; text `{semantic.text-secondary}`, border `{semantic.hairline}` |
| `hover` | bg `{semantic.surface-hover}`, text → `{semantic.text-primary}` |
| `active/pressed` | bg `{semantic.surface-active}`, scale `0.99`, no shadow |
| `focused` | `2px` `{semantic.accent-focus}` ring + `2px` offset, drawn with `outline` (not `box-shadow`) so it cannot clip in scroll containers; full-width rows inside scroll regions use a `-2px` inset offset. Never remove outline for custom controls; no per-component override |
| `selected` | bg `{semantic.surface-active}` + left `2px` `{semantic.accent-focus}` bar (lists and cards, e.g. `workspace-card-selected`) or filled pill (segmented items, `tab-item`) |
| `disabled` | `40%` opacity, no pointer events, `aria-disabled`; skeleton text stays `{semantic.text-muted}` |
| `destructive` | border/text `{semantic.status-danger}`; hover fill `status-danger` at `12%` + `{semantic.text-inverse}` in dark / danger text in light |
| `loading` | skeleton pulse `{semantic.surface-hover}`↔`{semantic.surface-active}` `{motion.pulse}` + `16px` Geist spinner in `{semantic.text-muted}` |
| `empty` | `24px` hero Geist icon in `{semantic.text-muted}` + `body-sm` muted copy + primary action button |

Apply to: pill, popover cells, cards, chips/rows, session rows, provider rows, provider tabs, toggle, stepper, splitter, palette rows, tab items, message/plan/tool/tool-run-group/subagent/notice/permission/elicitation/diff/skill-row/command-row/mcp-server-form/profile/process/onboarding/trust-dialog/login-dialog/keybinding, composer config chips, attachment chips and activity-ledger rows below. Destructive appears on: discard hunk, delete thread/workspace, revoke trust, a Provider option whose kind rejects, the `SIGKILL` end of the cancellation ladder, rollback destructive confirm, delete command.

### State Precedence

Two kinds of state can hold on one component at once, and they are different axes:

* **Structural interaction states** — the nine rows above. They own the `opacity`, `pointer-events`, `outline` and `background` channels.
* **Component semantic states** — what the component is *reporting*: `status-dot` states, `session-item-chip.pendingBorder` and its `statusMarker`, `tab-item.statusMarker`, `plan-panel` step states, `provider-tab.statusMarker`, `code-editor-well.errorRow`. They own the border colour, the status marker (disc / ring / corner badge) and adjacent status text.

Rules, in the order to apply them:

1. **Semantic states are never replaced.** A structural state may dim or outline a semantic state; it never removes or recolours it. `disabled` (`40%` opacity) leaves an amber `pendingBorder` and an `awaiting` ring visible at `40%`.
2. **On a shared channel the higher state wins that channel only:** `disabled` › `destructive` › `focused` › `selected` › semantic › `hover` / `active/pressed`. Semantic outranks hover, so a card with a pending approval keeps its attention treatment (the left rule and the wash) while hovered.
3. **`selected` and `focused` coexist.** Focus owns the `outline` ring; selection keeps its left bar and fill. Both render together, never one instead of the other.
4. **Capability gating scopes to the gated affordance**, not the whole element, unless the element's only action is gated. A no-git `session-item-chip` hides its git-only parts and stays a live button.
5. **A semantic state that asks for the user is never made unreachable.** `awaiting` and `auth_required` must stay actionable from another surface (`approval-inbox-pill`, `provider-row`) even if the element carrying them is `disabled`.

Worked example: a `session-item-chip` whose only action is capability-gated (`aria-disabled`, `40%` opacity, no pointer events) while it has a pending approval keeps its amber `pendingBorder` and `awaiting` ring at `40%` opacity, and the approval is still answerable from the inbox. Tabs use the "filled pill" `selected` form; every vertical list, including `settings-nav-item`, uses the bar.

## Interaction Patterns

Cross-component rules adopted from a reference study of how other agentic coding tools design the same screens (*Agentic Coding UI*, a private claude.ai artifact; sources listed in its footer). Component entries say what a thing looks like; these say what every surface must do the same way, so six chunks do not invent six answers (`docs/milestone.md` §1.2).

**Evidence grade.** The study mixes real captures with its own sketches, so each pattern carries a grade and only graded-up patterns are adopted:

* **Observed** — a real product screenshot in the study (T3 Code, Claude Code Desktop, Claude's session-inspection panel).
* **Documented** — a product's public documentation, as cited by the study.
* **Schematic** — the study's own diagram of documented behaviour (the Cursor, Warp, Codex-app and OpenCode panels). A hypothesis, never evidence; a schematic-only pattern is not adopted.

A pattern is adopted only where it is Observed or Documented **and** fits an ACP fact. Where the pattern assumes data ACP does not carry, the row says how it was adapted.

| # | Rule | Applied in | Grade | Status |
| :--- | :--- | :--- | :--- | :--- |
| P1 | **Collapse execution, keep the summary.** Tool calls, thoughts, finished plan steps and unmodified diff context default to a one-line summary with depth one disclosure away. Anything that failed or asks the user opens itself | `tool-run-group`, `tool-accordion`, `thought-block`, `plan-panel.stepDone`, `diff-viewer.collapsedContext` | Observed, Documented | `tool-run-group` new; rest existing |
| P2 | **Status is a sentence, not a colour.** Every non-healthy state carries its reason in words in the same row: the dot says *that*, the words say *what* and how to fix it | `provider-row` status subtext, `health-badge`, `turn-notice`, `tool-accordion` `Failed`, `provider-capability-notice`, `working-indicator` | Observed | Existing rule for Providers; extended to the transcript |
| P3 | **Enabled-but-unreachable is not disabled.** Toggle and health are independent axes: a row switched on with a red dot reads as a fault; a row switched off by policy is dimmed and its reason is worded as a choice | `provider-row`, `toggle-switch` | Observed | M1.12 verifies with two fixture rows |
| P4 | **Git context rides with the composer.** Branch, isolation and the thread's diff stat sit next to the input, never in a separate tab | `branch-worktree-pill`, `branch-bar` | Observed | Amended d0-rc12 |
| P5 | **Controls that change agent behaviour sit beside the input**, not two clicks away in Settings. One home per control | `composer-config-chip`, prompt-card mode and context pills | Observed | New |
| P6 | **The empty or disabled state names the fix.** The disabled control says what is missing and where to fix it | `prompt-card`, `model-selector-pill` zero-provider, `workspace-selector-pill` unresolved, `session-config-panel`, `code-editor-well` empty state, `activity-ledger`, `turn-notice` `connection-lost` | Observed | Existing; extended |
| P7 | **Decisions are asked, not buried in prose.** A real fork is a numbered choice with an escape hatch (`Other`) and a way to decline (`Skip`). *Adapted:* ACP's option type has a value and a title but no description, so the card renders the title and the property's help text and never invents a trade-off line | `elicitation-card`, `permission-request-card` | Observed | Extended |
| P8 | **One primary action, pinned where the next click goes.** `Commit…` lives in the always-visible branch bar, never in a panel that can be collapsed or pushed off-screen; review (Changes) and approval (request dock) are separate words for separate acts | `branch-bar`, prompt submit, `turn-notice` single action | Observed | Amended d0-rc12 (supersedes option a) |
| P9 | **Zero reports zero honestly.** A metric that was reported as zero renders `0`; one that was not reported is hidden or says so. Never sample data, never an estimate | `usage-bar`, `activity-ledger`, `code-editor-well` empty state | Observed | New wording |
| P10 | **Two indexes over one history.** The transcript answers "what happened, in order"; the ledger answers "what did this session touch, by kind". Neither replaces the other | `activity-ledger` beside the Stage; the study's Progress and Outputs blocks already map to `plan-panel` and `provider-artifact` | Observed | New |
| P11 | **A setting states its consequence in a sentence**, under the control, not in a tooltip: `Applies from the next turn`, `Applies to new sessions` | `composer-config-chip` caption, Settings rows | Observed | New |
| P12 | **Where before what.** The run target is chosen at the start of a session and stays visible | `workspace-selector-pill`, `isolation-pill`, hub `Local` / `Remote` | Observed | Existing |
| P13 | **Capabilities are sourced inventory.** Skills, Providers, MCP servers and commands show provenance (`folder` / `archive` / `git-hub` / `lockfile` for skills; `native file` / `imported` for MCP; `user` / `imported` for commands) and a status cell that is either a fact or an action, never both | `skill-row`, `command-row`, `provider-row`, `mcp-server-form` | Observed | Existing; M1.11 verified the cell rule on the retired matrix |
| P14 | **Where, what, how.** The composer reads as three bands in that order — run target, request, agent behaviour — and a control never sits in another's band | `prompt-card.bands` | Documented (Claude Code Desktop) | New d0-rc12 |
| P15 | **The consent moment is where the eyes are.** A pending request docks above the composer with numbered options; the transcript keeps an anchor, not the only copy | `request-dock` | Observed | New d0-rc12 |
| P16 | **Risk takes a second step.** The most permissive mode is an `Enable` action outside the list, and is unavailable where its guard (PRM‑02) does not hold, with the reason stated | `mode-pill` | Observed | New d0-rc12 |
| P17 | **One stat, three scopes.** `+a −b` appears on the action row, the turn receipt and the branch bar, each beside the action of its scope; never re-added by hand, never estimated | `tool-accordion` row, `turn-receipt`, `branch-bar` | Observed | New d0-rc12 |
| P18 | **Provenance over prefixes.** A command or skill shows its source as a group heading and badge; a qualified name appears only on a real collision, and an unavailable item stays listed with its reason | `composer-command-group`, `composer-suggestion-popover.dimRow` | Observed | New d0-rc12 |

**Considered, not adopted** — recorded so nobody re-proposes them without new evidence:

* **Tiled grid of live agents** (Cursor). Schematic only. Workspace session cards and clean aggregate thread inspectors are Tethys's answer to concurrent sessions.
* **One scrollback of terminal and agent blocks** (Warp). Schematic only. Terminals stay in `terminal-sheet` and a display-only tool-call well.
* **Async task-and-review-queue as the unit of work** (Codex app). Schematic only. The approval inbox is the equivalent for the consent decision.
* **Usage heatmap on the new-session home** (Claude Code Desktop). Observed, but it belongs to the hub, not the thread, and its data is `usage-bar`'s (M2.10). Revisit there.
* **`!` shell passthrough in the prompt line** (OpenCode). Documented, but it bypasses the permission path and needs its own consent story first.
* **Edit-and-resend on a past message.** Needs a restore point, which only some workspaces have; not in MVP (`message-actions`).

## Accessibility & Keyboard Map

* **axe-core gates (`M1.6`)**: every surface passes contrast (theming rules), `aria` roles for custom controls (pill `combobox`, popover `listbox/option`, drawer/dialog `dialog`, tabs `tablist/tab`, switch `switch`, stepper `spinbutton`, splitter `separator`, permission-mode radios `radiogroup`, plan steps `list` with `aria-current` on the in-progress step, `usage-bar` `img` with an `aria-label` reading the usage figure, workspace cards, the MCP config editor `textbox` and its `tree` toggle, the command body editor's `Markdown | Preview` toggle, the `skill-row` / `command-row` `listbox` / `skill-detail` / `command-editor` `region`, and the `side-panel` `region` with its `Overview` / `Changes` `tablist` and its collapse `button` carrying `aria-expanded`, the `mode-pill` `radiogroup`s, the `branch-bar` `toolbar`), visible focus on all pointer targets, hit targets per Iconography.
* **Transcript semantics**: the stage is a `role="log"` region whose live announcements are **off** while streaming — a chunk is never announced. A separate polite announcer speaks only: turn complete, a new permission or elicitation request, and `turn-notice` of severity warning or above (assertive for `error` and `connection-lost`). The streaming message sets `aria-busy` until its turn ends. `tool-run-group`, `thought-block`, `subagent-card` and `tool-accordion` are `button`s with `aria-expanded`; `message-actions` is a `toolbar`; `activity-ledger` is a `list` of expandable rows; `jump-to-latest` announces itself once when it appears, not on each count change.
* **Focus trap + restore**: drawers, palette, `workspace-trust-dialog`, `login-dialog`, terminal sheet and `provider-popover` trap `Tab` while open and restore to invoker on `Esc`/close. It is one behaviour (`useFocusTrap`), not one copy per surface: each trap registers at its `stacking` tier and only the topmost answers a key, so a dialog opened over a drawer wraps and closes on its own and returns focus into the drawer. A surface that traps focus never opens over a lower trap and waits instead (`provider-popover.focus`); it asks the same registry. Unstack order is derived from `stacking`, topmost first: popover → palette → sheet → dialog → drawer. Toasts and tooltips take no focus and are not in the order. A trap never opens over another trap: a `provider-popover` request that arrives while a dialog or sheet is open waits in the Provider's pending list. Inline `permission-request-card` and `elicitation-card` do **not** trap focus — they live in the stage flow and are reachable by roving tabindex, so a pending request never blocks reading the transcript.
* **Roving tabindex**: one `tabindex=0` per column/list/tab-strip; arrows move, `Home/End` jump. The stage's entries are one such list: `↑` / `↓` move between entries, `Enter` / `Space` toggle the focused group, block or card, and `End` scrolls to the tail and re-pins it.
* **Config editor** (`code-editor-well` on Settings / MCP): the editable form is one `aria-multiline` text region and is the only tab stop; `↑` `↓` `←` `→` `Home` / `End` are the text area's own caret movement and are never intercepted. The tree toggle is a `tree` with its own roving `tabindex` (`↑` / `↓` move, `→` expands, `←` collapses, `Enter` selects). `Tab` leaves the well for the next control; `Ctrl/Cmd+S` is the one shortcut that commits a save, never the keystroke itself mutating the file.
* **Global shortcuts**:

| Keys | Action |
| :--- | :--- |
| `Ctrl/Cmd+K` | Toggle Command Palette |
| `Ctrl/Cmd+1..9` | Focus tab N (1 = Workspaces hub) |
| `Ctrl/Cmd+T` | New Thread tab |
| `Ctrl/Cmd+W` | Close focused tab (guard dirty state) |
| `Delete` | On a focused tab: close it (never the pinned Workspaces tab). The tab's close button is a pointer affordance hidden from the accessibility tree, since a `tablist` may own only tabs |
| `Ctrl/Cmd+I` | Toggle the docked side panel (collapse to the rail / expand) |
| `Ctrl/Cmd+Shift+D` | Open or close the Changes tab |
| `Ctrl/Cmd+Shift+M` / `+I` / `+E` | Open the Mode / Model / Effort popover |
| `1`–`9` | In an open Mode, Model or Effort popover, or with a request in the dock: pick that row or option |
| `Ctrl+O` | Cycle transcript density (Summary / Normal / Verbose) for this thread |
| `Ctrl/Cmd+B` | Toggle the Sessions drawer (the same control as the titlebar toggle) |
| `Ctrl/Cmd+,` | Open Settings |
| `Enter/Space` | Open/confirm focused control |
| `Esc` | Unstack, derived from `stacking`: close popover → palette → sheet → dialog → drawer |

All P0 actions reachable by keyboard; layout stable at 60fps under synthetic 8-stream feed.

## Styling & Token Rules

* **Font stack**: `Geist Sans` for all structural UI labels (titles, pills, buttons, segmented items, provider names). `Geist Mono` for branch names, `session-item` labels, diff stats (`+42 −12`), hotkeys, telemetry, stepper numbers, and status subtext. `Geist Icons` for all glyphs. Never swap.
* **Backgrounds**: `{semantic.canvas}` global, `{semantic.surface-rail}` chrome, `{semantic.surface-elevated}`/`{semantic.surface-overlay}` for prompt/popover/drawer/palette/sheets, `{semantic.surface-card}` cards, `{semantic.surface-nested}` accordion, `{semantic.surface-sunken}` terminal/diff wells. No other fills.
* **Dividers**: strictly `1px solid`. `{semantic.hairline-structural}` for shell region edges and splitters; `{semantic.hairline}` for component borders and row separators; `{semantic.border-control}` for input strokes, toggle tracks and other control edges; `{semantic.hairline-strong}` for Level 3-4 surface borders. No shadows for depth — tonal steps, hairlines and the `{semantic.edge-highlight}` lit edge only.
* **Accents**: general chrome entirely monochromatic. Color accents restricted to `{semantic.accent-agent-active}`/`{semantic.status-active-session}` streaming/running, `{semantic.status-success}` healthy/idle-ready, `{semantic.status-warning}` / `{semantic.status-danger}` health warnings, `{semantic.accent-focus}` focus + toggle-active. Effort labels, chips, and badges never use accent color except a state marker: the `status-dot`, the `state-badge`, and a state left rule.
* **Density**: settings rows `12px 16px`; accordion sections `12px` gaps; drawer rows `36px`; chips `20px`. `SYN-11` schema forms must reuse `schema-field-group` spacing so static MVP inputs and generated V1 forms share rhythm.

## Do's and Don'ts

Visual and token rules. Behavioural guardrails (permissions, cancellation, MCP, git capability) are in `docs/pages-views-spec.md` §7.

### Do
* Use dot-matrix backgrounds inside catalog cards to provide visual depth without adding heavy assets.
* Keep all card and panel boundaries to a crisp 1px `{semantic.hairline}`; use `{semantic.hairline-structural}` only for shell region edges.
* Reference `{semantic.*}` exclusively in components; put raw values in `primitives`/`themes` and ship JSON manifests for custom themes.
* Use Geist Icons at `12/16/20/24px` with `28/32/36px` targets and `1.5px` strokes; no mixed icon sets.
* Reserve `provider-accordion` container tokens now so `SYN-09` telemetry and `SYN-11` schema forms land without re-spacing.
* Gate every theme (default + custom JSON) on WCAG AA before ship.
* Group by kind in the ledger and by order in the transcript; never merge the two into one list (P10).
* Put a control in exactly one place; a config category has one home.
* Put a state on the smallest shape that carries it — the marker, the label, a 2px left rule, or a ≤14% `status-*-soft` wash — and let motion carry liveness.

### Don't
* Don't use colorful background fills on cards; all cards must remain on `{semantic.surface-card}`.
* Don't hardcode hex/rgba inside `components:`; use the Semantic Theme Contract so light/dark/custom themes hot-swap.
* Don't ship TOML themes; manifests are JSON only.
* Don't use ambient shadows for depth; tonal steps, hairlines and `{semantic.edge-highlight}` only.
* Don't show a status dot without its reason in words in the same row (P2).
* Don't infer a tool call's origin (MCP server, skill, subagent) from its title in the webview; render the `origin` field or nothing.
* Don't wrap a content surface in a state colour. A saturated perimeter around a card, panel or row is the loudest possible report and the least informative; use the marker, a 2px left rule, or a `status-*-soft` wash. A compact control (≤28px chip/pill/badge, an input on error, a `destructive` button) is the exception — there the border is the control's shape.
* Don't animate a state that has stopped. Only `running` and `awaiting` breathe (`{motion.stateMotion}`); `error`, `interrupted`, `suspended`, `archived`, `idle` and `auth_required` are static, because motion reads as *still working*.
* Don't put a `status-dot` on a large area at full opacity as its only state carrier; the dot is small by design and the words in the same row do the rest (P2).
* Don't announce streamed chunks to assistive technology, and don't move the viewport while the user is reading (`jump-to-latest`).
* Don't invent per-option descriptions or trade-off lines the protocol did not send.
* Don't use GitHub or GitLab logos anywhere except `workspace-source-badge`, where they report where an existing folder's git remote points. A vendor logo is never an entry point, and never implies where a workspace came from.

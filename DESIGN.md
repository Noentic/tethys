---
version: d0-rc5
changelog:
  d0-rc5: "Accepted 20 Sep 2026. `sync-grid` (MCP matrix) with 2-D grid roving; `stacking` scale, Esc unstack order derived from it (drawers now dismiss last); Inspector overlay mode defined (1100-1512px gap left open); provider surfaces (`provider-popover`, `provider-artifact`, `provider-capability-notice`, `composer-command-group`); thread-view completion (tool-run/origin/subagent, turn notices, message actions, config chips, activity ledger; docs/pages-views-spec.md §4.1); Interaction Patterns section; streaming-transcript a11y rules."
  d0-rc4: "Accepted 20 Sep 2026. `awaiting` ring; State Precedence; reduced-motion clause and `motion.pulse`; `stop-control`, `isolation-pill`; action-bar priority and collapse order; `workspace-card-selected`; session-item-chip sizing; login-dialog countdown; `diff-added`/`diff-removed` and `diff-viewer` tokens; config panel takes the remaining popover width; terminal-sheet Level 4 chrome."
  d0-rc3: "Re-homing only: prose-only metrics moved into the YAML, page layouts and behaviour moved to docs/pages-views-spec.md, data bindings to docs/architecture.md §8.3, `worktree-*` renamed `session-*`, stale colour values removed."
  d0-rc2: "Reconciled with pages-views-spec: per-Provider config selector, session-list-row / permission-request-card naming, MCP attachment replaces vendor-file projection."
name: Tethys-Precision-Monochromatic
description: |
  The design contract for a native, high-performance desktop control plane that runs autonomous coding agents over any folder, in parallel. Built around a Tabular paradigm (icon rail + tab strip + Workspace Catalog) that expands into a four-region IDE shell (Rail/Hub | Sessions | Stage/Inspector | Action Bar/Composer). All color is a swappable Semantic Theme Contract (primitives → semantic → CSS vars); default themes are Default Dark (Obsidian Zinc) and Default Light (Clean Zinc/Slate); users ship JSON theme manifests. Precision Monochromatic chrome, Geist typography/icons, 1px hairlines, and restrained accents reserved for agent telemetry and health states. Terminology follows the ACP three-tier model — Provider (one ACP connection) / Workspace (one `cwd`) / Session (one `session/new`); see docs/pages-views-spec.md §0.

primitives:
  zinc-950: "#09090b"
  zinc-700: "#27272a"
  obsidian-1000: "#050507"
  obsidian-960: "#0b0b0d"
  obsidian-940: "#0f0f12"
  obsidian-920: "#111114"
  obsidian-900: "#131316"
  obsidian-880: "#161619"
  obsidian-860: "#17171a"
  obsidian-840: "#1b1b1e"
  obsidian-800: "#212124"
  zinc-500: "#71717a"
  zinc-300: "#bfbfc9"
  zinc-50: "#f4f4f5"
  slate-0: "#ffffff"
  slate-25: "#f9f9fa"
  slate-50: "#fafafa"
  slate-100: "#f4f4f5"
  slate-200: "#e4e4e7"
  slate-300: "#d4d4d8"
  slate-500: "#71717a"
  slate-700: "#3f3f46"
  slate-900: "#18181b"
  sky-400: "#38bdf8"
  blue-500: "#3b82f6"
  green-500: "#10b981"
  amber-500: "#f59e0b"
  red-500: "#ef4444"

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
    hairline-strong: "{primitives.zinc-700}"
    hairline-structural: "rgba(255, 255, 255, 0.13)"
    edge-highlight: "rgba(255, 255, 255, 0.055)"
    grid-dot: "rgba(255, 255, 255, 0.12)"
    text-primary: "{primitives.zinc-50}"
    text-secondary: "{primitives.zinc-300}"
    text-muted: "{primitives.zinc-500}"
    text-inverse: "{primitives.zinc-950}"
    primary: "{primitives.zinc-50}"
    on-primary: "{primitives.zinc-950}"
    accent-focus: "{primitives.blue-500}"
    accent-toggle-active: "{primitives.blue-500}"
    accent-agent-active: "{primitives.sky-400}"
    accent-agent-idle: "{primitives.zinc-500}"
    status-active-session: "{primitives.sky-400}"
    status-success: "{primitives.green-500}"
    status-warning: "{primitives.amber-500}"
    status-danger: "{primitives.red-500}"
    diff-added: "{primitives.green-500}"
    diff-removed: "{primitives.red-500}"
  default-light:
    canvas: "{primitives.slate-100}"
    surface-rail: "{primitives.slate-0}"
    surface-panel: "{primitives.slate-25}"
    surface-elevated: "{primitives.slate-0}"
    surface-card: "{primitives.slate-0}"
    surface-card-hover: "{primitives.slate-100}"
    surface-nested: "{primitives.slate-100}"
    surface-overlay: "{primitives.slate-0}"
    surface-sunken: "{primitives.slate-900}"
    surface-hover: "rgba(0, 0, 0, 0.04)"
    surface-active: "rgba(0, 0, 0, 0.08)"
    overlay-scrim: "rgba(0, 0, 0, 0.30)"
    hairline: "rgba(0, 0, 0, 0.08)"
    hairline-strong: "{primitives.slate-300}"
    hairline-structural: "rgba(0, 0, 0, 0.12)"
    edge-highlight: "rgba(255, 255, 255, 0.90)"
    grid-dot: "rgba(0, 0, 0, 0.12)"
    text-primary: "{primitives.slate-900}"
    text-secondary: "{primitives.slate-700}"
    text-muted: "{primitives.slate-500}"
    text-inverse: "{primitives.slate-50}"
    primary: "{primitives.slate-900}"
    on-primary: "{primitives.slate-0}"
    accent-focus: "{primitives.blue-500}"
    accent-toggle-active: "{primitives.blue-500}"
    accent-agent-active: "#0284c7"
    accent-agent-idle: "{primitives.slate-500}"
    status-active-session: "#0284c7"
    status-success: "#059669"
    status-warning: "#d97706"
    status-danger: "#dc2626"
    diff-added: "{primitives.green-500}"
    diff-removed: "{primitives.red-500}"

semantic:
  canvas: { var: "--tethys-canvas", role: "Global canvas background" }
  surface-rail: { var: "--tethys-surface-rail", role: "Activity rail and window chrome" }
  surface-panel: { var: "--tethys-surface-panel", role: "Segmented frames, stepper, side columns" }
  surface-elevated: { var: "--tethys-surface-elevated", role: "Prompt card, popovers, drawers, tabs" }
  surface-card: { var: "--tethys-surface-card", role: "Workspace catalog card" }
  surface-card-hover: { var: "--tethys-surface-card-hover", role: "Card hover" }
  surface-nested: { var: "--tethys-surface-nested", role: "Accordion / nested form interior" }
  surface-overlay: { var: "--tethys-surface-overlay", role: "Command palette, modal sheets" }
  surface-sunken: { var: "--tethys-surface-sunken", role: "Terminal / code wells, always dark" }
  surface-hover: { var: "--tethys-surface-hover", role: "Hover wash" }
  surface-active: { var: "--tethys-surface-active", role: "Pressed / selected wash" }
  overlay-scrim: { var: "--tethys-overlay-scrim", role: "Dismiss scrim" }
  hairline: { var: "--tethys-hairline", role: "1px default divider" }
  hairline-strong: { var: "--tethys-hairline-strong", role: "Inputs, toggles, drawer edge, Level 3-4 surface borders" }
  hairline-structural: { var: "--tethys-hairline-structural", role: "Shell region dividers only: titlebar, rail, sessions/inspector edges, action bar, splitters" }
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
  status-success: { var: "--tethys-status-success", role: "Healthy handshake" }
  status-warning: { var: "--tethys-status-warning", role: "Disabled / unauthenticated" }
  status-danger: { var: "--tethys-status-danger", role: "Missing binary / destructive" }
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
  shell-left: 264px
  shell-left-collapsed: 48px
  shell-threads: 280px
  shell-inspector: 360px
  shell-actionbar: 56px
  splitter-hit: 6px
  palette-width: 600px
  palette-height: 400px
  drawer-peek: 380px
  drawer-queue: 420px
  prompt-width: 820px
  stage-measure: 760px
  stage-min: 560px
  popover-selector: 560px
  breakpoints: { sessions-icon: 800px, inspector-overlay: 1100px }

# Paint order. Higher paints above lower. The Esc unstack order (Accessibility & Keyboard Map)
# is derived from this table, topmost first, and is not maintained separately.
stacking:
  base: 0            # canvas, rails, stage, docked Inspector, action bar
  drawer-scrim: 10   # {semantic.overlay-scrim} behind an overlay Inspector, peek drawer, approval drawer
  drawer: 20         # overlay Inspector, workspace-peek-drawer, approval-queue-drawer
  dialog-scrim: 30
  dialog: 40         # modal-dialog, workspace-trust-dialog, login-dialog
  sheet: 50          # terminal-sheet (opens from login-dialog CLI passthrough, so above dialog)
  palette: 60        # command-palette
  popover: 70        # model-selector-popover, action-bar overflow, provider-popover
  toast: 80
  tooltip: 90

motion:
  instant: 100ms
  fast: 150ms
  base: 200ms
  easing: ease-out
  skeleton: 1200ms
  pulse: { duration: 2000ms, easing: "cubic-bezier(0.4, 0, 0.6, 1)", opacityLow: 50% }
  rules: "accordion/splitter fast; drawer/palette base; thumb slide fast; content fade after 100ms; no layout shift"
  reducedMotion: "under prefers-reduced-motion: reduce, every looping animation (pulse, skeleton, spinner) is suspended to a static frame; no state may depend on motion alone (see Universal State Matrix / State Precedence)"

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
    borderRight: "1px solid {semantic.hairline-structural}"
    header: "12px padding, 1px hairline bottom"
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
  action-bar:
    backgroundColor: "{semantic.surface-rail}"
    height: "{layout.shell-actionbar}"
    borderTop: "1px solid {semantic.hairline-structural}"
    padding: "0 {spacing.lg}"
    gap: "{spacing.sm}"
    contents: "provider/config pill (Provider identity and health; opens the full `model-selector-popover` and anchors `provider-popover` — the Model and Effort controls are `composer-config-chip`s in the composer, not here), mode pill (the one home of the ACP `mode` category), permission-mode pill, isolation pill (branch, or `no git`), diff-summary pill (only when a turn has a diff in a git workspace), usage-bar, queue count, Stop"
    priority: "stop, isolation-pill, permission-mode pill, provider/config pill, diff-summary pill, mode pill, queue count, usage-bar (highest first). The diff-summary pill is a registered slot; it sits above the mode pill so it folds after it, which keeps the fold order usage-bar, queue count, mode pill intact"
    collapseRule: "as the bar narrows toward {layout.stage-min}, elements fold in reverse priority — usage-bar first, then queue count, then mode pill — into a trailing `•••` overflow popover (Level 4). Stop and the isolation pill never fold. A folded queue count keeps a warning dot on the `•••` trigger. Slots registered through registerActionBarSlot declare a priority and fold with the same rule; an undeclared slot folds before usage-bar."
    overflowTrigger: "20px icon button, `aria-label` names the folded items"
  toast:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline-strong}"
    edge: "{semantic.edge-highlight}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
    maxWidth: 384px
    typography: "{typography.body-sm}"
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
  status-dot:
    size: 8px
    sizeInline: 6px
    rounded: "{rounded.full}"
    idle: "{semantic.accent-agent-idle}"
    running: "{semantic.accent-agent-active}"
    awaiting: "{semantic.status-warning}"
    healthy: "{semantic.status-success}"
    error: "{semantic.status-danger}"
    interrupted: "{semantic.text-muted}"
    suspended: "{semantic.hairline-strong}"
    archived: "{semantic.hairline}"
    unknown: "{semantic.accent-agent-idle}"
    authRequired: "{semantic.status-warning}"
    shape: "filled disc for every state except `awaiting`"
    awaitingShape: "ring — {ringWidth} stroke in {semantic.status-warning}, transparent centre, same outer size as the disc"
    ringWidth: 2px
    ringWidthInline: 1.5px
    pulse: "`running` and `awaiting` pulse per {motion.pulse}. Pulse is decoration: state must stay legible with it suspended (prefers-reduced-motion, unfocused window), so the only permitted differentiators between `running` and `awaiting` are hue AND shape together"
    rule: "`awaiting` (ring) is a session/turn state. Provider amber (`auth_required`, detected-but-disabled) stays a filled disc so the two amber meanings never collapse when the pulse is off. Applies identically on chips, topology nodes, session rows and the rail; `provider-row` additionally keeps its status subtext"
    a11y: "role=status with aria-label and title carrying the state name — unchanged; shape is for glanceable, non-hover reading"
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
    height: 20px
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    branch: "outline pill, 1px {semantic.hairline} border, {semantic.text-secondary} text, the session's branch; `maxWidth` 160px, ellipsis truncation with the full name as tooltip"
    noGit: "muted pill, {semantic.surface-hover} fill, {semantic.text-muted} text, reads `no git`. Not a button. Tooltip: `No git — edits are applied in place and cannot be reverted`. This is a first-class state, not an error: no danger or warning colour"
    priority: "never folds into the action-bar overflow"
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
  workspace-source-badge:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-sm}"
    iconSize: "{icons.sizes.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  session-topology-canvas:
    backgroundColor: "{semantic.canvas}"
    dotColor: "{semantic.grid-dot}"
    dotSpacing: 12px
    rounded: "{rounded.md}"
    nodeSize: 10px
    nodeIdle: "{semantic.grid-dot}"
    nodeRunning: "{semantic.accent-agent-active}"
    nodeAwaiting: "{semantic.status-warning}"
    nodeAwaitingShape: "ring (2px stroke, transparent centre) — every other node is a filled disc; same rule as status-dot, so `nodeRunning` and `nodeAwaiting` differ by shape as well as hue when the pulse is suspended"
    nodeError: "{semantic.status-danger}"
    edgeColor: "{semantic.hairline-strong}"
    providerGlyphSize: "{icons.sizes.micro}"
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
    statusMarker: "a `{components.status-dot.sizeInline}` marker overlaid on the provider glyph's top-right corner, adding no width. `running` = filled sky disc, `awaiting` = amber ring (see status-dot), `error` = filled danger disc, `idle` = none. Present in addition to `pendingBorder`, so an awaiting chip differs from a running one by shape, not only by hue"
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
    threadLowerBar: "the docked in-thread composer's lower bar, left to right: `composer-config-chip`s (Model, Effort), `attachment-chip`s, then submit. `/thread/new` keeps `model-selector-pill` here because that is where the Provider is chosen"
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
    rounded: "{rounded.full}"
    size: 32px
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
    pendingBorder: "1px solid {semantic.status-warning}"
  elicitation-card:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
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
    anchor: "the Provider's `model-selector-pill` in the action bar, so the request is visibly attributed to the Provider that raised it"
    content: "a title, a body rendered from the request's schema with `schema-field-group` spacing, and the Provider's own action set in the Provider's order — never a hardcoded approve/reject pair, the same rule as `permission-request-card`. A destructive-kind action uses the Universal State Matrix `destructive` row"
    focus: "traps `Tab` while open and restores focus to the invoker on `Esc`/close, unlike the inline cards. Because it traps focus it never opens over another trap: a request that arrives while a dialog or sheet is open waits in the Provider's pending list, the pill shows the pending count, and it opens when the topmost trap closes"
    pendingBorder: "1px solid {semantic.status-warning}"
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
  composer-config-chip:
    backgroundColor: "transparent"
    backgroundHover: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
    height: 28px
    scope: "The category-aware Model and Effort controls in the docked composer's lower bar, taken from the Provider's session config options by `category`: `model` becomes the Model chip and `thought_level` the Effort chip. `mode` is not a chip: its one home is the action bar's mode pill. `model_config` and every other select or boolean option live only in the full `session-config-panel` behind the Provider pill. Each category has exactly one home; a control is never rendered twice"
    absent: "a Provider that declares no option for a category renders no chip for it — never a disabled empty chip"
    label: "reads the current value; the option name is shown only when the value is ambiguous on its own (`Effort · High`, not bare `High`)"
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
    scope: "Gives a presentation to the grouping the composer `/` popup already requires — Tethys commands are 'listed apart from `/agent:name` commands the Provider advertises' (docs/pages-views-spec.md §4 `composer`), which the spec states but does not draw. Commands the Provider declares through its connection's available-commands list render as a separate group under a heading naming the Provider, after the Tethys commands, so a Provider command is never mistaken for one Tethys resolves itself. The rows reuse the existing command-row treatment; only the group heading is new. Not a second popup"
    clash: "a Provider command whose name collides with a Tethys command renders as `/agent:name`, existing clash rule"
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
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    typography: "{typography.mono-code}"
    addedFill: "{semantic.diff-added} at 16%"
    removedFill: "{semantic.diff-removed} at 16%"
    addedWordFill: "{semantic.diff-added} at 32%"
    removedWordFill: "{semantic.diff-removed} at 32%"
    gutterMark: "`+` / `−` glyph in solid {semantic.diff-added} / {semantic.diff-removed}; present on every changed line so colour is never the sole carrier"
    lineNumber: "{typography.mono-micro} in {semantic.text-muted}"
    hunkHeader: "{semantic.surface-hover} fill, {typography.mono-micro}, {semantic.text-muted}"
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
    backgroundColor: "transparent"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    scope: "The Servers × Providers attachment matrix on Settings / MCP. Rows are MCP servers, columns are Providers, and the workspace is the page's scope selector, not a third axis"
    headerRow: "sticky at the top of the scroll region, `{semantic.surface-elevated}`, 1px `{semantic.hairline-strong}` bottom border, height 36px, Provider name in {typography.label-sm} with its `status-dot`"
    frozenColumn: "the server-name column is frozen at 220px against the left edge, `{semantic.surface-elevated}`, 1px `{semantic.hairline-strong}` right border. Both axis labels must stay visible to read any cell"
    columnMinWidth: 132px
    rowHeight: 40px
    overflow: "the grid scrolls horizontally inside its own region as Providers are added (`+ Add Custom ACP Server` makes the column count unbounded); the page itself never scrolls horizontally. Scroll padding reserves the frozen column width so a focused cell is never hidden beneath it"
    empty:
      noServers: "zero rows: the header row still renders; the body is one full-width empty state `No MCP servers configured` with an `Add server` action"
      noProviders: "zero columns: the frozen server column renders alone; a full-width empty state `No connected Providers` links to Settings / Providers"
      both: "the noProviders state; there is nothing to attach to yet"
    a11y: "role=grid with aria-rowcount and aria-colcount; header cells `columnheader`, server cells `rowheader`, attachment cells `gridcell`. Keyboard model: Accessibility & Keyboard Map, 'Grid roving'"
  sync-grid-cell:
    backgroundColor: "transparent"
    textColor: "{semantic.text-muted}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
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
    borderBottom: "1px solid {semantic.hairline}"
    slugTypography: "{typography.mono-code}"
    padding: 6px 12px
    height: 36px
  category-pill:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
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
    trackInactive: "{semantic.hairline-strong}"
    trackActive: "{semantic.accent-toggle-active}"
  stepper-input:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
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
    well: "the xterm viewport is a `{semantic.surface-sunken}` well with a 1px `{semantic.hairline}` border and `{rounded.md}`, inset in the sheet; the sheet chrome (title bar showing the command, close) stays Level 4. This is the same Sunken layer the Elevation table already assigns to terminal wells"
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
* **Default Light (Clean Zinc/Slate)**: the values in `themes.default-light`. Accents are darkened for contrast, and the terminal well (`surface-sunken`) stays dark.
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
The shell is **chrome raised over a deep stage**: titlebar, rail and action bar sit above the canvas, the sessions column and inspector sit between, and the stage is the deepest plane. Every pair of surfaces that abut must clear a perceptual gap (CIE L*), enforced by `packages/ui/src/theme/elevation.test.ts`. Depth is tone alone, so the ramp is wide on purpose.

- **Canvas Base** (`{semantic.canvas}` — dark `#0b0b0d` / light `#f4f4f5`): The stage. Deepest plane; default background for empty states and canvas containers.
- **Surface Rail** (`{semantic.surface-rail}` — dark `#161619` / light `#ffffff`): Titlebar, activity rail, action bar. Raised chrome, >= 3 L* above the canvas.
- **Surface Panel** (`{semantic.surface-panel}` — dark `#111114` / light `#f9f9fa`): Sessions column and inspector, between chrome and stage.
- **Surface Card** (`{semantic.surface-card}` — dark `#131316` / light `#ffffff`): Workspace card body in the catalog view.
- **Surface Card Hover** (`{semantic.surface-card-hover}` — dark `#17171a` / light `#f4f4f5`): Raised card state on pointer interaction.
- **Surface Elevated** (`{semantic.surface-elevated}` — dark `#1b1b1e` / light `#ffffff`): Active tabs, drawers, prompt containers, active segmented buttons.
- **Surface Overlay** (`{semantic.surface-overlay}` — dark `#212124` / light `#ffffff`): Popovers, command palette, modal sheets, toasts, tooltips. In dark it is strictly above Surface Elevated. Light themes cannot exceed white, so separation there is the border's job.
- **Surface Sunken** (`{semantic.surface-sunken}` — dark `#050507` / light `#18181b`): Terminal wells, diff viewer, code wells; always dark for ANSI stability.
- **Surface Nested** (`{semantic.surface-nested}` — dark `#0f0f12` / light `#f4f4f5`): Recessed interior: accordion bodies, thought blocks, tool accordions, cards inside drawers.
- **Dot Matrix Grid** (`{semantic.grid-dot}` — dark `rgba(255,255,255,0.12)` / light `rgba(0,0,0,0.12)`): 1px circular grid dots spaced at 12px intervals inside workspace cards.

### Dividers & Accents
- **Hairline** (`{semantic.hairline}` — dark `rgba(255,255,255,0.08)` / light `rgba(0,0,0,0.08)`): 1px borders surrounding cards, tab borders, panel dividers, popover frames, and provider row separators.
- **Hairline Strong** (`{semantic.hairline-strong}` — dark `#27272a` / light `#d4d4d8`): Input strokes, toggle inactive tracks, and the border of every Level 3 and Level 4 surface (drawers, prompt card, popovers, palette, modals).
- **Hairline Structural** (`{semantic.hairline-structural}` — dark `rgba(255,255,255,0.13)` / light `rgba(0,0,0,0.12)`): Shell region dividers only — titlebar bottom, rail right, sessions/inspector edges, action bar top, splitters. Heavier than Hairline so the shell skeleton outweighs component borders such as keycaps.
- **Edge Highlight** (`{semantic.edge-highlight}` — dark `rgba(255,255,255,0.055)` / light `rgba(255,255,255,0.9)`): The lit top 1px of a Level 2+ surface, drawn as `inset 0 1px 0`. It is a border treatment, not a shadow: it does not cast, blur, or extend beyond the element.
- **Accent Agent Active** (`{semantic.accent-agent-active}` — dark `#38bdf8` / light `#0284c7`): Electric sky indicator signaling live ACP streaming, active process execution, or an active agent session (`status-active-session` alias).
- **Accent Focus** (`{semantic.accent-focus}` — `#3b82f6` both): Keyboard focus boundaries and toggle active track (`accent-toggle-active` alias).
- **Health States**: `{semantic.status-danger}` (dark `#ef4444` / light `#dc2626`, CLI missing), `{semantic.status-warning}` (dark `#f59e0b` / light `#d97706`, disabled/unauthenticated), `{semantic.status-success}` (dark `#10b981` / light `#059669`, healthy handshake). Reserved strictly for provider/agent health; never for decorative chrome.
- **Diff Lines** (`{semantic.diff-added}` / `{semantic.diff-removed}` — `#10b981` / `#ef4444` in both themes): Added and removed lines in `diff-viewer` only. They are deliberately not the health tokens, so the rule above still holds. Both themes use the same bright values because `diff-viewer` always sits on `{semantic.surface-sunken}`, which is dark in both. Colour is never the only carrier: every changed line also has a `+` / `−` glyph in the gutter.
- **Overlay Scrim** (`{semantic.overlay-scrim}` — dark `rgba(0,0,0,0.50)` / light `rgba(0,0,0,0.30)`): Dismiss layer behind modal popovers and narrow-window drawers. No blur.

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
* **Active vs. inactive**: unfocused window dims `surface-*` to `60%` opacity treatment via `tauri-plugin-window-state`, suspends accent pulse animation, keeps hairlines at full opacity for structure. Focus returns prior accent state.
* **Reduced motion**: `prefers-reduced-motion: reduce` suspends every looping animation — `{motion.pulse}`, the `{motion.skeleton}` shimmer and the button/loading spinner — to a static frame, exactly as an unfocused window does. Single-shot transitions (`fast`/`base`) stay. No state may rely on motion alone: `running` vs `awaiting` differ by shape (disc vs ring) as well as hue, and `Stop`'s pending phase shows its remaining grace as a static fill plus text (see `stop-control`).
* **IME**: composition underline `{semantic.text-secondary}`, caret `{semantic.accent-focus}`; candidate window follows textarea caret; no layout shift during composition.
* **Clipboard / DnD**: paste plain → text; paste rich/file-drop on composer → `@`-chip conversion with `mono-micro` hint (`Pasted file → @path`); directory drop on catalog → `Add workspace` affordance; denied drop shows `status-danger` ring on target only.

## Shell Structure

Four resizable regions (`UI-01`). Widths and breakpoints are the `layout:` tokens; what each region contains is in `docs/pages-views-spec.md` §1 and §4.

```
┌────┬──────────────┬──────────────────────┬───────────────────┐
│Rail│ Workspaces   │ Sessions             │ Stage + Inspector │
│48px│ 264px → 48px │ 280px                │ flex              │
│    │              │                      │ ActionBar 56px    │
│    │              │                      │ Composer docked   │
└────┴──────────────┴──────────────────────┴───────────────────┘
```

* **Rail** `{spacing.rail}`: `nav-rail`, `20px` icons on `36px` targets. **Hub** `{layout.shell-left}`, collapsing to `{layout.shell-left-collapsed}`.
* **Sessions** `{layout.shell-threads}`: collapses to an icon strip below `{layout.breakpoints.sessions-icon}`.
* **Stage**: flex, never narrower than `{layout.stage-min}` without the Inspector switching to overlay mode; text holds to `{layout.stage-measure}`. The Stage itself has no overlay mode.
* **Inspector** `{layout.shell-inspector}`: collapses to an overlay drawer below `{layout.breakpoints.inspector-overlay}`. **Overlay mode is the Inspector's, and only the Inspector's:** it renders at `{stacking.drawer}` (Level 3) over the Stage with a `{semantic.overlay-scrim}` at `{stacking.drawer-scrim}`, is opened from the action bar diff-summary pill or the tab strip, and dismisses on `Esc` or scrim click. **Open limitation (`d0-rc5`):** the threshold is the fixed `inspector-overlay` breakpoint, but the Stage reaches `{layout.stage-min}` only at `48 + 264 + 280 + 360 + 560 = 1512px` with every region expanded. Between `1100px` and `1512px` a docked Inspector leaves the Stage under its minimum, and at `1280px` it leaves 328px. The fix is a collapse ladder (Workspaces hub, then Sessions, then Inspector, each triggered by the Stage falling below `stage-min`), which changes an accepted breakpoint and is not decided here.
* **Action Bar** `{layout.shell-actionbar}`, with the composer docked centered at `{layout.prompt-width}` and a floating `{layout.popover-selector}` variant inside the peek and queue drawers.
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
- **`{rounded.full}` (9999px)**: Action buttons, agent status pulse indicators, `toggle-switch` track/thumb.

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
| `loading` | skeleton pulse `{semantic.surface-hover}↔{semantic.surface-active} {motion.skeleton}` + `16px` Geist spinner in `{semantic.text-muted}` |
| `empty` | `24px` hero Geist icon in `{semantic.text-muted}` + `body-sm` muted copy + primary action button |

Apply to: pill, popover cells, cards, chips/rows, session rows, provider rows, toggle, stepper, splitter, palette rows, tab items, topology nodes, message/plan/tool/tool-run-group/subagent/notice/permission/elicitation/diff/sync/profile/process/onboarding/trust-dialog/login-dialog/keybinding, composer config chips, attachment chips and activity-ledger rows below. Destructive appears on: discard hunk, delete thread/workspace, revoke trust, a Provider option whose kind rejects, the `SIGKILL` end of the cancellation ladder, rollback destructive confirm.

### State Precedence

Two kinds of state can hold on one component at once, and they are different axes:

* **Structural interaction states** — the nine rows above. They own the `opacity`, `pointer-events`, `outline` and `background` channels.
* **Component semantic states** — what the component is *reporting*: `status-dot` states, `session-item-chip.pendingBorder` and its `statusMarker`, `session-topology-canvas` `nodeAwaiting`/`nodeRunning`, `plan-panel` step states, `sync-grid-cell` status. They own the border colour, the status marker (disc / ring / corner badge) and adjacent status text.

Rules, in the order to apply them:

1. **Semantic states are never replaced.** A structural state may dim or outline a semantic state; it never removes or recolours it. `disabled` (`40%` opacity) leaves an amber `pendingBorder` and an `awaiting` ring visible at `40%`.
2. **On a shared channel the higher state wins that channel only:** `disabled` › `destructive` › `focused` › `selected` › semantic › `hover` / `active/pressed`. Semantic outranks hover, so a card with a pending approval keeps its amber border while hovered.
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
| P4 | **Git context rides with the composer.** Branch and diff stat sit next to the input, never in a separate tab | `isolation-pill`, diff-summary pill | Observed | Decided (option a) |
| P5 | **Controls that change agent behaviour sit beside the input**, not two clicks away in Settings. One home per control | `composer-config-chip`, action-bar mode and permission pills | Observed | New |
| P6 | **The empty or disabled state names the fix.** The disabled control says what is missing and where to fix it | `prompt-card`, `model-selector-pill` zero-provider, `session-config-panel`, `sync-grid` empty states, `activity-ledger`, `turn-notice` `connection-lost` | Observed | Existing; extended |
| P7 | **Decisions are asked, not buried in prose.** A real fork is a numbered choice with an escape hatch (`Other`) and a way to decline (`Skip`). *Adapted:* ACP's option type has a value and a title but no description, so the card renders the title and the property's help text and never invents a trade-off line | `elicitation-card`, `permission-request-card` | Observed | Extended |
| P8 | **One primary action, pinned where the next click goes.** *Adapted:* `Approve & Commit` stays in the Inspector (decided); the pill that opens it is what is pinned | diff-summary pill, prompt submit, `turn-notice` single action | Observed | Decided |
| P9 | **Zero reports zero honestly.** A metric that was reported as zero renders `0`; one that was not reported is hidden or says so. Never sample data, never an estimate | `usage-bar`, `activity-ledger`, `sync-grid` empty states | Observed | New wording |
| P10 | **Two indexes over one history.** The transcript answers "what happened, in order"; the ledger answers "what did this session touch, by kind". Neither replaces the other | `activity-ledger` beside the Stage; the study's Progress and Outputs blocks already map to `plan-panel` and `provider-artifact` | Observed | New |
| P11 | **A setting states its consequence in a sentence**, under the control, not in a tooltip: `Applies from the next turn`, `Applies to new sessions` | `composer-config-chip` caption, Settings rows | Observed | New |
| P12 | **Where before what.** The run target is chosen at the start of a session and stays visible | `workspace-selector-pill`, `isolation-pill`, hub `Local` / `Remote` | Observed | Existing |
| P13 | **Capabilities are sourced inventory.** Skills, Providers and MCP servers show provenance (yours, project, plugin) and a status cell that is either a fact or an action, never both | `skill-row`, `provider-row`, `sync-grid-cell` | Observed | Existing; M1.11 verifies the cell rule |

**Considered, not adopted** — recorded so nobody re-proposes them without new evidence:

* **Tiled grid of live agents** (Cursor). Schematic only. The sessions column and `session-topology-canvas` are Tethys's answer to many concurrent sessions.
* **One scrollback of terminal and agent blocks** (Warp). Schematic only. Terminals stay in `terminal-sheet` and a display-only tool-call well.
* **Async task-and-review-queue as the unit of work** (Codex app). Schematic only. The approval inbox is the equivalent for the consent decision.
* **Usage heatmap on the new-session home** (Claude Code Desktop). Observed, but it belongs to the hub, not the thread, and its data is `usage-bar`'s (M2.10). Revisit there.
* **`!` shell passthrough in the prompt line** (OpenCode). Documented, but it bypasses the permission path and needs its own consent story first.
* **Edit-and-resend on a past message.** Needs a restore point, which only some workspaces have; not in MVP (`message-actions`).

## Accessibility & Keyboard Map

* **axe-core gates (`M1.6`)**: every surface passes contrast (theming rules), `aria` roles for custom controls (pill `combobox`, popover `listbox/option`, drawer/dialog `dialog`, tabs `tablist/tab`, switch `switch`, stepper `spinbutton`, splitter `separator`, permission-mode radios `radiogroup`, plan steps `list` with `aria-current` on the in-progress step, `usage-bar` `img` with an `aria-label` reading the usage figure, topology canvas `img` with a text summary of node states, the MCP attachment matrix `grid` with `columnheader` / `rowheader` / `gridcell`), visible focus on all pointer targets, hit targets per Iconography.
* **Transcript semantics**: the stage is a `role="log"` region whose live announcements are **off** while streaming — a chunk is never announced. A separate polite announcer speaks only: turn complete, a new permission or elicitation request, and `turn-notice` of severity warning or above (assertive for `error` and `connection-lost`). The streaming message sets `aria-busy` until its turn ends. `tool-run-group`, `thought-block`, `subagent-card` and `tool-accordion` are `button`s with `aria-expanded`; `message-actions` is a `toolbar`; `activity-ledger` is a `list` of expandable rows; `jump-to-latest` announces itself once when it appears, not on each count change.
* **Focus trap + restore**: drawers, palette, `workspace-trust-dialog`, `login-dialog`, terminal sheet and `provider-popover` trap `Tab` while open and restore to invoker on `Esc`/close. Unstack order is derived from `stacking`, topmost first: popover → palette → sheet → dialog → drawer. Toasts and tooltips take no focus and are not in the order. A trap never opens over another trap: a `provider-popover` request that arrives while a dialog or sheet is open waits in the Provider's pending list. Inline `permission-request-card` and `elicitation-card` do **not** trap focus — they live in the stage flow and are reachable by roving tabindex, so a pending request never blocks reading the transcript.
* **Roving tabindex**: one `tabindex=0` per column/list/tab-strip; arrows move, `Home/End` jump. The stage's entries are one such list: `↑` / `↓` move between entries, `Enter` / `Space` toggle the focused group, block or card, and `End` scrolls to the tail and re-pins it.
* **Grid roving** (`sync-grid` only): one `tabindex=0` for the whole grid, on the last-focused cell (the first `gridcell` on entry). `←` `→` `↑` `↓` move one cell and stop at the edge without wrapping; `Home` / `End` jump to the first / last cell of the row; `Ctrl+Home` / `Ctrl+End` to the first / last cell of the grid; `PageUp` / `PageDown` move by the visible row count. The `rowheader` is reachable with `←` from the first `gridcell`. Moving focus scrolls the cell into view past the frozen column and sticky header. `Tab` leaves the grid rather than walking cells.
* **Global shortcuts**:

| Keys | Action |
| :--- | :--- |
| `Ctrl/Cmd+K` | Toggle Command Palette |
| `Ctrl/Cmd+1..9` | Focus tab N (1 = Workspaces hub) |
| `Ctrl/Cmd+T` | New Thread tab |
| `Ctrl/Cmd+W` | Close focused tab (guard dirty state) |
| `Ctrl/Cmd+,` | Open Settings |
| `Enter/Space` | Open/confirm focused control |
| `Esc` | Unstack, derived from `stacking`: close popover → palette → sheet → dialog → drawer |

All P0 actions reachable by keyboard; layout stable at 60fps under synthetic 8-stream feed.

## Styling & Token Rules

* **Font stack**: `Geist Sans` for all structural UI labels (titles, pills, buttons, segmented items, provider names). `Geist Mono` for branch names, `session-item` labels, diff stats (`+42 −12`), hotkeys, telemetry, stepper numbers, and status subtext. `Geist Icons` for all glyphs. Never swap.
* **Backgrounds**: `{semantic.canvas}` global, `{semantic.surface-rail}` chrome, `{semantic.surface-elevated}`/`{semantic.surface-overlay}` for prompt/popover/drawer/palette/sheets, `{semantic.surface-card}` cards, `{semantic.surface-nested}` accordion, `{semantic.surface-sunken}` terminal/diff wells. No other fills.
* **Dividers**: strictly `1px solid`. `{semantic.hairline-structural}` for shell region edges and splitters; `{semantic.hairline}` for component borders and row separators; `{semantic.hairline-strong}` for input strokes, toggle tracks, and Level 3-4 surface borders. No shadows for depth — tonal steps, hairlines and the `{semantic.edge-highlight}` lit edge only.
* **Accents**: general chrome entirely monochromatic. Color accents restricted to `{semantic.accent-agent-active}`/`{semantic.status-active-session}` streaming/running, `{semantic.status-success}` healthy/idle-ready, `{semantic.status-warning}` / `{semantic.status-danger}` health warnings, `{semantic.accent-focus}` focus + toggle-active. Effort labels, chips, and badges never use accent color except the running pulse dot.
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

### Don't
* Don't use colorful background fills on cards; all cards must remain on `{semantic.surface-card}`.
* Don't hardcode hex/rgba inside `components:`; use the Semantic Theme Contract so light/dark/custom themes hot-swap.
* Don't ship TOML themes; manifests are JSON only.
* Don't use ambient shadows for depth; tonal steps, hairlines and `{semantic.edge-highlight}` only.
* Don't show a status dot without its reason in words in the same row (P2).
* Don't infer a tool call's origin (MCP server, skill, subagent) from its title in the webview; render the `origin` field or nothing.
* Don't announce streamed chunks to assistive technology, and don't move the viewport while the user is reading (`jump-to-latest`).
* Don't invent per-option descriptions or trade-off lines the protocol did not send.
* Don't use GitHub or GitLab logos anywhere except `workspace-source-badge`, where they report where an existing folder's git remote points. A vendor logo is never an entry point, and never implies where a workspace came from.

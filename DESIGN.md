---
version: d0-rc3
changelog:
  d0-rc3: "Re-homing only, no visual design decisions changed; metrics that existed only in prose (card borders, extra status-dot states, breakpoints, stepper button size) were added to the YAML. Page layouts, component behaviour and copy moved to docs/pages-views-spec.md; the UI data-bindings table moved to docs/architecture.md §8.3. worktree-* components renamed session-* (they render non-git workspaces too). Stale colour values in Theming Architecture removed; action-bar worktree pill renamed isolation pill."
  d0-rc2: "Reconciled with pages-views-spec: per-Provider config selector replaces the fixed three-column selector; session-list-row / permission-request-card naming; MCP attachment replaces vendor-file projection."
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

motion:
  instant: 100ms
  fast: 150ms
  base: 200ms
  easing: ease-out
  skeleton: 1200ms
  rules: "accordion/splitter fast; drawer/palette base; thumb slide fast; content fade after 100ms; no layout shift"

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
    contents: "provider/config pill, mode pill, permission-mode pill, isolation pill (branch, or `no git`), usage-bar, queue count, Stop"
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
  approval-inbox-pill:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    dotColor: "{semantic.status-warning}"
    rounded: "{rounded.full}"
    padding: 2px 8px
    height: 20px
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
  workspace-card-active:
    backgroundColor: "{semantic.surface-card-hover}"
    border: "1px solid {semantic.hairline-strong}"
    rounded: "{rounded.lg}"
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
    pendingBorder: "1px solid {semantic.status-warning}"
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
    configPanelWidth: 360px
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
  turn-message:
    backgroundColor: "transparent"
    textColor: "{semantic.text-primary}"
    typography: "{typography.body-md}"
  thought-block:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  tool-accordion:
    backgroundColor: "{semantic.surface-nested}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
  plan-panel:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    stepTypography: "{typography.body-sm}"
    stepPending: "{semantic.text-muted}"
    stepActive: "{semantic.accent-agent-active}"
    stepComplete: "{semantic.status-success}"
  diff-viewer:
    backgroundColor: "{semantic.surface-sunken}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
  usage-bar:
    size: 16px
    trackColor: "{semantic.hairline-strong}"
    fillColor: "{semantic.text-muted}"
    fillWarning: "{semantic.status-warning}"
    labelTypography: "{typography.mono-micro}"
  snapshot-mode-tag:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
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
* **Stage**: flex, never narrower than `{layout.stage-min}` without switching to overlay mode; text holds to `{layout.stage-measure}`.
* **Inspector** `{layout.shell-inspector}`: collapses to an overlay drawer below `{layout.breakpoints.inspector-overlay}`.
* **Action Bar** `{layout.shell-actionbar}`, with the composer docked centered at `{layout.prompt-width}` and a floating `{layout.popover-selector}` variant inside the peek and queue drawers.
* **Splitters** are `shell-splitter`; **palette** is `command-palette`, Level 4.

## Elevation & Depth

No ambient shadows are permitted. Depth is achieved through tonal stepped layers, 1px borders, and the `{semantic.edge-highlight}` lit top edge on Level 2 and above. Level 4 is always a strictly lighter tone than Level 3 in dark themes, with the same `{semantic.hairline-strong}` border:

| Layer | Surface | Border | Role |
| :--- | :--- | :--- | :--- |
| Level 0 | `{semantic.canvas}` | None | Global canvas |
| Level 1 | `{semantic.surface-card}` | 1px `{semantic.hairline}` | Default Workspace card |
| Level 2 | `{semantic.surface-card-hover}` | 1px `{semantic.hairline-strong}` | Card hover state |
| Level 3 | `{semantic.surface-elevated}` | 1px `{semantic.hairline-strong}` | Thread peek drawer, prompt input |
| Level 4 | `{semantic.surface-overlay}` | 1px `{semantic.hairline-strong}` | `model-selector-popover`, `terminal-sheet`, palette, modal, toast, tooltip |
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
| `selected` | bg `{semantic.surface-active}` + left `2px` `{semantic.accent-focus}` bar (lists) or filled pill (segmented) |
| `disabled` | `40%` opacity, no pointer events, `aria-disabled`; skeleton text stays `{semantic.text-muted}` |
| `destructive` | border/text `{semantic.status-danger}`; hover fill `status-danger` at `12%` + `{semantic.text-inverse}` in dark / danger text in light |
| `loading` | skeleton pulse `{semantic.surface-hover}↔{semantic.surface-active} {motion.skeleton}` + `16px` Geist spinner in `{semantic.text-muted}` |
| `empty` | `24px` hero Geist icon in `{semantic.text-muted}` + `body-sm` muted copy + primary action button |

Apply to: pill, popover cells, cards, chips/rows, session rows, provider rows, toggle, stepper, splitter, palette rows, tab items, topology nodes, message/plan/tool/permission/elicitation/diff/sync/profile/process/onboarding/trust-dialog/login-dialog/keybinding components below. Destructive appears on: discard hunk, delete thread/workspace, revoke trust, a Provider option whose kind rejects, the `SIGKILL` end of the cancellation ladder, rollback destructive confirm.

## Accessibility & Keyboard Map

* **axe-core gates (`M1.6`)**: every surface passes contrast (theming rules), `aria` roles for custom controls (pill `combobox`, popover `listbox/option`, drawer/dialog `dialog`, tabs `tablist/tab`, switch `switch`, stepper `spinbutton`, splitter `separator`, permission-mode radios `radiogroup`, plan steps `list` with `aria-current` on the in-progress step, `usage-bar` `img` with an `aria-label` reading the usage figure, topology canvas `img` with a text summary of node states), visible focus on all pointer targets, hit targets per Iconography.
* **Focus trap + restore**: drawers, palette, `workspace-trust-dialog`, `login-dialog`, terminal sheet trap `Tab` while open and restore to invoker on `Esc`/close. Unstack order: popover → drawer/sheet → palette → dialog. Inline `permission-request-card` and `elicitation-card` do **not** trap focus — they live in the stage flow and are reachable by roving tabindex, so a pending request never blocks reading the transcript.
* **Roving tabindex**: one `tabindex=0` per column/list/tab-strip; arrows move, `Home/End` jump.
* **Global shortcuts**:

| Keys | Action |
| :--- | :--- |
| `Ctrl/Cmd+K` | Toggle Command Palette |
| `Ctrl/Cmd+1..9` | Focus tab N (1 = Workspaces hub) |
| `Ctrl/Cmd+T` | New Thread tab |
| `Ctrl/Cmd+W` | Close focused tab (guard dirty state) |
| `Ctrl/Cmd+,` | Open Settings |
| `Enter/Space` | Open/confirm focused control |
| `Esc` | Unstack: close popover → drawer/sheet → palette → dialog |

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

### Don't
* Don't use colorful background fills on cards; all cards must remain on `{semantic.surface-card}`.
* Don't hardcode hex/rgba inside `components:`; use the Semantic Theme Contract so light/dark/custom themes hot-swap.
* Don't ship TOML themes; manifests are JSON only.
* Don't use ambient shadows for depth; tonal steps, hairlines and `{semantic.edge-highlight}` only.
* Don't use GitHub or GitLab logos anywhere except `workspace-source-badge`, where they report where an existing folder's git remote points. A vendor logo is never an entry point, and never implies where a workspace came from.

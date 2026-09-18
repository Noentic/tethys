---
version: d0-rc2
name: Tethys-Precision-Monochromatic
description: |
  A native, high-performance desktop control plane for running autonomous coding agents across parallel git worktrees. Built around a Tabular paradigm (icon rail + tab strip + Workspace Catalog) that expands into a four-region IDE shell (Rail/Hub | Sessions | Stage/Inspector | Action Bar/Composer). All color is a swappable Semantic Theme Contract (primitives → semantic → CSS vars); default themes are Default Dark (Obsidian Zinc) and Default Light (Clean Zinc/Slate); users ship JSON theme manifests. Precision Monochromatic chrome, Geist typography/icons, 1px hairlines, and restrained accents reserved for agent telemetry and health states. Terminology follows the ACP three-tier model — Provider (one ACP connection) / Workspace (one `cwd`) / Session (one `session/new`); see "ACP Terminology" below and `docs/pages-views-spec.md` §0 for the page-level mapping.

primitives:
  zinc-950: "#09090b"
  zinc-925: "#111114"
  zinc-900: "#121215"
  zinc-850: "#15151a"
  zinc-800: "#18181b"
  zinc-700: "#27272a"
  zinc-500: "#71717a"
  zinc-300: "#bfbfc9"
  zinc-50: "#f4f4f5"
  slate-0: "#ffffff"
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
    canvas: "{primitives.zinc-950}"
    surface-rail: "{primitives.zinc-950}"
    surface-panel: "{primitives.zinc-900}"
    surface-elevated: "{primitives.zinc-800}"
    surface-card: "{primitives.zinc-925}"
    surface-card-hover: "{primitives.zinc-850}"
    surface-nested: "{primitives.zinc-900}"
    surface-overlay: "{primitives.zinc-800}"
    surface-sunken: "{primitives.zinc-950}"
    surface-hover: "rgba(255, 255, 255, 0.04)"
    surface-active: "rgba(255, 255, 255, 0.08)"
    overlay-scrim: "rgba(0, 0, 0, 0.50)"
    hairline: "rgba(255, 255, 255, 0.08)"
    hairline-strong: "{primitives.zinc-700}"
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
    canvas: "{primitives.slate-50}"
    surface-rail: "{primitives.slate-0}"
    surface-panel: "{primitives.slate-100}"
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
  hairline-strong: { var: "--tethys-hairline-strong", role: "Inputs, toggles, drawer edge" }
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
  manifestPath: "~/.tethys/themes/<id>.json or <repo>/.tethys/themes/<id>.json"
  baseThemes: ["default-dark", "default-light"]
  customThemeKeys: "any subset of semantic keys; missing keys inherit from `base` field"
  hotSwap: "validate → set CSS vars atomically → persist `theme.id` → repaint; invalid manifest keeps prior theme + toast error"
  contrast: "WCAG AA minimum: 4.5:1 normal text, 3:1 large text/borders/focus; CI blocks M1.6 on failure"
  authorRule: "components MUST ref {semantic.*} only; primitives/themes are author space, never component space"

typography:
  display-lg:
    fontFamily: Geist Sans
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.02em
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
  prompt-width: 680px
  popover-selector: 560px

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
  tab-bar:
    backgroundColor: "{semantic.surface-rail}"
    height: "{spacing.titlebar}"
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
  approval-inbox-pill:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    dotColor: "{semantic.status-warning}"
    rounded: "{rounded.full}"
    padding: 2px 8px
    height: 20px
  shell-splitter:
    backgroundColor: "{semantic.hairline}"
    hitArea: "{layout.splitter-hit}"
    hoverColor: "{semantic.hairline-strong}"
    dragColor: "{semantic.accent-focus}"
  command-palette:
    backgroundColor: "{semantic.surface-overlay}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.lg}"
    width: "{layout.palette-width}"
  segmented-control:
    backgroundColor: "{semantic.surface-panel}"
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
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    height: 220px
  workspace-card-active:
    backgroundColor: "{semantic.surface-card-hover}"
    rounded: "{rounded.lg}"
  workspace-source-badge:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-muted}"
    typography: "{typography.label-sm}"
    iconSize: "{icons.sizes.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  worktree-topology-canvas:
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
  thread-chip:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    height: 20px
  worktree-session-item-chip:
    backgroundColor: "{semantic.surface-hover}"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.mono-micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    height: 20px
  worktree-session-item-row:
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
    backgroundColor: "{semantic.surface-elevated}"
    border: "1px solid {semantic.hairline}"
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
    rounded: "{rounded.full}"
    trackInactive: "{semantic.hairline-strong}"
    trackActive: "{semantic.accent-toggle-active}"
  stepper-input:
    backgroundColor: "{semantic.surface-panel}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.sm}"
    typography: "{typography.mono-code}"
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

## Overview

Tethys is a local desktop control plane engineered for running, supervising, and checkpointing autonomous ACP (Agent Client Protocol) coding agents across multiple parallel git worktrees.

Instead of managing a deep, multi-pane filesystem tree, Tethys organizes development through a **Tabular, Workspace-Centric** paradigm that expands into a four-region IDE shell (`UI-01`):
1. **Activity Rail (48px)**: Anchors system states (Workspaces, New Thread, Settings).
2. **Window Header & Tab Strip (40px)**: Manages concurrent execution threads across multiple repositories.
3. **Workspace Catalog Hub**: A Railway-inspired card grid split into **Local** (folders on this machine) and **Remote** (SSH, container, or cloud-hosted folders). That split is orthogonal to version control: a workspace is `git + remote`, `git local-only`, or `no VCS`, in any combination with Local/Remote, and the card renders accordingly (`workspace-source-badge`, `worktree-topology-canvas`).
4. **Thread Shell**: `Rail/Hub | Sessions | Stage/Inspector | Action Bar/Composer` with tokenized splitters and a `Ctrl/Cmd+K` palette.

## ACP Terminology (normative)

Tethys is an ACP **Client**. Three tiers, and no other use of the word "agent" in this document or in component copy (see `docs/pages-views-spec.md` §0):

* **Provider** — one ACP connection, which the protocol itself calls an "Agent" (Claude Code, Codex, OpenCode, custom ACP server). One persistent connection per enabled Provider, negotiated with `initialize` and, when advertised, `auth/login`. Connections are isolated: one failing never degrades the others, so aggregate health chrome (rail daemon dot, `provider-row` dots) is per-Provider, never all-or-nothing.
* **Workspace** — one directory (`cwd`), rendered as a `workspace-card`. A single Workspace can host concurrent Sessions from *different* Providers; Provider and Workspace are orthogonal, not nested.
* **Session** — one `session/new` conversation bound to exactly one Provider + one Workspace. A Tethys "thread" (tab, `session-list-row`) is the UI wrapper around one Session.

Copy rule: counts read `2 sessions` (naming Providers where it matters), never `2 agents active`. `Provider` labels appear in the selector and settings; `Session` labels appear in the hub, tabs, and the sessions column.

The visual style is **Precision Monochromatic**: stepped zinc surfaces, dot-matrix canvas accents, `1px` hairlines, and typography/icons executed entirely with Geist Sans, Geist Mono, and Geist Icons. **All components reference `{semantic.*}` tokens only** — raw hex lives in `primitives`/`themes` and ships as CSS vars (`--tethys-*`) for dynamic retheming.

## Theming Architecture

Two-tier contract: `primitives` (raw palette) → `semantic` interface (`surface-canvas`, `surface-elevated`, `hairline`, `text-primary`, `accent-agent-active`, …) → CSS vars. Components MUST NOT reference `primitives`, `themes`, or hex.

* **Default Dark (Obsidian Zinc)**: current shipped values verbatim (`canvas #09090b`, `elevated #18181b`, `hairline rgba(255,255,255,0.08)`, …). Source of truth for dark contrast.
* **Default Light (Clean Zinc/Slate, confirmed)**: `canvas #fafafa`, `rail/elevated/card #ffffff`, `panel/nested #f4f4f5`, `hairline rgba(0,0,0,0.08)`, `hairline-strong #d4d4d8`, `text #18181b/#3f3f46/#71717a`, `sunken #18181b` (terminal stays dark), accents darkened for contrast (`agent-active #0284c7`, `success #059669`, `warning #d97706`, `danger #dc2626`), scrim `rgba(0,0,0,0.30)`.
* **User Custom Themes (JSON only)**: manifest `~/.tethys/themes/<id>.json` (or repo-scoped). Schema: `{ id, name, base: "default-dark"|"default-light", vars: { <semantic>: <hex|rgba> }, meta: { author, version } }`. Missing keys inherit from `base`; unknown keys are errors; invalid file keeps current theme + toast.
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
- **Canvas Base** (`{semantic.canvas}` — dark `#09090b` / light `#fafafa`): Default background for empty states and canvas containers.
- **Surface Rail** (`{semantic.surface-rail}` — dark `#09090b` / light `#ffffff`): Activity rail and window chrome.
- **Surface Card** (`{semantic.surface-card}` — dark `#111114` / light `#ffffff`): Workspace card body in the catalog view.
- **Surface Card Hover** (`{semantic.surface-card-hover}` — dark `#15151a` / light `#f4f4f5`): Raised card state on pointer interaction.
- **Surface Elevated** (`{semantic.surface-elevated}` — dark `#18181b` / light `#ffffff`): Active tabs, popovers, prompt containers, and active segmented buttons.
- **Surface Overlay** (`{semantic.surface-overlay}`): Command palette and modal sheets (elevated tone per theme).
- **Surface Sunken** (`{semantic.surface-sunken}` — `#18181b` both themes): Terminal wells, diff viewer, code wells; always dark for ANSI stability.
- **Surface Nested** (`{semantic.surface-nested}` — dark `#121215` / light `#f4f4f5`): Accordion interior, thought blocks, tool accordions.
- **Dot Matrix Grid** (`{semantic.grid-dot}` — dark `rgba(255,255,255,0.12)` / light `rgba(0,0,0,0.12)`): 1px circular grid dots spaced at 12px intervals inside workspace cards.

### Dividers & Accents
- **Hairline** (`{semantic.hairline}` — dark `rgba(255,255,255,0.08)` / light `rgba(0,0,0,0.08)`): 1px borders surrounding cards, tab borders, panel dividers, popover frames, and provider row separators.
- **Hairline Strong** (`{semantic.hairline-strong}` — dark `#27272a` / light `#d4d4d8`): Used for search input strokes, active selection rings, toggle inactive tracks, and drawer borders.
- **Accent Agent Active** (`{semantic.accent-agent-active}` — dark `#38bdf8` / light `#0284c7`): Electric sky indicator signaling live ACP streaming, active process execution, or an active agent session (`status-active-session` alias).
- **Accent Focus** (`{semantic.accent-focus}` — `#3b82f6` both): Keyboard focus boundaries and toggle active track (`accent-toggle-active` alias).
- **Health States**: `{semantic.status-danger}` (dark `#ef4444` / light `#dc2626`, CLI missing), `{semantic.status-warning}` (dark `#f59e0b` / light `#d97706`, disabled/unauthenticated), `{semantic.status-success}` (dark `#10b981` / light `#059669`, healthy handshake). Reserved strictly for provider/agent health; never for decorative chrome.
- **Overlay Scrim** (`{semantic.overlay-scrim}` — dark `rgba(0,0,0,0.50)` / light `rgba(0,0,0,0.30)`): Dismiss layer behind modal popovers and narrow-window drawers. No blur.

## Typography

The interface relies exclusively on **Geist Sans** for UI hierarchy, **Geist Mono** for telemetry/git/paths, and **Geist Icons** for all glyphs (no emoji, no mixed sets).

| Token | Family | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `{typography.display-lg}` | Geist Sans | 28px | 600 | 1.3 | Centered prompt header ("What are we building today?") |
| `{typography.heading-lg}` | Geist Sans | 20px | 600 | 1.4 | View title ("Workspaces") |
| `{typography.heading-md}` | Geist Sans | 15px | 600 | 1.4 | Workspace card repo title, drawer headers |
| `{typography.body-md}` | Geist Sans | 14px | 400 | 1.5 | Chat messages, primary prompt input |
| `{typography.body-sm}` | Geist Sans | 13px | 400 | 1.4 | Tab labels, secondary descriptions |
| `{typography.label-md}` | Geist Sans | 12px | 500 | 1.4 | Segmented control buttons, filter toggles |
| `{typography.label-sm}` | Geist Sans | 11px | 500 | 1.3 | Service badges, metadata tags |
| `{typography.mono-code}` | Geist Mono | 12px | 400 | 1.5 | CLI logs, stdout/stderr streams, git hashes, stepper numbers, provider status subtext, diff stats |
| `{typography.mono-micro}` | Geist Mono | 11px | 500 | 1.3 | Hotkey pills, `worktree-session-item` chip/row labels, branch names, port numbers, telemetry (`Checked 1m ago`), health latency badges |

## Iconography (Geist Icons, Decided)

* **Set**: Geist Icons exclusively (`{icons.set}`). Vendor logos (GitHub/GitLab) are the only non-Geist exception.
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

## Layout

### Prompt Orchestration Layout
The New Thread empty state (`/thread/new`) centers a `prompt-card` (`{layout.prompt-width}` wide, `{rounded.2xl}`, `{semantic.surface-elevated}`) under a `{typography.display-lg}` header ("What are we building today?"). The card composes the `session/new` call, so both of its required inputs are explicit fields.
* First field: `workspace-selector-pill` above the textarea (`workspace-source-badge` icon + name + chevron). Pre-filled from the last-active workspace or the card that opened the canvas, never silently assumed — no Session is created without an explicit `cwd`.
* Top zone: multiline textarea (`{typography.body-md}`, placeholder `Ask Anything…` in `{semantic.text-muted}`).
* Lower-left edge: `model-selector-pill` (`[Provider Icon 16px] [Provider name label-md] [config summary mono-micro] [Chevron 14px]`).
* Lower-right edge: `action-icon-button` (`32px`, `{rounded.full}`, `{semantic.surface-hover}` → `{semantic.primary}` fill once input is present).
* The `model-selector-popover` (`{layout.popover-selector}` total) anchors below the pill, left-aligned to the card, never clipping the `{layout.prompt-width}` card bounds.

### Workspace Catalog Layout
The Workspaces screen uses a responsive auto-fill card grid:
* **Header Bar**:
  * Left: Title `{typography.heading-lg}` ("Workspaces") and a Segmented Control (`Local` | `Remote`). `Local` = folders on this machine; `Remote` = SSH, containers, cloud workspaces (post-V1, shows empty state until `REM-01`). The switch says nothing about version control — VCS status is carried by `workspace-source-badge` per card.
  * Right: Omnibar Search (`Ctrl K` / `Cmd K`), `Needs attention (N)` filter chip (`approval-inbox-pill` tokens in selected state; filters the grid to cards with a pending `session/request_permission`), Sort Selector ("Recent Activity ∨"), View Mode Toggle (Grid / List), and `+` Add workspace (opens `workspace-trust-dialog`). List view reuses `worktree-session-item-row` at full width.
* **Grid Specifications**:
  * Grid type: CSS Grid with `repeat(auto-fill, minmax(320px, 1fr))`.
  * Gap: `{spacing.lg}` (16px) horizontal and vertical.
  * Padding: `{spacing.xl}` (24px) container inset.
* **Tab Persistence**: The `Workspaces` tab remains pinned as the leftmost hub tab. Spawning threads creates sibling tabs (`[ ⌗ repo / branch × ]`) to its right. The catalog state stays mounted; switching tabs never unmounts it.

### Thread Inspection Patterns
1. **Direct Chip Spawn**: Clicking any `worktree-session-item` chip on a card footer immediately spawns that worktree session into the top tab bar and switches focus to it.
2. **Workspace Peek Drawer**: Clicking the card header or dot-matrix canvas triggers a slide-over sheet (`workspace-peek-drawer`, `380px` wide) from the right window edge. It lists all active git worktrees as `worktree-session-item-row` entries (branch slug, agent pulse, turn checkpoint counter, uncommitted diff stats), plus a `+ New Thread` action. Single-click never navigates full-screen.
3. **Double-Click Primary Thread**: Double-clicking a card opens or focuses the primary / most-recent thread tab for that workspace.
4. **Overflow**: Card footers show max 2–3 chips; additional sessions collapse into a `+N more` chip that opens the peek drawer.

### Settings Surface Layout (`/settings/*`)
Full-window settings surface: a left nav column of `settings-nav-item` rows (`General`, `Providers`, `Skills & Commands`, `MCP Servers`, `Keybindings`) plus a breadcrumb (`Settings / <page>`) and a per-page header with right-cluster controls. Subpage frames:
* **General**: two-column form — color scheme, JSON theme picker, UI/Code/Terminal font pickers, OS-notification toggle, and the `Trusted Folders` list (`trusted-folder-row` per decision: path `mono-code`, `workspace-source-badge`, permission mode, date, destructive `Revoke`).
* **Providers**: single-column `provider-row` list; each row expands inline into a `provider-accordion` (`{semantic.surface-nested}`) without navigating away.
* **Skills & Commands**: category tabs (`Skills` | `Connectors` | `Plugins`) + `Yours` | `Discover` segmented control over a `skill-row` list (slug `mono-code`, `category-pill`, origin, script-trust `toggle-switch`, `•••` menu) with a `+ Add` dropdown.
* **MCP Servers**: servers × Providers matrix of `sync-grid-cell` badges (attachment semantics, see Representative Surfaces §5).
* **Keybindings**: searchable `keybinding-row` table (action, scope, `keycap-pill` combination, conflict badge) with a recorder that captures physical keydowns.

Provider login opens whichever surface the Provider's `authMethods` declares — a `login-dialog` form/URL flow, or the isolated `terminal-sheet` for CLI passthrough — never an inline row form.

### Four-Region Shell Architecture (PRD UI-01)

```
┌────┬──────────────┬──────────────────────┬───────────────────┐
│Rail│ Hub/Projects │ Sessions             │ Stage + Inspector │
│48px│ 264px → 48px │ 280px                │ flex              │
│    │              │                      │ ActionBar 56px    │
│    │              │                      │ Composer docked   │
└────┴──────────────┴──────────────────────┴───────────────────┘
```

* **Left Rail & Hub**: `48px` Geist `nav-rail` (`20px` icons, `36px` targets; top cluster Workspaces + New Thread, bottom cluster Settings + daemon health `status-dot`) + collapsible Hub list (`{layout.shell-left}` → collapsed `{layout.shell-left-collapsed}`). Hub rows: workspace icon + name (`body-sm`) + status dot. Collapse preserves rail; `Esc` never collapses while palette open.
* **Sessions Column** (`{layout.shell-threads}`): three-level grouping — Workspace → Provider → Session — using `session-group-header` rows above `session-list-row` entries (`48px`, `8px 12px`, `{rounded.sm}`): status dot + provider glyph + title/branch `mono-micro` + dirty dot + running badge (`accent-agent-active`) + turn count (`T8`) + `Fork` action. Provider sub-grouping is required, not cosmetic: one Workspace can hold Sessions from several Providers at once (see ACP Terminology). Roving `tabindex`, `Enter` focuses stage.
* **Main Stage & Turn Inspector**: flex stage for chat turns + right Inspector (`{layout.shell-inspector}`, collapsible to overlay past `<1100px`). Stage sections: messages (`turn-message`), thoughts (`thought-block`), `plan-panel`, tool calls (`tool-accordion`), inline `permission-request-card` / `elicitation-card`. Inspector sections: plan, turn telemetry, raw payloads, diff + checkpoint footer. The sessions column past `<800px` collapses to an icon strip; stage never under `560px` min-width without overlay mode.
* **Action Bar & Composer**: bottom-docked bar (`{layout.shell-actionbar}`): provider/config pill, mode pill, permissions pill (Session-scoped, defaulting to the workspace's trust-dialog choice), worktree pill, `usage-bar` (rendered only when the Provider reports token usage), queue count, `Stop`. `Stop` is two-stage: the first press is a protocol `session/cancel` and renders as a neutral pending control awaiting the `cancelled` stop reason; only after the grace window elapses does it escalate to the destructive-styled process ladder (`SIGINT → SIGTERM → SIGKILL`). Composer docked centered (`{layout.prompt-width}`) + floating variant (`560px`) inside peek/queue drawers. Fixed and floating share `prompt-card` + `composer-chip` tokens.
* **Resizers & Command Palette**: `shell-splitter` = `1px {semantic.hairline}` line + `{layout.splitter-hit}` transparent hit area; hover `{semantic.hairline-strong}`, drag `{semantic.accent-focus}`; double-click resets to token width. Palette (`command-palette`, `{layout.palette-width}×{layout.palette-height}`, Level 4, `{semantic.surface-overlay}`): input row + grouped `listbox` (commands, files, threads, actions); `Ctrl/Cmd+K` toggles, `↑↓` moves, `Enter` runs, `Esc` unstacks; sub-ms first-result target via FFF-backed `search.files`.

## Elevation & Depth

No ambient shadows are permitted. Depth is achieved strictly through tonal stepped zinc layers and 1px borders:

| Layer | Surface | Border | Role |
| :--- | :--- | :--- | :--- |
| Level 0 | `{semantic.canvas}` | None | Global canvas |
| Level 1 | `{semantic.surface-card}` | 1px `{semantic.hairline}` | Default Workspace card |
| Level 2 | `{semantic.surface-card-hover}` | 1px `{semantic.hairline-strong}` | Card hover state |
| Level 3 | `{semantic.surface-elevated}` | 1px `{semantic.hairline-strong}` | Thread peek drawer, prompt input |
| Level 4 | `{semantic.surface-elevated}` / `{semantic.surface-overlay}` | 1px `{semantic.hairline}` | `model-selector-popover`, `terminal-sheet`, palette above Level 3 |
| Nested | `{semantic.surface-nested}` | 1px `{semantic.hairline}` | `provider-accordion` interior inside a Level 0/1 settings row |
| Sunken | `{semantic.surface-sunken}` | 1px `{semantic.hairline}` | Terminal, diff viewer wells |

## Shapes

- **`{rounded.xs}` (4px)**: Status badges, `worktree-session-item` chips, `health-badge`, `protocol-pill`, git SHA tags.
- **`{rounded.sm}` (6px)**: Segmented control items, search inputs, `model-selector-pill`, `stepper-input`, `worktree-session-item-row`.
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
| `focused` | `2px` `{semantic.accent-focus}` ring + `2px` offset; never remove outline for custom controls |
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

## Components

### Prompt Components

**`prompt-card`**
* Structure: Centered column, width `680px`, background `{semantic.surface-elevated}`, radius `{rounded.2xl}`, padding `{spacing.lg}`.
* Header (outside card): `{typography.display-lg}` prompt ("What are we building today?").
* Input: Multiline textarea, `{typography.body-md}`, text `{semantic.text-primary}`, placeholder `{semantic.text-muted}`.
* Lower bar: Flex row, `space-between`; left slot is `model-selector-pill`, right slot is the submit action.

**`workspace-selector-pill`**
* Format: `[workspace-source-badge icon 16px] [Workspace name label-md] [Chevron 14px]`, metrics identical to `model-selector-pill`. Opens the same peek-style workspace picker used by the catalog.
* Pre-filled with the last-active workspace, or the card that launched the canvas. Submit stays disabled while unresolved: `session/new` always carries an explicit `cwd`.
* States: `selected` shows the resolved path as a `mono-code` tooltip; a workspace whose trust was revoked renders `destructive` and is non-selectable.

**`model-selector-pill`**
* Format: `[Provider Icon 16px] [Provider Name label-md] [Config summary mono-micro] [Chevron 14px]`, height `28px`, padding `4px 8px`, radius `{rounded.sm}`, transparent bg → `{semantic.surface-hover}` on hover, focus ring `1px {semantic.accent-focus}`.
* The config summary is whatever the selected Provider's own session-config schema returns — often model + effort, but not guaranteed to be that shape. Display examples: `[▲ Claude Code  Sonnet · Medium ∨]`, `[◈ OpenCode  gpt-5-codex ∨]`, `[◇ Codex CLI ∨]` (no configurable options).
* A field label dims to `{semantic.text-muted}` (from `{semantic.text-secondary}`) when the schema marks it unavailable for the current selection (e.g. `thought_level` absent on the chosen model). The Provider name never dims.
* Trigger: Click, `Enter`, or `Space` when focused opens the popover. `Escape` with popover closed is a no-op (focus stays in pill); with popover open, cancels and returns focus to the prompt textarea.

**`model-selector-popover` — Provider List + Schema Panel (supersedes the earlier fixed three-column flyout)**
* Container: `560px` total width, bg `{semantic.surface-elevated}`, `1px {semantic.hairline}`, radius `{rounded.md}` (Level 4 elevation). Anchored below the pill, left-aligned to the `680px` prompt card. No screen wrapping; flips above the pill only if viewport space requires.
* Two regions (macOS column-view / Raycast submenu pattern):
  * **Left — Provider `200px`** (fixed): connected ACP Providers (Claude Code, Codex, OpenCode, custom ACP server). Each row: Geist vendor icon (`16px`) + name (`{typography.label-md}`) + connection dot (`6px {rounded.full}`; `{semantic.accent-agent-active}` streaming, `{semantic.status-success}` ready/idle, `{semantic.status-warning}` `auth_required`, `{semantic.accent-agent-idle}` unreachable) + `protocol-pill` (`ACP v2`) where applicable.
  * **Right — `session-config-panel` `360px`**: renders **whatever the selected Provider's session-config schema declares**, one `schema-field-group` per field. Model + effort is the common case (Claude Code), not a Tethys-wide constant: a Provider may expose only a model list, or nothing configurable at all (panel shows the `empty` pattern: `No session options for this provider`). Field controls come from the schema's type — listbox for enums, `stepper-input` for numbers, `toggle-switch` for booleans. Long lists scroll inside the panel; the Provider column never resizes.
* **Auth gate**: a Provider that declares `authMethods` and hasn't completed `auth/login` renders `⚠` in `{semantic.status-warning}` and is not selectable. Activating it opens `login-dialog` (or `terminal-sheet` for CLI passthrough) from inside the popover; on success the row becomes selectable and the panel loads. A prompt can never submit against an unauthenticated Provider.
* Divider: `1px {semantic.hairline}` vertical between the Provider column and the panel.
* Keyboard (velocity-first):
  * `Enter` / `Space`: open selector from pill; confirm the highlighted value and close, returning focus to textarea.
  * `↑` / `↓`: move within the active column.
  * `→`: drill from the Provider column into the config panel (and between nested field lists); `←`: step back. No breadcrumb clicks required.
  * `Esc`: cancel, close popover, return focus to prompt textarea.
  * Type-ahead: printable chars filter the active column; `Tab` cycles regions (accessibility fallback).
* States: empty Provider column (`No connected providers — add one in Settings / Providers`); panel loading skeleton (3 shimmer rows, stays within panel width); handshake error row in `{semantic.status-danger}` with retry.
* Data binding: Provider column from `agent.connections.list` (+ registry profiles); panel fields from that Provider's `initialize` / session-config schema. Writes via `thread.setConfigOption`. Per `PRM-04`, the selector can only narrow within Tethys policy, never widen it.

### Workspace Components

**`segmented-control` & `segmented-item`**
* Container: Height 32px, background `{semantic.surface-panel}`, border 1px solid `{semantic.hairline}`, radius `{rounded.md}`.
* Inactive Item: Transparent, text `{semantic.text-muted}`, `{typography.label-md}`.
* Active Item (`segmented-item-active`): Background `{semantic.surface-elevated}`, text `{semantic.text-primary}`, border 1px solid `{semantic.hairline}`, radius `{rounded.sm}`.

**`workspace-card`**
* Structure: Flex column, height `220px`, background `{semantic.surface-card}`, border 1px solid `{semantic.hairline}`, radius `{rounded.lg}`. Hover → `{semantic.surface-card-hover}` + border `{semantic.hairline-strong}`.
* Top Bar: Repo/folder title in `{typography.heading-md}`, `workspace-source-badge`, favorite star icon, and a card-level `⚠` badge mirroring the highest-severity node state.
* Body: `worktree-topology-canvas` in one of two modes decided by VCS status (git-topology or single-node) — never a static centered vendor logo.
* Footer Bar: Two lines:
  * Status line: `{branch} · N sessions` in `{typography.mono-micro}` (`● N sessions` in `{semantic.accent-agent-active}` while running, `1 waiting ⚠` in `{semantic.status-warning}` when a `session/request_permission` is pending, `idle` otherwise). Never "N agents" — see ACP Terminology.
  * Session cluster: up to 2–3 `worktree-session-item-chip` pills + `+N more` overflow chip; `git-init-upsell-chip` instead of chips on a no-VCS card with no running session.
* Interactions: single-click header/body → peek drawer (opens on its `Approvals` tab when approvals are pending, otherwise `Sessions`); double-click anywhere → primary/most-recent Session tab; chip click → direct Session tab (see Layout); hover on an idle card → `+ New Thread` overlay button inside the canvas. Card never performs full-window navigation.
* Disabled affordance: on a single-node card that already has a running Session, `+ New Thread` is `disabled` with the tooltip `This folder isn't version-controlled, so only one agent can run here at a time. Initialize git to run threads in parallel.`

**`workspace-source-badge`**
* Format: `[glyph 12px] [label label-sm]` on `{semantic.surface-hover}`, radius `{rounded.xs}`. Values: `Git · GitHub`, `Git · GitLab`, `Git · local` (initialized, no remote), `Folder · no VCS`. A secondary `Remote` tag appends for folders on an SSH/container host.
* Vendor logos (GitHub/GitLab) are the sanctioned non-Geist exception; the folder and local-git glyphs are Geist.

**`worktree-topology-canvas` — Two Modes (VCS-dependent)**
* Shared: inset canvas, dot-matrix background (`{semantic.grid-dot}`, 1px dots at 12px intervals), radius `{rounded.md}`. Every node carries a provider glyph (`{icons.sizes.micro}`) because one Workspace can run concurrent Sessions from different Providers.
* Node color encodes Session state: `{semantic.accent-agent-active}` pulse = running, `{semantic.status-warning}` pulse = waiting on approval, `{semantic.grid-dot}` outline = idle worktree, `{semantic.status-danger}` = errored/blocked turn. Pulse respects `prefers-reduced-motion` and window focus.
* **git-topology mode** (folder is git-initialized): trunk node (`main`) plus one branch node per active Session, joined by `1px {semantic.hairline-strong}` edges.
* **single-node mode** (no git): one centered node, same color coding — a plain folder has no worktree mechanism to isolate parallel Sessions, so there is only ever one Session to draw. Upgrading via `git-init-upsell-chip` hot-swaps the canvas to git-topology in place, without navigating away.

**`git-init-upsell-chip`**
* Footer chip on no-VCS cards only: `Initialize git →`, chip metrics identical to `worktree-session-item-chip`. Runs `git init` + an initial commit of the folder's current state in place, then swaps the canvas mode. `loading` state uses the standard skeleton pulse; failure surfaces a toast and leaves the card in single-node mode.

**`workspace-trust-dialog`** (`modal-dialog`, `480px`, Level 4, focus-trapped)
* Adding a workspace and trusting it are one flow: no card exists and no Provider process is spawned against a folder until trust is granted.
* Header: shield glyph + `Trust this folder?`. Path row: resolved absolute path, home-shortened (`~/dev/vocasia-next`), `{typography.mono-code}`. `workspace-source-badge` echoed inline so the decision is made with full context.
* Body copy branches by source: local git-tracked (worktree isolation available), local no-VCS (single-thread cap + inline `Initialize git now` checkbox), remote (extra line in `{semantic.status-warning}`: commands run directly on `{host}`, no sandbox).
* Controls: permission-mode radio (`Supervised` default / `Auto-approve reads` / `YOLO`), trust-scope checkbox (`Just this folder` default vs `This folder and subfolders opened later`), footer `Cancel` (secondary) / `Trust & Add Workspace` (primary, disabled until a path resolves).
* The chosen mode becomes the local policy for resolving every `session/request_permission` from that Workspace's Sessions. It is not a vendor-prompt suppressor: ACP routes all tool-call consent through the Client, so there is no second CLI prompt to de-dupe. A Provider's one-time `auth/login` is a separate, earlier step (`login-dialog`).
* Re-prompts when the resolved path or git remote changes underneath a trusted entry. Decisions are listed and revocable in `Settings / General` (`trusted-folder-row`).

**`worktree-session-item` — Single Component, Two Density Variants (Decided)**
* Shared data schema (token parity, both variants bind the same fields): `provider_id` (leading provider glyph), `branch_name`, `session_status` (`running | idle | awaiting | error`), `turn_count`, `diff_stats` (`+added -removed`), `has_uncommitted`.
* **Variant A — `chip` (card footer, inactive previews)**: Inline-flex pill, height `20px`, padding `2px 8px`, radius `{rounded.xs}`, bg `{semantic.surface-hover}`, label `{typography.mono-micro}` in `{semantic.text-secondary}`. A chip with a pending permission request renders a `1px {semantic.status-warning}` outline in place of the default hairline. Hover: bg `{semantic.surface-active}`, text `{semantic.text-primary}`. In single-node mode the cluster collapses to one unnamed session chip (no branch name exists). Overflow chip (`+3 more`) uses identical metrics and opens the peek drawer. Legacy alias: `thread-chip`.
* **Variant B — `row` (peek drawer, list view)**: Full-width flex row, height `36px`, padding `6px 12px`, radius `{rounded.sm}`, transparent bg → `{semantic.surface-hover}` on hover. Contents left→right: agent pulse dot (`6px`; `{semantic.accent-agent-active}` running, `{semantic.status-success}` idle, `{semantic.status-warning}`/`{semantic.status-danger}` for awaiting/error), branch slug (`{typography.mono-micro}`), turn checkpoint counter (`T12`), diff badge (`+42 −12` in `{typography.mono-micro}` muted), trailing checkpoint rollback button (Geist icon-only, appears on hover/focus). Disabled state (non-git folder or explicit-`plain` workspace, `WT‑11`): diff badge and rollback hidden, row shows `no git · no revert` subtext.
 * Keyboard: chips and rows are `button`/`option` roles; `Enter` activates, arrow keys move within the cluster/list.

**`workspace-peek-drawer`**
* Container: `380px` wide slide-over from the right window edge, bg `{semantic.surface-elevated}`, left border `1px {semantic.hairline-strong}` (Level 3). Header: workspace title (`{typography.heading-md}`) + `workspace-source-badge` + close `×`. Tabs: `Sessions` (default) and `Approvals` (opened directly when the workspace has pending requests). Sections: active Session rows (`worktree-session-item-row`) grouped by Provider, turn checkpoint counters, uncommitted diff stats, footer `+ New Thread` action (disabled per the single-node concurrency gate).
* Motion: `{motion.base} {motion.easing}` translate; scrim `{semantic.overlay-scrim}` only on narrow windows, otherwise modeless (catalog stays interactive).
* Focus: moves into drawer on open, returns to invoking card on close; `Esc` closes.

### Provider Components (Settings / Providers)

**Page frame**
* Header left: breadcrumb `Settings / Providers` (`{typography.label-md}` muted) + title `Providers` (`{typography.heading-lg}`).
* Header right cluster: telemetry label (`Checked 1m ago` in `{typography.mono-micro}` muted) + `+ Add Custom ACP Server` button + `↻ Manual Health Check` icon button + health-check interval `stepper-input` (`[−] 300 [+] seconds`) with info tooltip. `0` disables background pinging (label switches to `Manual only`).
* List: single column of `provider-row` entries separated by `1px {semantic.hairline}` bottom borders. No card chrome per row — ACP-first registry density (T3-style).

**`provider-row`**
* Container: padded flex row (`12px 16px`), bottom separator `1px {semantic.hairline}`.
* Status indicator (`8px {rounded.full}` dot):
  * `{semantic.status-danger}`: CLI binary not found or missing from `$PATH`.
  * `{semantic.status-warning}`: provider detected but disabled or unauthenticated.
  * `{semantic.status-success}`: healthy, ACP handshake verified, CLI on path.
  * `{semantic.status-active-session}`: active agent session currently running (overrides green while leased).
* Identity: vendor/engine icon (16px) + title (`{typography.heading-md}`) + optional `protocol-pill`s (`ACP v2`, `Early Access`, adapter name in `{typography.label-sm}`).
* Status subtext: monospace detail string (`{typography.mono-code}` in `{semantic.text-muted}`), e.g. `Not found — Codex CLI ('codex') is not installed or not on PATH`.
* Telemetry badges (`health-badge`, `SYN-09` slot): `12ms` ping latency + handshake protocol pill, in `{typography.mono-micro}` muted. Shown when last check succeeded; hidden on `Not found`.
* Trailing controls: expandable chevron (`∨`, rotates 180° when open) toggling the accordion + `toggle-switch` for instant active/inactive runtime switch. Chevron and toggle are separately focusable; `Space` toggles, `Enter` expands.

**`provider-accordion` (inline in-app configuration)**
* Container: nested surface `{semantic.surface-nested}` with `1px {semantic.hairline}` border, radius `{rounded.md}`, padding `{spacing.lg}`. Slides down under its row.
* Motion: `{motion.fast} {motion.easing}` expand/collapse (grid-rows animation) with zero layout shift — sibling rows translate, never reflow text; content fades after 100ms.
* Sections (vertical rhythm `12px` gaps, preserved for future schema forms):
  1. **Executable Path Override**: text input + `Browse…` file picker. Placeholder e.g. `/usr/local/bin/claude` or `npx @cursor/agent`. Validation error in `{semantic.status-danger}` mono-micro.
  2. **Protocol & Mode**: select between `ACP v1` | `ACP v2` | `CLI Subprocess Wrapper`. Disabled options show `Unsupported by this binary` hint.
  3. **Environment & Flags**: key-value pair manager (rows of `KEY = value` inputs + remove `×`, `+ Add variable` affordance). Values never echo secrets in plain text; secret refs render as `keychain:tethys/…`.
  4. **Authentication Action (`login-dialog`, spelled `LoginDialog` in the pages spec; adapts to declared `authMethods`)**: the control renders whatever that Provider's `initialize` response advertises, not a fixed PTY login. Env-var method → key/value form inside `login-dialog`; URL method → `Sign in with {Provider} →` link plus a code-confirmation field with a visible countdown (implementations commonly expire around `300s`, shown in `{typography.mono-micro}`); CLI-passthrough method → isolated `terminal-sheet` running the vendor's own command (`claude login`, `codex auth`). A Provider declaring no `authMethods` hides this control entirely — there is nothing to log into. Per `G7` Credential Principle, Tethys never reads or caches vendor tokens; forms and sheets are input-only, and `Close` returns focus to the invoking control. On success the row's dot flips amber → green and the Provider becomes selectable in `model-selector-popover`.
  5. **Negotiated capabilities + `SYN-09` health slot**: `schema-field-group` of read-only rows from this Provider's `initialize` result — `session/resume` (yes/no; when no, that Provider's Sessions rely entirely on Tethys's local transcript cache, and `Fork` degrades to a summarized `session/new`), `MCP transports` (`stdio` / `sse` / `http`), `elicitation` (yes/no), `Last check`, `Latency`, `Detected version` — bound to `agent.connections.list` / `mcp.health`. This is what turns "Healthy — ACP handshake verified" into something actionable, since resume, MCP attachment, and elicitation all vary per Provider. MVP renders negotiated values plus static health; V1 wires live re-check without changing container tokens.
  6. **`SYN-11` Native-settings slot (entry point now, runtime post-MVP)**: reserved `schema-field-group` with header `Native config (full file)` + `Open schema form` button + `View raw` link. Container, padding, and toggle/input tokens are final now so a future TanStack Form generated from the vendor JSON schema (the first full-support agents: OpenCode, Antigravity CLI, Kiro CLI; Claude Code and Codex native forms post-MVP) drops in without altering vertical rhythm. Includes version-drift warning banner slot and `Preview diff / Rollback` action row (bound to `agent.config.plan/apply/rollback`).

**`toggle-switch`**
* Metrics: track `32px × 18px`, thumb `14px` circle, radius `{rounded.full}`. Inactive track `{semantic.hairline-strong}`; active track `{semantic.accent-toggle-active}`; thumb `{semantic.primary}` always. `{motion.fast} {motion.easing}` thumb slide + track fade.
* Behavior: instant runtime enable/disable; focus ring `accent-focus`; `Space` toggles; `aria-checked` bound to profile enabled state.

**`stepper-input`**
* Structure: joined button group `[−] [input] [+]` on `{semantic.surface-panel}` with `1px {semantic.hairline}` outer border, radius `{rounded.sm}`. Numbers in `{typography.mono-code}` tabular. Buttons `24px` hit targets, hover `{semantic.surface-hover}`.
* Semantics: seconds between background health pings; `0` = disabled (`Manual only`); clamp `0–3600`; invalid input reverts with tooltip.

**`terminal-sheet`**
* Isolated interactive terminal overlay for vendor login: bg `{semantic.surface-overlay}`, `1px {semantic.hairline-strong}`, radius `{rounded.lg}`, xterm.js surface on `{semantic.surface-sunken}`. Title shows the exact command being run. No copy-out of secrets; close returns focus to `Launch Vendor Login`.

### Shell Components

**`shell-splitter`**
* Visual `1px {semantic.hairline}` + `{layout.splitter-hit}` transparent hit area; hover `{semantic.hairline-strong}`, drag `{semantic.accent-focus}`; `separator` role with `aria-valuenow` width; double-click resets to `{layout.*}` token.

**`command-palette`**
* Container `{layout.palette-width}×{layout.palette-height}`, `{semantic.surface-overlay}`, `1px {semantic.hairline}`, `{rounded.lg}` (Level 4). Input row (`body-md`, Geist search `16px`) + grouped `listbox` rows (`36px`, `mono-micro` hints, `Enter` runs). Empty → `No results` empty pattern; loading → skeleton rows.

**`session-list-row`** (legacy alias: `thread-list-row`)
* `48px`, `8px 12px`, `{rounded.sm}`, transparent → hover `{semantic.surface-hover}` → selected `{semantic.surface-active}` + accent bar. Contents: `status-dot` + provider glyph (`12px`) + title/branch (`body-sm`) + branch (`mono-micro` muted) + turn count (`T8`, `mono-micro`) + dirty dot (`status-warning`) + running badge (`accent-agent-active` pulse) + `Fork` icon action on hover/focus. `M1.7/M1.8` event models feed state; `UI-02` states map to dots.
* Grouping: `session-group-header` rows nest Workspace → Provider above the Session rows. Collapsing a Workspace header collapses its Provider groups; roving `tabindex` spans the flattened visible list.
* `Fork` opens a new Session on the same Provider + Workspace — `session/resume` with `replayFrom: start` where the Provider supports it, otherwise a fresh `session/new` seeded with the transcript summarized into the first message. The row's tooltip states which path applies, read from the Provider's negotiated capabilities.

**`status-dot`**
* One shared dot for every state surface (rail daemon health, hub rows, session rows, provider rows, topology nodes): `8px` standalone / `6px` inline, `{rounded.full}`. `UI-02` mapping: `Idle` → `accent-agent-idle`, `Running` → `accent-agent-active` (pulse), `Awaiting approval` → `status-warning` (pulse), `Error` → `status-danger`, `Interrupted` → `text-muted`, `Suspended` → `hairline-strong`, `Archived` → `hairline`. An unrecognized state renders the neutral idle dot rather than failing.

**`approval-inbox-pill`**
* Tab-strip pill `Waiting on you (N)` with a `{semantic.status-warning}` pulse dot and `mono-micro` count; hidden entirely at zero. Click slides out the `approval-queue-drawer` without interrupting the active conversation. The hub's `Needs attention (N)` filter chip reuses these tokens in `selected` state — same component, different placement.

**`tab-item`**
* `[Icon] [repo / branch] [×]`, `28px`, `{rounded.md}`, transparent → active `{semantic.surface-elevated}`. The Workspaces hub tab is pinned at index 0 and has no close affordance. Switching tabs never unmounts background streams or uncommitted diff state; `Ctrl/Cmd+1..9` jumps directly.

## Representative Surfaces (D0)

All layouts use `{semantic.*}` only; API states marked with `→ API`.

1. **Turn Inspector** (`UI-04`, `M1.7`): stage column of `turn-message` (`body-md`, streamed markdown worker) → collapsible `thought-block` (`surface-panel`, chevron, muted) → `plan-panel` → `tool-accordion` rows (`surface-nested`): header (Geist tool icon + name + `status-dot`), body (command line `mono-code`, input JSON collapsible, stdout on `surface-sunken` with cap + `View full` → blob), footer per-turn `View diff / Restore to before this turn` (`WT-03/04` → `git.checkpoint.*`, `diff.summary`). Turn states: `Running` (sky pulse) / `Idle` / `RequiresAction` (amber) / `Error` (danger + retry) / `Interrupted` (muted + resume).
   * `plan-panel` renders the Provider-reported plan (`session/update` plan notification) as a checklist with pending / in-progress / completed steps and a `(3/5 steps)` header count. It is optional per Provider: hidden entirely when a Provider never sends one, never shown empty.
   * `tool-accordion` cards are keyed by `toolCallId` and show `kind` (read/edit/execute/…) + `status` (pending/in_progress/completed/failed); `tool_call_update` notifications patch the existing card in place rather than appending a new one.
   * `elicitation-card` handles a Provider asking for structured input mid-turn (`elicitation/create`): a small inline form generated from the requested schema, using `schema-field-group` rhythm. Distinct from a permission request — it collects data, it does not authorize a tool call. Providers that don't declare `elicitation` never render it.
   * **History vs live**: reopening a Session always renders full history from Tethys's own local transcript cache, independent of whether the Provider supports `session/resume`. When resume is unavailable, cached turns render above the new live turns under a `1px {semantic.hairline}` divider labelled `Earlier history (read-only)` in `{typography.label-sm}` muted, so a fresh `session/new` never looks like lost history.
   * **Capability-driven revert**: `Revert Turn` and its diff/stage affordances render only when the folder is git-initialized and the session supports restore; otherwise they hide behind a `no git · no revert` explanation (`snapshot-mode-tag` tokens). Git is a feature, not enforcement — no app-managed snapshot fallback in MVP.
2. **Permission Requests & Global Inbox** (`UI-03`, `PRM-01..04`, `M1.8`): persistent `approval-inbox-pill` in the tab-bar (`status-warning` dot, `mono-micro` count; zero state hidden). Every request appears twice from one source of truth: inline in the stage as a `permission-request-card` at the point it was requested, and mirrored in the `approval-queue-drawer` (`{layout.drawer-queue}`).
   * `permission-request-card` (`surface-card`, title `heading-md`, command/diff excerpt `mono-code`, affected paths): **buttons are generated from the Provider's own `options` array on the `session/request_permission` call** — commonly `Allow once` / `Allow always` / `Reject`, but Tethys renders whatever that Provider sends, including custom option kinds and counts. There is no hardcoded Approve/Reject pair, and no fixed button order beyond rendering the Provider's own ordering; an option whose kind marks it as rejecting uses destructive tokens.
   * Auto-resolution: in `Auto` / `YOLO` mode Tethys picks a matching option itself per the Workspace's `workspace-trust-dialog` policy and renders the card in a resolved, read-only state showing which option was auto-picked and why. Policy can only narrow, never widen, what an agent mode would allow.
   * Distinct control: this card authorizes a tool call *before* it runs. `Approve & Commit` in the review surface is Tethys's own post-hoc git staging step on a finished turn's diff — the two are never merged into one affordance.
   * OS notification mirrors inbox count → `permission.respond/rules.*`.
3. **Diff & Review Viewer** (`WT-04/05`, `M1.9`): `diff-viewer` well (`surface-sunken`, `mono-code 12px`) with unified/split segmented toggle (scroll anchor preserved), per-file headers (path + `+a −b` + stage toggle) and per-hunk `Stage/Discard` (discard = destructive) + per-turn `Revert` (undoable restore point; hidden with a `no git · no revert` explanation via `snapshot-mode-tag` tokens when the folder has no git history or the session can't restore). Commit box: input + `Draft with agent` → synthesized message preview (`body-sm` muted) → `git.stage/unstage/discard/commit`; the primary action is `Approve & Commit`, which is Tethys's own post-hoc staging step and never reuses `permission-request-card` copy. Large diffs collapse past `1MB`/`20k` lines with `Load file` affordance.
4. **Full Composer + thread-new selector** (`CMP-01..05`, `M1.10`): docked `prompt-card` + `composer-chip` pills: `/` Tethys command (filename = name, `{{args}}` fill) vs. `/agent:name` clash rendering; `$` skill chip with method badge (`native` = instruction + link vs. `inline` = embedded); `@` path chip (FFF `search.files`, sub-ms target, `path:line` echo, sends reference never contents). Queue states: queued/editable/reorderable/persisted (`thread.queue.*`); sending while running appends without interrupting stream. Same chunk owns the `/thread/new` Provider + session-config selector and the `session/new` composition (explicit `cwd` + workspace `mcpServers`).
5. **MCP Attachment Grid & Trust Settings** (`SYN-01..07`, `M1.11`): servers × Providers matrix of `sync-grid-cell` badges. For an ACP-native Provider, Tethys does **not** project MCP config into vendor files — it attaches the relevant servers as the `mcpServers` array on each `session/new` for that Workspace, so the matrix reads "which servers get attached to new Sessions in which Workspaces". Cell states: `Attached {status-success}` (will be passed on the next `session/new` for that Provider + Workspace pair), `Unsupported transport {status-warning}` (the Provider's `mcpCapabilities` doesn't accept this server's transport), `File projection {semantic.surface-hover}` (compatibility fallback for a Provider that can't accept `mcpServers` at session creation). Servers can be attached globally or scoped to specific Workspaces. Server cards carry name, transport (`stdio` / `sse` / `http`, matching ACP's declared transports), command, args, env.
   * Vendor-file projection is a fallback path only, and only there do the projection states apply (`pending` muted / `drifted {status-warning}` / `conflict {status-danger}`) along with the `Preview diff → Apply → Rollback` action bar (`mcp.projection.plan/apply/rollback`). Attachment needs no apply step — it takes effect at the next session start.
   * Also on this surface: import wizard (detect → preview → apply); `skill-row` entries with script-trust toggle (untrusted excluded from YOLO, `SYN-07`). Secrets render as `keychain:…` refs only.
6. **Agent Profiles & Monitoring** (`AGT-01/07`, `MON-01`, `M1.12/M1.13`): `profile-card` (icon + name + version pin + `Update available` pill + `Install/Update` button → `agent.registry.*`); launch-spec editor (exec/protocol/env, same tokens as provider accordion); `Login` (`login-dialog` / `terminal-sheet` per declared `authMethods`, `G7`), `Restart`, `View stderr` (sunken well). Activity table of `process-row`s: `PID, CPU%, RSS, uptime, state` + the cancellation ladder → `agent.connections.*`, supervisor sampling. The ladder is presented as two layers, matching the runtime: `session/cancel` is the protocol-level interrupt and renders neutral while awaiting the `cancelled` stop reason; `SIGINT → SIGTERM → SIGKILL` is the fallback for a subprocess that misses the grace window and only takes destructive styling once that window has actually elapsed.
7. **Terminal & Onboarding** (`M1.14`, Class C): Class C interactive PTY `terminal-sheet` (full xterm, `surface-sunken`, resize/reflow correct, workspace-only per `WorkspaceOnlyConnection`, no output parsing) vs. headless stream viewer (read-only snapshot + tail, `mono-code`). Onboarding zero-state: 3 `onboarding-step` cards (`surface-card`, `24px` hero Geist icon, `heading-md` + `body-sm` + action): `Add repository → Install agent → Start first thread`; progress persists; skip returns to catalog empty state.
8. **Workspace Add & Trust** (`workspace-add-flow`, `workspace-trust-dialog`; `M1.16`, `TRU‑01`): native folder picker (local) or remote path + existing SSH/container connection picker → path resolution and source detection → `workspace-trust-dialog` → card creation. No `workspace-card` and no Provider process exists for an untrusted path. Trust records (path + host id, permission mode, timestamp, scope) render as `trusted-folder-row` entries in `Settings / General` with a destructive `Revoke` that removes the card and requires re-trusting through the same dialog.
9. **General & Keybindings Settings** (`SET‑01`/`KEY‑01`; `M2.14`; `Trusted Folders` list alone ships in `M1.16`): `Settings / General` two-column form — color scheme, JSON theme picker (hot-swap `<50ms`), UI/Code/Terminal font pickers (default Geist Sans / Geist Mono), OS-notification toggle, `Trusted Folders` list. `Settings / Keybindings` — searchable `keybinding-row` table (action `body-sm`, scope `Global | Editor | Terminal`, `keycap-pill` combo, conflict badge in `{semantic.status-warning}`) with a recorder input that captures physical keydown events and saves to instant global dispatch.

## Styling & Token Rules

* **Font stack**: `Geist Sans` for all structural UI labels (titles, pills, buttons, segmented items, provider names). `Geist Mono` for branch names, `worktree-session-item` labels, diff stats (`+42 −12`), hotkeys, telemetry, stepper numbers, and status subtext. `Geist Icons` for all glyphs. Never swap.
* **Backgrounds**: `{semantic.canvas}` global, `{semantic.surface-rail}` chrome, `{semantic.surface-elevated}`/`{semantic.surface-overlay}` for prompt/popover/drawer/palette/sheets, `{semantic.surface-card}` cards, `{semantic.surface-nested}` accordion, `{semantic.surface-sunken}` terminal/diff wells. No other fills.
* **Dividers**: strictly `1px solid` `{semantic.hairline}`, with `{semantic.hairline-strong}` only for input strokes, toggle tracks, and drawer borders. No shadows for depth — tonal steps + hairlines only.
* **Accents**: general chrome entirely monochromatic. Color accents restricted to `{semantic.accent-agent-active}`/`{semantic.status-active-session}` streaming/running, `{semantic.status-success}` healthy/idle-ready, `{semantic.status-warning}` / `{semantic.status-danger}` health warnings, `{semantic.accent-focus}` focus + toggle-active. Effort labels, chips, and badges never use accent color except the running pulse dot.
* **Density**: settings rows `12px 16px`; accordion sections `12px` gaps; drawer rows `36px`; chips `20px`. `SYN-11` schema forms must reuse `schema-field-group` spacing so static MVP inputs and generated V1 forms share rhythm.

## Data Bindings (PRD / Architecture reference)

| UI | Reads | Writes |
| :--- | :--- | :--- |
| Selector provider column | `agent.connections.list`, registry profiles (`AGT-01/02`), negotiated `initialize` result | — |
| `session-config-panel` | that Provider's own session-config schema (§7.2); shape varies per Provider | `thread.setConfigOption` (narrowed by policy, `PRM-04`) |
| Catalog cards / drawer | `project.list/status`, `thread.list` (Sessions grouped by Provider), `git.worktree.*`, `checkpoint.*`, diff summary, VCS status per folder | `thread.create` (explicit `cwd` + workspace `mcpServers`; own worktree default, `WT-01`), `git.init` (upsell chip), `thread.fork` (V1) |
| Workspace add / trust | trust store by resolved path + host id (mode, scope, timestamp) | `project.add` gated on trust grant; revoke removes the card (`M1.16`, `TRU‑01`) |
| Shell sessions/inspector | `events.subscribe {sinceSeq}`, `entries` materialized, `turns`, local transcript cache (independent of Provider `session/resume` support) | `thread.prompt/queue.*/cancel/resume` |
| `plan-panel` | `session/update` plan notifications (optional per Provider) | — |
| Permission requests / inbox | `events` permission requests **including the Provider's `options` array**, `permission.rules.*` | `permission.respond` (selected option id), OS notify |
| `elicitation-card` | `elicitation/create` request schema (Providers declaring `elicitation`) | elicitation response (`M1.7`) |
| `usage-bar` | Session token usage as reported by the Provider (`MON-03`; hidden when unreported) | — (values land in `M2.10`; `M1.6` reserves the Action Bar slot and renders nothing) |
| Diff/review | `git.diff.summary/file`, `checkpoint.*` | `git.stage/unstage/discard/commit` |
| Composer `/ $ @` | `commands.list`, `search.files`, skill strategy | `commands.expand`, `thread.queue.*` |
| MCP attachment / skills | `mcp.registry/effective` (per Workspace), Provider `mcpCapabilities`, `skills.list` | attach via `mcpServers` on `thread.create`; `mcp.projection.plan/apply/rollback` on the fallback path only; `skills.trust/enable` |
| Profiles/monitor | `agent.profiles/registry/connections.*`, process sampling | `agent.registry.install/update`, `connections.restart`, `agent.login` |
| Terminal/onboarding | `terminal.list/attach`, `project.list` | `terminal.write/resize`, `project.add` |
| Provider rows | `agent.profiles.*`, `agent.connections.list`, `mcp.health` (`SYN-09`) | toggle → profile enable; stepper → health interval; exec/protocol/env → launch spec |
| Provider accordion | `agent.config.schema/get/validate` (`SYN-11`), negotiated capabilities (`session/resume`, MCP transports, `elicitation`), declared `authMethods` | `agent.config.plan/apply/rollback`; login via `agent.login` in `login-dialog` or `terminal-sheet` per method (`AGT-07`, `G7`) |
| General / keybindings settings | theme manifests, font list, trust store, shortcut table | theme id, font prefs, notification toggle, shortcut rebind (`M2.14`; trust list alone in `M1.16`) |
| Non-git workspaces | VCS status per folder + explicit `isolation: plain` opt-out (`WT-11`) | `git init` upsell (convenience, `M1.16`); revert/diff/stage UI hidden with a `no git · no revert` explanation when unavailable — no snapshot fallback in MVP |

## Do's and Don'ts

### Do
* Segment workspaces cleanly into `Local` and `Remote` to avoid mixing local worktrees with SSH/container agents.
* Retain the top tab bar: open threads directly into persistent tabs while keeping the `Workspaces` hub intact.
* Use dot-matrix backgrounds inside catalog cards to provide visual depth without adding heavy assets.
* Keep all card and panel boundaries to a crisp 1px `{semantic.hairline}`.
* Reference `{semantic.*}` exclusively in components; put raw values in `primitives`/`themes` and ship JSON manifests for custom themes.
* Use Geist Icons at `12/16/20/24px` with `28/32/36px` targets and `1.5px` strokes; no mixed icon sets.
* Keep the selector popover at `560px` with a fixed `200px` Provider column and a `360px` `session-config-panel`; render whatever fields that Provider's schema declares and scroll inside the panel rather than resizing.
* Render permission buttons from the Provider's own `options` array on `session/request_permission`, in the order the Provider sent them.
* Say `2 sessions` (naming Providers where it matters), never `2 agents` — "agent" means the Provider connection.
* Reuse `status-dot` for every state indicator (rail, hub, sessions, providers, topology nodes) so `UI-02` states map once.
* Gate every newly added folder behind `workspace-trust-dialog` before a card exists or a Provider process starts.
* Reuse `worktree-session-item` chip/row variants everywhere a branch session appears; never invent a second chip style.
* Reserve `provider-accordion` container tokens now so `SYN-09` telemetry and `SYN-11` schema forms land without re-spacing.
* Return focus on every dismiss (`Esc` in popover/drawer/sheet → invoker) and trap focus in palette/dialogs/sheets.
* Gate every theme (default + custom JSON) on WCAG AA before ship.

### Don't
* Don't navigate the entire window to a full screen when clicking a card; use the side-peek drawer or open a dedicated thread tab.
* Don't use colorful background fills on cards; all cards must remain on `{semantic.surface-card}`.
* Don't hardcode hex/rgba inside `components:`; use the Semantic Theme Contract so light/dark/custom themes hot-swap.
* Don't ship TOML themes; manifests are JSON only.
* Don't crowd the card footer with more than 2–3 thread chips; show an overflow indicator (`+3 more`) that opens the side-peek drawer.
* Don't use a single-pane breadcrumb drilldown for the model selector; Tethys is a desktop control plane — use the side-by-side flyout.
* Don't assume every Provider exposes Model + Effort; the config panel is generated from that Provider's schema, and `No session options for this provider` is a valid state.
* Don't hardcode an Approve/Reject pair, a button count, or a button order on a permission request; Tethys renders the Provider's `options`.
* Don't project MCP config into a vendor's own config file for an ACP-native Provider; attach servers as `mcpServers` on `session/new` and keep file projection for the fallback path only.
* Don't show the destructive `SIGINT/SIGTERM/SIGKILL` ladder before `session/cancel`'s grace window has elapsed.
* Don't dim the Provider name when a config field is unsupported; dim only the affected field label.
* Don't read or cache vendor tokens in any login surface (`login-dialog` or `terminal-sheet`); launch the vendor's own flow and close.
* Don't adopt foreign component runtimes (e.g. ACP UI kits) that bring their own stores, providers, or icon sets; borrow presentational ideas only and re-implement against `@tethys/state` and semantic tokens (M1.6 plan D9).
* Don't add shadows, blurs, or accent-colored chrome outside execution/health states.
---
version: d0-rc1
name: Tethys-Precision-Monochromatic
description: |
  A native, high-performance desktop control plane for running autonomous coding agents across parallel git worktrees. Built around a Tabular paradigm (icon rail + tab strip + Workspace Catalog) that expands into a four-region IDE shell (Rail/Hub | Threads | Stage/Inspector | Action Bar/Composer). All color is a swappable Semantic Theme Contract (primitives → semantic → CSS vars); default themes are Default Dark (Obsidian Zinc) and Default Light (Clean Zinc/Slate); users ship JSON theme manifests. Precision Monochromatic chrome, Geist typography/icons, 1px hairlines, and restrained accents reserved for agent telemetry and health states.

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
  thread-list-row:
    backgroundColor: "transparent"
    textColor: "{semantic.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 48px
  prompt-card:
    backgroundColor: "{semantic.surface-elevated}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.lg}"
    width: "{layout.prompt-width}"
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
    modelColumnWidth: 220px
    effortColumnWidth: 140px
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
  approval-card:
    backgroundColor: "{semantic.surface-card}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
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
  diff-viewer:
    backgroundColor: "{semantic.surface-sunken}"
    border: "1px solid {semantic.hairline}"
    rounded: "{rounded.md}"
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
3. **Workspace Catalog Hub**: A Railway-inspired card grid dividing environments into **Local** (local git worktree checkouts) and **Remote** (SSH, container, or cloud-hosted workspaces).
4. **Thread Shell**: `Rail/Hub | Threads | Stage/Inspector | Action Bar/Composer` with tokenized splitters and a `Ctrl/Cmd+K` palette.

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
The New Thread empty state centers a `prompt-card` (`{layout.prompt-width}` wide, `{rounded.2xl}`, `{semantic.surface-elevated}`) under a `{typography.display-lg}` header ("What are we building today?").
* Top zone: multiline textarea (`{typography.body-md}`, placeholder `Ask Anything…` in `{semantic.text-muted}`).
* Lower-left edge: `model-selector-pill` (`[Vendor Icon 16px] [Model label-md] [Effort mono-micro] [Chevron 14px]`).
* Lower-right edge: circular submit button (`{rounded.full}`, `{semantic.surface-hover}` → active `{semantic.text-primary}`).
* The `model-selector-popover` (`{layout.popover-selector}` total) anchors below the pill, left-aligned to the card, never clipping the `{layout.prompt-width}` card bounds.

### Workspace Catalog Layout
The Workspaces screen uses a responsive auto-fill card grid:
* **Header Bar**:
  * Left: Title `{typography.heading-lg}` ("Workspaces") and a Segmented Control (`Local` | `Remote`). `Local` = local git repositories and worktrees; `Remote` = SSH, containers, cloud workspaces (post-V1, shows empty state until `REM-01`).
  * Right: Omnibar Search (`Ctrl K` / `Cmd K`), Sort Selector ("Recent Activity ∨"), and View Mode Toggle (Grid / List). List view reuses `worktree-session-item-row` at full width.
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

### Settings / Providers Layout
Full-window settings surface with left nav (`Settings / Providers` breadcrumb) and a single-column provider list. Header bar holds the title plus right-cluster global controls. Each provider row expands inline into a `provider-accordion` (`{semantic.surface-nested}`) without navigating away. The vendor login flow opens an isolated `terminal-sheet` overlay, never inline.

### Four-Region Shell Architecture (PRD UI-01)

```
┌────┬──────────────┬──────────────────────┬───────────────────┐
│Rail│ Hub/Projects │ Threads              │ Stage + Inspector │
│48px│ 264px → 48px │ 280px                │ flex              │
│    │              │                      │ ActionBar 56px    │
│    │              │                      │ Composer docked   │
└────┴──────────────┴──────────────────────┴───────────────────┘
```

* **Left Rail & Hub**: `48px` Geist rail (`20px` icons, `36px` targets) + collapsible Hub list (`{layout.shell-left}` → collapsed `{layout.shell-left-collapsed}`). Hub rows: workspace icon + name (`body-sm`) + status dot. Collapse preserves rail; `Esc` never collapses while palette open.
* **Threads Column** (`{layout.shell-threads}`): `thread-list-row` entries (`48px`, `8px 12px`, `{rounded.sm}`): status dot + title + branch `mono-micro` + dirty dot + running badge (`accent-agent-active`). Grouped by workspace; parallel worktrees stack under parent. Roving `tabindex`, `Enter` focuses stage.
* **Main Stage & Turn Inspector**: flex stage for chat turns + right Inspector (`{layout.shell-inspector}`, collapsible to overlay past `<1100px`). Inspector sections: messages (`turn-message`), thoughts (`thought-block`), tool calls (`tool-accordion`), checkpoint footer. Threads past `<800px` collapse to icon strip; stage never under `560px` min-width without overlay mode.
* **Action Bar & Composer**: bottom-docked bar (`{layout.shell-actionbar}`): agent pill, mode pill, permissions pill, worktree pill, queue count, `Stop`. Composer docked centered (`{layout.prompt-width}`) + floating variant (`560px`) inside peek/queue drawers. Fixed and floating share `prompt-card` + `composer-chip` tokens.
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

Apply to: pill, popover cells, cards, chips/rows, thread rows, provider rows, toggle, stepper, splitter, palette rows, message/tool/diff/sync/profile/process/onboarding components below. Destructive appears on: discard hunk, delete thread/workspace, revoke trust, SIGKILL, rollback destructive confirm.

## Accessibility & Keyboard Map

* **axe-core gates (`M1.6`)**: every surface passes contrast (theming rules), `aria` roles for custom controls (pill `combobox`, popover `listbox/option`, drawer `dialog`, tabs `tablist/tab`, switch `switch`, stepper `spinbutton`, splitter `separator`), visible focus on all pointer targets, hit targets per Iconography.
* **Focus trap + restore**: drawers, palette, approval dialog, terminal sheet trap `Tab` while open and restore to invoker on `Esc`/close. Unstack order: popover → drawer/sheet → palette → dialog.
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

**`model-selector-pill`**
* Format: `[Vendor Icon 16px] [Model Name label-md] [Effort mono-micro] [Chevron 14px]`, height `28px`, padding `4px 8px`, radius `{rounded.sm}`, transparent bg → `{semantic.surface-hover}` on hover, focus ring `1px {semantic.accent-focus}`.
* Display examples: `[◈ DeepSeek V4.1 Flash  Max ∨]`, `[▲ Gemini 3.8 Flash  Medium ∨]`.
* Effort label dims to `{semantic.text-muted}` (from `{semantic.text-secondary}`) when the active model does not support extended reasoning (`thought_level` absent). Model name never dims.
* Trigger: Click, `Enter`, or `Space` when focused opens the popover. `Escape` with popover closed is a no-op (focus stays in pill); with popover open, cancels and returns focus to the prompt textarea.

**`model-selector-popover` — Three-Column Flyout (Decided)**
* Container: `560px` total width, bg `{semantic.surface-elevated}`, `1px {semantic.hairline}`, radius `{rounded.md}` (Level 4 elevation). Anchored below the pill, left-aligned to the `680px` prompt card. No screen wrapping; flips above the pill only if viewport space requires.
* Column layout (macOS column view / Raycast submenu pattern, exposes full hierarchy at a glance):
  * **Tier 1 — Provider `200px`**: Connected ACP engines (e.g. Claude Code, Codex, OpenCode, Custom ACP server). Each row: Geist vendor icon (`16px`) + name (`{typography.label-md}`) + connection dot (`6px {rounded.full}`; `{semantic.accent-agent-active}` streaming, `{semantic.status-success}` ready/idle, `{semantic.accent-agent-idle}` unreachable). Selecting filters Tier 2. Shows `ACP v2` / adapter pills where applicable.
  * **Tier 2 — Model `220px`**: Models for the selected agent (e.g. DeepSeek V4.1 Flash, Gemini 3.8 Flash, Claude 3.7 Sonnet). Rows show model name + capability hint (reasoning-capable marker). Long lists scroll inside the column only; columns never resize.
  * **Tier 3 — Effort `140px`**: Reasoning effort `None | Low | Medium | High | Max`. Disabled (all rows dimmed, non-selectable) when the Tier 2 model lacks `thought_level` support.
* Dividers: `1px {semantic.hairline}` vertical between columns.
* Keyboard (velocity-first):
  * `Enter` / `Space`: open selector from pill; confirm highlighted leaf (model without effort, or effort value) and close, returning focus to textarea.
  * `↑` / `↓`: move within the active tier.
  * `→`: drill into next tier (provider → models → effort); `←`: step back one tier. No breadcrumb clicks required.
  * `Esc`: cancel, close popover, return focus to prompt textarea.
  * Type-ahead: printable chars filter the active tier; `Tab` cycles tiers (accessibility fallback).
* States: empty Tier 1 (`No connected agents — add one in Settings / Providers`); Tier 2 loading skeleton (3 shimmer rows, stays within column width); handshake error row in `{semantic.status-danger}` with retry.
* Data binding: Tier 1 from `agent.connections.list` (+ registry profiles); Tiers 2–3 from ACP `configOptions` categories `model` / `thought_level`. Writes via `thread.setConfigOption`. Per `PRM-04`, the selector can only narrow within Tethys policy, never widen it.

### Workspace Components

**`segmented-control` & `segmented-item`**
* Container: Height 32px, background `{semantic.surface-panel}`, border 1px solid `{semantic.hairline}`, radius `{rounded.md}`.
* Inactive Item: Transparent, text `{semantic.text-muted}`, `{typography.label-md}`.
* Active Item (`segmented-item-active`): Background `{semantic.surface-elevated}`, text `{semantic.text-primary}`, border 1px solid `{semantic.hairline}`, radius `{rounded.sm}`.

**`workspace-card`**
* Structure: Flex column, height `220px`, background `{semantic.surface-card}`, border 1px solid `{semantic.hairline}`, radius `{rounded.lg}`. Hover → `{semantic.surface-card-hover}` + border `{semantic.hairline-strong}`.
* Top Bar: Repo title in `{typography.heading-md}`, favorite star icon, and a remote/local badge pill (`{typography.label-sm}`).
* Body: Inset canvas filled with a radial/dot-matrix pattern (`{semantic.grid-dot}`, 1px dots at 12px intervals) with a centered vendor logo (GitHub, GitLab, or local folder glyph).
* Footer Bar: Row displaying:
  * Running thread indicator: `● N agents active` in `{semantic.accent-agent-active}` (`{typography.mono-micro}`).
  * Session cluster: up to 2–3 `worktree-session-item-chip` pills + `+N more` overflow chip.
* Interactions: single-click header/body → peek drawer; double-click anywhere → primary/most-recent thread tab; chip click → direct thread tab (see Layout). Card never performs full-window navigation.

**`worktree-session-item` — Single Component, Two Density Variants (Decided)**
* Shared data schema (token parity, both variants bind the same fields): `branch_name`, `agent_status` (`running | idle | awaiting | error`), `turn_count`, `diff_stats` (`+added -removed`), `has_uncommitted`.
* **Variant A — `chip` (card footer, inactive previews)**: Inline-flex pill, height `20px`, padding `2px 8px`, radius `{rounded.xs}`, bg `{semantic.surface-hover}`, label `{typography.mono-micro}` in `{semantic.text-secondary}`. Hover: bg `{semantic.surface-active}`, text `{semantic.text-primary}`. Overflow chip (`+3 more`) uses identical metrics and opens the peek drawer. Legacy alias: `thread-chip`.
* **Variant B — `row` (peek drawer, list view)**: Full-width flex row, height `36px`, padding `6px 12px`, radius `{rounded.sm}`, transparent bg → `{semantic.surface-hover}` on hover. Contents left→right: agent pulse dot (`6px`; `{semantic.accent-agent-active}` running, `{semantic.status-success}` idle, `{semantic.status-warning}`/`{semantic.status-danger}` for awaiting/error), branch slug (`{typography.mono-micro}`), turn checkpoint counter (`T12`), diff badge (`+42 −12` in `{typography.mono-micro}` muted), trailing checkpoint rollback button (Geist icon-only, appears on hover/focus). Disabled state (plain-directory workspaces, `GIT_DISABLED`): diff badge and rollback hidden, row shows `No checkpoints — plain workspace` subtext.
* Keyboard: chips and rows are `button`/`option` roles; `Enter` activates, arrow keys move within the cluster/list.

**`workspace-peek-drawer`**
* Container: `380px` wide slide-over from the right window edge, bg `{semantic.surface-elevated}`, left border `1px {semantic.hairline-strong}` (Level 3). Header: workspace title (`{typography.heading-md}`) + close `×`. Sections: active worktree rows (`worktree-session-item-row`), turn checkpoint counters, uncommitted diff stats, footer `+ New Thread` action.
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
  4. **Authentication Action**: `Launch Vendor Login` button → opens isolated `terminal-sheet` running the official flow (`claude login`, `codex auth`). Per `G7` Credential Principle, Tethys never reads or caches vendor tokens; the sheet is display + input only, with `Close` returning to the accordion.
  5. **`SYN-09` Health slot (entry point now, runtime post-MVP)**: reserved `schema-field-group` containing `Last check`, `Latency`, `MCP transports`, `Detected version` rows bound to `mcp.health` / `agent.connections.list`. MVP renders static values; V1 wires live re-check without changing container tokens.
  6. **`SYN-11` Native-settings slot (entry point now, runtime post-MVP)**: reserved `schema-field-group` with header `Native config (full file)` + `Open schema form` button + `View raw` link. Container, padding, and toggle/input tokens are final now so a future TanStack Form generated from the vendor JSON schema (OpenCode, Antigravity CLI, Kiro CLI) drops in without altering vertical rhythm. Includes version-drift warning banner slot and `Preview diff / Rollback` action row (bound to `agent.config.plan/apply/rollback`).

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

**`thread-list-row`**
* `48px`, `8px 12px`, `{rounded.sm}`, transparent → hover `{semantic.surface-hover}` → selected `{semantic.surface-active}` + accent bar. Contents: status dot + title (`body-sm`) + branch (`mono-micro` muted) + dirty dot (`status-warning`) + running badge (`accent-agent-active` pulse). `M1.7/M1.8` event models feed state; `UI-02` states map to dots.

## Representative Surfaces (D0)

All layouts use `{semantic.*}` only; API states marked with `→ API`.

1. **Turn Inspector** (`UI-04`, `M1.7`): stage column of `turn-message` (`body-md`, streamed markdown worker) → collapsible `thought-block` (`surface-panel`, chevron, muted) → `tool-accordion` rows (`surface-nested`): header (Geist tool icon + name + status dot), body (command line `mono-code`, input JSON collapsible, stdout on `surface-sunken` with cap + `View full` → blob), footer per-turn `View diff / Restore to before this turn` (`WT-03/04` → `git.checkpoint.*`, `diff.summary`). Turn states: `Running` (sky pulse) / `Idle` / `RequiresAction` (amber) / `Error` (danger + retry) / `Interrupted` (muted + resume).
2. **Approvals Dialog & Global Inbox** (`UI-03`, `PRM-01..04`, `M1.8`): persistent `Waiting on you (N)` pill in tab-bar (`status-warning` dot, `mono-micro` count; zero state hidden). Queue in `approval-queue-drawer` (`{layout.drawer-queue}`): `approval-card` per request (`surface-card`, title `heading-md`, command/diff excerpt `mono-code`, affected paths, `Approve / Deny / Always allow: thread|project` buttons; destructive Deny uses danger tokens). Policy note: agent `mode` can only narrow, never widen. OS notification mirrors inbox count → `permission.respond/rules.*`.
3. **Diff & Review Viewer** (`WT-04/05`, `M1.9`): `diff-viewer` well (`surface-sunken`, `mono-code 12px`) with unified/split segmented toggle (scroll anchor preserved), per-file headers (path + `+a −b` + stage toggle) and per-hunk `Stage/Discard` (discard = destructive) + per-turn `Revert` (undoable restore point). Commit box: input + `Draft with agent` → synthesized message preview (`body-sm` muted) → `git.stage/unstage/discard/commit`. Large diffs collapse past `1MB`/`20k` lines with `Load file` affordance.
4. **Full Composer** (`CMP-01..05`, `M1.10`): docked `prompt-card` + `composer-chip` pills: `/` Tethys command (filename = name, `{{args}}` fill) vs. `/agent:name` clash rendering; `$` skill chip with method badge (`native` = instruction + link vs. `inline` = embedded); `@` path chip (FFF `search.files`, sub-ms target, `path:line` echo, sends reference never contents). Queue states: queued/editable/reorderable/persisted (`thread.queue.*`); sending while running appends without interrupting stream.
5. **Sync Grid & Trust Settings** (`SYN-01..07`, `M1.11`): servers×targets matrix of `sync-grid-cell` badges (`in sync {status-success} / pending muted / drifted {status-warning} / conflict {status-danger} / unsupported idle`). Row actions: `Preview diff → Apply → Rollback` (`mcp.projection.plan/apply/rollback`, `skills.*`); import wizard (detect → preview → apply); skill rows with script-trust toggle (untrusted excluded from YOLO, `SYN-07`). Secrets render as `keychain:…` refs only.
6. **Agent Profiles & Monitoring** (`AGT-01/07`, `MON-01`, `M1.12/M1.13`): `profile-card` (icon + name + version pin + `Update available` pill + `Install/Update` button → `agent.registry.*`); launch-spec editor (exec/protocol/env, same tokens as provider accordion); `Login` (terminal-sheet delegation, `G7`), `Restart`, `View stderr` (sunken well). Activity table of `process-row`s: `PID, CPU%, RSS, uptime, state` + cancel ladder (`cancel → SIGINT → SIGTERM → SIGKILL`, destructive styling on kill) → `agent.connections.*`, supervisor sampling.
7. **Terminal & Onboarding** (`M1.14`, Class C): Class C interactive PTY `terminal-sheet` (full xterm, `surface-sunken`, resize/reflow correct, workspace-only per `WorkspaceOnlyConnection`, no output parsing) vs. headless stream viewer (read-only snapshot + tail, `mono-code`). Onboarding zero-state: 3 `onboarding-step` cards (`surface-card`, `24px` hero Geist icon, `heading-md` + `body-sm` + action): `Add repository → Install agent → Start first thread`; progress persists; skip returns to catalog empty state.

## Styling & Token Rules

* **Font stack**: `Geist Sans` for all structural UI labels (titles, pills, buttons, segmented items, provider names). `Geist Mono` for branch names, `worktree-session-item` labels, diff stats (`+42 −12`), hotkeys, telemetry, stepper numbers, and status subtext. `Geist Icons` for all glyphs. Never swap.
* **Backgrounds**: `{semantic.canvas}` global, `{semantic.surface-rail}` chrome, `{semantic.surface-elevated}`/`{semantic.surface-overlay}` for prompt/popover/drawer/palette/sheets, `{semantic.surface-card}` cards, `{semantic.surface-nested}` accordion, `{semantic.surface-sunken}` terminal/diff wells. No other fills.
* **Dividers**: strictly `1px solid` `{semantic.hairline}`, with `{semantic.hairline-strong}` only for input strokes, toggle tracks, and drawer borders. No shadows for depth — tonal steps + hairlines only.
* **Accents**: general chrome entirely monochromatic. Color accents restricted to `{semantic.accent-agent-active}`/`{semantic.status-active-session}` streaming/running, `{semantic.status-success}` healthy/idle-ready, `{semantic.status-warning}` / `{semantic.status-danger}` health warnings, `{semantic.accent-focus}` focus + toggle-active. Effort labels, chips, and badges never use accent color except the running pulse dot.
* **Density**: settings rows `12px 16px`; accordion sections `12px` gaps; drawer rows `36px`; chips `20px`. `SYN-11` schema forms must reuse `schema-field-group` spacing so static MVP inputs and generated V1 forms share rhythm.

## Data Bindings (PRD / Architecture reference)

| UI | Reads | Writes |
| :--- | :--- | :--- |
| Selector Tier 1 | `agent.connections.list`, registry profiles (`AGT-01/02`) | — |
| Selector Tiers 2–3 | `configOptions` (`model`, `thought_level`) (§7.2) | `thread.setConfigOption` (narrowed by policy, `PRM-04`) |
| Catalog cards / drawer | `project.list/status`, `thread.list`, `git.worktree.*`, `checkpoint.*`, diff summary | `thread.create` (own worktree default, `WT-01`), `thread.fork` (V1) |
| Shell threads/inspector | `events.subscribe {sinceSeq}`, `entries` materialized, `turns` | `thread.prompt/queue.*/cancel/resume` |
| Approvals/inbox | `events` permission requests, `permission.rules.*` | `permission.respond`, OS notify |
| Diff/review | `git.diff.summary/file`, `checkpoint.*` | `git.stage/unstage/discard/commit` |
| Composer `/ $ @` | `commands.list`, `search.files`, skill strategy | `commands.expand`, `thread.queue.*` |
| Sync/skills | `mcp.registry/effective`, `skills.list` | `mcp.projection.plan/apply/rollback`, `skills.trust/enable` |
| Profiles/monitor | `agent.profiles/registry/connections.*`, process sampling | `agent.registry.install/update`, `connections.restart`, `agent.login` |
| Terminal/onboarding | `terminal.list/attach`, `project.list` | `terminal.write/resize`, `project.add` |
| Provider rows | `agent.profiles.*`, `agent.connections.list`, `mcp.health` (`SYN-09`) | toggle → profile enable; stepper → health interval; exec/protocol/env → launch spec |
| Provider accordion | `agent.config.schema/get/validate` (`SYN-11`) | `agent.config.plan/apply/rollback`; login via `agent.login` in `terminal-sheet` (`AGT-07`, `G7`) |
| Plain workspaces | project `isolation: plain` (`WT-11`) | `git.*` returns `GIT_DISABLED`; diff/restore/merge UI hidden |

## Do's and Don'ts

### Do
* Segment workspaces cleanly into `Local` and `Remote` to avoid mixing local worktrees with SSH/container agents.
* Retain the top tab bar: open threads directly into persistent tabs while keeping the `Workspaces` hub intact.
* Use dot-matrix backgrounds inside catalog cards to provide visual depth without adding heavy assets.
* Keep all card and panel boundaries to a crisp 1px `{semantic.hairline}`.
* Reference `{semantic.*}` exclusively in components; put raw values in `primitives`/`themes` and ship JSON manifests for custom themes.
* Use Geist Icons at `12/16/20/24px` with `28/32/36px` targets and `1.5px` strokes; no mixed icon sets.
* Keep the selector popover to three fixed columns (`200 / 220 / 140px`); scroll inside Tier 2 rather than resizing.
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
* Don't dim the model name when reasoning is unsupported; dim only the effort label.
* Don't read or cache vendor tokens in the login sheet; launch the vendor's own flow and close.
* Don't add shadows, blurs, or accent-colored chrome outside execution/health states.
//! Composer editor contract (`CMP-01..05`; M1.10 AD-9).
//!
//! Downstream units depend on `EditorHandle` and the item/chip shapes here,
//! not on TipTap directly, so the editor implementation stays swappable.

export type ChipKind =
  | "command"
  | "agent-command"
  | "skill"
  | "path"
  | "review";
export type ComposerControl =
  | "model"
  | "permissions"
  | "config"
  | "resume"
  | "clear";

export const COMPOSER_CONTROL_SHORTCUT_EVENT =
  "tethys:composer-control-shortcut";
export const COMPOSER_INSERT_CHIP_EVENT = "tethys:composer-insert-chip";
export type ComposerControlShortcut = "mode" | "model" | "effort";

/** A chip's UI metadata. `token` is the only part that reaches the prompt. */
export interface EditorChip {
  kind: ChipKind;
  /** Display label (command/skill/file name). */
  name: string;
  /** Plaintext token serialized into the prompt. */
  token: string;
  /** Worktree-relative path, for `@` chips. */
  path?: string;
  isDir?: boolean;
  /** For `$` skills: how the skill is injected (always `referenced` in M1.5). */
  injectionMethod?: "referenced";
}

/** One row in a trigger popup. */
export interface ComposerItem {
  id: string;
  /** Popup group heading (e.g. `Claude Code commands`); absent = ungrouped. */
  group?: string;
  label: string;
  detail?: string;
  /** Tethys control opened instead of inserting this row as a chip. */
  control?: ComposerControl;
  /** Search tokens the popup may match client-side. */
  keywords?: string[];
  chip: EditorChip;
}

/** A popup's data source, queried as the user types after the trigger. */
export type ComposerItemSource = (
  query: string,
  signal?: AbortSignal,
) => ComposerItem[] | Promise<ComposerItem[]>;

export interface ComposerSources {
  command?: ComposerItemSource;
  skill?: ComposerItemSource;
  path?: ComposerItemSource;
}

/**
 * Imperative editor surface. Everything the product code needs from the
 * editor, so a textarea fallback can implement the same shape.
 */
export interface EditorHandle {
  insertChip(chip: EditorChip): void;
  serializeToPrompt(): string;
  serializeToPromptParts(): PromptPart[];
  setText(text: string): void;
  clear(): void;
  focus(): void;
  isEmpty(): boolean;
}

/** Plain prompt text and resolved path-chip identity in document order. */
export type PromptPart =
  | { kind: "text"; text: string }
  | { kind: "path"; name: string; path: string };

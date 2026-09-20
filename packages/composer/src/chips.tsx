import { Chip } from "@tethys/ui";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import type { ChipKind, EditorChip } from "./types";

export const CHIP_NODE = "composerChip";

/** Prefix glyph each chip kind renders before its name. */
export function chipPrefix(kind: ChipKind): string {
  switch (kind) {
    case "command":
    case "agent-command":
      return "/";
    case "skill":
      return "$";
    case "path":
      return "@";
  }
}

export interface ChipAttrs {
  kind: ChipKind;
  name: string;
  token: string;
  path: string | null;
  isDir: boolean;
  injectionMethod: "referenced" | null;
}

export function chipToAttrs(chip: EditorChip): ChipAttrs {
  return {
    kind: chip.kind,
    name: chip.name,
    token: chip.token,
    path: chip.path ?? null,
    isDir: chip.isDir ?? false,
    injectionMethod: chip.injectionMethod ?? null,
  };
}

/**
 * `composer-chip` (DESIGN.md) — an inline atom node. Serializes to `token`
 * only: a `/` command expands via the backend, `$`/`@` emit their plaintext
 * reference, `/agent:name` passes through unchanged. Never carries a body.
 */
export function ComposerChipView({ node, deleteNode }: NodeViewProps) {
  const attrs = node.attrs as ChipAttrs;
  return (
    <NodeViewWrapper as="span" data-composer-chip={attrs.kind}>
      <Chip
        icon={<span className="font-mono">{chipPrefix(attrs.kind)}</span>}
        onRemove={deleteNode ? () => deleteNode() : undefined}
        contentEditable={false}
      >
        {attrs.name}
        {attrs.kind === "skill" && attrs.injectionMethod === "referenced" && (
          <span
            data-testid="injection-method-badge"
            className="ml-1 rounded-xs bg-(--tethys-surface-active) px-1 text-mono-micro text-(--tethys-text-muted)"
          >
            Referenced
          </span>
        )}
      </Chip>
    </NodeViewWrapper>
  );
}

/** Inline atom chip node used by every `/ $ @` trigger. */
export const ComposerChip = Node.create({
  name: CHIP_NODE,
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: "command" },
      name: { default: "" },
      token: { default: "" },
      path: { default: null },
      isDir: { default: false },
      injectionMethod: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-composer-chip]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-composer-chip": node.attrs.kind,
        class: "composer-chip",
      }),
      node.attrs.token,
    ];
  },

  renderText({ node }) {
    return node.attrs.token;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ComposerChipView);
  },
});

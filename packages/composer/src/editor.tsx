import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { CHIP_NODE, ComposerChip, chipInsertion } from "./chips";
import { DocumentNode, ParagraphNode, TextNode } from "./nodes";
import type {
  ComposerControl,
  ComposerItem,
  ComposerSources,
  EditorChip,
  EditorHandle,
  PromptPart,
} from "./types";

const DOCUMENT_EXTENSION = DocumentNode;
const PARAGRAPH_EXTENSION = ParagraphNode;
const TEXT_EXTENSION = TextNode;

interface PopupState {
  items: ComposerItem[];
  range: { from: number; to: number };
  query: string;
  clientRect: (() => DOMRect | null) | null;
  command: (item: ComposerItem) => void;
  selectedIndex: number;
  loading: boolean;
}

interface SuggestionRuntime {
  sourcesRef: React.MutableRefObject<ComposerSources>;
  onControlRef: React.MutableRefObject<
    ((control: ComposerControl) => void) | undefined
  >;
  setPopup: (updater: (prev: PopupState | null) => PopupState | null) => void;
  keydownRef: React.MutableRefObject<
    ((event: KeyboardEvent) => boolean) | null
  >;
}

function suggestionExtension(
  char: "/" | "$" | "@",
  pluginKeyName: string,
  runtime: SuggestionRuntime,
) {
  const sourceKey: keyof ComposerSources =
    char === "/" ? "command" : char === "$" ? "skill" : "path";

  return Extension.create({
    name: `composerSuggestion${pluginKeyName}`,
    addProseMirrorPlugins() {
      return [
        Suggestion<ComposerItem, ComposerItem>({
          editor: this.editor,
          char,
          pluginKey: new PluginKey(pluginKeyName),
          allowSpaces: false,
          items: async ({ query, signal }) => {
            const source = runtime.sourcesRef.current[sourceKey];
            if (!source) return [];
            return (await source(query, signal)).slice(0, 50);
          },
          command: ({ editor, range, props }) => {
            if (props.control) {
              editor.chain().focus().deleteRange(range).run();
              runtime.onControlRef.current?.(props.control);
              return;
            }
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(chipInsertion(props.chip))
              .run();
          },
          render: () => ({
            onStart: (props: SuggestionProps<ComposerItem, ComposerItem>) => {
              runtime.setPopup(() => ({
                items: props.items,
                range: props.range,
                query: props.query,
                clientRect: props.clientRect ?? null,
                command: props.command,
                selectedIndex: 0,
                loading: props.loading,
              }));
            },
            onUpdate: (props: SuggestionProps<ComposerItem, ComposerItem>) => {
              runtime.setPopup((prev) =>
                prev
                  ? {
                      ...prev,
                      items: props.items,
                      range: props.range,
                      query: props.query,
                      clientRect: props.clientRect ?? null,
                      command: props.command,
                      loading: props.loading,
                    }
                  : prev,
              );
            },
            onExit: () => runtime.setPopup(() => null),
            onKeyDown: ({ event }) =>
              runtime.keydownRef.current?.(event) ?? false,
          }),
        }),
      ];
    },
  });
}

/** Walks a ProseMirror document into the one plaintext prompt string. */
export function serializePrompt(doc: {
  forEach: (fn: (node: SerializeNode) => void) => void;
}): string {
  const blocks: string[] = [];
  doc.forEach((block) => {
    let line = "";
    block.forEach((child) => {
      if (child.isText) {
        line += child.text ?? "";
      } else if (child.type?.name === CHIP_NODE) {
        line += String(child.attrs?.token ?? "");
      } else {
        line += child.textContent ?? "";
      }
    });
    // The insertion gap after a chip is for the caret, not for the prompt.
    blocks.push(line.trimEnd());
  });
  return blocks.join("\n").trimEnd();
}

function serializePromptParts(doc: {
  forEach: (fn: (node: SerializeNode) => void) => void;
}): PromptPart[] {
  const parts: PromptPart[] = [];
  let text = "";
  const flushText = () => {
    if (text !== "") parts.push({ kind: "text", text });
    text = "";
  };

  let blockIndex = 0;
  doc.forEach((block) => {
    if (blockIndex > 0) text += "\n";
    blockIndex += 1;
    block.forEach((child) => {
      if (child.isText) {
        text += child.text ?? "";
      } else if (
        child.type?.name === CHIP_NODE &&
        child.attrs?.kind === "path"
      ) {
        flushText();
        const path = String(child.attrs?.path ?? "");
        if (path !== "") {
          parts.push({
            kind: "path",
            name: String(child.attrs?.name ?? path),
            path,
          });
        } else {
          text += String(child.attrs?.token ?? "");
        }
      } else if (child.type?.name === CHIP_NODE) {
        text += String(child.attrs?.token ?? "");
      } else {
        text += child.textContent ?? "";
      }
    });
  });
  text = text.trimEnd();
  flushText();
  return parts;
}

interface SerializeNode {
  isText?: boolean;
  text?: string | null;
  textContent?: string;
  type?: { name: string };
  attrs?: Record<string, unknown>;
  forEach: (fn: (node: SerializeNode) => void) => void;
}

export interface ComposerEditorProps {
  sources?: ComposerSources;
  disabled?: boolean;
  placeholder?: string;
  onChange?: (plaintext: string) => void;
  onSubmit?: () => void;
  onControl?: (control: ComposerControl) => void;
}

/**
 * The `/ $ @` composer editor (`CMP-01..05`). Chips are inline atoms; the
 * serialized prompt is exactly one plaintext string. Keyboard: bare `Enter`
 * inserts a newline, `Ctrl/Cmd+Enter` submits.
 */
export const ComposerEditor = React.forwardRef<
  EditorHandle,
  ComposerEditorProps
>(function ComposerEditor(
  {
    sources = {},
    disabled = false,
    placeholder,
    onChange,
    onSubmit,
    onControl,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<ComposerSources>(sources);
  sourcesRef.current = sources;
  const onControlRef = useRef(onControl);
  onControlRef.current = onControl;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const [popup, setPopup] = useState<PopupState | null>(null);
  const popupRef = useRef<PopupState | null>(null);
  popupRef.current = popup;
  const keydownRef = useRef<((event: KeyboardEvent) => boolean) | null>(null);

  const runtime = useMemo<SuggestionRuntime>(
    () => ({ sourcesRef, onControlRef, setPopup, keydownRef }),
    [],
  );

  const extensions = useMemo(
    () => [
      DOCUMENT_EXTENSION,
      PARAGRAPH_EXTENSION,
      TEXT_EXTENSION,
      ComposerChip,
      suggestionExtension("/", "composerCommand", runtime),
      suggestionExtension("$", "composerSkill", runtime),
      suggestionExtension("@", "composerPath", runtime),
    ],
    [runtime],
  );

  const editor = useEditor({
    extensions,
    content: "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "composer-editor min-h-[96px] px-1 text-body-md text-(--tethys-text-primary) outline-none",
        "data-placeholder": placeholder ?? "",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Prompt",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape" && popupRef.current) {
          setPopup(() => null);
          return true;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSubmitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current?.(serializePrompt(instance.state.doc));
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const insertChip = useCallback(
    (chip: EditorChip) => {
      editor?.chain().focus().insertContent(chipInsertion(chip)).run();
    },
    [editor],
  );

  useImperativeHandle(
    ref,
    (): EditorHandle => ({
      insertChip,
      serializeToPrompt: () =>
        editor ? serializePrompt(editor.state.doc) : "",
      serializeToPromptParts: () =>
        editor ? serializePromptParts(editor.state.doc) : [],
      setText: (text) => editor?.commands.setContent(paragraphTextToDoc(text)),
      clear: () => editor?.commands.clearContent(),
      focus: () => editor?.commands.focus(),
      isEmpty: () => (editor ? isDocEmpty(editor.state.doc) : true),
    }),
    [editor, insertChip],
  );

  const selectItem = useCallback((item: ComposerItem) => {
    popupRef.current?.command(item);
    setPopup(() => null);
  }, []);

  keydownRef.current = useCallback(
    (event: KeyboardEvent) => {
      const current = popupRef.current;
      if (!current || current.items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setPopup((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex: (prev.selectedIndex + 1) % prev.items.length,
              }
            : prev,
        );
        return true;
      }
      if (event.key === "ArrowUp") {
        setPopup((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex:
                  (prev.selectedIndex - 1 + prev.items.length) %
                  prev.items.length,
              }
            : prev,
        );
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = current.items[current.selectedIndex];
        if (item) selectItem(item);
        return true;
      }
      return false;
    },
    [selectItem],
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <EditorContent editor={editor} />
      {popup && (
        <ComposerPopup
          popup={popup}
          container={containerRef.current}
          onSelect={selectItem}
        />
      )}
    </div>
  );
});

/** Splits plaintext into one paragraph per line (edit mode for queued items). */
function paragraphTextToDoc(text: string) {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line.length > 0 ? [{ type: "text", text: line }] : [],
    })),
  };
}

function isDocEmpty(doc: {
  childCount: number;
  firstChild?: { content: { size: number } } | null;
}): boolean {
  if (doc.childCount !== 1) return false;
  return (doc.firstChild?.content.size ?? 0) === 0;
}

function groupItems(
  items: ComposerItem[],
): Array<[string | null, ComposerItem[]]> {
  const groups: Array<[string | null, ComposerItem[]]> = [];
  for (const item of items) {
    const key = item.group ?? null;
    const existing = groups.find(([group]) => group === key);
    if (existing) {
      existing[1].push(item);
    } else {
      groups.push([key, [item]]);
    }
  }
  return groups;
}

function ComposerPopup({
  popup,
  container,
  onSelect,
}: {
  popup: PopupState;
  container: HTMLElement | null;
  onSelect: (item: ComposerItem) => void;
}) {
  const rect = popup.clientRect?.();
  const containerRect = container?.getBoundingClientRect();
  const popupWidth = 400;
  const style: React.CSSProperties = {
    left:
      rect && containerRect && container
        ? Math.max(
            0,
            Math.min(
              rect.left - containerRect.left,
              container.clientWidth - popupWidth,
            ),
          )
        : 0,
    top: rect && containerRect ? rect.top - containerRect.top : 0,
    transform: "translateY(calc(-100% - 4px))",
  };
  const groups = groupItems(popup.items);

  return (
    <div
      data-testid="composer-popup"
      role="dialog"
      aria-label="Composer suggestions"
      style={style}
      className="edge-lit absolute z-(--tethys-z-popover) max-h-72 w-[400px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-md border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) p-1"
    >
      {popup.loading ? (
        <p
          role="status"
          className="px-3 py-2 text-body-sm text-(--tethys-text-muted)"
        >
          Loading…
        </p>
      ) : popup.items.length === 0 ? (
        <p
          role="status"
          className="px-3 py-2 text-body-sm text-(--tethys-text-muted)"
        >
          No matches
        </p>
      ) : (
        <div role="listbox" aria-label="Composer suggestions">
          {groups.map(([group, items]) => (
            // biome-ignore lint/a11y/useSemanticElements: popup groups are labelled listbox groups, not form fieldsets
            <div
              key={group ?? "__ungrouped"}
              role="group"
              aria-label={group ?? undefined}
            >
              {group && (
                <div className="px-2 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider">
                  {group}
                </div>
              )}
              {items.map((item) => {
                const index = popup.items.indexOf(item);
                const selected = index === popup.selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-description={item.control ? item.detail : undefined}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(item);
                    }}
                    className={`flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-body-sm ${
                      selected
                        ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                        : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
                    } ${item.control ? "opacity-60" : ""}`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.detail && (
                      <span className="ml-auto max-w-[62%] shrink-0 truncate text-right text-label-sm text-(--tethys-text-muted)">
                        {item.detail}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <footer className="border-t border-(--tethys-hairline) px-2 py-1 text-label-sm text-(--tethys-text-muted)">
        ↑ ↓ Move · Enter Select · Esc Close
      </footer>
    </div>
  );
}

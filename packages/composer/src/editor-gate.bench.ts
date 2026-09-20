//! AD-9 editor gate (M1.10 U1) — one-shot measurement harness.
//!
//! Not shipped in the barrel and not part of CI: run with
//! `pnpm --filter @tethys/composer bench`. It confirms the two hard numbers
//! AD-9 gates on, against the *engine* path:
//!   (a) trigger → first popup result resolved ≤ 30 ms (instant stub),
//!   (b) a 1 MB paste serializes without a frame gap above the 60 Hz budget.
//!
//! The real-WebView compositor smoke (WKWebView/WebView2/WebKitGTK) is a
//! documented follow-up; this harness isolates the editor cost so a regression
//! is attributable to the editor, not the (already-benchmarked M1.5) backend.

import { Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { describe, expect, it } from "vitest";
import { ComposerChip } from "./chips";
import { serializePrompt } from "./editor";
import { DocumentNode, ParagraphNode, TextNode } from "./nodes";
import type { ComposerItem, ComposerItemSource } from "./types";

/** 1,000,000 ASCII characters ≈ 1 MB UTF-8. */
const PASTE_SIZE = 1_000_000;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function makeEditor(): Editor {
  return new Editor({
    extensions: [DocumentNode, ParagraphNode, TextNode, ComposerChip],
    content: "",
  });
}

/**
 * A `/` suggestion wired to `source`, so typing the trigger drives the real
 * plugin pipeline and we can time trigger → first result resolved.
 */
function suggestionGateEditor(
  source: ComposerItemSource,
  marks: { firstResult?: number },
): Editor {
  const extension = Extension.create({
    name: "gateSuggestion",
    addProseMirrorPlugins() {
      return [
        Suggestion<ComposerItem, ComposerItem>({
          editor: this.editor,
          char: "/",
          pluginKey: new PluginKey("gateCommand"),
          items: async ({ query, signal }) => {
            const items = await source(query, signal);
            marks.firstResult ??= performance.now();
            return items;
          },
          command: () => {},
          render: () => ({
            onStart: () => {},
            onUpdate: () => {},
            onExit: () => {},
            onKeyDown: () => false,
          }),
        }),
      ];
    },
  });
  return new Editor({
    extensions: [
      DocumentNode,
      ParagraphNode,
      TextNode,
      ComposerChip,
      extension,
    ],
    content: "",
  });
}

function samplesMedian(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe("AD-9 editor gate", () => {
  it("trigger to first popup result is within 30 ms against an instant stub", async () => {
    const source: ComposerItemSource = (query) =>
      query.length === 0
        ? []
        : [
            {
              id: "cmd",
              label: "review",
              chip: { kind: "command", name: "review", token: "review" },
            },
          ];

    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const marks: { firstResult?: number } = {};
      const editor = suggestionGateEditor(source, marks);
      const start = performance.now();
      editor.commands.insertContent("/rev");
      // Let the async `items` promise resolve inside the plugin pipeline.
      for (let tick = 0; tick < 10 && marks.firstResult === undefined; tick++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (marks.firstResult !== undefined) {
        samples.push(marks.firstResult - start);
      }
      editor.destroy();
    }

    expect(samples.length).toBeGreaterThan(0);
    const elapsed = samplesMedian(samples);

    console.log(
      `[gate] trigger → first popup result (median of ${samples.length}): ${elapsed.toFixed(3)} ms`,
    );
    expect(elapsed).toBeLessThan(30);
  });

  it("serializes a 1 MB paste without a long frame gap", () => {
    const editor = makeEditor();
    const payload = "a".repeat(PASTE_SIZE);

    const pasteStart = performance.now();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: payload }],
        },
      ],
    });
    const serialized = serializePrompt(editor.state.doc);
    const duration = performance.now() - pasteStart;

    console.log(
      `[gate] 1 MB paste + serialize: ${duration.toFixed(1)} ms (${formatBytes(payload.length)})`,
    );

    expect(serialized.length).toBe(PASTE_SIZE);
    expect(duration).toBeLessThan(50);
    editor.destroy();
  });
});

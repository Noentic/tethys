import { describe, expect, it } from "vitest";
import { createDiffHighlighter, createInProcessTransport } from "./client";
import { languageForPath } from "./languages";
import { highlightLines } from "./shiki";

describe("diff highlight facade (M1.9 U3)", () => {
  it("infers a language from the file extension", () => {
    expect(languageForPath("src/a.ts")).toBe("typescript");
    expect(languageForPath("a.zzz")).toBeNull();
    expect(languageForPath("Dockerfile")).toBe("docker");
  });

  it("highlights a .ts snippet into spans within each line", async () => {
    const highlighter = createDiffHighlighter({
      transport: createInProcessTransport(),
    });
    const text = "const a: number = 1;\nexport { a };\n";
    const lines = await highlighter.highlight(text, "src/a.ts");
    const textLines = text.split("\n");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((line) => line.length > 0)).toBe(true);
    lines.forEach((line, index) => {
      for (const span of line) {
        expect(span.start).toBeGreaterThanOrEqual(0);
        expect(span.end).toBeLessThanOrEqual(textLines[index].length);
      }
    });
  });

  it("caches by content hash so the transport runs once", async () => {
    let calls = 0;
    const highlighter = createDiffHighlighter({
      transport: async () => {
        calls += 1;
        return [[{ start: 0, end: 1, color: "#fff" }]];
      },
    });
    const first = await highlighter.highlight("same", "a.ts");
    const second = await highlighter.highlight("same", "a.ts");
    expect(calls).toBe(1);
    expect(second).toBe(first);
    expect(highlighter.cacheSize).toBe(1);
  });

  it("degrades to plain text for an unknown language without throwing", async () => {
    let calls = 0;
    const highlighter = createDiffHighlighter({
      transport: async () => {
        calls += 1;
        return [[{ start: 0, end: 1, color: "#fff" }]];
      },
    });
    await expect(highlighter.highlight("mystery", "a.zzz")).resolves.toEqual(
      [],
    );
    expect(calls).toBe(0);
  });

  it("degrades to plain text when the worker fails to load", async () => {
    const originalWorker = globalThis.Worker;
    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(): void {
        queueMicrotask(() => this.onerror?.());
      }
      terminate(): void {}
    }
    globalThis.Worker = FailingWorker as unknown as typeof Worker;
    try {
      const highlighter = createDiffHighlighter();
      await expect(
        highlighter.highlight("const a = 1;", "a.ts"),
      ).resolves.toEqual([]);
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  it("returns identical spans across direct in-process runs", async () => {
    const text = "function add(a: number, b: number) { return a + b; }";
    const first = await highlightLines(text, "typescript");
    const second = await highlightLines(text, "typescript");
    expect(second).toEqual(first);
    expect(first[0].length).toBeGreaterThan(0);
  });
});

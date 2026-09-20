/**
 * M1.9 U5 — 20k-line first-paint benchmark.
 *
 * Recorded once, never re-run (AGENTS.md anti-pattern: recorded benchmarks are
 * not re-run for review or CI). Not part of the turbo `test` task: it runs only
 * through `vitest.bench.config.ts`. Sources the same synthetic diff shape the
 * S0.1 harness used (`crates/tethys-core/src/synthetic.rs`), feeds it through
 * the U1 row model, and mounts the U4 viewer once per run.
 */

import type { DiffFileDetail, DiffHunk, DiffLineKind } from "@tethys/bindings";
import { cleanup, render } from "@testing-library/react";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiffViewer } from "../src/diff-viewer";
import { buildDiffRows } from "../src/row-model";

const TOTAL_LINES = 20_000;
const RUNS = 11;

function generateSyntheticDiff(totalLines: number): DiffHunk[] {
  const linesPerHunk = 100;
  const hunks: DiffHunk[] = [];
  let currentLine = 1;
  while (currentLine <= totalLines) {
    const hunkSize = Math.min(totalLines - currentLine + 1, linesPerHunk);
    const lines = Array.from({ length: hunkSize }, (_, index) => {
      const lineNumber = currentLine + index;
      const kind: DiffLineKind =
        lineNumber % 5 === 0
          ? "Addition"
          : lineNumber % 5 === 1
            ? "Deletion"
            : "Context";
      const prefix = kind === "Addition" ? "+ " : kind === "Deletion" ? "- " : "  ";
      return {
        kind,
        text: `${prefix}const line_${lineNumber} = calculate_value(${lineNumber}, "synthetic-patch-data");`,
      };
    });
    hunks.push({
      old_start: currentLine,
      old_lines: hunkSize,
      new_start: currentLine,
      new_lines: hunkSize,
      lines,
    });
    currentLine += hunkSize;
  }
  return hunks;
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === "diff-scroll" ? 400 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === "diff-scroll" ? 800 : 0;
    },
  });
});

afterAll(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
  }
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  }
});

const MARKER_START = "<!-- first-paint:start -->";
const MARKER_END = "<!-- first-paint:end -->";

function writeResults(p50: number, p95: number): void {
  const docPath = resolve(__dirname, "../../../docs/m1.9-review-ui-results.md");
  const block = `${MARKER_START}
## First paint (20k-line diff)

| Field | Value |
|---|---|
| Host | ${process.platform} · ${process.arch} · Node ${process.version} |
| Method | \`buildDiffRows\` + virtualized \`DiffViewer\` mount over a 20,000-line synthetic diff (200 hunks), ${RUNS} runs |
| p50 | **${p50.toFixed(2)} ms** |
| p95 | **${p95.toFixed(2)} ms** |
| Criterion | ≤ 50 ms first paint |

Recorded once by the M1.9 author; not re-run in CI (AGENTS.md).
${MARKER_END}`;

  mkdirSync(dirname(docPath), { recursive: true });
  const existing = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
  const start = existing.indexOf(MARKER_START);
  const end = existing.indexOf(MARKER_END);
  const next =
    start >= 0 && end >= 0
      ? `${existing.slice(0, start)}${block}${existing.slice(end + MARKER_END.length)}`
      : existing === ""
        ? `# M1.9 — Review UI: Results\n\n${block}\n`
        : `${existing.trimEnd()}\n\n${block}\n`;
  writeFileSync(docPath, next);
}

describe("20k-line diff first paint (M1.9 U5)", () => {
  it("records p50/p95 first paint under the 50 ms criterion", () => {
    const hunks = generateSyntheticDiff(TOTAL_LINES);
    const detail: DiffFileDetail = {
      path: "synthetic/20k.ts",
      binary: false,
      collapsed: false,
      additions: 8_000,
      deletions: 4_000,
      hunks,
    };

    // Warm-up runs so module init and JIT costs do not land in the samples.
    for (let warm = 0; warm < 5; warm += 1) {
      const view = render(<DiffViewer detail={detail} />);
      view.unmount();
      cleanup();
    }

    const times: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const start = performance.now();
      const view = render(<DiffViewer detail={detail} />);
      times.push(performance.now() - start);
      view.unmount();
      cleanup();
    }
    expect(buildDiffRows(detail, "unified").length).toBeGreaterThan(
      TOTAL_LINES,
    );

    times.sort((a, b) => a - b);
    const p50 = percentile(times, 0.5);
    const p95 = percentile(times, 0.95);
    writeResults(p50, p95);
    console.log(
      `[M1.9 first-paint] p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms over ${RUNS} runs`,
    );
    expect(p50).toBeLessThanOrEqual(50);
  });
});

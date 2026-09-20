import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DiffFileDetail, DiffHunk } from "@tethys/bindings";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DiffViewer, topVisibleAnchor } from "./diff-viewer";
import { buildDiffRows } from "./row-model";

afterEach(cleanup);

const ROW_HEIGHT = 24;

// jsdom reports zero-size boxes, which leaves the virtualizer with no viewport.
// Give the diff scroll region a fixed size so a real window of rows mounts.
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
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetHeight",
      originalOffsetHeight,
    );
  }
  if (originalOffsetWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetWidth",
      originalOffsetWidth,
    );
  }
});

function detail(
  hunks: DiffHunk[],
  partial: Partial<DiffFileDetail> = {},
): DiffFileDetail {
  return {
    path: "src/example.ts",
    binary: false,
    collapsed: false,
    additions: 1,
    deletions: 1,
    hunks,
    ...partial,
  };
}

const smallDetail = detail([
  {
    old_start: 1,
    old_lines: 3,
    new_start: 1,
    new_lines: 3,
    lines: [
      { kind: "Context", text: "keep" },
      { kind: "Deletion", text: "let x = 1;" },
      { kind: "Addition", text: "let x = 2;" },
    ],
  },
]);

function largeDetail(): DiffFileDetail {
  const lines = Array.from({ length: 500 }, (_, index) => ({
    kind: (index % 7 === 0 ? "Addition" : "Context") as "Addition" | "Context",
    text: `line ${index}`,
  }));
  return detail(
    [{ old_start: 1, old_lines: 500, new_start: 1, new_lines: 500, lines }],
    { additions: 72, deletions: 0 },
  );
}

describe("DiffViewer (M1.9 U4)", () => {
  it("virtualizes: a 500-line file mounts far fewer than 500 rows", () => {
    const { container } = render(<DiffViewer detail={largeDetail()} />);
    const rendered = container.querySelectorAll("[data-row-kind]");
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
  });

  it("styles changed lines with tokens and a gutter glyph", () => {
    const { container } = render(<DiffViewer detail={smallDetail} />);
    const addition = container.querySelector('[data-row-kind="addition"]');
    const deletion = container.querySelector('[data-row-kind="deletion"]');
    const context = container.querySelector('[data-row-kind="context"]');
    expect(addition?.className).toContain("bg-diff-added/16");
    expect(deletion?.className).toContain("bg-diff-removed/16");
    expect(context?.className ?? "").not.toContain("diff-added");
    expect(context?.className ?? "").not.toContain("diff-removed");
    expect(addition?.querySelector('[data-gutter="+"]')).toBeTruthy();
    expect(deletion?.querySelector('[data-gutter="−"]')).toBeTruthy();
  });

  it("marks a one-token edit with a 32% word fill in split mode", () => {
    const { container } = render(
      <DiffViewer detail={smallDetail} mode="split" />,
    );
    const changed = container.querySelector('[class*="bg-diff-added/32"]');
    expect(changed?.textContent).toBe("2");
    const removed = container.querySelector('[class*="bg-diff-removed/32"]');
    expect(removed?.textContent).toBe("1");
  });

  it("fills the addition's own text when the edit changes length", () => {
    const asymmetric = detail([
      {
        old_start: 1,
        old_lines: 1,
        new_start: 1,
        new_lines: 1,
        lines: [
          { kind: "Deletion", text: "abc" },
          { kind: "Addition", text: "abcdef" },
        ],
      },
    ]);
    const { container } = render(
      <DiffViewer detail={asymmetric} mode="split" />,
    );
    // No token survives, so both sides fill the whole line — the addition must
    // not highlight the deletion's prefix.
    expect(
      container.querySelector('[class*="bg-diff-added/32"]')?.textContent,
    ).toBe("abcdef");
    expect(
      container.querySelector('[class*="bg-diff-removed/32"]')?.textContent,
    ).toBe("abc");
  });

  it("preserves the scroll anchor across a unified↔split toggle", () => {
    // One deletion against two additions: unified spends a separate row on
    // each, split pairs them, so the same source line lands on different row
    // indices — the toggle must resolve the line, not keep the raw offset.
    const anchorDetail = detail([
      {
        old_start: 1,
        old_lines: 2,
        new_start: 1,
        new_lines: 3,
        lines: [
          { kind: "Context", text: "keep" },
          { kind: "Deletion", text: "del" },
          { kind: "Addition", text: "add1" },
          { kind: "Addition", text: "add2" },
        ],
      },
    ]);
    const unified = buildDiffRows(anchorDetail, "unified");
    const split = buildDiffRows(anchorDetail, "split");
    const anchor = unified[4].anchorId;
    const unifiedIndex = 4;
    const splitIndex = split.findIndex((row) =>
      row.anchorIds.includes(anchor ?? ""),
    );
    expect(anchor).toBe("0:addition:3");
    expect(splitIndex).toBe(3);
    expect(splitIndex).not.toBe(unifiedIndex);

    render(<DiffViewer detail={anchorDetail} />);
    const scroll = screen.getByTestId("diff-scroll");
    scroll.scrollTop = unifiedIndex * ROW_HEIGHT;
    fireEvent.click(screen.getByRole("radio", { name: "Split" }));
    expect(scroll.scrollTop).toBe(splitIndex * ROW_HEIGHT);

    // ...and back: the same source line resolves to its unified row again.
    fireEvent.click(screen.getByRole("radio", { name: "Unified" }));
    expect(scroll.scrollTop).toBe(unifiedIndex * ROW_HEIGHT);
  });

  it("topVisibleAnchor skips context and lands on the following change", () => {
    const unified = buildDiffRows(smallDetail, "unified");
    // Row 0 is the hunk header, row 1 context, row 2 the deletion.
    expect(topVisibleAnchor(unified, 0, ROW_HEIGHT)).toBe(unified[2].anchorId);
    // Split row 1 is a context pair, row 2 the changed pair.
    const split = buildDiffRows(smallDetail, "split");
    expect(topVisibleAnchor(split, ROW_HEIGHT, ROW_HEIGHT)).toBe(
      split[2].anchorIds[0],
    );
    expect(topVisibleAnchor([], 0, ROW_HEIGHT)).toBeNull();
  });

  it("topVisibleAnchor stays put when no changed line is in view", () => {
    const unified = buildDiffRows(smallDetail, "unified");
    // Only the hunk header is visible: no anchor, so the toggle does not jump.
    expect(topVisibleAnchor(unified, 0, ROW_HEIGHT, ROW_HEIGHT)).toBeNull();
    // Widen the viewport to include the deletion and it anchors there.
    expect(topVisibleAnchor(unified, 0, ROW_HEIGHT, 3 * ROW_HEIGHT)).toBe(
      unified[2].anchorId,
    );
  });

  it("renders a Load file affordance for a collapsed file", () => {
    const onLoadFile = vi.fn();
    render(
      <DiffViewer
        detail={detail([], { collapsed: true, additions: 40, deletions: 2 })}
        onLoadFile={onLoadFile}
      />,
    );
    const button = screen.getByRole("button", { name: "Load file" });
    fireEvent.click(button);
    expect(onLoadFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("diff-scroll")).toBeNull();
  });
});

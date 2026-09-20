import type { DiffFileDetail } from "@tethys/bindings";
import { describe, expect, it } from "vitest";
import { buildDiffRows, resolveAnchorIndex } from "./row-model";

function detail(
  partial: Partial<DiffFileDetail> & Pick<DiffFileDetail, "hunks">,
): DiffFileDetail {
  return {
    path: "src/example.ts",
    binary: false,
    collapsed: false,
    additions: 1,
    deletions: 1,
    ...partial,
  };
}

const singleHunk = detail({
  hunks: [
    {
      old_start: 10,
      old_lines: 3,
      new_start: 10,
      new_lines: 3,
      lines: [
        { kind: "Context", text: "a" },
        { kind: "Context", text: "b" },
        { kind: "Deletion", text: "c" },
        { kind: "Addition", text: "d" },
      ],
    },
  ],
});

describe("diff row model (M1.9 U1)", () => {
  it("unified: one hunk header plus every line, with correct numbering", () => {
    const rows = buildDiffRows(singleHunk, "unified");
    expect(rows.map((row) => row.kind)).toEqual([
      "hunk-header",
      "context",
      "context",
      "deletion",
      "addition",
    ]);
    expect(rows[1].cell?.oldLine).toBe(10);
    expect(rows[1].cell?.newLine).toBe(10);
    expect(rows[3].cell?.oldLine).toBe(12);
    expect(rows[3].cell?.newLine).toBeNull();
    expect(rows[3].cell?.gutter).toBe("−");
    expect(rows[4].cell?.oldLine).toBeNull();
    expect(rows[4].cell?.newLine).toBe(12);
    expect(rows[4].cell?.gutter).toBe("+");
  });

  it("split: deletion and addition pair onto one row", () => {
    const rows = buildDiffRows(singleHunk, "split");
    expect(rows.map((row) => row.kind)).toEqual([
      "hunk-header",
      "pair",
      "pair",
      "pair",
    ]);
    const changed = rows[3];
    expect(changed.left?.kind).toBe("Deletion");
    expect(changed.left?.text).toBe("c");
    expect(changed.right?.kind).toBe("Addition");
    expect(changed.right?.text).toBe("d");
    // context fills both cells
    expect(rows[1].left?.text).toBe("a");
    expect(rows[1].right?.text).toBe("a");
  });

  it("split links paired change cells for lazy word diff", () => {
    const rows = buildDiffRows(singleHunk, "split");
    const changed = rows[3];
    expect(changed.left?.facingAnchorId).toBe(changed.right?.anchorId);
    expect(changed.right?.facingAnchorId).toBe(changed.left?.anchorId);
    // a context pair has no facing change
    expect(rows[1].left?.facingAnchorId).toBeNull();
  });

  it("pure addition file numbers the new side and leaves old null", () => {
    const added = detail({
      additions: 2,
      deletions: 0,
      hunks: [
        {
          old_start: 0,
          old_lines: 0,
          new_start: 1,
          new_lines: 2,
          lines: [
            { kind: "Addition", text: "first" },
            { kind: "Addition", text: "second" },
          ],
        },
      ],
    });
    const rows = buildDiffRows(added, "unified").filter(
      (row) => row.kind === "addition",
    );
    expect(rows.map((row) => row.cell?.newLine)).toEqual([1, 2]);
    expect(rows.every((row) => row.cell?.oldLine === null)).toBe(true);
  });

  it("collapsed detail renders one marker row and no content rows", () => {
    const rows = buildDiffRows(
      detail({ collapsed: true, hunks: [] }),
      "unified",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("collapsed-context");
    expect(rows[0].text).toContain("changed lines");
  });

  it("binary detail renders one marker row", () => {
    const rows = buildDiffRows(detail({ binary: true, hunks: [] }), "split");
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain("Binary");
  });

  it("anchor stability: a source line keeps its anchorId across modes", () => {
    const unified = buildDiffRows(singleHunk, "unified");
    const split = buildDiffRows(singleHunk, "split");
    const unifiedDeletion = unified.find((row) => row.kind === "deletion");
    const splitDeletion = split[3].left;
    expect(unifiedDeletion?.cell?.anchorId).toBe(splitDeletion?.anchorId);

    const unifiedContext = unified[1].cell?.anchorId;
    expect(split[1].left?.anchorId).toBe(unifiedContext);
  });

  it("resolveAnchorIndex falls back to the nearest following line in the hunk", () => {
    const rows = buildDiffRows(singleHunk, "split");
    expect(resolveAnchorIndex(rows, "0:deletion:12")).toBe(3);
    // No context line 12 exists; the following addition line 12 is retained,
    // so the viewport lands there rather than at the file top.
    expect(resolveAnchorIndex(rows, "0:context:12")).toBe(3);
    // A line with nothing following in the hunk resolves to nothing.
    expect(resolveAnchorIndex(rows, "0:deletion:99")).toBeUndefined();
  });
});

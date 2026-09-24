import { describe, expect, it } from "vitest";
import { detailFromPatch, detailFromTexts } from "./patch";

describe("tool-call diffs", () => {
  it("reads a bare hunk list, as Core emits for ACP diff content", () => {
    const detail = detailFromPatch(
      "README.md",
      "@@ -1,3 +1,3 @@\n # Title\n-old line\n+new line\n tail\n",
    );
    expect(detail?.additions).toBe(1);
    expect(detail?.deletions).toBe(1);
    expect(detail?.hunks[0]?.lines.map((line) => line.kind)).toEqual([
      "Context",
      "Deletion",
      "Addition",
      "Context",
    ]);
  });

  it("reads a full patch with Index and file headers, as OpenCode reports it", () => {
    const patch = [
      "Index: /repo/README.md",
      "===================================================================",
      "--- /repo/README.md",
      "+++ /repo/README.md",
      "@@ -2,2 +2,4 @@",
      " A zero-commission protocol.",
      "+## Demo line",
      "+",
      " ## Quick Start",
      "",
    ].join("\n");
    const detail = detailFromPatch("/repo/README.md", patch);
    expect(detail?.path).toBe("/repo/README.md");
    expect(detail?.additions).toBe(2);
    expect(detail?.hunks[0]?.new_start).toBe(2);
  });

  it("returns nothing for text that is not a patch", () => {
    expect(detailFromPatch("a", "Edit applied successfully.")).toBeNull();
  });

  it("diffs the text before and after an edit with context around it", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n");
    const after = ["a", "b", "c", "d", "E", "f", "g", "h"].join("\n");
    const detail = detailFromTexts("x.ts", before, after);
    expect(detail?.additions).toBe(1);
    expect(detail?.deletions).toBe(1);
    const kinds = detail?.hunks[0]?.lines.map((line) => line.kind) ?? [];
    expect(kinds.filter((kind) => kind === "Context")).toHaveLength(6);
  });

  it("has nothing to show when the text did not change", () => {
    expect(detailFromTexts("x.ts", "same", "same")).toBeNull();
  });
});

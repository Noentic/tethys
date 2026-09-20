import { describe, expect, it } from "vitest";
import { diffWordSpans } from "./word-diff";

describe("word-level intra-line diff (M1.9 U2)", () => {
  it("marks only the changed token on a one-token edit", () => {
    const { oldSpans, newSpans } = diffWordSpans("let x = 1;", "let x = 2;");
    expect(oldSpans).toEqual([{ start: 8, end: 9 }]);
    expect(newSpans).toEqual([{ start: 8, end: 9 }]);
  });

  it("marks the whole line on a rewrite (no misleading unchanged gap)", () => {
    const { oldSpans, newSpans } = diffWordSpans(
      "alpha beta gamma",
      "delta epsilon",
    );
    expect(oldSpans).toEqual([{ start: 0, end: 16 }]);
    expect(newSpans).toEqual([{ start: 0, end: 13 }]);
  });

  it("marks re-indentation precisely", () => {
    const { oldSpans, newSpans } = diffWordSpans(
      "    return 1;",
      "  return 1;",
    );
    expect(oldSpans).toEqual([{ start: 0, end: 4 }]);
    expect(newSpans).toEqual([{ start: 0, end: 2 }]);
  });

  it("returns no spans for identical lines", () => {
    const { oldSpans, newSpans } = diffWordSpans("same();", "same();");
    expect(oldSpans).toEqual([]);
    expect(newSpans).toEqual([]);
  });

  it("every span stays within its line's length", () => {
    const { oldSpans, newSpans } = diffWordSpans(
      "if (a && b) { x(); }",
      "if (a || b) { y(); }",
    );
    expect(
      oldSpans.every((span) => span.end <= "if (a && b) { x(); }".length),
    ).toBe(true);
    expect(
      newSpans.every((span) => span.end <= "if (a || b) { y(); }".length),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { cn, TYPE_SCALE_STEPS } from "./utils";

describe("cn", () => {
  it("keeps a type step when a text color follows it", () => {
    for (const step of TYPE_SCALE_STEPS) {
      const merged = cn(`text-${step}`, "text-(--tethys-text-muted)");
      expect(merged, step).toContain(`text-${step}`);
      expect(merged, step).toContain("text-(--tethys-text-muted)");
    }
  });

  it("still lets a later type step override an earlier one", () => {
    expect(cn("text-body-sm", "text-label-md")).toBe("text-label-md");
  });

  it("still dedupes conflicting utilities", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

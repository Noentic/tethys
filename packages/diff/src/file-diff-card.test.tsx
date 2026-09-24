import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileDiffCard } from "./file-diff-card";
import { detailFromTexts } from "./patch";

const highlighter = { highlight: async () => [], cacheSize: 0 };

function edit(lines: number) {
  const before = Array.from({ length: lines }, (_, index) => `line ${index}`);
  const after = before.map((line, index) => (index % 2 ? `${line}!` : line));
  const detail = detailFromTexts(
    "src/app.ts",
    before.join("\n"),
    after.join("\n"),
  );
  if (!detail) throw new Error("expected a diff");
  return detail;
}

describe("FileDiffCard", () => {
  it("heads the diff with the verb, the path and a two-colour stat", () => {
    render(
      <FileDiffCard detail={edit(4)} verb="Edited" highlighter={highlighter} />,
    );
    expect(screen.getByText("Edited")).toBeTruthy();
    expect(screen.getByTitle("src/app.ts")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText("−2")).toBeTruthy();
  });

  it("marks every changed line with a glyph, not colour alone", () => {
    const { container } = render(
      <FileDiffCard detail={edit(4)} highlighter={highlighter} />,
    );
    expect(container.querySelectorAll('[data-gutter="+"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-gutter="−"]')).toHaveLength(2);
    expect(container.querySelectorAll(".diff-hatch-removed")).toHaveLength(2);
  });

  it("caps a long edit and shows the rest on demand", () => {
    const { container } = render(
      <FileDiffCard detail={edit(80)} highlighter={highlighter} />,
    );
    const more = screen.getByRole("button", { name: /Show \d+ more lines/ });
    const before = container.querySelectorAll("[data-row-kind]").length;
    fireEvent.click(more);
    expect(
      container.querySelectorAll("[data-row-kind]").length,
    ).toBeGreaterThan(before);
  });

  it("opens the file in the Changes panel when asked", () => {
    const onOpen = vi.fn();
    render(
      <FileDiffCard
        detail={edit(4)}
        onOpen={onOpen}
        highlighter={highlighter}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in Changes" }));
    expect(onOpen).toHaveBeenCalled();
  });
});

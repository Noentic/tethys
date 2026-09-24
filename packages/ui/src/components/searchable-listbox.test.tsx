import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchableListbox } from "./searchable-listbox";
import { TruncatedText } from "./truncated-text";

const MODELS = [
  { id: "openai/gpt-5.5", label: "GPT-5.5", group: "OpenAI" },
  { id: "openai/gpt-6-sol", label: "GPT-6 Sol", group: "OpenAI" },
  {
    id: "zen/big-pickle",
    label: "Big Pickle",
    group: "OpenCode Zen",
    description: "Free while in preview",
  },
];

describe("SearchableListbox", () => {
  it("filters the list by what is typed", () => {
    render(
      <SearchableListbox label="Model" items={MODELS} onSelect={() => {}} />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "pickle" },
    });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Big Pickle");
  });

  it("groups items under their heading", () => {
    render(
      <SearchableListbox label="Model" items={MODELS} onSelect={() => {}} />,
    );
    expect(screen.getByText("OpenAI")).toBeTruthy();
    expect(screen.getByText("OpenCode Zen")).toBeTruthy();
  });

  it("says nothing matched instead of showing a blank list", async () => {
    render(
      <SearchableListbox label="Model" items={MODELS} onSelect={() => {}} />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "qqq" },
    });
    expect(await screen.findByText(/No model matches/)).toBeTruthy();
  });

  it("reports the chosen item's id and marks the current one", () => {
    const onSelect = vi.fn();
    render(
      <SearchableListbox
        label="Model"
        items={MODELS}
        selectedId="openai/gpt-5.5"
        onSelect={onSelect}
      />,
    );
    const current = screen
      .getAllByRole("option")
      .find((option) => option.getAttribute("aria-selected") === "true");
    expect(current?.textContent).toContain("GPT-5.5");
    fireEvent.click(screen.getByText("Big Pickle"));
    expect(onSelect).toHaveBeenCalledWith("zen/big-pickle");
  });
});

describe("TruncatedText", () => {
  it("carries the full value as its tooltip", () => {
    render(<TruncatedText text="OpenCode Zen/Big Pickle" />);
    expect(screen.getByTitle("OpenCode Zen/Big Pickle")).toBeTruthy();
  });

  it("keeps a path's last segment whole", () => {
    const { container } = render(
      <TruncatedText mode="path" text="/home/me/Code/nebeng-api" />,
    );
    const parts = container.querySelectorAll("span > span");
    expect(parts[0].textContent).toBe("/home/me/Code/");
    expect(parts[1].textContent).toBe("nebeng-api");
  });
});

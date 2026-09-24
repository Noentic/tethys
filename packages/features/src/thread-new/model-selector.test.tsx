import { fireEvent, render, screen } from "@testing-library/react";
import type { ConfigOption } from "@tethys/bindings";
import { noProviderFixtures, providerConnectionFixtures } from "@tethys/state";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ModelSelector } from "./model-selector";

function renderSelector(
  overrides: Partial<ComponentProps<typeof ModelSelector>> = {},
) {
  const props: ComponentProps<typeof ModelSelector> = {
    providers: providerConnectionFixtures,
    selectedProviderId: "claude-code",
    onSelectProvider: vi.fn(),
    values: {},
    onConfigChange: vi.fn(),
    configOptions: providerConnectionFixtures[0]?.configSchema ?? [],
    ...overrides,
  };
  render(<ModelSelector {...props} />);
  return props;
}

function openPopover() {
  fireEvent.click(screen.getByRole("combobox"));
}

describe("ModelSelector", () => {
  it("mounts with an empty provider list without throwing", () => {
    renderSelector({ providers: noProviderFixtures, selectedProviderId: null });
    expect(screen.getByRole("combobox").textContent).toContain(
      "No provider available",
    );
    openPopover();
    expect(screen.getByText("No connected providers")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Settings \/ Providers/i }),
    ).toBeTruthy();
  });

  it("shows a searchable model list first and the remaining options on demand", () => {
    renderSelector();
    openPopover();
    expect(screen.getByPlaceholderText("Search models…")).toBeTruthy();
    expect(screen.getByRole("option", { name: /^Sonnet/ })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Effort" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options…" }));
    expect(screen.getByRole("combobox", { name: "Effort" })).toBeTruthy();
  });

  it("writes model and effort changes through their wire option ids", () => {
    const onConfigChange = vi.fn();
    const configOptions = (
      providerConnectionFixtures[0]?.configSchema ?? []
    ).map((option) =>
      option.category === "thought_level"
        ? { ...option, id: "effort" }
        : option,
    );
    renderSelector({ onConfigChange, configOptions });
    openPopover();
    fireEvent.click(screen.getByRole("option", { name: /^Opus/ }));
    fireEvent.click(screen.getByRole("button", { name: "More options…" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Effort" }), {
      target: { value: "high" },
    });
    expect(onConfigChange).toHaveBeenNthCalledWith(1, "model", "claude-opus-x");
    expect(onConfigChange).toHaveBeenNthCalledWith(2, "effort", "high");
  });

  it("finds a model by typing instead of scrolling", () => {
    renderSelector();
    openPopover();
    fireEvent.change(screen.getByPlaceholderText("Search models…"), {
      target: { value: "opus" },
    });
    const models = screen
      .getAllByRole("option")
      .filter((option) => option.hasAttribute("cmdk-item"));
    expect(models.map((option) => option.textContent)).toEqual([
      expect.stringMatching(/^Opus/),
    ]);
  });

  it("keeps mode out of the model popover and shows only the model summary", () => {
    const mode: ConfigOption = {
      id: "mode",
      name: "Mode",
      description: null,
      current_value: "manual",
      values: ["manual", "plan"],
      category: "mode",
      kind: "select",
      value_options: [
        { id: "manual", name: "Manual", description: null },
        { id: "plan", name: "Plan", description: null },
      ],
    };
    renderSelector({
      configOptions: [
        mode,
        ...(providerConnectionFixtures[0]?.configSchema ?? []),
      ],
    });
    expect(screen.getByRole("combobox").textContent).toContain("Sonnet");
    expect(screen.getByRole("combobox").textContent).not.toContain("Manual");
    openPopover();
    expect(screen.queryByRole("listbox", { name: "Mode" })).toBeNull();
  });

  it("shows the empty-state copy when the provider has no options", () => {
    renderSelector({ selectedProviderId: "codex-cli", configOptions: [] });
    openPopover();
    expect(
      screen.getByText("No session options for this provider"),
    ).toBeTruthy();
  });

  it("names draft progress instead of options while the session prepares", () => {
    renderSelector({ draftStatus: "preparing", configOptions: [] });
    openPopover();
    expect(
      screen.getAllByText("Preparing the session…").length,
    ).toBeGreaterThan(0);
  });

  it("gates an auth_required provider and offers Sign in", () => {
    renderSelector({ selectedProviderId: "gemini-cli" });
    openPopover();
    expect(screen.getAllByText("Sign in").length).toBeGreaterThan(0);
    const gemini = screen
      .getAllByRole("option")
      .find((option) => option.textContent?.includes("Gemini CLI"));
    expect(gemini?.getAttribute("aria-disabled")).toBe("true");
  });
});

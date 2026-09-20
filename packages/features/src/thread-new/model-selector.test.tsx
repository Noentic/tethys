import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders one schema-field-group per ConfigOption", () => {
    renderSelector();
    openPopover();
    expect(screen.getByRole("listbox", { name: "Model" })).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Effort" })).toBeTruthy();
  });

  it("shows the empty-state copy when the provider has no options", () => {
    renderSelector({ selectedProviderId: "codex-cli" });
    openPopover();
    expect(
      screen.getByText("No session options for this provider"),
    ).toBeTruthy();
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

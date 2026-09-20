import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ConfigOption } from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import { ComposerConfigChips, chipOptions } from "./config-chips";

function option(
  id: string,
  category: string,
  values: Array<[string, string]>,
  current: string,
): ConfigOption {
  return {
    id,
    name: id,
    description: null,
    current_value: current,
    values: values.map(([valueId]) => valueId),
    category,
    kind: "select",
    value_options: values.map(([valueId, name]) => ({
      id: valueId,
      name,
      description: null,
    })),
  };
}

const model = option(
  "model",
  "model",
  [
    ["claude-sonnet-x", "Sonnet"],
    ["claude-opus-x", "Opus"],
  ],
  "claude-sonnet-x",
);
const effort = option(
  "thought_level",
  "thought_level",
  [
    ["low", "Low"],
    ["high", "High"],
  ],
  "low",
);
const mode = option("mode", "mode", [["plan", "Plan"]], "plan");
const modelConfig = option("model_config", "model_config", [["a", "A"]], "a");

describe("ComposerConfigChips", () => {
  it("shows exactly the model and thought_level chips, never mode/others", () => {
    expect(
      chipOptions([model, effort, mode, modelConfig]).map((o) => o.id),
    ).toEqual(["model", "thought_level"]);
    expect(chipOptions([mode, modelConfig])).toEqual([]);
  });

  it("renders the value's display name, not its id", () => {
    render(
      <ComposerConfigChips
        options={[model]}
        values={{ model: "claude-sonnet-x" }}
        providerName="Claude Code"
        onSetOption={vi.fn()}
      />,
    );
    expect(screen.getByText("Sonnet")).toBeTruthy();
    expect(screen.queryByText("claude-sonnet-x")).toBeNull();
  });

  it("reverts the chip and shows the notice when the provider rejects", async () => {
    const onSetOption = vi.fn().mockRejectedValue(new Error("rejected"));
    render(
      <ComposerConfigChips
        options={[effort]}
        values={{ thought_level: "low" }}
        providerName="Claude Code"
        onSetOption={onSetOption}
      />,
    );
    fireEvent.click(screen.getByText("Low"));
    fireEvent.click(screen.getByRole("option", { name: "High" }));
    await waitFor(() =>
      expect(screen.getByTestId("provider-capability-notice")).toBeTruthy(),
    );
    expect(screen.getByText("Low")).toBeTruthy();
  });
});

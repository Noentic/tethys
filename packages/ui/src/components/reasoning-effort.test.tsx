import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReasoningEffort } from "./reasoning-effort";

const LEVELS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
];

describe("ReasoningEffort", () => {
  it("names the current level and both ends of the provider's effort scale", () => {
    render(
      <ReasoningEffort
        label="Effort effort"
        levels={LEVELS}
        value="medium"
        onChange={() => {}}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Effort effort" });
    expect(slider.getAttribute("aria-valuetext")).toBe("Medium");
    expect(screen.getByText("Low")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("Medium")).toBeTruthy();
  });

  it("dynamically adapts to 5-level scales like None to X-High", () => {
    const fiveLevels = [
      { id: "none", name: "None" },
      { id: "low", name: "Low" },
      { id: "medium", name: "Medium" },
      { id: "high", name: "High" },
      { id: "xhigh", name: "X-High" },
    ];
    render(
      <ReasoningEffort
        label="Effort effort"
        levels={fiveLevels}
        value="low"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.getByText("X-High")).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
  });

  it("reports the level id for the step chosen", () => {
    const onChange = vi.fn();
    render(
      <ReasoningEffort
        label="Effort effort"
        levels={LEVELS}
        value="low"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith("high");
  });

  it("allows selecting a level by clicking its label button", () => {
    const onChange = vi.fn();
    render(
      <ReasoningEffort
        label="Effort effort"
        levels={LEVELS}
        value="low"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "High" }));
    expect(onChange).toHaveBeenCalledWith("high");
  });

  it("highlights the hovered level on pointer enter", () => {
    render(
      <ReasoningEffort
        label="Effort effort"
        levels={LEVELS}
        value="low"
        onChange={() => {}}
      />,
    );
    const mediumButton = screen.getByRole("button", { name: "Medium" });
    expect(mediumButton.className).toContain("text-(--tethys-text-muted)");
    fireEvent.pointerEnter(mediumButton);
    expect(mediumButton.className).toContain("text-(--tethys-text-primary)");
    fireEvent.pointerLeave(mediumButton);
    expect(mediumButton.className).toContain("text-(--tethys-text-muted)");
  });
});

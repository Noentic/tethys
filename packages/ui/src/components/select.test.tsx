import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./select";

describe("Select", () => {
  it("forwards value, change and className, and renders its own chevron", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select
        aria-label="Color scheme"
        className="h-7"
        value="dark"
        onChange={onChange}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </Select>,
    );
    const select = screen.getByRole("combobox", { name: "Color scheme" });
    expect(select.getAttribute("class")).toContain("h-7");
    expect(select.getAttribute("class")).toContain("appearance-none");
    expect((select as HTMLSelectElement).value).toBe("dark");
    fireEvent.change(select, { target: { value: "light" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("mutes the chevron when the select is disabled", () => {
    const { container } = render(
      <Select aria-label="Terminal font" disabled value="mono">
        <option value="mono">Mono</option>
      </Select>,
    );
    const select = screen.getByRole("combobox", { name: "Terminal font" });
    expect(select.hasAttribute("disabled")).toBe(true);
    const chevron = container.querySelector("svg");
    expect(chevron?.getAttribute("class")).toContain(
      "peer-disabled:opacity-40",
    );
  });
});

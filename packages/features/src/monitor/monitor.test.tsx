import { fireEvent, render, screen } from "@testing-library/react";
import type { ProcessSample } from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import { ActivityTable } from "./activity-table";

function sample(
  pid: number,
  overrides: Partial<ProcessSample> = {},
): ProcessSample {
  return {
    pid,
    cpu: 12.5,
    rss: 32 * 1024 * 1024,
    uptime_secs: 90,
    state: "sleep",
    leader: false,
    ...overrides,
  };
}

describe("activity table (M1.13 U11)", () => {
  it("renders one process-row per sample", () => {
    render(
      <ActivityTable
        samples={[sample(100, { leader: true }), sample(101), sample(102)]}
      />,
    );
    const rows = screen.getAllByTestId("process-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("100");
    expect(rows[0].textContent).toContain("12.5%");
    expect(rows[0].textContent).toContain("32.0 MiB");
    expect(rows[0].textContent).toContain("1m 30s");
    expect(rows[0].textContent).toContain("sleep");
  });

  it("keeps the ladder neutral while cancel is requested", () => {
    render(
      <ActivityTable
        samples={[sample(100, { leader: true }), sample(101)]}
        cancelPhase="cancel_requested"
      />,
    );
    for (const row of screen.getAllByTestId("process-row")) {
      expect(row.getAttribute("data-destructive")).toBeNull();
    }
  });

  it("takes destructive styling only once grace elapsed", () => {
    render(
      <ActivityTable
        samples={[sample(100, { leader: true }), sample(101)]}
        cancelPhase="grace_elapsed"
      />,
    );
    const rows = screen.getAllByTestId("process-row");
    expect(
      rows
        .find((row) => row.getAttribute("data-leader") === "false")
        ?.getAttribute("data-destructive"),
    ).toBe("true");
  });

  it("invokes restart from the only MVP action", () => {
    const onRestart = vi.fn();
    render(
      <ActivityTable
        samples={[sample(1, { leader: true })]}
        onRestart={onRestart}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("renders an empty state rather than crashing", () => {
    render(<ActivityTable samples={[]} />);
    expect(screen.getByText("No active processes")).toBeTruthy();
    expect(screen.queryAllByTestId("process-row")).toHaveLength(0);
  });

  it("is a semantic table", () => {
    render(<ActivityTable samples={[sample(1, { leader: true })]} />);
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

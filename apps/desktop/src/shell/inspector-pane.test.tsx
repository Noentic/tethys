import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InspectorPane } from "./InspectorPane";

describe("InspectorPane header and collapse (d0-rc9)", () => {
  it("names the session state in the header badge", () => {
    render(<InspectorPane sessionId="s1" status="awaiting_approval" />);
    expect(screen.getByText("Thread Inspector")).toBeDefined();
    expect(screen.getByText("Awaiting approval").style.color).toBe(
      "var(--tethys-status-warning)",
    );
  });

  it("offers a Collapse control and reports its expanded state", () => {
    const onToggleCollapse = vi.fn();
    render(
      <InspectorPane
        sessionId="s1"
        status="running"
        onToggleCollapse={onToggleCollapse}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Collapse/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("switches between Overview and Changes and exposes the expand action", async () => {
    const onExpand = vi.fn();
    render(<InspectorPane onExpand={onExpand} />);
    expect(screen.getByRole("tabpanel", { name: "Overview" })).toBeDefined();
    fireEvent.click(screen.getByRole("tab", { name: "Changes 0" }));
    expect(screen.getByRole("tabpanel", { name: "Changes" })).toBeDefined();
    await waitFor(() =>
      expect(screen.getByTestId("review-hidden")).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand side panel" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("collapses to a rail that keeps the breathing marker visible", () => {
    render(<InspectorPane sessionId="s1" status="running" collapsed />);
    expect(screen.getByTestId("inspector-rail")).toBeDefined();
    // A pending request must never become invisible just because the panel is
    // collapsed (State Precedence rule 5): the marker stays on the rail.
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Running",
    );
    expect(screen.queryByText("Thread Inspector")).toBeNull();
  });

  it("keeps the overlay close affordance instead of a collapse toggle", () => {
    render(
      <InspectorPane
        sessionId="s1"
        status="idle"
        isOverlay
        onCloseOverlay={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Close inspector" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Collapse/ })).toBeNull();
  });
});

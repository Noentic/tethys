import { fireEvent, render, screen } from "@testing-library/react";
import {
  clearAllSessionStoresForTesting,
  createInitialSessionState,
  createSessionStore,
} from "@tethys/state";
import {
  clearRegistriesForTesting,
  registerApprovalDrawerBody,
} from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell Layout & States", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
  });

  it("renders with pinned Workspaces tab at index 0 which cannot be closed", () => {
    render(<AppShell activeRoute="/workspaces" />);

    // Tab strip should contain Workspaces
    const wsTab = screen.getByRole("tab", { name: /workspaces/i });
    expect(wsTab).toBeDefined();

    // Workspaces tab should not have a close button
    const closeBtn = wsTab.querySelector(
      'button[aria-label="Close Workspaces"]',
    );
    expect(closeBtn).toBeNull();
  });

  it("adds closable tab when navigating to a thread session", () => {
    const initial = createInitialSessionState(
      "thread-abc",
      "claude-code",
      "ws-1",
      "Fix auth bug",
    );
    createSessionStore({
      ...initial,
      status: "running",
      turnCount: 2,
    });

    render(<AppShell activeRoute="/thread/thread-abc" />);

    const threadTab = screen.getByRole("tab", { name: /Fix auth bug/i });
    expect(threadTab).toBeDefined();

    // Closable tab has close button
    const closeBtn = screen.getByLabelText("Close Fix auth bug");
    expect(closeBtn).toBeDefined();
  });

  it("renders approval-inbox-pill when count >= 1 and hides when 0", () => {
    const { rerender } = render(<AppShell activeRoute="/workspaces" />);

    // Count is 0 -> pill is not visible in DOM
    expect(screen.queryByLabelText(/pending approvals/i)).toBeNull();

    // Now add a session awaiting approval
    const initial = createInitialSessionState(
      "thread-pending",
      "claude-code",
      "ws-1",
      "Pending Permission",
    );
    createSessionStore({
      ...initial,
      status: "awaiting_approval",
      turnCount: 1,
    });

    rerender(<AppShell activeRoute="/workspaces" />);

    const pill = screen.getByLabelText(/Waiting on you/i);
    expect(pill).toBeDefined();
  });

  it("tracks window focus/blur state", () => {
    const { container } = render(<AppShell activeRoute="/workspaces" />);
    const root = container.firstChild as HTMLElement;

    expect(root.getAttribute("data-window-focused")).toBe("true");

    // Simulate window blur
    fireEvent(window, new Event("blur"));
    expect(root.getAttribute("data-window-focused")).toBe("false");

    // Simulate window focus
    fireEvent(window, new Event("focus"));
    expect(root.getAttribute("data-window-focused")).toBe("true");
  });
});

describe("Replaceable approval drawer body (M1.6c U10)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
  });

  it("renders a registered approval drawer body instead of the default", () => {
    registerApprovalDrawerBody(({ sessions }) => (
      <div data-testid="registered-body">registered {sessions.length}</div>
    ));
    createSessionStore({
      ...createInitialSessionState("thread-approve", "p-1", "ws-1", "Approve"),
      status: "awaiting_approval",
    });

    render(<AppShell activeRoute="/workspaces" />);
    fireEvent.click(screen.getByLabelText(/Waiting on you/i));
    expect(screen.getByTestId("registered-body")).toBeDefined();
  });
});

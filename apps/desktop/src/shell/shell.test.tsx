import { fireEvent, render, screen } from "@testing-library/react";
import {
  clearAllSessionStoresForTesting,
  createInitialSessionState,
  createSessionStore,
  getOrCreateSessionStore,
  selectCancellationState,
} from "@tethys/state";
import {
  clearRegistriesForTesting,
  registerApprovalDrawerBody,
} from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { ActionBar } from "./ActionBar";
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

describe("ActionBar Stop Button States", () => {
  it("renders neutral Stop button during idle and cancel_requested", () => {
    const { rerender } = render(<ActionBar cancellationState="idle" />);
    const stopBtn = screen.getByRole("button", { name: "Stop" });
    expect(stopBtn.className).not.toContain("text-(--tethys-status-danger)");

    rerender(<ActionBar cancellationState="cancel_requested" />);
    const cancellingBtn = screen.getByRole("button", { name: /Cancelling/ });
    expect(cancellingBtn.className).not.toContain(
      "text-(--tethys-status-danger)",
    );
    expect(cancellingBtn.getAttribute("aria-busy")).toBe("true");
  });

  it("renders destructive styling exclusively during grace_elapsed and terminating", () => {
    const { rerender } = render(
      <ActionBar cancellationState="grace_elapsed" />,
    );
    const forceKillBtn = screen.getByRole("button", { name: /Force kill/ });
    expect(forceKillBtn.className).toContain("text-(--tethys-status-danger)");

    rerender(<ActionBar cancellationState="terminating" />);
    const termBtn = screen.getByRole("button", {
      name: /Terminating \(SIGKILL\)/,
    });
    expect(termBtn.className).toContain("text-(--tethys-status-danger)");
  });

  it("shows the isolation pill as the branch, or no git", () => {
    const { rerender } = render(
      <ActionBar cancellationState="idle" worktreeBranch="feat/isolation" />,
    );
    expect(screen.getByText("feat/isolation")).toBeDefined();

    rerender(<ActionBar cancellationState="idle" noGit />);
    expect(screen.getByText("no git")).toBeDefined();

    rerender(<ActionBar cancellationState="idle" />);
    expect(screen.queryByText("no git")).toBeNull();
  });
});

describe("Cancel ladder and replaceable drawer body (M1.6c U4 / U10)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
  });

  it("one press sends a cancel request; a second press does not advance the ladder", () => {
    createSessionStore(
      createInitialSessionState("thread-stop", "p-1", "ws-1", "Stop me"),
    );
    render(<AppShell activeRoute="/thread/thread-stop" />);

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    const store = getOrCreateSessionStore("thread-stop");
    expect(selectCancellationState(store.state)).toBe("cancel_requested");

    const pending = screen.getByRole("button", { name: /Cancelling/ });
    expect(pending.hasAttribute("disabled")).toBe(true);
    fireEvent.click(pending);
    expect(selectCancellationState(store.state)).toBe("cancel_requested");
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

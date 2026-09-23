import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TurnEventBody } from "@tethys/bindings";
import { InspectorScreen, registerInspectorRenderers } from "@tethys/features";
import {
  clearAllSessionStoresForTesting,
  createInitialSessionState,
  createSessionStore,
  getOrCreateSessionStore,
  sessionReducer,
} from "@tethys/state";
import {
  clearRegistriesForTesting,
  registerInspectorSlot,
  useInspectorControl,
} from "@tethys/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// The thread view is Rail | Stage | Inspector. Sessions is an on-demand overlay
// drawer, and the Inspector renders once (DESIGN.md Shell Structure).

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

const noopClient = {
  permission: {
    respond: vi.fn().mockResolvedValue(undefined),
    elicitationRespond: vi.fn().mockResolvedValue(undefined),
  },
  events: { subscribe: vi.fn().mockResolvedValue(undefined) },
};

function seedSession(id: string, title: string) {
  createSessionStore({
    ...createInitialSessionState(id, "claude-code", "ws-1", title),
    status: "running",
  });
}

describe("three-region shell", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
    registerInspectorRenderers();
    setWindowWidth(1440);
  });

  it("docks Rail | Stage | Inspector and leaves Sessions closed", () => {
    seedSession("s1", "Fix auth bug");
    render(<AppShell activeRoute="/thread/s1" />);

    expect(screen.getByTestId("inspector-pane-shell")).toBeDefined();
    expect(
      screen.queryByRole("navigation", { name: "Sessions Column" }),
    ).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("labels a thread tab with its live title and Provider glyph", () => {
    seedSession("s1", "Fix auth bug");
    render(<AppShell activeRoute="/thread/s1" />);

    const tab = screen.getByRole("tab", { name: "Fix auth bug" });
    expect(within(tab).getByTestId("provider-glyph")).toBeDefined();
  });

  it("renders no action bar: no footer, and the composer is the card in the Stage", () => {
    seedSession("s1", "Fix auth bug");
    render(<AppShell activeRoute="/thread/s1" />);
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("opens Sessions as a modal drawer from the titlebar and restores focus on Esc", () => {
    seedSession("s1", "Fix auth bug");
    render(<AppShell activeRoute="/thread/s1" />);
    const toggle = screen.getByRole("button", {
      name: "Toggle sessions sidebar",
    });
    toggle.focus();
    fireEvent.click(toggle);

    const drawer = screen.getByRole("dialog", { name: "Sessions" });
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    expect(
      within(drawer).getByRole("navigation", { name: "Sessions Column" }),
    ).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("closes the drawer and navigates when a session is chosen", () => {
    seedSession("s1", "Fix auth bug");
    const onNavigate = vi.fn();
    render(<AppShell activeRoute="/workspaces" onNavigate={onNavigate} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle sessions sidebar" }),
    );

    const drawer = screen.getByRole("dialog", { name: "Sessions" });
    fireEvent.click(
      within(drawer).getByRole("button", { name: /Fix auth bug/ }),
    );

    expect(onNavigate).toHaveBeenCalledWith("/thread/s1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles the Sessions drawer with Ctrl+B", () => {
    render(<AppShell activeRoute="/thread/s1" />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Sessions" })).toBeDefined();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("makes the Inspector a modal overlay below 1100px, not a docked pane", () => {
    setWindowWidth(900);
    function OpenInspector() {
      const { open } = useInspectorControl();
      return (
        <button type="button" onClick={open}>
          open inspector
        </button>
      );
    }
    render(
      <AppShell activeRoute="/thread/s1">
        <OpenInspector />
      </AppShell>,
    );
    expect(screen.queryByTestId("inspector-pane-shell")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "open inspector" }));
    const overlay = screen.getByRole("dialog", { name: "Thread Inspector" });
    expect(overlay.getAttribute("aria-modal")).toBe("true");
    expect(within(overlay).getByTestId("inspector-pane-shell")).toBeDefined();
    // The drawer supplies the scrim; the Inspector keeps its own header.
    expect(screen.getAllByText("Thread Inspector")).toHaveLength(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens Changes in the Inspector overlay below the docked breakpoint", async () => {
    setWindowWidth(1040);
    seedSession("s1", "Fix auth bug");
    function OpenChanges() {
      const { openChanges } = useInspectorControl();
      return (
        <button type="button" onClick={() => openChanges?.()}>
          open changes
        </button>
      );
    }
    render(
      <AppShell activeRoute="/thread/s1">
        <OpenChanges />
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "open changes" }));

    const overlay = screen.getByRole("dialog", { name: "Thread Inspector" });
    expect(within(overlay).getByRole("tab", { name: /Changes/ })).toBeDefined();
    await within(overlay).findByText("No changes to review");
    expect(screen.getAllByTestId("inspector-pane-shell")).toHaveLength(1);
  });

  it("mounts each registered Inspector slot exactly once", () => {
    const Probe = () => <div data-testid="probe-slot">probe</div>;
    registerInspectorSlot("probe", Probe);
    seedSession("s1", "Fix auth bug");
    render(<AppShell activeRoute="/thread/s1" />);
    expect(screen.getAllByTestId("probe-slot")).toHaveLength(1);
    expect(
      screen.getAllByRole("complementary", { name: "Thread Inspector" }),
    ).toHaveLength(1);
  });

  it("shows the plan once when the transcript surface is mounted beside the shell Inspector", () => {
    const store = getOrCreateSessionStore("s-plan", "claude-code", "ws-1");
    act(() => {
      store.setState((state) =>
        sessionReducer(state, {
          type: "PlanUpsert",
          body: {
            plan_id: "default",
            plan: {
              entries: [
                {
                  content: "step one",
                  priority: "Medium",
                  status: "InProgress",
                },
              ],
            },
          },
        } as TurnEventBody),
      );
    });
    render(
      <AppShell activeRoute="/thread/s-plan">
        <InspectorScreen sessionId="s-plan" client={noopClient} />
      </AppShell>,
    );
    expect(screen.getAllByText("Plan · 0/1 complete")).toHaveLength(1);
    expect(screen.getAllByText("Thread Inspector")).toHaveLength(1);
  });
});

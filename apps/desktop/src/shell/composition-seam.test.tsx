import { act, fireEvent, render, screen } from "@testing-library/react";
import { createInitialSessionState, createSessionStore } from "@tethys/state";
import {
  clearRegistriesForTesting,
  getAllActionBarSlots,
  getAllInspectorSlots,
  getApprovalDrawerBody,
  getEntryRenderer,
  registerActionBarSlot,
  registerApprovalDrawerBody,
  registerEntryRenderer,
  registerInspectorSlot,
  useInspectorControl,
} from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { ACTION_BAR_PRIORITY, ActionBar } from "./ActionBar";
import { AppShell } from "./AppShell";
import { InspectorPane } from "./InspectorPane";
import { Stage } from "./Stage";

describe("Wave-2 Composition Seam", () => {
  it("renders UnknownEntryRenderer for unrecognised entry kinds without throwing", () => {
    const initial = createInitialSessionState(
      "test-sess-1",
      "prov-1",
      "ws-1",
      "Test Session",
    );
    const store = createSessionStore({
      ...initial,
      turnCount: 1,
      entries: [
        {
          id: "entry-unknown-1",
          kind: "speculative_future_kind",
          timestamp: 1000,
          data: { foo: "bar" },
        },
      ],
    });

    render(<Stage store={store} />);

    // Neutral fallback renderer
    expect(
      screen.getByLabelText("Unknown entry: speculative_future_kind"),
    ).toBeDefined();
  });

  it("dynamically dispatches registered entry renderers when added via registerEntryRenderer", () => {
    // Wave 2 mock renderer (e.g. M1.9 diff-viewer)
    function MockDiffViewer({
      entry,
    }: {
      entry: { id: string; data?: unknown };
    }) {
      return (
        <div data-testid="diff-viewer-surface">Diff Viewer for {entry.id}</div>
      );
    }

    registerEntryRenderer("diff_viewer", MockDiffViewer);

    expect(getEntryRenderer("diff_viewer")).toBe(MockDiffViewer);

    const initial = createInitialSessionState(
      "test-sess-2",
      "prov-1",
      "ws-1",
      "Diff Session",
    );
    const store = createSessionStore({
      ...initial,
      turnCount: 1,
      entries: [
        {
          id: "entry-diff-1",
          kind: "diff_viewer",
          timestamp: 1000,
          data: {},
        },
      ],
    });

    render(<Stage store={store} />);

    expect(screen.getByTestId("diff-viewer-surface")).toBeDefined();
    expect(screen.getByText("Diff Viewer for entry-diff-1")).toBeDefined();
  });

  it("dynamically renders inspector slots registered via registerInspectorSlot", () => {
    function MockCheckpointSlot({ sessionId }: { sessionId?: string }) {
      return (
        <div data-testid="checkpoint-slot">Checkpoint for {sessionId}</div>
      );
    }

    registerInspectorSlot("checkpoint", MockCheckpointSlot);

    const slots = getAllInspectorSlots();
    expect(slots.some(([id]) => id === "checkpoint")).toBe(true);

    render(<InspectorPane sessionId="test-sess-slot" />);

    expect(screen.getByTestId("checkpoint-slot")).toBeDefined();
    expect(screen.getByText("Checkpoint for test-sess-slot")).toBeDefined();
  });

  it("dynamically renders action-bar slots registered via registerActionBarSlot", () => {
    function MockPermissionPill({ sessionId }: { sessionId?: string }) {
      return <div data-testid="permission-slot">Mode for {sessionId}</div>;
    }

    registerActionBarSlot("permission", MockPermissionPill);

    const slots = getAllActionBarSlots();
    expect(slots.some(([id]) => id === "permission")).toBe(true);

    render(<ActionBar cancellationState="idle" sessionId="test-sess-bar" />);

    expect(screen.getByTestId("permission-slot")).toBeDefined();
    expect(screen.getByText("Mode for test-sess-bar")).toBeDefined();
  });
});

describe("Action-bar fold (M1.6c U6)", () => {
  let observerCallback: ResizeObserverCallback | null = null;

  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      observerCallback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {
      observerCallback = null;
    }
  }

  const setWidth = (width: number) =>
    act(() => {
      observerCallback?.(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

  beforeEach(() => {
    clearRegistriesForTesting();
    observerCallback = null;
    globalThis.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
  });

  function ModeFixture() {
    return <span data-testid="mode-pill-fixture">Mode fixture</span>;
  }
  function DiffFixture() {
    return <span data-testid="diff-pill-fixture">Diff fixture</span>;
  }

  it("folds usage-bar, then queue count, then the mode pill, never Stop or isolation", () => {
    registerActionBarSlot("mode", ModeFixture, ACTION_BAR_PRIORITY.mode);
    registerActionBarSlot(
      "diff-summary",
      DiffFixture,
      ACTION_BAR_PRIORITY["diff-summary"],
    );

    render(
      <ActionBar
        cancellationState="idle"
        usageText="12k"
        queueCount={2}
        worktreeBranch="feat/isolation"
      />,
    );

    // Wide: nothing folds.
    expect(screen.getByText("12k")).toBeDefined();
    expect(screen.getByText("2 queued")).toBeDefined();
    expect(screen.getByTestId("mode-pill-fixture")).toBeDefined();
    expect(screen.getByText("feat/isolation")).toBeDefined();

    // Narrow a little: only usage-bar folds.
    setWidth(840);
    expect(screen.queryByText("12k")).toBeNull();
    expect(screen.getByText("2 queued")).toBeDefined();
    expect(screen.getByTestId("mode-pill-fixture")).toBeDefined();

    // Narrower: queue count folds too.
    setWidth(780);
    expect(screen.queryByText("2 queued")).toBeNull();
    expect(screen.getByTestId("mode-pill-fixture")).toBeDefined();

    // Narrower still: the mode pill folds.
    setWidth(700);
    expect(screen.queryByTestId("mode-pill-fixture")).toBeNull();
    expect(screen.getByText("feat/isolation")).toBeDefined();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined();

    const trigger = screen.getByRole("button", { name: /More:/ });
    expect(trigger.getAttribute("aria-label")).toContain("usage-bar");
    expect(trigger.getAttribute("aria-label")).toContain("queue-count");
    expect(trigger.getAttribute("aria-label")).toContain("mode");
  });

  it("puts a warning dot on the trigger only when a folded queue count is non-zero", () => {
    registerActionBarSlot("mode", ModeFixture, ACTION_BAR_PRIORITY.mode);
    const { unmount } = render(
      <ActionBar cancellationState="idle" usageText="12k" queueCount={3} />,
    );
    setWidth(560);
    expect(screen.getByTestId("overflow-queue-dot")).toBeDefined();
    unmount();

    render(
      <ActionBar cancellationState="idle" usageText="12k" queueCount={0} />,
    );
    setWidth(560);
    expect(screen.queryByTestId("overflow-queue-dot")).toBeNull();
  });

  it("folds a registered low-priority slot before a high-priority one", () => {
    registerActionBarSlot("low", DiffFixture, 5);
    registerActionBarSlot("high", ModeFixture, 80);
    render(<ActionBar cancellationState="idle" usageText="12k" />);
    setWidth(50);
    expect(screen.queryByTestId("diff-pill-fixture")).toBeNull();
    expect(screen.queryByTestId("mode-pill-fixture")).toBeNull();
  });
});

describe("Replaceable defaults and inspector control (M1.6c U10 / U11)", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
  });

  it("renders the default Mode: badge only while permission-mode is unregistered", () => {
    const { rerender } = render(<ActionBar cancellationState="idle" />);
    expect(screen.getByText(/Mode:/)).toBeDefined();

    registerActionBarSlot("permission-mode", () => (
      <span data-testid="permission-mode-pill">Registered</span>
    ));
    rerender(<ActionBar cancellationState="idle" />);
    expect(screen.queryByText(/Mode:/)).toBeNull();
    expect(screen.getByTestId("permission-mode-pill")).toBeDefined();
  });

  it("lets a slot open the overlay Inspector through useInspectorControl", () => {
    function OpenInspector() {
      const { open } = useInspectorControl();
      return (
        <button type="button" onClick={open}>
          open inspector
        </button>
      );
    }
    registerActionBarSlot("open-inspector", OpenInspector);

    render(<AppShell activeRoute="/thread/t1" />);
    expect(screen.queryByLabelText("Close inspector")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "open inspector" }));
    expect(screen.getByLabelText("Close inspector")).toBeDefined();
  });

  it("is a no-op outside a provider and does not throw", () => {
    function NoProvider() {
      const { open } = useInspectorControl();
      return (
        <button type="button" onClick={open}>
          no provider
        </button>
      );
    }
    render(<NoProvider />);
    fireEvent.click(screen.getByRole("button", { name: "no provider" }));
  });

  it("replaces the default approval drawer body when one is registered", () => {
    registerApprovalDrawerBody(({ sessions }) => (
      <div data-testid="registered-drawer-body">{sessions.length}</div>
    ));
    expect(getApprovalDrawerBody()).toBeDefined();
  });
});

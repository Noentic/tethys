import { fireEvent, render, screen } from "@testing-library/react";
import { createInitialSessionState, createSessionStore } from "@tethys/state";
import {
  clearRegistriesForTesting,
  getAllInspectorSlots,
  getApprovalDrawerBody,
  getEntryRenderer,
  registerApprovalDrawerBody,
  registerEntryRenderer,
  registerInspectorSlot,
  useInspectorControl,
} from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
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
});

describe("Replaceable defaults and inspector control (M1.6c U10 / U11)", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
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

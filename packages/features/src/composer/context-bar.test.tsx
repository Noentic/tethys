import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ConfigOption } from "@tethys/bindings";
import {
  CONTEXT_BAR_PRIORITY,
  clearRegistriesForTesting,
  registerComposerContextSlot,
} from "@tethys/ui";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBar, formatUsage } from "./context-bar";
import { registerQueueCountSlot } from "./queue-count-slot";

// The row's width budget, from the pure fold (packages/ui/src/context-bar-fold):
// provider 170 + diff 110 + mode 80 + queue 90 + usage 70 and 24 of gaps. The stop control is in the card's lower bar, so it
// is not part of this row.
const EVERYTHING_FITS = 544;

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

function ModeFixture() {
  return <span data-testid="mode-pill-fixture">Mode fixture</span>;
}
function DiffFixture() {
  return <span data-testid="diff-pill-fixture">Diff fixture</span>;
}

function option(
  id: string,
  name: string,
  category: string,
  current = "a",
): ConfigOption {
  return {
    id,
    name,
    description: null,
    current_value: current,
    values: ["a", "b"],
    category,
    kind: "select",
    value_options: [
      { id: "a", name: "Alpha", description: null },
      { id: "b", name: "Beta", description: null },
    ],
  };
}

const baseProps = {
  sessionId: "s-bar",
  providerName: "claude-code",
  configOptions: [] as ConfigOption[],
  values: {},
  onSetOption: vi.fn().mockResolvedValue(undefined),
  queueCount: 0,
};

describe("formatUsage", () => {
  it("uses input/output when the provider reports them", () => {
    expect(
      formatUsage({
        input_tokens: 1200,
        output_tokens: 340,
        total_tokens: 1540,
        cost: null,
      }),
    ).toBe("1,200 in · 340 out");
  });

  it("falls back to total/context for v1 used/size updates", () => {
    expect(
      formatUsage({
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 4200,
        cost: 0.12,
        context_size: 8000,
        cost_currency: "USD",
      }),
    ).toBe("4,200 tokens · ctx 8,000 · 0.12 USD");
  });
});

describe("context bar", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
    observerCallback = null;
    globalThis.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
  });

  describe("fold", () => {
    function registerFullRow() {
      registerComposerContextSlot(
        "mode",
        ModeFixture,
        CONTEXT_BAR_PRIORITY.mode,
      );
      registerComposerContextSlot(
        "diff-summary",
        DiffFixture,
        CONTEXT_BAR_PRIORITY["diff-summary"],
      );
      registerQueueCountSlot();
    }

    function renderFullRow() {
      return render(
        <ContextBar
          {...baseProps}
          queueCount={2}
          usageText="12k"
          slotData={{ "queue-count": { count: 2 } }}
        />,
      );
    }

    it("folds usage, then the queue count, then mode while retaining the diff slot", () => {
      registerFullRow();
      renderFullRow();

      setWidth(EVERYTHING_FITS);
      expect(screen.getByText("12k")).toBeDefined();
      expect(screen.getByText("2 queued")).toBeDefined();
      expect(screen.getByTestId("mode-pill-fixture")).toBeDefined();

      setWidth(640);
      expect(screen.getByText("12k")).toBeDefined();
      expect(screen.getByText("2 queued")).toBeDefined();

      setWidth(500);
      expect(screen.queryByText("12k")).toBeNull();
      expect(screen.queryByText("2 queued")).toBeNull();
      expect(screen.getByTestId("mode-pill-fixture")).toBeDefined();

      setWidth(400);
      expect(screen.queryByTestId("mode-pill-fixture")).toBeNull();
      expect(screen.queryByText("2 queued")).toBeNull();
      expect(screen.getByTestId("diff-pill-fixture")).toBeDefined();

      setWidth(0);
      const trigger = screen.getByRole("button", { name: /More:/ });
      for (const id of ["usage-bar", "queue-count", "mode", "diff-summary"]) {
        expect(trigger.getAttribute("aria-label")).toContain(id);
      }
    });

    it("puts a warning dot on the trigger only when a folded queue count is non-zero", () => {
      registerFullRow();
      const { unmount } = renderFullRow();
      setWidth(300);
      expect(screen.getByTestId("overflow-queue-dot")).toBeDefined();
      unmount();

      render(
        <ContextBar
          {...baseProps}
          queueCount={0}
          usageText="12k"
          slotData={{ "queue-count": { count: 0 } }}
        />,
      );
      setWidth(300);
      expect(screen.queryByTestId("overflow-queue-dot")).toBeNull();
    });

    it("folds a registered undeclared slot before a declared one", () => {
      registerComposerContextSlot("vendor-extra", DiffFixture);
      registerComposerContextSlot(
        "mode",
        ModeFixture,
        CONTEXT_BAR_PRIORITY.mode,
      );
      render(<ContextBar {...baseProps} />);
      // provider 170 + mode 80 + vendor 80 + gaps 24 = 354.
      setWidth(353);
      expect(screen.queryByTestId("diff-pill-fixture")).toBeNull();
      expect(screen.getByTestId("mode-pill-fixture")).toBeDefined();
    });

    it("does not fold for a stop control that is not in this row", () => {
      registerFullRow();
      renderFullRow();
      // Exactly the row's own width: the old action bar, which also carried
      // the stop control, would already have folded here.
      setWidth(EVERYTHING_FITS);
      expect(screen.queryByRole("button", { name: /More:/ })).toBeNull();
    });
  });

  it("renders a registered slot with the session id it belongs to", () => {
    function PermissionFixture({ sessionId }: { sessionId?: string }) {
      return <div data-testid="permission-slot">Mode for {sessionId}</div>;
    }
    registerComposerContextSlot("permission-mode", PermissionFixture);
    render(<ContextBar {...baseProps} sessionId="s-slot" />);
    expect(screen.getByText("Mode for s-slot")).toBeDefined();
  });

  describe("diff slot", () => {
    it("hides the legacy diff slot when the workspace has no git", () => {
      registerComposerContextSlot(
        "diff-summary",
        DiffFixture,
        CONTEXT_BAR_PRIORITY["diff-summary"],
      );
      render(<ContextBar {...baseProps} noGit />);
      expect(screen.queryByTestId("diff-pill-fixture")).toBeNull();
    });

    it("shows the diff pill when there is git", () => {
      registerComposerContextSlot(
        "diff-summary",
        DiffFixture,
        CONTEXT_BAR_PRIORITY["diff-summary"],
      );
      render(<ContextBar {...baseProps} />);
      expect(screen.getByTestId("diff-pill-fixture")).toBeDefined();
    });
  });

  describe("provider pill", () => {
    it("opens the full panel with only the options that have no other home", () => {
      render(
        <ContextBar
          {...baseProps}
          configOptions={[
            option("model", "Model", "model"),
            option("thought_level", "Effort", "thought_level"),
            option("mode", "Mode", "mode"),
            option("temperature", "Temperature", "model_config"),
          ]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Claude Code/ }));
      expect(screen.getByText("Temperature")).toBeDefined();
      // Model, Effort and Mode each have exactly one other home.
      expect(screen.queryByText("Model")).toBeNull();
      expect(screen.queryByText("Effort")).toBeNull();
      expect(screen.queryByText("Mode")).toBeNull();
    });

    it("writes a choice made in the panel", () => {
      const onSetOption = vi.fn().mockResolvedValue(undefined);
      render(
        <ContextBar
          {...baseProps}
          onSetOption={onSetOption}
          configOptions={[option("temperature", "Temperature", "model_config")]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Claude Code/ }));
      expect(
        screen.getByText(
          "Provider is fixed for this thread — start a new thread to switch",
        ),
      ).toBeDefined();
      fireEvent.change(screen.getByRole("combobox", { name: "Temperature" }), {
        target: { value: "b" },
      });
      expect(onSetOption).toHaveBeenCalledWith("temperature", "b");
    });

    it("exposes its element as the anchor a Provider request popover mounts on", () => {
      const anchor = createRef<HTMLButtonElement>();
      render(<ContextBar {...baseProps} providerAnchorRef={anchor} />);
      expect(anchor.current?.textContent).toContain("Claude Code");
      expect(anchor.current?.getAttribute("aria-haspopup")).toBe("dialog");
    });
  });
});

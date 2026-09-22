import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  clearFocusTrapsForTesting,
  clearRegistriesForTesting,
  ModalDialog,
} from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FIXTURE_PROVIDER_METHOD as METHOD,
  FIXTURE_PROVIDER_ID as PROVIDER,
  registerFixtureProviderIntegration,
} from "./integrations/fixture";
import {
  clearPendingExtensionsForTesting,
  enqueueProviderExtension,
  getPendingExtensions,
} from "./pending-extensions";
import {
  ProviderExtensionSurface,
  ProviderPendingCount,
  ProviderPopover,
} from "./provider-popover";

const THREAD = "thread-fixture";

function fixtureExtension(
  overrides: Record<string, unknown> = {},
  requestId = "request-1",
) {
  return {
    provider_id: PROVIDER,
    method: METHOD,
    request_id: requestId,
    params: JSON.stringify({
      title: "Authorize access",
      body: "Paste the code from the browser.",
      actions: [
        { id: "open", label: "Open browser" },
        { id: "deny", label: "Cancel", kind: "destructive" },
        { id: "copy", label: "Copy code" },
      ],
      ...overrides,
    }),
  };
}

describe("provider-popover pending treatment (d0-rc11)", () => {
  it("takes the attention treatment: wash, 2px left rule and a ringed dot", () => {
    const { container } = render(
      <ProviderExtensionSurface
        providerId={PROVIDER}
        method={METHOD}
        params={fixtureExtension().params}
      />,
    );
    const surface = container.firstElementChild as HTMLElement;
    // A popover is an opaque floating layer, so the wash is an image layer over
    // its overlay surface rather than a translucent background.
    expect(surface.className).toContain("wash-warning");
    expect(surface.className).toContain("border-l-2");
    expect(surface.className).toContain("border-l-(--tethys-status-warning)");
    expect(surface.className).not.toContain("border-warning-soft");

    // The state is also a shape: the awaiting ring, so it is not hue alone.
    const dot = screen.getByRole("status", { name: "Awaiting approval" });
    expect(dot.style.backgroundColor).toBe("transparent");
  });
});

describe("provider-popover scaffold (M1.7 U13)", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
    clearFocusTrapsForTesting();
    clearPendingExtensionsForTesting();
    registerFixtureProviderIntegration();
  });

  it("does not enqueue a method with no registered surface", () => {
    expect(
      enqueueProviderExtension(THREAD, {
        provider_id: PROVIDER,
        method: "_fixture.dev/unknown",
        request_id: null,
        params: "{}",
      }),
    ).toBe(false);
    expect(getPendingExtensions(THREAD)).toHaveLength(0);
  });

  it("opens with the Provider's own actions in its own order", () => {
    enqueueProviderExtension(THREAD, fixtureExtension());
    render(<ProviderPopover threadId={THREAD} onRespond={async () => {}} />);
    expect(screen.getByText("Authorize access")).toBeTruthy();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Open browser", "Cancel", "Copy code"]);
  });

  it("shows the pending count as text on the pill", () => {
    enqueueProviderExtension(THREAD, fixtureExtension());
    enqueueProviderExtension(
      THREAD,
      fixtureExtension({ title: "Second" }, "request-2"),
    );
    render(<ProviderPendingCount threadId={THREAD} />);
    expect(screen.getByTestId("provider-pending-count").textContent).toBe("2");
  });

  it("traps Tab and restores focus to the invoker on Escape", async () => {
    enqueueProviderExtension(THREAD, fixtureExtension());
    const { rerender } = render(<button type="button">invoker</button>);
    const invoker = screen.getByText("invoker");
    invoker.focus();
    rerender(
      <>
        <button type="button">invoker</button>
        <ProviderPopover threadId={THREAD} onRespond={async () => {}} />
      </>,
    );

    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(invoker);
  });

  it("queues behind a real open dialog and opens when it closes", async () => {
    enqueueProviderExtension(THREAD, fixtureExtension());
    const view = (dialogOpen: boolean) => (
      <>
        <ModalDialog open={dialogOpen} onClose={() => {}} title="Sign in">
          <button type="button">inside the dialog</button>
        </ModalDialog>
        <ProviderPopover threadId={THREAD} onRespond={async () => {}} />
      </>
    );
    const { rerender } = render(view(true));
    // The request waits: only the dialog is on screen.
    expect(screen.getByRole("dialog", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("Authorize access")).toBeNull();
    expect(getPendingExtensions(THREAD)).toHaveLength(1);

    rerender(view(false));
    await waitFor(() =>
      expect(screen.getByText("Authorize access")).toBeTruthy(),
    );
  });

  it("does not steal Tab from a dialog that opened after it", async () => {
    enqueueProviderExtension(THREAD, fixtureExtension());
    const view = (dialogOpen: boolean) => (
      <>
        <ProviderPopover threadId={THREAD} onRespond={async () => {}} />
        <ModalDialog open={dialogOpen} onClose={() => {}} title="Sign in">
          <button type="button">only</button>
        </ModalDialog>
      </>
    );
    const { rerender } = render(view(false));
    await waitFor(() =>
      expect(screen.getByText("Authorize access")).toBeTruthy(),
    );
    rerender(view(true));
    // The dialog is lower in the stack than the popover, so the popover yields
    // the screen to it rather than trapping focus over it.
    await waitFor(() =>
      expect(screen.queryByText("Authorize access")).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Sign in" })).toBeTruthy();
  });

  it("does not open another Provider's popover", () => {
    enqueueProviderExtension(THREAD, fixtureExtension());
    render(
      <ProviderPopover threadId="other-thread" onRespond={async () => {}} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

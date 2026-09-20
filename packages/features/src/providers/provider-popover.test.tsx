import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { clearRegistriesForTesting, registerProviderSurface } from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingExtensionsForTesting,
  enqueueProviderExtension,
  getPendingExtensions,
  setTrapOpen,
} from "./pending-extensions";
import {
  ProviderExtensionSurface,
  ProviderPendingCount,
  ProviderPopover,
  queueProviderExtension,
} from "./provider-popover";

const PROVIDER = "fixture-provider";
const METHOD = "_fixture.dev/oauth_request";

function fixtureExtension(overrides: Record<string, unknown> = {}) {
  return {
    provider_id: PROVIDER,
    method: METHOD,
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

describe("provider-popover scaffold (M1.7 U13)", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
    clearPendingExtensionsForTesting();
    registerProviderSurface(PROVIDER, METHOD, ProviderExtensionSurface);
  });

  it("does not enqueue a method with no registered surface", () => {
    expect(
      queueProviderExtension({
        provider_id: PROVIDER,
        method: "_fixture.dev/unknown",
        params: "{}",
      }),
    ).toBe(false);
    expect(getPendingExtensions(PROVIDER)).toHaveLength(0);
  });

  it("opens with the Provider's own actions in its own order", () => {
    enqueueProviderExtension(fixtureExtension());
    render(<ProviderPopover providerId={PROVIDER} />);
    expect(screen.getByText("Authorize access")).toBeTruthy();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Open browser", "Cancel", "Copy code"]);
  });

  it("shows the pending count as text on the pill", () => {
    enqueueProviderExtension(fixtureExtension());
    enqueueProviderExtension(fixtureExtension({ title: "Second" }));
    render(<ProviderPendingCount providerId={PROVIDER} />);
    expect(screen.getByTestId("provider-pending-count").textContent).toBe("2");
  });

  it("traps Tab and restores focus to the invoker on Escape", async () => {
    enqueueProviderExtension(fixtureExtension());
    const { rerender } = render(<button type="button">invoker</button>);
    const invoker = screen.getByText("invoker");
    invoker.focus();
    rerender(
      <>
        <button type="button">invoker</button>
        <ProviderPopover providerId={PROVIDER} />
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

  it("queues behind an open dialog and opens when it closes", async () => {
    enqueueProviderExtension(fixtureExtension());
    setTrapOpen("login-dialog", true);
    const { rerender } = render(<ProviderPopover providerId={PROVIDER} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    setTrapOpen("login-dialog", false);
    rerender(<ProviderPopover providerId={PROVIDER} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  });

  it("does not open another Provider's popover", () => {
    enqueueProviderExtension(fixtureExtension());
    render(<ProviderPopover providerId="other-provider" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

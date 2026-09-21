import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawer, ModalDialog } from "./index";
import {
  clearFocusTrapsForTesting,
  useFocusTrap,
  useFocusTrapBelow,
} from "./lib/use-focus-trap";

// One behaviour for every surface that traps focus (DESIGN.md Accessibility &
// Keyboard Map): `Tab` wraps, `Esc` closes the topmost, focus returns to the
// exact invoker, and a trap never opens over a lower one.

afterEach(() => {
  clearFocusTrapsForTesting();
});

const tab = (shift = false) =>
  fireEvent.keyDown(document.activeElement ?? window, {
    key: "Tab",
    shiftKey: shift,
  });

describe("focus trap: Tab wraps inside the surface", () => {
  it("wraps in a Drawer", () => {
    render(
      <Drawer open onClose={() => {}} bare label="Sessions">
        <button type="button">first</button>
        <button type="button">last</button>
      </Drawer>,
    );
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    tab();
    expect(document.activeElement).toBe(first);
    tab(true);
    expect(document.activeElement).toBe(last);
  });

  it("wraps in a ModalDialog", () => {
    render(
      <ModalDialog open onClose={() => {}} title="Trust">
        <button type="button">first</button>
        <button type="button">last</button>
      </ModalDialog>,
    );
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    tab();
    expect(document.activeElement).toBe(first);
    tab(true);
    expect(document.activeElement).toBe(last);
  });
});

describe("focus trap: Esc restores focus to the exact invoker", () => {
  function Harness({ open }: { open: boolean }) {
    return (
      <div>
        <button type="button">invoker</button>
        <button type="button">other</button>
        <Drawer open={open} onClose={() => {}} bare label="Sessions">
          <button type="button">inside</button>
        </Drawer>
      </div>
    );
  }

  it("returns focus to the element that was focused when it opened", () => {
    const { rerender } = render(<Harness open={false} />);
    const invoker = screen.getByRole("button", { name: "invoker" });
    invoker.focus();
    rerender(<Harness open />);
    expect(document.activeElement).not.toBe(invoker);
    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(invoker);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ModalDialog open onClose={onClose} title="Trust">
        <button type="button">inside</button>
      </ModalDialog>,
    );
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("focus trap: stacking", () => {
  function Stack({
    drawerOpen,
    dialogOpen,
    onDrawerClose,
    onDialogClose,
  }: {
    drawerOpen: boolean;
    dialogOpen: boolean;
    onDrawerClose: () => void;
    onDialogClose: () => void;
  }) {
    return (
      <div>
        <Drawer open={drawerOpen} onClose={onDrawerClose} bare label="Sessions">
          <button type="button">drawer-first</button>
          <button type="button">drawer-open-dialog</button>
        </Drawer>
        <ModalDialog open={dialogOpen} onClose={onDialogClose} title="Trust">
          <button type="button">dialog-first</button>
          <button type="button">dialog-last</button>
        </ModalDialog>
      </div>
    );
  }

  it("closes the dialog first on Esc, then the drawer, each once", () => {
    const onDrawerClose = vi.fn();
    const onDialogClose = vi.fn();
    render(
      <Stack
        drawerOpen
        dialogOpen
        onDrawerClose={onDrawerClose}
        onDialogClose={onDialogClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDialogClose).toHaveBeenCalledTimes(1);
    expect(onDrawerClose).not.toHaveBeenCalled();
  });

  it("returns focus into the drawer when the dialog on top of it closes", () => {
    const noop = () => {};
    const { rerender } = render(
      <Stack
        drawerOpen
        dialogOpen={false}
        onDrawerClose={noop}
        onDialogClose={noop}
      />,
    );
    const opener = screen.getByRole("button", { name: "drawer-open-dialog" });
    opener.focus();
    rerender(
      <Stack drawerOpen dialogOpen onDrawerClose={noop} onDialogClose={noop} />,
    );
    rerender(
      <Stack
        drawerOpen
        dialogOpen={false}
        onDrawerClose={noop}
        onDialogClose={noop}
      />,
    );
    expect(document.activeElement).toBe(opener);
  });

  it("wraps Tab inside the dialog on top, not into the drawer beneath", () => {
    const noop = () => {};
    render(
      <Stack drawerOpen dialogOpen onDrawerClose={noop} onDialogClose={noop} />,
    );
    const dialogFirst = screen.getByRole("button", { name: "dialog-first" });
    const dialogLast = screen.getByRole("button", { name: "dialog-last" });
    dialogLast.focus();
    tab();
    expect(document.activeElement).toBe(dialogFirst);
  });
});

describe("focus trap: a trap never opens over a lower one", () => {
  function Probe() {
    const blocked = useFocusTrapBelow("popover");
    return <span data-testid="blocked">{String(blocked)}</span>;
  }

  it("reports a lower trap, and clears when it closes", () => {
    const view = (open: boolean) => (
      <div>
        <Probe />
        <ModalDialog open={open} onClose={() => {}} title="Trust">
          <button type="button">inside</button>
        </ModalDialog>
      </div>
    );
    const { rerender } = render(view(false));
    expect(screen.getByTestId("blocked").textContent).toBe("false");
    rerender(view(true));
    expect(screen.getByTestId("blocked").textContent).toBe("true");
    rerender(view(false));
    expect(screen.getByTestId("blocked").textContent).toBe("false");
  });

  it("does not count a trap at its own tier or above", () => {
    function PopoverTrap() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap({
        active: true,
        containerRef: ref,
        tier: "popover",
        onEscape: () => {},
        initialFocus: "first",
      });
      return (
        <div ref={ref}>
          <button type="button">inside</button>
        </div>
      );
    }
    render(
      <div>
        <Probe />
        <PopoverTrap />
      </div>,
    );
    expect(screen.getByTestId("blocked").textContent).toBe("false");
  });
});

describe("focus trap: a parent re-render does not steal focus", () => {
  it("keeps focus on the control the user is on inside a ModalDialog", () => {
    const view = (onClose: () => void) => (
      <ModalDialog open onClose={onClose} title="Trust">
        <button type="button">inside</button>
      </ModalDialog>
    );
    const { rerender } = render(view(() => {}));
    const inside = screen.getByRole("button", { name: "inside" });
    inside.focus();
    rerender(view(() => {}));
    rerender(view(() => {}));
    expect(document.activeElement).toBe(inside);
  });
});

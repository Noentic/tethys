import { describe, expect, it, vi } from "vitest";
import { setupGlobalKeyboardMap, unstackManager } from "./keyboard";

describe("setupGlobalKeyboardMap", () => {
  it("triggers onTogglePalette on Ctrl+K and Cmd+K", () => {
    const handlers = { onTogglePalette: vi.fn() };
    const cleanup = setupGlobalKeyboardMap(handlers);

    // Ctrl+K
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
    );
    expect(handlers.onTogglePalette).toHaveBeenCalledTimes(1);

    // Cmd+K
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "K", metaKey: true }),
    );
    expect(handlers.onTogglePalette).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("triggers onNewThread on Ctrl+T", () => {
    const handlers = { onNewThread: vi.fn() };
    const cleanup = setupGlobalKeyboardMap(handlers);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(handlers.onNewThread).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("triggers onCloseTab on Ctrl+W", () => {
    const handlers = { onCloseTab: vi.fn() };
    const cleanup = setupGlobalKeyboardMap(handlers);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "w", ctrlKey: true }),
    );
    expect(handlers.onCloseTab).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("triggers onOpenSettings on Ctrl+,", () => {
    const handlers = { onOpenSettings: vi.fn() };
    const cleanup = setupGlobalKeyboardMap(handlers);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", ctrlKey: true }),
    );
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("triggers onFocusTab for Ctrl+1 through Ctrl+9", () => {
    const handlers = { onFocusTab: vi.fn() };
    const cleanup = setupGlobalKeyboardMap(handlers);

    for (let i = 1; i <= 9; i++) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: String(i), ctrlKey: true }),
      );
      expect(handlers.onFocusTab).toHaveBeenLastCalledWith(i - 1);
    }
    expect(handlers.onFocusTab).toHaveBeenCalledTimes(9);

    cleanup();
  });
});

describe("unstackManager (Esc unstack order)", () => {
  it("dismisses top item in strict priority order: popover -> drawer -> palette -> dialog", () => {
    unstackManager.clear();

    const order: string[] = [];
    const dismissDialog = vi.fn(() => order.push("dialog"));
    const dismissPalette = vi.fn(() => order.push("palette"));
    const dismissDrawer = vi.fn(() => order.push("drawer"));
    const dismissPopover = vi.fn(() => order.push("popover"));

    // Register out of order
    unstackManager.register("dialog-1", "dialog", dismissDialog);
    unstackManager.register("drawer-1", "drawer", dismissDrawer);
    unstackManager.register("palette-1", "palette", dismissPalette);
    unstackManager.register("popover-1", "popover", dismissPopover);

    const cleanup = setupGlobalKeyboardMap({});

    // 1st Esc: Popover dismissed
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(dismissPopover).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["popover"]);

    // 2nd Esc: Drawer dismissed
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(dismissDrawer).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["popover", "drawer"]);

    // 3rd Esc: Palette dismissed
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(dismissPalette).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["popover", "drawer", "palette"]);

    // 4th Esc: Dialog dismissed
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(dismissDialog).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["popover", "drawer", "palette", "dialog"]);

    // 5th Esc: Nothing left
    const handled = unstackManager.unstackTop();
    expect(handled).toBe(false);

    cleanup();
  });
});

describe("inspector toggle shortcut (d0-rc9)", () => {
  it("triggers onToggleInspector on Ctrl+I and Cmd+I", () => {
    const handlers = { onToggleInspector: vi.fn() };
    const cleanup = setupGlobalKeyboardMap(handlers);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", ctrlKey: true }),
    );
    expect(handlers.onToggleInspector).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "I", metaKey: true }),
    );
    expect(handlers.onToggleInspector).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("does not fire without a modifier", () => {
    const handlers = { onToggleInspector: vi.fn() };
    const cleanup = setupGlobalKeyboardMap(handlers);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    expect(handlers.onToggleInspector).not.toHaveBeenCalled();

    cleanup();
  });
});

describe("d0-rc12 surface shortcuts", () => {
  it("toggles Changes with Cmd/Ctrl+Shift+D and routes composer controls", () => {
    const handlers = {
      onToggleChanges: vi.fn(),
      onOpenComposerControl: vi.fn(),
    };
    const cleanup = setupGlobalKeyboardMap(handlers);

    for (const [key, control] of [
      ["m", "mode"],
      ["i", "model"],
      ["e", "effort"],
    ] as const) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          metaKey: true,
          shiftKey: true,
          cancelable: true,
        }),
      );
      expect(handlers.onOpenComposerControl).toHaveBeenLastCalledWith(control);
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "D",
        ctrlKey: true,
        shiftKey: true,
        cancelable: true,
      }),
    );
    expect(handlers.onToggleChanges).toHaveBeenCalledTimes(1);

    cleanup();
  });
});

export interface ShortcutHandler {
  onTogglePalette?: () => void;
  onFocusTab?: (tabIndex: number) => void;
  onNewThread?: () => void;
  onCloseTab?: () => void;
  onOpenSettings?: () => void;
}

export type UnstackType = "popover" | "drawer" | "palette" | "dialog";

interface UnstackEntry {
  id: string;
  type: UnstackType;
  dismiss: () => void;
}

// Unstack priority: popover (0) -> drawer (1) -> palette (2) -> dialog (3)
const UNSTACK_PRIORITY: Record<UnstackType, number> = {
  popover: 0,
  drawer: 1,
  palette: 2,
  dialog: 3,
};

class UnstackManager {
  private stack: UnstackEntry[] = [];

  public register(
    id: string,
    type: UnstackType,
    dismiss: () => void,
  ): () => void {
    // Remove if already exists
    this.unregister(id);
    this.stack.push({ id, type, dismiss });
    // Sort by priority so lowest priority number (popover) is popped first
    this.stack.sort(
      (a, b) => UNSTACK_PRIORITY[a.type] - UNSTACK_PRIORITY[b.type],
    );

    return () => {
      this.unregister(id);
    };
  }

  public unregister(id: string): void {
    this.stack = this.stack.filter((item) => item.id !== id);
  }

  public unstackTop(): boolean {
    if (this.stack.length === 0) return false;
    const top = this.stack.shift();
    if (top) {
      top.dismiss();
      return true;
    }
    return false;
  }

  public hasActive(): boolean {
    return this.stack.length > 0;
  }

  public clear(): void {
    this.stack = [];
  }
}

export const unstackManager = new UnstackManager();

export function setupGlobalKeyboardMap(handlers: ShortcutHandler): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const isMetaOrCtrl = e.metaKey || e.ctrlKey;

    if (e.key === "Escape") {
      // Unstack order: popover -> drawer/sheet -> palette -> dialog
      const handled = unstackManager.unstackTop();
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    if (isMetaOrCtrl) {
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onTogglePalette?.();
        return;
      }

      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        handlers.onNewThread?.();
        return;
      }

      if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        handlers.onCloseTab?.();
        return;
      }

      if (e.key === ",") {
        e.preventDefault();
        handlers.onOpenSettings?.();
        return;
      }

      // Ctrl/Cmd + 1..9
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
        e.preventDefault();
        handlers.onFocusTab?.(digit - 1);
      }
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}

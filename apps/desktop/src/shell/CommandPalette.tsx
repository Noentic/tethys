import { Command } from "cmdk";
import { useEffect, useRef } from "react";
import { unstackManager } from "./keyboard";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectCommand?: (action: string) => void;
}

export function CommandPalette({
  open,
  onClose,
  onSelectCommand,
}: CommandPaletteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const unregister = unstackManager.register("palette", "palette", onClose);
      return () => {
        unregister();
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (action: string) => {
    onSelectCommand?.(action);
    onClose();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop scrim dismiss
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-[var(--tethys-overlay-scrim)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="w-[600px] h-[400px] flex flex-col overflow-hidden rounded-xl border border-[var(--tethys-hairline)] bg-[var(--tethys-surface-overlay)] shadow-none outline-none"
      >
        <Command
          label="Command Palette"
          className="flex flex-col h-full w-full"
        >
          <div className="flex items-center border-b border-[var(--tethys-hairline)] px-4 py-2">
            <span className="text-xs text-[var(--tethys-text-muted)] mr-2 select-none">
              ⌘
            </span>
            <Command.Input
              autoFocus
              placeholder="Type a command, file, or session..."
              className="w-full bg-transparent text-sm text-[var(--tethys-text-primary)] placeholder-[var(--tethys-text-muted)] outline-none"
            />
            <kbd className="rounded bg-[var(--tethys-surface-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--tethys-text-muted)] select-none">
              ESC
            </kbd>
          </div>

          <Command.List className="flex-1 overflow-y-auto p-2 outline-none">
            <Command.Empty className="py-8 text-center text-xs text-[var(--tethys-text-muted)]">
              No results found.
            </Command.Empty>

            <Command.Group
              heading="Commands"
              className="px-2 py-1 text-[11px] font-medium text-[var(--tethys-text-muted)] [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              <Command.Item
                onSelect={() => handleSelect("new-thread")}
                className="flex h-8 items-center justify-between rounded-md px-2 text-xs text-[var(--tethys-text-secondary)] transition-colors cursor-pointer data-[selected=true]:bg-[var(--tethys-surface-hover)] data-[selected=true]:text-[var(--tethys-text-primary)]"
              >
                <span>New Thread</span>
                <span className="font-mono text-[10px] text-[var(--tethys-text-muted)]">
                  Ctrl+T
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect("go-workspaces")}
                className="flex h-8 items-center justify-between rounded-md px-2 text-xs text-[var(--tethys-text-secondary)] transition-colors cursor-pointer data-[selected=true]:bg-[var(--tethys-surface-hover)] data-[selected=true]:text-[var(--tethys-text-primary)]"
              >
                <span>Go to Workspaces</span>
                <span className="font-mono text-[10px] text-[var(--tethys-text-muted)]">
                  Ctrl+1
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect("open-settings")}
                className="flex h-8 items-center justify-between rounded-md px-2 text-xs text-[var(--tethys-text-secondary)] transition-colors cursor-pointer data-[selected=true]:bg-[var(--tethys-surface-hover)] data-[selected=true]:text-[var(--tethys-text-primary)]"
              >
                <span>Open Settings</span>
                <span className="font-mono text-[10px] text-[var(--tethys-text-muted)]">
                  Ctrl+,
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect("toggle-theme")}
                className="flex h-8 items-center justify-between rounded-md px-2 text-xs text-[var(--tethys-text-secondary)] transition-colors cursor-pointer data-[selected=true]:bg-[var(--tethys-surface-hover)] data-[selected=true]:text-[var(--tethys-text-primary)]"
              >
                <span>Toggle Light/Dark Theme</span>
                <span className="font-mono text-[10px] text-[var(--tethys-text-muted)]">
                  Theme
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Files (FFF)"
              className="px-2 py-1 text-[11px] font-medium text-[var(--tethys-text-muted)] [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              <Command.Item
                onSelect={() => handleSelect("search-files")}
                className="flex h-8 items-center justify-between rounded-md px-2 text-xs text-[var(--tethys-text-secondary)] transition-colors cursor-pointer data-[selected=true]:bg-[var(--tethys-surface-hover)] data-[selected=true]:text-[var(--tethys-text-primary)]"
              >
                <span>Search all workspace files</span>
                <span className="font-mono text-[10px] text-[var(--tethys-text-muted)]">
                  search.files
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Actions"
              className="px-2 py-1 text-[11px] font-medium text-[var(--tethys-text-muted)] [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              <Command.Item
                onSelect={() => handleSelect("manual-health-check")}
                className="flex h-8 items-center justify-between rounded-md px-2 text-xs text-[var(--tethys-text-secondary)] transition-colors cursor-pointer data-[selected=true]:bg-[var(--tethys-surface-hover)] data-[selected=true]:text-[var(--tethys-text-primary)]"
              >
                <span>Run Manual Health Check</span>
                <span className="font-mono text-[10px] text-[var(--tethys-text-muted)]">
                  host.health
                </span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

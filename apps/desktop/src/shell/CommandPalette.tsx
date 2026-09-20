import { MagnifyingGlass } from "@nebutra/icons";
import { KeycapPill } from "@tethys/ui";
import { Command } from "cmdk";
import { useEffect, useRef } from "react";
import { unstackManager } from "./keyboard";

// Palette rows are 36px (DESIGN.md palette rows); the keyboard-highlighted row uses
// the selected wash, hover stays a lighter wash.
const ITEM_CLASS =
  "flex h-9 cursor-pointer items-center justify-between rounded-sm px-3 text-body-sm text-(--tethys-text-secondary) transition-colors data-[selected=true]:bg-(--tethys-surface-active) data-[selected=true]:text-(--tethys-text-primary)";
const HINT_CLASS = "font-mono text-mono-micro text-(--tethys-text-muted)";
const GROUP_CLASS =
  "px-2 py-1 text-label-sm text-(--tethys-text-muted) [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider";

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
      className="fixed inset-0 z-(--tethys-z-palette) flex items-start justify-center bg-(--tethys-overlay-scrim) pt-[15vh]"
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
        className="edge-lit flex h-(--layout-palette-height) w-(--layout-palette-width) flex-col overflow-hidden rounded-lg border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) outline-none"
      >
        <Command
          label="Command Palette"
          className="flex h-full w-full flex-col"
        >
          <div className="flex h-12 shrink-0 items-center gap-sm border-b border-(--tethys-hairline) px-lg">
            <MagnifyingGlass
              className="size-4 shrink-0 text-(--tethys-text-muted)"
              aria-hidden="true"
            />
            <Command.Input
              autoFocus
              placeholder="Type a command, file, or session..."
              className="w-full bg-transparent text-body-md text-(--tethys-text-primary) placeholder-(--tethys-text-muted) outline-none"
            />
            <KeycapPill>ESC</KeycapPill>
          </div>

          <Command.List className="flex-1 overflow-y-auto p-2 outline-none">
            <Command.Empty className="py-xl text-center text-body-sm text-(--tethys-text-muted)">
              No results found.
            </Command.Empty>

            <Command.Group heading="Commands" className={GROUP_CLASS}>
              <Command.Item
                onSelect={() => handleSelect("new-thread")}
                className={ITEM_CLASS}
              >
                <span>New Thread</span>
                <span className={HINT_CLASS}>Ctrl+T</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect("go-workspaces")}
                className={ITEM_CLASS}
              >
                <span>Go to Workspaces</span>
                <span className={HINT_CLASS}>Ctrl+1</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect("open-settings")}
                className={ITEM_CLASS}
              >
                <span>Open Settings</span>
                <span className={HINT_CLASS}>Ctrl+,</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect("toggle-theme")}
                className={ITEM_CLASS}
              >
                <span>Toggle Light/Dark Theme</span>
                <span className={HINT_CLASS}>Theme</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Files (FFF)" className={GROUP_CLASS}>
              <Command.Item
                onSelect={() => handleSelect("search-files")}
                className={ITEM_CLASS}
              >
                <span>Search all workspace files</span>
                <span className={HINT_CLASS}>search.files</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Actions" className={GROUP_CLASS}>
              <Command.Item
                onSelect={() => handleSelect("manual-health-check")}
                className={ITEM_CLASS}
              >
                <span>Run Manual Health Check</span>
                <span className={HINT_CLASS}>host.health</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

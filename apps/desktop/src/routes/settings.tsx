import { ArrowLeft, MagnifyingGlass, TerminalWindow } from "@nebutra/icons";
import type React from "react";
import { useState } from "react";

export interface SettingsNavItem {
  id: string;
  label: string;
  path: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "general", label: "General", path: "/settings/general" },
  { id: "providers", label: "Providers", path: "/settings/providers" },
  { id: "skills", label: "Skills & Commands", path: "/settings/skills" },
  { id: "mcp", label: "MCP Servers", path: "/settings/mcp" },
  { id: "keybindings", label: "Keybindings", path: "/settings/keybindings" },
];

export interface SettingsLayoutProps {
  activeSection?: string;
  onNavigateSection?: (path: string) => void;
  children?: React.ReactNode;
}

export function SettingsLayout({
  activeSection = "general",
  onNavigateSection,
  children,
}: SettingsLayoutProps) {
  const [navSearch, setNavSearch] = useState<string>("");

  const currentItem =
    SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection) ??
    SETTINGS_NAV_ITEMS[0];

  const filteredNavItems = SETTINGS_NAV_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(navSearch.toLowerCase()),
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-(--tethys-canvas)">
      {/* Left Navigation (240px, Matching Image 4 & Image 6) */}
      <nav
        aria-label="Settings Navigation"
        className="flex h-full w-60 flex-col justify-between border-r border-(--tethys-hairline) bg-(--tethys-surface-panel) p-3 select-none shrink-0"
      >
        <div className="flex flex-col gap-3">
          {/* App title / Brand header (Matching Image 4) */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex size-6 items-center justify-center rounded bg-(--tethys-accent-primary) text-white">
              <TerminalWindow className="size-3.5" />
            </div>
            <span className="text-sm font-bold tracking-tight text-(--tethys-text-primary)">
              Tethys
            </span>
          </div>

          {/* Search box inside settings sidebar (Matching Image 4) */}
          <div className="relative flex items-center px-1">
            <MagnifyingGlass className="absolute left-3.5 size-3.5 text-(--tethys-text-muted)" />
            <input
              type="text"
              aria-label="Search settings"
              placeholder="Search"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) pl-8 pr-7 text-xs text-(--tethys-text-primary) placeholder:text-(--tethys-text-muted) focus:border-(--tethys-hairline-strong) focus:outline-none transition-colors"
            />
            <kbd className="absolute right-3 font-mono text-[10px] text-(--tethys-text-muted)">
              /
            </kbd>
          </div>

          {/* Nav Categories */}
          <div className="flex flex-col gap-0.5">
            {filteredNavItems.map((item) => {
              const isSelected = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateSection?.(item.path)}
                  className={`flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors text-left outline-none focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus) ${
                    isSelected
                      ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-semibold"
                      : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Section (Matching Image 4) */}
        <div className="flex flex-col gap-1 border-t border-(--tethys-hairline) pt-2">
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-(--tethys-text-muted) hover:text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover) transition-colors text-left"
          >
            <span className="truncate">Sign in to Tethys Sync</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection?.("/thread/new")}
            className="flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-(--tethys-text-muted) hover:text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover) transition-colors text-left"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back</span>
          </button>
        </div>
      </nav>

      {/* Main Settings Content Area */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Child Slot */}
        <main
          aria-label={`${currentItem.label} Settings`}
          className="flex-1 p-8 max-w-4xl"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

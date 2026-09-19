import { ArrowLeft, MagnifyingGlass, TerminalWindow } from "@nebutra/icons";
import { Input, KeycapPill } from "@tethys/ui";
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
        className="flex h-full w-60 shrink-0 flex-col justify-between border-r border-(--tethys-hairline-structural) bg-(--tethys-surface-panel) p-md select-none"
      >
        <div className="flex flex-col gap-md">
          {/* App title / Brand header (Matching Image 4) */}
          <div className="flex items-center gap-sm px-2 py-1.5">
            <div className="flex size-6 items-center justify-center rounded-sm bg-(--tethys-primary) text-(--tethys-on-primary)">
              <TerminalWindow className="size-3.5" />
            </div>
            <span className="text-heading-md text-(--tethys-text-primary)">
              Tethys
            </span>
          </div>

          {/* Search box inside settings sidebar (Matching Image 4) */}
          <Input
            type="text"
            aria-label="Search settings"
            placeholder="Search"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            leadingIcon={<MagnifyingGlass className="size-3.5" />}
            trailingIcon={<KeycapPill>/</KeycapPill>}
          />

          {/* Nav Categories */}
          <div className="flex flex-col gap-0.5">
            {filteredNavItems.map((item) => {
              const isSelected = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateSection?.(item.path)}
                  className={`focus-ring-inset flex h-8 items-center rounded-sm px-3 text-left text-body-sm transition-colors ${
                    isSelected
                      ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
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
        <div className="flex flex-col gap-1 border-t border-(--tethys-hairline) pt-sm">
          <button
            type="button"
            className="focus-ring-inset flex h-8 items-center gap-sm rounded-sm px-3 text-left text-body-sm text-(--tethys-text-muted) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
          >
            <span className="truncate">Sign in to Tethys Sync</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection?.("/thread/new")}
            className="focus-ring-inset flex h-8 items-center gap-sm rounded-sm px-3 text-left text-body-sm text-(--tethys-text-muted) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
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
          className="max-w-4xl flex-1 p-2xl"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

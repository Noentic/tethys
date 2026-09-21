import {
  ArrowLeft,
  BookOpen,
  Command as CommandIcon,
  Puzzle,
  Servers,
  SettingsGear,
} from "@nebutra/icons";
import type React from "react";

export interface SettingsNavItem {
  id: string;
  label: string;
  path: string;
  Icon: React.ElementType;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: "general",
    label: "General",
    path: "/settings/general",
    Icon: SettingsGear,
  },
  {
    id: "providers",
    label: "Providers",
    path: "/settings/providers",
    Icon: Puzzle,
  },
  {
    id: "skills",
    label: "Skills & Commands",
    path: "/settings/skills",
    Icon: BookOpen,
  },
  { id: "mcp", label: "MCP Servers", path: "/settings/mcp", Icon: Servers },
  {
    id: "keybindings",
    label: "Keybindings",
    path: "/settings/keybindings",
    Icon: CommandIcon,
  },
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
  const currentItem =
    SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection) ??
    SETTINGS_NAV_ITEMS[0];

  return (
    <div className="flex h-full w-full overflow-hidden bg-(--tethys-canvas)">
      {/* Pen `HL2ay` Settings nav: Title + the five items, no search field. */}
      <nav
        aria-label="Settings Navigation"
        className="flex h-full w-60 shrink-0 flex-col justify-between border-r border-(--tethys-hairline-structural) bg-(--tethys-surface-panel) p-lg select-none"
      >
        <div className="flex flex-col gap-md">
          <span className="px-0 text-heading-lg text-(--tethys-text-primary)">
            Settings
          </span>

          <div className="flex flex-col gap-0.5">
            {SETTINGS_NAV_ITEMS.map((item) => {
              const isSelected = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isSelected ? "page" : undefined}
                  onClick={() => onNavigateSection?.(item.path)}
                  className={`focus-ring-inset relative flex h-8 items-center gap-sm rounded-sm px-3 text-left text-body-sm transition-colors ${
                    isSelected
                      ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                      : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
                  }`}
                >
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-r-xs bg-(--tethys-accent-focus)"
                    />
                  )}
                  <item.Icon
                    className={`size-4 shrink-0 ${
                      isSelected
                        ? "text-(--tethys-text-primary)"
                        : "text-(--tethys-text-muted)"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-(--tethys-hairline) pt-sm">
          <button
            type="button"
            onClick={() => onNavigateSection?.("/thread/new")}
            className="focus-ring-inset flex h-8 items-center gap-sm rounded-sm px-3 text-left text-body-sm text-(--tethys-text-muted) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
          >
            <ArrowLeft className="size-4" />
            <span>Back</span>
          </button>
        </div>
      </nav>

      {/* Main Settings Content Area */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <main
          aria-label={`${currentItem.label} Settings`}
          className="w-full max-w-[1120px] flex-1 p-2xl"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

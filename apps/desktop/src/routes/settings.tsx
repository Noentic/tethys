import type React from "react";

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
  const currentItem =
    SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection) ??
    SETTINGS_NAV_ITEMS[0];

  return (
    <div className="flex h-full w-full overflow-hidden bg-(--tethys-canvas)">
      {/* Left Navigation (220px) */}
      <nav
        aria-label="Settings Navigation"
        className="flex h-full w-56 flex-col border-r border-(--tethys-hairline) bg-(--tethys-surface-panel) p-3 select-none shrink-0"
      >
        <div className="px-3 py-2 text-xs font-semibold text-(--tethys-text-primary)">
          Settings
        </div>

        <div className="mt-2 flex flex-col gap-1">
          {SETTINGS_NAV_ITEMS.map((item) => {
            const isSelected = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigateSection?.(item.path)}
                className={`flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors text-left outline-none focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus) ${
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
      </nav>

      {/* Main Settings Content Area with Breadcrumb & Header Slot */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Breadcrumb & Header */}
        <header className="border-b border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-8 py-4">
          <nav
            aria-label="Breadcrumb"
            className="mb-1 flex items-center gap-1.5 text-[11px] text-(--tethys-text-muted)"
          >
            <span>Settings</span>
            <span>/</span>
            <span className="text-(--tethys-text-primary) font-medium">
              {currentItem.label}
            </span>
          </nav>
          <h1 className="text-lg font-semibold text-(--tethys-text-primary)">
            {currentItem.label}
          </h1>
        </header>

        {/* Child Slot */}
        <main
          aria-label={`${currentItem.label} Settings`}
          className="flex-1 p-8 max-w-3xl"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

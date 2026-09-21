import { Cross } from "@nebutra/icons";
import type React from "react";
import { nextRovingIndex } from "../lib/roving";
import { cn } from "../lib/utils";

export interface TabItemData {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  pinned?: boolean;
  dirty?: boolean;
}

export interface TabStripProps {
  tabs: TabItemData[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab?: (id: string) => void;
  children?: React.ReactNode;
  className?: string;
}

export function TabStrip({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  children,
  className,
}: TabStripProps) {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  const rovingIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <div
      role="tablist"
      aria-label="Tabs"
      className={cn(
        "flex h-titlebar w-full items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-(--tethys-hairline-structural) bg-(--tethys-surface-rail) px-2 select-none",
        className,
      )}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const closable = !tab.pinned && onCloseTab;
          return (
            // The wrapper carries the tab's chrome. A `tablist` may own only
            // tabs, so the close button cannot be a child of the tab or of the
            // list's accessibility tree: it is a pointer affordance, hidden
            // from it, and the keyboard path is `Delete` on the focused tab
            // (WAI-ARIA tabs pattern, deletable tabs).
            <div
              key={tab.id}
              role="presentation"
              className={cn(
                "group relative flex h-7 max-w-[220px] shrink-0 items-center rounded-md transition-colors duration-150",
                isActive
                  ? "edge-lit border border-(--tethys-hairline) bg-(--tethys-surface-elevated) text-(--tethys-text-primary)"
                  : "border border-transparent bg-transparent text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
              )}
            >
              <div
                role="tab"
                aria-selected={isActive}
                tabIndex={index === rovingIndex ? 0 : -1}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectTab(tab.id);
                    return;
                  }
                  if (e.key === "Delete" && closable) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                    return;
                  }
                  const next = nextRovingIndex(e.key, index, tabs.length);
                  if (next === null) return;
                  e.preventDefault();
                  onSelectTab(tabs[next].id);
                  const nodes = e.currentTarget
                    .closest('[role="tablist"]')
                    ?.querySelectorAll<HTMLElement>('[role="tab"]');
                  nodes?.[next]?.focus();
                }}
                className={cn(
                  "focus-ring flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md pl-2.5 text-body-sm",
                  closable ? "pr-7" : "pr-2.5",
                )}
              >
                {tab.icon && (
                  <span className="shrink-0 text-(--tethys-text-muted) group-hover:text-current">
                    {tab.icon}
                  </span>
                )}
                <span className="truncate">{tab.title}</span>
                {tab.subtitle && (
                  <span className="truncate font-mono text-mono-micro text-(--tethys-text-muted)">
                    {tab.subtitle}
                  </span>
                )}
                {tab.dirty && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-(--tethys-status-warning)"
                    title="Unsaved changes"
                  />
                )}
              </div>
              {closable && (
                <button
                  type="button"
                  aria-hidden="true"
                  aria-label={`Close ${tab.title}`}
                  tabIndex={-1}
                  onClick={() => onCloseTab(tab.id)}
                  className="absolute top-1/2 right-1 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-(--tethys-text-muted) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
                >
                  <Cross className="size-3" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {children && (
        <div className="flex items-center gap-2 pl-2">{children}</div>
      )}
    </div>
  );
}

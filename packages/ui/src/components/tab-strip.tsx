import { Cross } from "@nebutra/icons";
import type React from "react";
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
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(tab.id);
                }
              }}
              className={cn(
                "focus-ring group flex h-7 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-body-sm transition-colors duration-150",
                isActive
                  ? "edge-lit border border-(--tethys-hairline) bg-(--tethys-surface-elevated) text-(--tethys-text-primary)"
                  : "border border-transparent bg-transparent text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
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
              {!tab.pinned && onCloseTab && (
                <button
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="ml-auto -mr-1 flex h-5 w-5 items-center justify-center rounded-sm text-(--tethys-text-muted) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
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

import type React from "react";
import { cn } from "../lib/utils";

export interface UnderlineTabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** Trailing marker, e.g. an attention dot. */
  adornment?: React.ReactNode;
}

export interface UnderlineTabsProps<T extends string = string> {
  tabs: Array<UnderlineTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}

// In-page section tabs (skills catalog, workspace peek). Window-level tabs live in
// TabStrip; this is the lighter underline form for content regions.
export function UnderlineTabs<T extends string = string>({
  tabs,
  value,
  onChange,
  label = "Sections",
  className,
}: UnderlineTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex gap-lg", className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              "focus-ring -mb-px flex items-center gap-1.5 border-b-2 pb-1.5 text-label-md transition-colors",
              isActive
                ? "border-(--tethys-accent-focus) text-(--tethys-text-primary)"
                : "border-transparent text-(--tethys-text-muted) hover:text-(--tethys-text-primary)",
            )}
          >
            {tab.label}
            {tab.adornment}
          </button>
        );
      })}
    </div>
  );
}

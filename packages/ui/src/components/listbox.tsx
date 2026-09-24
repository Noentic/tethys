import type React from "react";
import { nextRovingIndex } from "../lib/roving";
import { cn } from "../lib/utils";

export interface ListboxItem<T = string> {
  id: string;
  value: T;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface ListboxProps<T = string> {
  items: Array<ListboxItem<T>>;
  selectedId?: string;
  onSelect: (item: ListboxItem<T>) => void;
  className?: string;
  label?: string;
  /**
   * `trailing` puts a short sublabel (a badge, a count) at the row's end;
   * `below` stacks a long one (a path) under the label so neither squeezes the other.
   */
  sublabelPlacement?: "trailing" | "below";
}

export function Listbox<T = string>({
  items,
  selectedId,
  onSelect,
  className,
  label = "Options",
  sublabelPlacement = "trailing",
}: ListboxProps<T>) {
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const rovingIndex =
    selectedIndex >= 0
      ? selectedIndex
      : items.findIndex((item) => !item.disabled);

  return (
    <div
      role="listbox"
      aria-label={label}
      tabIndex={-1}
      className={cn(
        "focus-ring flex flex-col gap-0.5 rounded-md p-1",
        className,
      )}
    >
      {items.map((item, index) => {
        const isSelected = item.id === selectedId;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={isSelected}
            aria-disabled={item.disabled}
            tabIndex={index === rovingIndex ? 0 : -1}
            onClick={() => !item.disabled && onSelect(item)}
            onKeyDown={(e) => {
              if (!item.disabled && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(item);
                return;
              }
              const next = nextRovingIndex(
                e.key,
                index,
                items.length,
                (candidate) => !!items[candidate]?.disabled,
              );
              if (next === null) return;
              e.preventDefault();
              const nodes =
                e.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                  '[role="option"]',
                );
              nodes?.[next]?.focus();
            }}
            className={cn(
              "relative flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-body-sm transition-colors duration-150 select-none",
              isSelected
                ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-r-xs before:bg-(--tethys-accent-focus)"
                : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
              item.disabled &&
                "pointer-events-none opacity-40 cursor-not-allowed",
            )}
          >
            {item.icon && (
              <span className="shrink-0 text-(--tethys-text-muted)">
                {item.icon}
              </span>
            )}
            {sublabelPlacement === "below" ? (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{item.label}</span>
                {item.sublabel && (
                  <span className="min-w-0 font-mono text-mono-micro text-(--tethys-text-muted)">
                    {item.sublabel}
                  </span>
                )}
              </span>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.sublabel && (
                  <span className="max-w-[50%] min-w-0 shrink truncate font-mono text-mono-micro text-(--tethys-text-muted)">
                    {item.sublabel}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

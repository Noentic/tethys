import type React from "react";
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
}

export function Listbox<T = string>({
  items,
  selectedId,
  onSelect,
  className,
  label = "Options",
}: ListboxProps<T>) {
  return (
    <div
      role="listbox"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "focus-ring flex flex-col gap-0.5 rounded-md p-1",
        className,
      )}
    >
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={isSelected}
            aria-disabled={item.disabled}
            tabIndex={-1}
            onClick={() => !item.disabled && onSelect(item)}
            onKeyDown={(e) => {
              if (!item.disabled && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(item);
              }
            }}
            className={cn(
              "relative flex h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-body-sm transition-colors duration-150 select-none",
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
            <span className="truncate flex-1">{item.label}</span>
            {item.sublabel && (
              <span className="shrink-0 font-mono text-mono-micro text-(--tethys-text-muted)">
                {item.sublabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
        "flex flex-col gap-0.5 rounded-md p-1 outline-none",
        "focus-visible:ring-1 focus-visible:ring-[var(--tethys-accent-focus)]",
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
              "flex h-8 items-center gap-2 rounded-[6px] px-2.5 text-xs transition-colors duration-150 cursor-pointer select-none",
              isSelected
                ? "bg-[var(--tethys-surface-active)] text-[var(--tethys-text-primary)] font-medium"
                : "text-[var(--tethys-text-secondary)] hover:bg-[var(--tethys-surface-hover)] hover:text-[var(--tethys-text-primary)]",
              item.disabled &&
                "pointer-events-none opacity-40 cursor-not-allowed",
            )}
          >
            {item.icon && (
              <span className="shrink-0 text-[var(--tethys-text-muted)]">
                {item.icon}
              </span>
            )}
            <span className="truncate flex-1">{item.label}</span>
            {item.sublabel && (
              <span className="shrink-0 font-mono text-[10px] text-[var(--tethys-text-muted)]">
                {item.sublabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

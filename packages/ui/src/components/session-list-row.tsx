import React from "react";
import { cn } from "../lib/utils";
import { StatusDot } from "./status-dot";

export interface SessionListRowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  sessionId: string;
  title: string;
  status: string;
  providerGlyph?: React.ReactNode;
  branchName?: string;
  turnCount?: number;
  dirty?: boolean;
  selected?: boolean;
  onFork?: () => void;
  onSelect?: () => void;
}

export const SessionListRow = React.forwardRef<
  HTMLDivElement,
  SessionListRowProps
>(
  (
    {
      sessionId: _sessionId,
      title,
      status,
      providerGlyph,
      branchName,
      turnCount,
      dirty = false,
      selected = false,
      onFork,
      onSelect,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      // biome-ignore lint/a11y/useSemanticElements: complex row containing child action buttons
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className={cn(
          "group relative flex h-12 w-full items-center justify-between rounded-md px-3 py-2 text-xs transition-colors duration-150 cursor-pointer select-none outline-none",
          "focus-visible:ring-2 focus-visible:ring-(--tethys-accent-focus) focus-visible:ring-offset-1 focus-visible:ring-offset-(--tethys-canvas)",
          selected
            ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-(--tethys-accent-focus)"
            : "bg-transparent text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusDot status={status} />
          {providerGlyph && (
            <span className="shrink-0 text-(--tethys-text-muted) text-[12px]">
              {providerGlyph}
            </span>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate text-[13px] font-normal leading-tight">
              {title}
            </span>
            {branchName && (
              <span className="truncate font-mono text-[10px] text-(--tethys-text-muted) leading-tight mt-0.5">
                {branchName}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {dirty && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-(--tethys-status-warning)"
              title="Unsaved changes"
            />
          )}
          {typeof turnCount === "number" && (
            <span className="rounded bg-(--tethys-surface-hover) px-1 py-0.5 font-mono text-[10px] text-(--tethys-text-muted)">
              T{turnCount}
            </span>
          )}
          {onFork && (
            <button
              type="button"
              aria-label="Fork session"
              title="Fork session"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onFork();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-(--tethys-text-muted) opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary) transition-opacity"
            >
              ⑂
            </button>
          )}
        </div>
      </div>
    );
  },
);

SessionListRow.displayName = "SessionListRow";

export const ThreadListRow = SessionListRow;

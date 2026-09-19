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
          "focus-ring-inset group relative flex h-12 w-full cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-body-sm transition-colors duration-150 select-none",
          selected
            ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-r-xs before:bg-(--tethys-accent-focus)"
            : "bg-transparent text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusDot status={status} />
          {providerGlyph && (
            <span className="shrink-0 text-label-md text-(--tethys-text-muted)">
              {providerGlyph}
            </span>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate text-body-sm">{title}</span>
            {branchName && (
              <span className="mt-0.5 truncate font-mono text-mono-micro text-(--tethys-text-muted)">
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
            <span className="rounded-xs bg-(--tethys-surface-hover) px-1 py-0.5 font-mono text-mono-micro text-(--tethys-text-muted)">
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
              className="flex h-5 w-5 items-center justify-center rounded-sm text-(--tethys-text-muted) opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
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

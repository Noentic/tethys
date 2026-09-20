//! One `sync-grid-cell` (DESIGN.md `sync-grid-cell`; spec §5.4).
//!
//! Reads its state through `renderCellState`; never derives an attachment
//! state. Colour is never the sole carrier — every state carries text, and the
//! `aria-label` names server, Provider and state so a cell is readable without
//! the headers in view.

import type { AttachmentState } from "@tethys/bindings";
import { type CellTone, renderCellState } from "@tethys/state";
import { cn } from "@tethys/ui";
import type React from "react";

const TONE_CLASS: Record<CellTone, string> = {
  success: "text-(--tethys-status-success)",
  warning: "text-(--tethys-status-warning)",
  danger: "text-(--tethys-status-danger)",
  muted: "text-(--tethys-text-muted)",
};

export interface AttachmentCellProps {
  serverName: string;
  providerName: string;
  state: AttachmentState;
  tabIndex?: number;
  cellRef?: (el: HTMLElement | null) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  /** Opens the vendor-file fallback section (FileProjection cells only). */
  onActivate?: () => void;
}

/**
 * A `sync-grid-cell`: a status fact (`Attached`, `unsupported transport`, `—`)
 * or the fallback action (`File projection`), never both (DESIGN P13).
 */
export function AttachmentCell({
  serverName,
  providerName,
  state,
  tabIndex,
  cellRef,
  onKeyDown,
  onFocus,
  onActivate,
}: AttachmentCellProps) {
  const view = renderCellState(state);
  const ariaLabel = `${serverName} · ${providerName} · ${view.label}${
    view.sub ? ` (${view.sub})` : ""
  }`;
  const body = (
    <>
      <span>{view.label}</span>
      {view.sub && (
        <span className="ml-1 text-(--tethys-text-muted)">{view.sub}</span>
      )}
    </>
  );
  const className = cn(
    "flex h-full w-full items-center px-1.5 font-mono text-mono-micro",
    TONE_CLASS[view.tone],
    view.actionable &&
      "cursor-pointer text-left hover:bg-(--tethys-surface-hover)",
  );

  if (view.actionable) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: DESIGN sync-grid-cell is an explicit gridcell role
      <button
        ref={cellRef as (el: HTMLButtonElement | null) => void}
        type="button"
        role="gridcell"
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onClick={onActivate}
        className={className}
      >
        {body}
      </button>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: DESIGN sync-grid-cell is an explicit gridcell role
    <div
      ref={cellRef as (el: HTMLDivElement | null) => void}
      role="gridcell"
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={className}
    >
      {body}
    </div>
  );
}

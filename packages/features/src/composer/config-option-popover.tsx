//! `config-option-popover` (spec §4) — a small popover for one composer chip.

import type { ConfigOption } from "@tethys/bindings";
import { Popover } from "@tethys/ui";
import type { RefObject } from "react";
import { optionValues } from "../thread-new/session-config-panel";

export interface ConfigOptionPopoverProps {
  option: ConfigOption;
  value: string;
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function ConfigOptionPopover({
  option,
  value,
  open,
  onClose,
  onSelect,
  anchorRef,
}: ConfigOptionPopoverProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      className="bottom-full left-0 mb-1.5"
    >
      <div className="flex w-60 flex-col">
        <div role="listbox" aria-label={option.name} className="flex flex-col">
          {optionValues(option).map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="option"
              aria-selected={candidate.id === value}
              onClick={() => {
                onSelect(candidate.id);
                onClose();
              }}
              className={`focus-ring flex min-h-8 items-center rounded-sm px-3 py-1.5 text-left text-body-sm ${
                candidate.id === value
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                  : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
              }`}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>
                  {candidate.id === option.recommended_value
                    ? `${candidate.name} (Recommended)`
                    : candidate.name}
                </span>
                {candidate.description && (
                  <span className="text-label-sm text-(--tethys-text-muted)">
                    {candidate.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
        <p className="px-3 py-1 text-label-sm text-(--tethys-text-muted)">
          Applies from the next turn
        </p>
      </div>
    </Popover>
  );
}

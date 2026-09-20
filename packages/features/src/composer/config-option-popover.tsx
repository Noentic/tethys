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
      <div className="flex w-56 flex-col">
        <div className="px-3 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider">
          {option.name}
        </div>
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
              className={`focus-ring flex h-8 items-center rounded-sm px-3 text-left text-body-sm ${
                candidate.id === value
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                  : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
              }`}
            >
              {candidate.name}
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

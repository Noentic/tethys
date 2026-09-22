//! Mode pill (spec §4, DESIGN.md `mode-pill`) — the one home of the ACP `mode` category.
//! Every other option lives in the composer chips or the full config panel.

import type { ConfigOption } from "@tethys/bindings";
import { Popover } from "@tethys/ui";
import { useRef, useState } from "react";
import { optionValues } from "../thread-new/session-config-panel";

export const MODE_PILL_PRIORITY = 40;

export interface ModePillData {
  options?: ConfigOption[];
  onChange?: (value: string) => void;
}

export function ModePill({ data }: { data?: unknown }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const pillData = data as ModePillData | undefined;
  const option = pillData?.options?.find(
    (candidate) => candidate.category === "mode",
  );
  if (!option) return null;

  const display =
    optionValues(option).find((value) => value.id === option.current_value)
      ?.name ?? option.current_value;

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Mode, ${display}`}
        onClick={() => setOpen((prev) => !prev)}
        className="focus-ring inline-flex h-[22px] items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
      >
        <span aria-hidden="true" className="text-(--tethys-text-muted)">
          Mode
        </span>
        <span className="text-(--tethys-text-primary)">{display}</span>
        <span aria-hidden="true" className="text-(--tethys-text-muted)">
          {"\u25be"}
        </span>
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        className="bottom-full left-0 mb-1.5 w-60"
      >
        <div
          className="flex flex-col gap-0.5 p-1"
          role="listbox"
          aria-label={option.name}
        >
          {optionValues(option).map((value) => (
            <button
              key={value.id}
              type="button"
              role="option"
              aria-selected={value.id === option.current_value}
              onClick={() => {
                pillData?.onChange?.(value.id);
                setOpen(false);
              }}
              className={`focus-ring flex min-h-8 items-center rounded-sm px-3 text-left text-body-sm ${
                value.id === option.current_value
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                  : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
              }`}
            >
              {value.name}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

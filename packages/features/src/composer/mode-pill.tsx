//! Action-bar mode pill (spec §4) — the one home of the ACP `mode` category.
//! Every other option lives in the composer chips or the full config panel.

import type { ConfigOption } from "@tethys/bindings";
import { Chip } from "@tethys/ui";
import { useState } from "react";
import { optionValues } from "../thread-new/session-config-panel";

export const MODE_PILL_PRIORITY = 40;

export interface ModePillData {
  options?: ConfigOption[];
  onChange?: (value: string) => void;
}

export function ModePill({ data }: { data?: unknown }) {
  const [open, setOpen] = useState(false);
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
      <Chip
        interactive
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Mode · {display}
      </Chip>
      {open && (
        <div
          role="listbox"
          aria-label={option.name}
          className="edge-lit absolute bottom-full left-0 mb-1.5 w-48 rounded-md border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) p-1"
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
              className="focus-ring flex h-8 w-full items-center rounded-sm px-3 text-left text-body-sm text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
            >
              {value.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

//! The prompt-card mode control. Mode is returned by the connected Provider's
//! prepared session, so it is intentionally absent before that connection exists.

import type { ConfigOption } from "@tethys/bindings";
import { Popover } from "@tethys/ui";
import { useRef, useState } from "react";
import { optionValues } from "./session-config-panel";

const PILL_CLASS =
  "focus-ring flex h-[22px] items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

export interface ModeSelectorProps {
  options: ConfigOption[];
  value?: string;
  onChange: (value: string) => void;
}

export function ModeSelector({ options, value, onChange }: ModeSelectorProps) {
  const option = options.find((candidate) => candidate.category === "mode");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // No connected session means no mode control. This keeps mode writes behind
  // the same provider connection that supplies the option values.
  if (!option) return null;

  const current = value ?? option.current_value;
  const display =
    optionValues(option).find((candidate) => candidate.id === current)?.name ??
    current;
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Mode, ${display}`}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((previous) => !previous);
          } else if (event.key === "Escape") {
            close();
          }
        }}
        className={PILL_CLASS}
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
        onClose={close}
        anchorRef={anchorRef}
        className="bottom-full left-0 mb-1.5 w-60"
      >
        <div
          className="flex flex-col gap-0.5 p-1"
          role="listbox"
          aria-label="Mode"
        >
          {optionValues(option).map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="option"
              aria-selected={candidate.id === current}
              onClick={() => {
                onChange(candidate.id);
                close();
              }}
              className={`focus-ring flex min-h-8 items-center rounded-sm px-3 text-left text-body-sm ${
                candidate.id === current
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                  : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
              }`}
            >
              <span className="truncate">{candidate.name}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

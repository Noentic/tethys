//! `composer-config-chip`s (spec §4) — the Model (`model` category) and Effort
//! (`thought_level`) controls beside the composer input. `mode` and every
//! other option live only in the full panel, so no option renders twice.

import type { ConfigOption } from "@tethys/bindings";
import { Chip } from "@tethys/ui";
import { useEffect, useState } from "react";
import { ProviderCapabilityNotice } from "../providers/capability-notice";
import { optionValues } from "../thread-new/session-config-panel";
import { ConfigOptionPopover } from "./config-option-popover";

/** Categories that own a composer chip; every other option is panel-only. */
const CHIP_CATEGORIES = ["model", "thought_level"] as const;

export function chipOptions(options: ConfigOption[]): ConfigOption[] {
  return CHIP_CATEGORIES.flatMap((category) => {
    const option = options.find((candidate) => candidate.category === category);
    return option ? [option] : [];
  });
}

export interface ComposerConfigChipsProps {
  options: ConfigOption[];
  values: Record<string, string>;
  providerName: string;
  /** Applies the change; reject (throw) to revert the chip. */
  onSetOption: (optionId: string, value: string) => Promise<void>;
}

export function ComposerConfigChips({
  options,
  values,
  providerName,
  onSetOption,
}: ComposerConfigChipsProps) {
  const chips = chipOptions(options);
  const [local, setLocal] = useState<Record<string, string>>(values);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    setLocal(values);
  }, [values]);

  if (chips.length === 0) return null;

  const change = async (option: ConfigOption, value: string) => {
    const previous = local[option.id] ?? option.current_value;
    setRejected(false);
    setLocal((prev) => ({ ...prev, [option.id]: value }));
    try {
      await onSetOption(option.id, value);
    } catch {
      setLocal((prev) => ({ ...prev, [option.id]: previous }));
      setRejected(true);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((option) => {
        const current = local[option.id] ?? option.current_value;
        const display =
          optionValues(option).find((value) => value.id === current)?.name ??
          current;
        const levels =
          option.category === "thought_level" ? optionValues(option) : [];
        if (levels.length > 1) {
          const index = Math.max(
            0,
            levels.findIndex((value) => value.id === current),
          );
          return (
            <label
              key={option.id}
              className="flex items-center gap-2 text-label-sm text-(--tethys-text-muted)"
            >
              Faster
              <input
                aria-label={`${option.name} effort`}
                type="range"
                min={0}
                max={levels.length - 1}
                step={1}
                value={index}
                onChange={(event) => {
                  const selected = levels[Number(event.target.value)];
                  if (selected) void change(option, selected.id);
                }}
                className="w-20 accent-(--tethys-accent-primary)"
              />
              Smarter
              <span className="sr-only">{display}</span>
            </label>
          );
        }
        return (
          <div key={option.id} className="relative">
            <Chip
              interactive
              aria-haspopup="listbox"
              aria-expanded={openId === option.id}
              onClick={() => setOpenId(openId === option.id ? null : option.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenId(openId === option.id ? null : option.id);
                } else if (event.key === "Escape") {
                  setOpenId(null);
                }
              }}
            >
              {display}
            </Chip>
            <ConfigOptionPopover
              option={option}
              value={current}
              open={openId === option.id}
              onClose={() => setOpenId(null)}
              onSelect={(value) => void change(option, value)}
            />
          </div>
        );
      })}
      {rejected && (
        <ProviderCapabilityNotice
          provider={providerName}
          capability="change this option mid-session"
        />
      )}
    </div>
  );
}

//! `composer-config-chip`s (spec §4) — the Model (`model` category) and Effort
//! (`thought_level`) controls beside the composer input. `mode` and every
//! other option live only in the full panel, so no option renders twice.

import { ChevronDown } from "@nebutra/icons";
import type { ConfigOption } from "@tethys/bindings";
import { cn, TruncatedText } from "@tethys/ui";
import { useEffect, useState } from "react";
import { providerEntry } from "../agents/provider-catalog";
import { ProviderCapabilityNotice } from "../providers/capability-notice";
import { ProviderPendingCount } from "../providers/provider-popover";
import { optionValues } from "../thread-new/config-values";
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
  providerAnchorRef?: React.Ref<HTMLButtonElement>;
  sessionId?: string;
}

export function ComposerConfigChips({
  options,
  values,
  providerName,
  onSetOption,
  providerAnchorRef,
  sessionId,
}: ComposerConfigChipsProps) {
  const chips = chipOptions(options);
  const [local, setLocal] = useState<Record<string, string>>(values);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    setLocal(values);
  }, [values]);

  const modelOption = options.find((option) => option.category === "model");
  const modelName = modelOption
    ? optionValues(modelOption).find(
        (value) =>
          value.id === (local[modelOption.id] ?? modelOption.current_value),
      )?.name
    : undefined;

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

  const provider = providerEntry(providerName);

  return (
    <div className="flex shrink-0 min-w-0 items-center gap-xs">
      {chips.map((option) => {
        const current = local[option.id] ?? option.current_value;
        const display =
          optionValues(option).find((value) => value.id === current)?.name ??
          current;
        const isModel = option.category === "model";
        return (
          <div key={option.id} className="flex min-w-0 items-center gap-xs">
            <div className="relative min-w-0">
              <button
                ref={isModel ? providerAnchorRef : undefined}
                type="button"
                data-composer-control={
                  option.category === "thought_level" ? "effort" : "model"
                }
                aria-label={`${option.name}, ${display}`}
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
                className={cn(
                  "inline-flex min-h-7 max-w-full min-w-0 items-center gap-1.5 rounded-sm px-2 text-label-md text-(--tethys-text-secondary) transition-colors select-none",
                  "hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
                  openId === option.id &&
                    "bg-(--tethys-surface-active) text-(--tethys-text-primary)",
                )}
              >
                {isModel && provider && (
                  <img
                    src={provider.icon}
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0"
                  />
                )}
                {option.category === "thought_level" && (
                  <span className="shrink-0 text-(--tethys-text-muted)">
                    {option.name} ·
                  </span>
                )}
                <TruncatedText
                  text={display}
                  className={isModel ? "max-w-36" : "max-w-48"}
                />
                <ChevronDown
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-(--tethys-text-muted)"
                />
              </button>
              <ConfigOptionPopover
                option={option}
                value={current}
                open={openId === option.id}
                onClose={() => setOpenId(null)}
                onSelect={(value) => void change(option, value)}
                modelName={modelName}
              />
            </div>
            {isModel && sessionId && (
              <ProviderPendingCount threadId={sessionId} />
            )}
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

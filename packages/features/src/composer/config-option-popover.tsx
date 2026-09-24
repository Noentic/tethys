//! `config-option-popover` (DESIGN.md; spec §4) — the small popover behind one
//! composer chip. The `model` category is a searchable list at a fixed height
//! (P19), an ordered `thought_level` is the stepped effort slider
//! (`composer-config-chip.orderedScale`), and any other select is a listbox.

import type { ConfigOption } from "@tethys/bindings";
import { cn, Popover, ReasoningEffort } from "@tethys/ui";
import type { RefObject } from "react";
import { optionValues } from "../thread-new/config-values";
import { ModelOptionList } from "../thread-new/model-option-list";

export interface ConfigOptionPopoverProps {
  option: ConfigOption;
  value: string;
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  anchorRef?: RefObject<HTMLElement | null>;
  /** The current model's name, shown on the effort slider's drag label. */
  modelName?: string;
}

/** Whether an option renders as the ordered effort scale. */
export function isEffortScale(option: ConfigOption): boolean {
  return option.category === "thought_level" && optionValues(option).length > 1;
}

function OptionListbox({
  option,
  value,
  onSelect,
}: Pick<ConfigOptionPopoverProps, "option" | "value" | "onSelect">) {
  return (
    <div role="listbox" aria-label={option.name} className="flex flex-col">
      {optionValues(option).map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          role="option"
          aria-selected={candidate.id === value}
          onClick={() => onSelect(candidate.id)}
          className={cn(
            "focus-ring flex min-h-8 items-center rounded-sm px-3 py-1.5 text-left text-body-sm",
            candidate.id === value
              ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
              : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)",
          )}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate">
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
  );
}

export function ConfigOptionPopover({
  option,
  value,
  open,
  onClose,
  onSelect,
  anchorRef,
  modelName,
}: ConfigOptionPopoverProps) {
  const choose = (next: string) => {
    onSelect(next);
    onClose();
  };
  const isModel = option.category === "model";
  const isEffort = isEffortScale(option);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      side="top"
      autoFocus={isModel}
      className={cn("flex flex-col", isModel && "overflow-hidden p-0")}
    >
      {isModel ? (
        <div className="flex h-[min(360px,55vh)] w-[min(320px,calc(100vw-16px))] flex-col">
          <ModelOptionList
            option={option}
            value={value}
            onChange={choose}
            className="min-h-0 flex-1"
          />
        </div>
      ) : isEffort ? (
        <div className="flex flex-col px-3 pt-3 pb-1.5">
          <ReasoningEffort
            label={`${option.name} effort`}
            levels={optionValues(option)}
            value={value}
            onChange={onSelect}
          />
        </div>
      ) : (
        <div className="w-[min(240px,calc(100vw-16px))]">
          <OptionListbox option={option} value={value} onSelect={choose} />
        </div>
      )}
      <p className="shrink-0 border-t border-(--tethys-hairline) px-3 py-1.5 text-label-sm text-(--tethys-text-muted)">
        Applies from the next turn
      </p>
    </Popover>
  );
}

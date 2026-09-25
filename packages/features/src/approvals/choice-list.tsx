//! The numbered choice list every "the agent needs you" card answers with
//! (DESIGN.md P7): one row per option in the Provider's order, its number as a
//! trailing keycap. `↑`/`↓` move between rows, `Enter` picks, and `1`–`9` pick
//! directly. A single choice answers at once; a multiple choice toggles and
//! the card submits.

import { Check } from "@nebutra/icons";
import { cn, KeycapPill } from "@tethys/ui";
import type React from "react";
import { useEffect, useRef } from "react";

export interface Choice {
  id: string;
  label: string;
  /** Secondary text the Provider sent; never invented here. */
  description?: string | null;
  /** A choice that refuses (`reject_once`): its label reads as danger. */
  refuses?: boolean;
}

/** Whether a key event is a `1`–`9` shortcut, and for which row. */
export function choiceIndexFromKey(key: string): number | null {
  const digit = Number.parseInt(key, 10);
  return Number.isNaN(digit) || digit < 1 || digit > 9 || key.length !== 1
    ? null
    : digit - 1;
}

export function ChoiceList({
  choices,
  label,
  multiple = false,
  selected = [],
  disabled = false,
  autoFocus = true,
  onChoose,
  footer,
  className,
}: {
  choices: Choice[];
  /** The accessible name of the group: the question or request it answers. */
  label: string;
  multiple?: boolean;
  /** The chosen ids of a multiple choice (or the single choice, once made). */
  selected?: string[];
  disabled?: boolean;
  /** Whether to focus the first choice button on mount. */
  autoFocus?: boolean;
  /** Called with a row's id: answers a single choice, toggles a multiple one. */
  onChoose: (id: string) => void;
  /** A row after the numbered ones, such as the free-text "Other". */
  footer?: React.ReactNode;
  className?: string;
}) {
  const rows = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && !disabled && rows.current[0]) {
      rows.current[0].focus();
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isInput) return;

      const index = choiceIndexFromKey(event.key);
      if (index !== null) {
        const choice = choices[index];
        if (choice) {
          event.preventDefault();
          onChoose(choice.id);
          return;
        }
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const activeIndex = rows.current.findIndex(
          (node) => node === document.activeElement,
        );
        if (activeIndex === -1 && rows.current.length > 0) {
          event.preventDefault();
          rows.current[0]?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [choices, disabled, onChoose]);

  const move = (from: number, step: number) => {
    const count = choices.length;
    if (count === 0) return;
    rows.current[(from + step + count) % count]?.focus();
  };

  return (
    <div className={cn("flex flex-col gap-xs", className)}>
      <fieldset
        aria-label={label}
        onKeyDown={(event) => {
          const index = choiceIndexFromKey(event.key);
          if (index === null || disabled) return;
          const choice = choices[index];
          if (!choice) return;
          event.preventDefault();
          onChoose(choice.id);
        }}
        className="m-0 flex min-w-0 flex-col border-0 p-0"
      >
        {choices.map((choice, index) => {
          const isSelected = selected.includes(choice.id);
          return (
            <button
              key={choice.id}
              ref={(node) => {
                rows.current[index] = node;
              }}
              type="button"
              aria-pressed={multiple ? isSelected : undefined}
              aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
              disabled={disabled}
              onClick={() => onChoose(choice.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, -1);
                }
              }}
              className={cn(
                "group focus-ring-inset flex min-h-8 w-full min-w-0 items-center gap-sm rounded-sm px-sm py-1 text-left transition-colors duration-150",
                "hover:bg-(--tethys-surface-hover) focus-visible:bg-(--tethys-surface-hover) disabled:opacity-60",
                isSelected && "bg-(--tethys-surface-active)",
              )}
            >
              {multiple ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-xs border border-(--tethys-border-control)",
                    isSelected &&
                      "border-(--tethys-text-primary) bg-(--tethys-text-primary) text-(--tethys-surface-card)",
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="w-2 shrink-0 font-mono text-mono-micro text-(--tethys-text-muted) opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  ›
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "text-label-md",
                    choice.refuses
                      ? "text-(--tethys-status-danger)"
                      : "text-(--tethys-text-primary)",
                  )}
                >
                  {choice.label}
                </span>
                {choice.description && (
                  <span className="text-body-sm text-(--tethys-text-muted)">
                    {choice.description}
                  </span>
                )}
              </span>
              {index < 9 && (
                <KeycapPill aria-hidden="true" className="shrink-0">
                  {index + 1}
                </KeycapPill>
              )}
            </button>
          );
        })}
      </fieldset>
      {footer}
      <p
        aria-hidden="true"
        className="px-sm font-mono text-mono-micro text-(--tethys-text-muted)"
      >
        ↑↓ move · ⏎ or 1–{Math.min(choices.length, 9)} to{" "}
        {multiple ? "toggle" : "choose"}
      </p>
    </div>
  );
}

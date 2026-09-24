//! The `model` config option as a searchable list (DESIGN.md
//! `searchable-listbox`, P19). A Provider such as OpenCode routes to hundreds of
//! models, so the list is filtered by typing, never scrolled through.

import type { ConfigOption } from "@tethys/bindings";
import { type SearchableItem, SearchableListbox } from "@tethys/ui";
import { optionValues } from "./config-values";

/**
 * Splits `OpenCode Zen/Big Pickle` into its routing prefix and model name when
 * the Provider names models that way, so each prefix becomes a group heading.
 * A list where no name carries a prefix stays one ungrouped list.
 */
export function modelItems(option: ConfigOption): SearchableItem[] {
  const values = optionValues(option);
  const prefixed = values.filter((value) => value.name.includes("/")).length;
  const grouped = prefixed > 1;
  return values.map((value) => {
    const cut = grouped ? value.name.indexOf("/") : -1;
    const name = cut > 0 ? value.name.slice(cut + 1) : value.name;
    return {
      id: value.id,
      label:
        value.id === option.recommended_value ? `${name} (Recommended)` : name,
      description: value.description ?? undefined,
      group: cut > 0 ? value.name.slice(0, cut) : undefined,
    };
  });
}

export interface ModelOptionListProps {
  option: ConfigOption;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ModelOptionList({
  option,
  value,
  onChange,
  className,
}: ModelOptionListProps) {
  return (
    <SearchableListbox
      label={option.name}
      items={modelItems(option)}
      selectedId={value}
      onSelect={onChange}
      placeholder={`Search ${option.name.toLowerCase()}s…`}
      className={className}
    />
  );
}

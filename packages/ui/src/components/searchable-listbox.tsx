import { Check, MagnifyingGlass } from "@nebutra/icons";
import { Command } from "cmdk";
import { useState } from "react";
import { cn } from "../lib/utils";

export interface SearchableItem {
  id: string;
  label: string;
  description?: string;
  /** Items sharing a group render under one heading, in first-seen order. */
  group?: string;
  disabled?: boolean;
}

export interface SearchableListboxProps {
  /** Accessible name of the list, for example the option's name `Model`. */
  label: string;
  items: SearchableItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  className?: string;
  /** Focus the search field on mount. */
  autoFocus?: boolean;
}

function groupsOf(items: SearchableItem[]): Array<[string, SearchableItem[]]> {
  const groups = new Map<string, SearchableItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups];
}

/**
 * A long list with a search field pinned above it (DESIGN.md
 * `searchable-listbox`, Interaction Patterns P19). The field filters by label,
 * description and group; the list scrolls under it inside the height its
 * container gives it, so a Provider with hundreds of models never pushes the
 * popover off screen.
 */
export function SearchableListbox({
  label,
  items,
  selectedId,
  onSelect,
  placeholder = "Search…",
  className,
  autoFocus = true,
}: SearchableListboxProps) {
  const [search, setSearch] = useState("");

  return (
    <Command
      label={label}
      loop
      defaultValue={selectedId}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-(--tethys-hairline) px-2.5">
        <MagnifyingGlass
          aria-hidden="true"
          className="size-3.5 shrink-0 text-(--tethys-text-muted)"
        />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="min-h-9 w-full min-w-0 bg-transparent text-body-sm text-(--tethys-text-primary) outline-none placeholder:text-(--tethys-text-muted)"
        />
      </div>
      <Command.List
        aria-label={label}
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        <Command.Empty className="px-3 py-4 text-center text-body-sm text-(--tethys-text-muted)">
          No {label.toLowerCase()} matches “{search}”
        </Command.Empty>
        {groupsOf(items).map(([group, members]) => (
          <Command.Group
            key={group || "ungrouped"}
            heading={group || undefined}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-mono-micro [&_[cmdk-group-heading]]:text-(--tethys-text-muted)"
          >
            {members.map((item) => {
              const selected = item.id === selectedId;
              return (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  keywords={[item.label, item.description ?? "", group]}
                  disabled={item.disabled}
                  aria-selected={selected}
                  onSelect={() => onSelect(item.id)}
                  className={cn(
                    "flex min-h-8 cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-body-sm text-(--tethys-text-secondary) select-none",
                    "data-[selected=true]:bg-(--tethys-surface-hover) data-[selected=true]:text-(--tethys-text-primary)",
                    "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      title={item.label}
                      className={cn(
                        "truncate",
                        selected && "text-(--tethys-text-primary)",
                      )}
                    >
                      {item.label}
                    </span>
                    {item.description && (
                      <span className="line-clamp-2 text-label-sm font-normal text-(--tethys-text-muted)">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-(--tethys-text-primary)"
                    />
                  )}
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}

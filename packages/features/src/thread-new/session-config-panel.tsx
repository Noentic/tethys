//! `session-config-panel` (DESIGN.md; spec §3) — one `schema-field-group` per
//! `ConfigOption`, driven by the Provider's own schema (never a fixed grid).

import type { ConfigOption } from "@tethys/bindings";
import {
  EmptyState,
  Listbox,
  SchemaFieldGroup,
  ToggleSwitch,
} from "@tethys/ui";

export interface SessionConfigPanelProps {
  options: ConfigOption[];
  /** Selected value per option id; falls back to `current_value`. */
  values: Record<string, string>;
  onChange: (optionId: string, value: string) => void;
  /** Option ids the Provider marks unavailable for the current selection. */
  unavailableIds?: string[];
}

const BOOLEAN_PAIRS = [
  ["true", "false"],
  ["on", "off"],
  ["enabled", "disabled"],
];

function booleanPair(values: string[]): boolean {
  if (values.length !== 2) return false;
  const lowered = values.map((value) => value.toLowerCase()).sort();
  return BOOLEAN_PAIRS.some(
    ([a, b]) => [...[a, b]].sort().join(",") === lowered.join(","),
  );
}

function isBoolean(option: ConfigOption): boolean {
  if (option.kind === "boolean") return true;
  if (option.kind === "select") return false;
  return booleanPair(option.values);
}

function valueLabel(option: ConfigOption, id: string): string {
  return option.value_options?.find((value) => value.id === id)?.name ?? id;
}

/** The Provider's display values, with `value_options` names preferred. */
export function optionValues(
  option: ConfigOption,
): Array<{ id: string; name: string }> {
  if (option.value_options && option.value_options.length > 0) {
    return option.value_options.map((value) => ({
      id: value.id,
      name: value.name,
    }));
  }
  return option.values.map((value) => ({
    id: value,
    name: valueLabel(option, value),
  }));
}

/**
 * Schema-driven session config. `ConfigOption` carries no explicit type, so
 * the control is derived from `kind` (when present) or the shape of `values`:
 * a boolean pair → toggle; >1 value → listbox; empty → read-only text.
 * An empty `options` list is the valid `No session options for this provider`.
 */
export function SessionConfigPanel({
  options,
  values,
  onChange,
  unavailableIds = [],
}: SessionConfigPanelProps) {
  if (options.length === 0) {
    return (
      <EmptyState
        title="No session options for this provider"
        description="This Provider exposes no configurable session options."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {options.map((option) => {
        const current = values[option.id] ?? option.current_value;
        const unavailable = unavailableIds.includes(option.id);
        return (
          <SchemaFieldGroup key={option.id} label={option.name}>
            {isBoolean(option) ? (
              <div className="flex items-center justify-between gap-2">
                {option.description && (
                  <span className="text-body-sm text-(--tethys-text-muted)">
                    {option.description}
                  </span>
                )}
                <ToggleSwitch
                  label={option.name}
                  checked={
                    current.toLowerCase() === "true" ||
                    current.toLowerCase() === "on" ||
                    current.toLowerCase() === "enabled"
                  }
                  disabled={unavailable}
                  onCheckedChange={(checked) =>
                    onChange(option.id, checked ? "true" : "false")
                  }
                />
              </div>
            ) : optionValues(option).length > 1 ||
              option.kind === "select" ||
              option.values.length > 0 ? (
              <div className={unavailable ? "opacity-50" : undefined}>
                <Listbox
                  label={option.name}
                  selectedId={current}
                  items={optionValues(option).map((value) => ({
                    id: value.id,
                    value: value.id,
                    label: value.name,
                  }))}
                  onSelect={(item) => onChange(option.id, item.value)}
                />
              </div>
            ) : (
              <span className="font-mono text-mono-code text-(--tethys-text-secondary)">
                {valueLabel(option, current)}
              </span>
            )}
          </SchemaFieldGroup>
        );
      })}
    </div>
  );
}

//! `session-config-panel` (DESIGN.md; spec §3) — one `schema-field-group` per
//! `ConfigOption`, driven by the Provider's own schema (never a fixed grid).

import type { ConfigOption } from "@tethys/bindings";
import { EmptyState, SchemaFieldGroup, Select, ToggleSwitch } from "@tethys/ui";
import { optionValues, valueLabel } from "./config-values";
import { ModelOptionList } from "./model-option-list";

export interface SessionConfigPanelProps {
  options: ConfigOption[];
  /** Selected value per option id; falls back to `current_value`. */
  values: Record<string, string>;
  onChange: (optionId: string, value: string) => void;
  /** Empty-state title override while a prepared draft is still resolving. */
  emptyCopy?: string;
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

/**
 * Schema-driven session config. `ConfigOption` carries no explicit type, so
 * the control is derived from `kind` (when present) or the shape of `values`:
 * a boolean pair → toggle; selectable values → themed select; empty →
 * read-only text.
 * An empty `options` list is the valid `No session options for this provider`.
 */
export function SessionConfigPanel({
  options,
  values,
  onChange,
  emptyCopy,
}: SessionConfigPanelProps) {
  if (options.length === 0) {
    return (
      <EmptyState
        title={emptyCopy ?? "No session options for this provider"}
        description={
          emptyCopy === undefined
            ? "This Provider exposes no configurable session options."
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      {options.map((option) => {
        const current = values[option.id] ?? option.current_value;
        return (
          <SchemaFieldGroup key={option.id} label={option.name}>
            {option.category === "model" && !isBoolean(option) ? (
              <ModelOptionList
                option={option}
                value={current}
                onChange={(value) => onChange(option.id, value)}
                className="max-h-64 rounded-md border border-(--tethys-hairline)"
              />
            ) : isBoolean(option) ? (
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
                  onCheckedChange={(checked) =>
                    onChange(option.id, checked ? "true" : "false")
                  }
                />
              </div>
            ) : optionValues(option).length > 0 ? (
              <Select
                aria-label={option.name}
                value={current}
                className="w-full"
                onChange={(event) => onChange(option.id, event.target.value)}
              >
                {optionValues(option).map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.id === option.recommended_value
                      ? `${value.name} (Recommended)`
                      : value.name}
                  </option>
                ))}
              </Select>
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

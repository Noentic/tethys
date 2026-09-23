//! `session-config-panel` (DESIGN.md; spec §3) — one `schema-field-group` per
//! `ConfigOption`, driven by the Provider's own schema (never a fixed grid).

import type { ConfigOption } from "@tethys/bindings";
import { EmptyState, SchemaFieldGroup, Select, ToggleSwitch } from "@tethys/ui";

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

function valueLabel(option: ConfigOption, id: string): string {
  return option.value_options?.find((value) => value.id === id)?.name ?? id;
}

/** The Provider's display values, with `value_options` names preferred. */
export function optionValues(
  option: ConfigOption,
): Array<{ id: string; name: string; description?: string | null }> {
  if (option.value_options && option.value_options.length > 0) {
    return option.value_options.map((value) => ({
      id: value.id,
      name: value.name,
      description: value.description,
    }));
  }
  return option.values.map((value) => ({
    id: value,
    name: valueLabel(option, value),
    description: undefined,
  }));
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
              <div
                role="radiogroup"
                aria-label={option.name}
                className="flex flex-col gap-1"
              >
                {optionValues(option).map((value) => (
                  <label
                    key={value.id}
                    className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-body-sm hover:bg-(--tethys-surface-hover)"
                  >
                    <input
                      type="radio"
                      name={option.id}
                      value={value.id}
                      checked={current === value.id}
                      onChange={() => onChange(option.id, value.id)}
                      className="mt-0.5 accent-(--tethys-accent-primary)"
                    />
                    <span className="min-w-0">
                      <span className="block text-(--tethys-text-primary)">
                        {value.name}
                      </span>
                      {value.description && (
                        <span className="block text-label-sm text-(--tethys-text-muted)">
                          {value.description}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
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

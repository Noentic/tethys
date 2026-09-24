//! A config option's selectable values, as the Provider names them.

import type { ConfigOption } from "@tethys/bindings";

export function valueLabel(option: ConfigOption, id: string): string {
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

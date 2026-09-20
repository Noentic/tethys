import type React from "react";
import { useId } from "react";
import { cn } from "../lib/utils";

export interface SchemaFieldGroupProps {
  /** Optional group heading. When omitted, no heading is rendered. */
  label?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * `schema-field-group` (DESIGN.md) — a pure spacing container: transparent
 * background, 1px hairline top border, `12px 0` padding. It carries no field
 * types, so both generated schema forms and static config rows share rhythm.
 */
export function SchemaFieldGroup({
  label,
  children,
  className,
}: SchemaFieldGroupProps) {
  const generatedId = useId();
  const labelId = label ? `${generatedId}-label` : undefined;

  return (
    <fieldset
      aria-labelledby={labelId}
      className={cn(
        "m-0 min-w-0 border-x-0 border-b-0 border-t border-solid border-(--tethys-hairline) bg-transparent px-0 py-3",
        className,
      )}
    >
      {label && (
        <legend
          id={labelId}
          className="mb-2 p-0 text-label-sm text-(--tethys-text-secondary)"
        >
          {label}
        </legend>
      )}
      {children}
    </fieldset>
  );
}

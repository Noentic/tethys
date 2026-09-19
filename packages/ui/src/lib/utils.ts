import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design-system type steps (tailwind.css `--text-*`). Without registering them,
// tailwind-merge reads `text-mono-micro` as a text *color* and drops it whenever a
// real color like `text-(--tethys-text-muted)` follows — silently losing the size.
export const TYPE_SCALE_STEPS = [
  "display-lg",
  "heading-lg",
  "heading-md",
  "body-md",
  "body-sm",
  "label-md",
  "label-sm",
  "mono-code",
  "mono-micro",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_SCALE_STEPS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

function firstEnabled(
  start: number,
  step: number,
  count: number,
  disabled: (index: number) => boolean,
): number | null {
  let index = start;
  while (index >= 0 && index < count) {
    if (!disabled(index)) return index;
    index += step;
  }
  return null;
}

/**
 * Computes the next roving-tabindex target for a list/tab-strip (DESIGN.md
 * accessibility map): arrows step with wraparound, Home/End jump to the first
 * or last enabled item. Returns `null` when the key is not a navigation key.
 */
export function nextRovingIndex(
  key: string,
  current: number,
  count: number,
  disabled: (index: number) => boolean = () => false,
): number | null {
  if (count <= 0) return null;
  if (key === "Home") return firstEnabled(0, 1, count, disabled);
  if (key === "End") return firstEnabled(count - 1, -1, count, disabled);

  const step = NEXT_KEYS.has(key) ? 1 : PREV_KEYS.has(key) ? -1 : 0;
  if (step === 0) return null;

  let index = current < 0 ? (step > 0 ? -1 : count) : current;
  for (let attempts = 0; attempts < count; attempts += 1) {
    index = (index + step + count) % count;
    if (!disabled(index)) return index;
  }
  return null;
}

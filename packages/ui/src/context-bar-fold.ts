/**
 * The context bar's width budget (DESIGN.md `prompt-card.contextBarFold`): when
 * the pills do not fit, the lowest-priority ones fold into an overflow, and the
 * stop control and the isolation pill never fold. Pure, so the order and the
 * arithmetic are proven directly and the same function serves whichever surface
 * hosts the bar.
 */

/** Fold priority, highest first. An undeclared registered slot ranks below `usage-bar`. */
export const CONTEXT_BAR_PRIORITY = {
  stop: 100,
  "isolation-pill": 90,
  "provider/config": 60,
  "diff-summary": 50,
  mode: 40,
  "queue-count": 30,
  "usage-bar": 20,
} as const;

export const UNDECLARED_SLOT_PRIORITY = 10;

/** Width budget per entry id, in px. */
export const CONTEXT_BAR_ITEM_WIDTHS: Record<string, number> = {
  stop: 110,
  "isolation-pill": 120,
  "provider/config": 170,
  "diff-summary": 110,
  mode: 80,
  "queue-count": 90,
  "usage-bar": 70,
  default: 80,
};

export const OVERFLOW_TRIGGER_WIDTH = 28;

/** Inter-cluster gaps not attributable to any single entry. */
export const CONTEXT_BAR_CHROME_WIDTH = 24;

const NEVER_FOLDS: ReadonlySet<string> = new Set(["stop", "isolation-pill"]);

/** The body size the width budgets above were measured at. */
const BASE_BODY_PX = 14;

/**
 * How much wider text renders than the budgets assume: the Settings type size
 * shifts every step of the ramp by `--tethys-type-offset`, so a pill measured at
 * 14px body text is proportionally wider at 18px.
 */
export function typeScale(
  root: Element | null = globalThis.document?.documentElement ?? null,
): number {
  if (!root || typeof getComputedStyle === "undefined") return 1;
  const offset = Number.parseFloat(
    getComputedStyle(root).getPropertyValue("--tethys-type-offset"),
  );
  return Number.isFinite(offset) ? (BASE_BODY_PX + offset) / BASE_BODY_PX : 1;
}

export interface ContextBarItem {
  id: string;
  priority: number;
  /** Whether the item renders at all; an absent item costs nothing. */
  present: boolean;
}

/**
 * The ids to fold into the overflow so the bar fits `availableWidth`, lowest
 * priority first. The stop control and the isolation pill are reserved as
 * chrome and never appear in the result.
 */
export function foldContextBar(
  items: readonly ContextBarItem[],
  availableWidth: number,
  scale = 1,
): Set<string> {
  const itemWidth = (id: string) =>
    (CONTEXT_BAR_ITEM_WIDTHS[id] ?? CONTEXT_BAR_ITEM_WIDTHS.default) * scale;
  const foldable = items
    .filter((item) => item.present && !NEVER_FOLDS.has(item.id))
    .sort((a, b) => a.priority - b.priority);

  const reserved = (id: string) =>
    items.some((item) => item.id === id && item.present) ? itemWidth(id) : 0;
  // The non-foldable chrome still consumes the bar, so the budget reserves what
  // is actually in the row or the bar under-folds. The stop control counts only
  // when it shares the row: in the docked card it is in the lower bar.
  const chromeWidth =
    reserved("stop") + reserved("isolation-pill") + CONTEXT_BAR_CHROME_WIDTH;

  const folded = new Set<string>();
  let remaining = foldable.reduce((sum, item) => sum + itemWidth(item.id), 0);
  for (const item of foldable) {
    const triggerCost = folded.size > 0 ? OVERFLOW_TRIGGER_WIDTH : 0;
    if (remaining + chromeWidth + triggerCost <= availableWidth) {
      break;
    }
    folded.add(item.id);
    remaining -= itemWidth(item.id);
  }
  return folded;
}

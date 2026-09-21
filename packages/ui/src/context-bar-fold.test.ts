import { describe, expect, it } from "vitest";
import {
  CONTEXT_BAR_CHROME_WIDTH,
  CONTEXT_BAR_ITEM_WIDTHS,
  CONTEXT_BAR_PRIORITY,
  foldContextBar,
  OVERFLOW_TRIGGER_WIDTH,
  UNDECLARED_SLOT_PRIORITY,
} from "./context-bar-fold";

const item = (id: string, priority: number, present = true) => ({
  id,
  priority,
  present,
});

const FULL = [
  item("stop", CONTEXT_BAR_PRIORITY.stop),
  item("permission-mode", CONTEXT_BAR_PRIORITY["permission-mode"]),
  item("provider/config", CONTEXT_BAR_PRIORITY["provider/config"]),
  item("diff-summary", CONTEXT_BAR_PRIORITY["diff-summary"]),
  item("mode", CONTEXT_BAR_PRIORITY.mode),
  item("queue-count", CONTEXT_BAR_PRIORITY["queue-count"]),
  item("usage-bar", CONTEXT_BAR_PRIORITY["usage-bar"]),
  item("isolation-pill", CONTEXT_BAR_PRIORITY["isolation-pill"]),
];

const width = (id: string) =>
  CONTEXT_BAR_ITEM_WIDTHS[id] ?? CONTEXT_BAR_ITEM_WIDTHS.default;
// What the never-folding chrome costs when the stop control shares the row: the
// stop control, the isolation pill and the gaps between clusters.
const CHROME =
  width("stop") + width("isolation-pill") + CONTEXT_BAR_CHROME_WIDTH;
const foldableTotal = (ids: string[]) =>
  ids.reduce((sum, id) => sum + width(id), 0);

describe("context bar fold", () => {
  it("keeps the declared priorities: stop and isolation highest, usage lowest", () => {
    expect(CONTEXT_BAR_PRIORITY).toEqual({
      stop: 100,
      "isolation-pill": 90,
      "permission-mode": 70,
      "provider/config": 60,
      "diff-summary": 50,
      mode: 40,
      "queue-count": 30,
      "usage-bar": 20,
    });
    expect(UNDECLARED_SLOT_PRIORITY).toBeLessThan(
      CONTEXT_BAR_PRIORITY["usage-bar"],
    );
  });

  it("folds nothing when there is room", () => {
    expect(foldContextBar(FULL, Number.POSITIVE_INFINITY)).toEqual(new Set());
  });

  it("folds lowest priority first as the width shrinks", () => {
    const order = [
      "usage-bar",
      "queue-count",
      "mode",
      "diff-summary",
      "provider/config",
      "permission-mode",
    ];
    let previous = 0;
    for (let available = 2000; available >= 0; available -= 5) {
      const folded = foldContextBar(FULL, available);
      // Whatever folds is always a prefix of the priority order.
      expect([...folded]).toEqual(order.slice(0, folded.size));
      expect(folded.size).toBeGreaterThanOrEqual(previous);
      previous = folded.size;
    }
    expect(previous).toBe(order.length);
  });

  it("never folds the stop control or the isolation pill, even at zero width", () => {
    const folded = foldContextBar(FULL, 0);
    expect(folded.has("isolation-pill")).toBe(false);
    expect(folded.has("stop")).toBe(false);
    expect(folded.size).toBe(6);
  });

  it("folds an undeclared slot before every declared one", () => {
    const items = [...FULL, item("vendor-extra", UNDECLARED_SLOT_PRIORITY)];
    const ids = items
      .filter((i) => i.id !== "isolation-pill" && i.id !== "stop")
      .map((i) => i.id);
    const roomForAllButOne = CHROME + foldableTotal(ids) - 1;
    expect([...foldContextBar(items, roomForAllButOne)]).toEqual([
      "vendor-extra",
    ]);
  });

  it("counts the overflow trigger's cost only once something has folded", () => {
    const ids = FULL.filter(
      (i) => i.id !== "isolation-pill" && i.id !== "stop",
    ).map((i) => i.id);
    const exactlyFits = CHROME + foldableTotal(ids);
    expect(foldContextBar(FULL, exactlyFits).size).toBe(0);

    // One pixel short folds the lowest item; and because a fold now needs the
    // trigger's 28px, one more item folds if the freed width does not cover it.
    const afterOneFold =
      exactlyFits - width("usage-bar") + OVERFLOW_TRIGGER_WIDTH;
    expect(foldContextBar(FULL, afterOneFold).size).toBe(1);
    expect(foldContextBar(FULL, afterOneFold - 1).size).toBe(2);
  });

  it("ignores an item that is not present", () => {
    const items = FULL.map((i) =>
      i.id === "usage-bar" ? { ...i, present: false } : i,
    );
    const folded = foldContextBar(items, 0);
    expect(folded.has("usage-bar")).toBe(false);
    expect(folded.has("queue-count")).toBe(true);
  });

  it("reserves the stop control's width only when it shares the row", () => {
    // In the docked card the stop control is in the lower bar, so the context
    // bar must not fold to make room for a control that is not in its row.
    const withoutStop = FULL.filter((i) => i.id !== "stop");
    const rowWidth =
      width("isolation-pill") +
      CONTEXT_BAR_CHROME_WIDTH +
      foldableTotal([
        "permission-mode",
        "provider/config",
        "diff-summary",
        "mode",
        "queue-count",
        "usage-bar",
      ]);
    expect(foldContextBar(withoutStop, rowWidth).size).toBe(0);
    // The same width does not fit once the stop control shares the row.
    expect(foldContextBar(FULL, rowWidth).size).toBeGreaterThan(0);
  });

  it("does not budget for an isolation pill that is absent", () => {
    const withPill = foldContextBar(FULL, 700);
    const withoutPill = foldContextBar(
      FULL.map((i) =>
        i.id === "isolation-pill" ? { ...i, present: false } : i,
      ),
      700,
    );
    expect(withoutPill.size).toBeLessThanOrEqual(withPill.size);
  });
});

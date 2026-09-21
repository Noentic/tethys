import { describe, expect, it } from "vitest";
import {
  activeSessionCount,
  type CatalogSession,
  type CatalogViewState,
  catalogWorkspaceFixtures,
  chipFields,
  chipSlots,
  fitCountForWidth,
  initialCatalogViewState,
  orderSessionsForChips,
  selectCatalog,
  sessionStatusKey,
  workspaceNeedsAttention,
} from "./workspaces";

function session(id: string, status: CatalogSession["status"]): CatalogSession {
  return {
    id,
    providerId: "claude-code",
    branchName: `feature/${id}`,
    status,
    turnCount: 1,
    diffStat: { added: 1, removed: 0 },
  };
}

describe("catalog session status mapping", () => {
  it("maps the typed thread state, never waiting_approval", () => {
    expect(sessionStatusKey("AwaitingApproval")).toBe("awaiting_approval");
    expect(sessionStatusKey("Running")).toBe("running");
    expect(sessionStatusKey("Idle")).toBe("idle");
    expect(sessionStatusKey("AwaitingApproval")).not.toBe("waiting_approval");
  });

  it("falls back to idle for unknown or prototype keys", () => {
    expect(sessionStatusKey("Nonsense")).toBe("idle");
    expect(sessionStatusKey("toString")).toBe("idle");
    expect(sessionStatusKey("constructor")).toBe("idle");
  });
});

describe("chip slot priority", () => {
  it("orders awaiting, then running, then the rest", () => {
    const ordered = orderSessionsForChips([
      session("idle", "Idle"),
      session("run", "Running"),
      session("await", "AwaitingApproval"),
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["await", "run", "idle"]);
  });

  it("keeps awaiting visible and overflows the tail", () => {
    const sessions = [
      session("a1", "AwaitingApproval"),
      session("a2", "AwaitingApproval"),
      session("r1", "Running"),
      session("r2", "Running"),
      session("i1", "Idle"),
    ];
    const slots = chipSlots(sessions, 2);
    expect(slots.visible.map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(slots.overflow).toBe(3);
  });

  it("never overflows an awaiting session while a running chip holds a slot", () => {
    const sessions = [
      session("a1", "AwaitingApproval"),
      session("r1", "Running"),
      session("r2", "Running"),
      session("r3", "Running"),
    ];
    const slots = chipSlots(sessions, 2);
    expect(slots.visible.map((s) => s.id)).toContain("a1");
    expect(slots.visible).toHaveLength(2);
    expect(slots.overflow).toBe(2);
  });

  it("computes a fit count from the inner width (320px card fits two)", () => {
    expect(fitCountForWidth(286)).toBe(2);
    expect(fitCountForWidth(96)).toBe(1);
    expect(fitCountForWidth(1000)).toBe(3);
  });
});

describe("chip field drop", () => {
  it("drops the turn count first, then the diff stat", () => {
    expect(chipFields(200)).toEqual({ turn: true, diffStat: true });
    expect(chipFields(150)).toEqual({ turn: false, diffStat: true });
    expect(chipFields(100)).toEqual({ turn: false, diffStat: false });
  });
});

describe("fixture rows", () => {
  it("keeps the canonical catalog as test doubles, not a live default", () => {
    expect(catalogWorkspaceFixtures.length).toBeGreaterThan(0);
    expect(catalogWorkspaceFixtures[0].capabilities.vcs.kind).toBe(
      "git-remote",
    );
  });
});

describe("catalog selection", () => {
  it("filters to needs-attention cards and sorts", () => {
    const list = catalogWorkspaceFixtures;
    const attention = selectCatalog(list, {
      ...initialCatalogViewState,
      needsAttentionOnly: true,
    } satisfies CatalogViewState);
    expect(attention).toHaveLength(1);
    expect(workspaceNeedsAttention(attention[0])).toBe(true);

    const byName = selectCatalog(list, {
      ...initialCatalogViewState,
      sort: "name",
    });
    expect(byName.map((w) => w.name)).toEqual(["notes", "scratch", "tethys"]);
  });

  it("keeps favorites first inside the active sort", () => {
    const sorted = selectCatalog(
      catalogWorkspaceFixtures,
      { ...initialCatalogViewState, sort: "name" },
      ["scratch"],
    );
    expect(sorted.map((w) => w.name)).toEqual(["scratch", "notes", "tethys"]);
  });

  it("counts the active sessions the card's meta row reports", () => {
    const tethys = catalogWorkspaceFixtures[0];
    expect(activeSessionCount(tethys)).toBe(2);
    expect(activeSessionCount(catalogWorkspaceFixtures[1])).toBe(0);
  });
});

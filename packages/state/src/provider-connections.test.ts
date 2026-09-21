import type { WorkspaceListItem } from "@tethys/bindings";
import { describe, expect, it } from "vitest";
import {
  hasSelectableProvider,
  isProviderSelectable,
  noProviderFixtures,
  providerConnectionFixtures,
  selectProviderConnections,
  toProviderConnection,
} from "./provider-connections";
import { clearProvidersForTesting, upsertProvider } from "./providers";
import {
  noWorkspaceFixtures,
  toTrustedWorkspace,
  trustedWorkspaceFixtures,
} from "./trusted-workspaces";
import { workspaceCapabilityFixtures } from "./workspace-capabilities";

describe("provider connections", () => {
  it("returns an empty list without throwing (no array indexing)", () => {
    expect(hasSelectableProvider(noProviderFixtures)).toBe(false);
    expect(noProviderFixtures).toEqual([]);
  });

  it("flags an auth_required provider non-selectable", () => {
    const authRequired = providerConnectionFixtures.find(
      (provider) => provider.status === "auth_required",
    );
    expect(authRequired).toBeDefined();
    expect(authRequired && isProviderSelectable(authRequired)).toBe(false);
  });

  it("carries the provider's own config schema", () => {
    const claude = providerConnectionFixtures.find(
      (provider) => provider.id === "claude-code",
    );
    expect(claude?.configSchema.map((option) => option.category)).toEqual([
      "model",
      "thought_level",
    ]);
  });

  it("maps a stored profile onto the connectability shape", () => {
    const mapped = toProviderConnection({
      id: "codex",
      name: "Codex",
      enabled: true,
      health: "not-found",
      auth_methods: [],
    } as unknown as Parameters<typeof toProviderConnection>[0]);
    expect(mapped).toMatchObject({
      id: "codex",
      profileId: "codex",
      status: "missing",
    });
  });

  it("reads the store, with no fixture fallback", () => {
    clearProvidersForTesting();
    expect(selectProviderConnections()).toEqual([]);

    upsertProvider({
      id: "claude-code",
      name: "Claude Code",
      enabled: true,
      health: "healthy",
      protocol: "V2",
      auth_methods: [],
    } as unknown as Parameters<typeof upsertProvider>[0]);
    expect(selectProviderConnections().map((row) => row.id)).toEqual([
      "claude-code",
    ]);
    clearProvidersForTesting();
  });
});

describe("trusted workspaces", () => {
  it("returns an empty list for the zero-workspace fixture", () => {
    expect(noWorkspaceFixtures).toEqual([]);
  });

  it("carries a Vcs shape the source badge can render", () => {
    expect(trustedWorkspaceFixtures[0].vcs.kind).toBe("git-remote");
    expect(trustedWorkspaceFixtures[0].path).toBe("~/Code/tethys");
  });

  it("maps a workspace.list row onto the composer option", () => {
    const row: WorkspaceListItem = {
      id: "w1",
      name: "w1",
      path: "/tmp/w1",
      capabilities: workspaceCapabilityFixtures["git-local"],
      trust: "trusted",
      sessions: [],
    };
    expect(toTrustedWorkspace(row)).toEqual({
      id: "w1",
      name: "w1",
      path: "/tmp/w1",
      vcs: { kind: "git-local" },
    });
  });
});

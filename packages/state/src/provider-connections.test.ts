import { describe, expect, it } from "vitest";
import {
  hasSelectableProvider,
  isProviderSelectable,
  noProviderFixtures,
  providerConnectionFixtures,
  useProviderConnections,
} from "./provider-connections";
import {
  noWorkspaceFixtures,
  trustedWorkspaceFixtures,
  useTrustedWorkspaces,
} from "./trusted-workspaces";

describe("useProviderConnections", () => {
  it("returns an empty list without throwing (no array indexing)", () => {
    expect(useProviderConnections(noProviderFixtures)).toEqual([]);
    expect(hasSelectableProvider(noProviderFixtures)).toBe(false);
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
});

describe("useTrustedWorkspaces", () => {
  it("returns an empty list for the zero-workspace fixture", () => {
    expect(useTrustedWorkspaces(noWorkspaceFixtures)).toEqual([]);
  });

  it("carries a Vcs shape the source badge can render", () => {
    expect(trustedWorkspaceFixtures[0].vcs.kind).toBe("git-remote");
    expect(useTrustedWorkspaces()[0].path).toBe("~/Code/tethys");
  });
});

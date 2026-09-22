import type { AgentProfileView } from "@tethys/bindings";
import { describe, expect, it } from "vitest";
import { catalogEntryForProfile, PROVIDER_CATALOG } from "./provider-catalog";

function profile(
  registryId: string | null,
  program = "server",
): AgentProfileView {
  return {
    id: "p1",
    name: "Any",
    class: "registry",
    enabled: true,
    launch_spec: { program, args: [], cwd: null, env: [] },
    registry_ref:
      registryId === null
        ? null
        : { id: registryId, version: "1.0.0", distribution: "npx" },
    projection_target: null,
    preferred_protocol: null,
    health: "healthy",
    auth_state: "ready",
    detail: null,
    protocol: null,
    capabilities: null,
    auth_methods: [],
    detected_version: null,
    latency_ms: null,
    last_checked_ms: null,
    recheck: "idle",
  };
}

describe("provider catalog", () => {
  it("lists the five known providers in product order", () => {
    expect(PROVIDER_CATALOG.map((entry) => entry.id)).toEqual([
      "claude-code",
      "codex",
      "opencode",
      "antigravity",
      "kiro",
    ]);
    expect(PROVIDER_CATALOG.map((entry) => entry.name)).toEqual([
      "Claude Code",
      "Codex",
      "OpenCode",
      "Antigravity",
      "kiro",
    ]);
  });

  it("ships exactly two integrations soon, both with no setup steps", () => {
    const soon = PROVIDER_CATALOG.filter((entry) => entry.support === "soon");
    expect(soon.map((entry) => entry.id)).toEqual(["antigravity", "kiro"]);
    expect(soon.every((entry) => entry.setup.length === 0)).toBe(true);
  });

  it("matches registry profiles by stable registry identity", () => {
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("claude-acp"))?.id,
    ).toBe("claude-code");
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("codex-acp"))?.id,
    ).toBe("codex");
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("opencode"))?.id,
    ).toBe("opencode");
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile(null, "claude")),
    ).toBeNull();
  });

  it("never matches a soon provider, so a stray profile stays inert", () => {
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("antigravity-acp")),
    ).toBeNull();
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("kiro")),
    ).toBeNull();
  });

  it("returns null for a profile the catalog does not own", () => {
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("my-agent")),
    ).toBeNull();
  });
});

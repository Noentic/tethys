import type { AgentProfileView } from "@tethys/bindings";
import { describe, expect, it } from "vitest";
import { catalogEntryForProfile, PROVIDER_CATALOG } from "./provider-catalog";

function profile(program: string, args: string[] = []): AgentProfileView {
  return {
    id: "p1",
    name: "Any",
    class: "registry",
    enabled: true,
    launch_spec: { program, args, cwd: null, env: [] },
    registry_ref: null,
    projection_target: null,
    preferred_protocol: null,
    health: "healthy",
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
      "opencode",
      "codex",
      "antigravity",
      "kiro",
    ]);
    expect(PROVIDER_CATALOG.map((entry) => entry.name)).toEqual([
      "Claude Code",
      "opencode",
      "Codex",
      "Antigravity",
      "kiro",
    ]);
  });

  it("ships exactly two integrations soon, both with no setup steps", () => {
    const soon = PROVIDER_CATALOG.filter((entry) => entry.support === "soon");
    expect(soon.map((entry) => entry.id)).toEqual(["antigravity", "kiro"]);
    expect(soon.every((entry) => entry.setup.length === 0)).toBe(true);
  });

  it("matches a profile on the program or the args, not the id", () => {
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("claude"))?.id,
    ).toBe("claude-code");
    expect(
      catalogEntryForProfile(
        PROVIDER_CATALOG,
        profile("npx", ["-y", "@agentclientprotocol/claude-agent-acp@0.79.0"]),
      )?.id,
    ).toBe("claude-code");
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("opencode", ["acp"]))
        ?.id,
    ).toBe("opencode");
    expect(catalogEntryForProfile(PROVIDER_CATALOG, profile("codex"))?.id).toBe(
      "codex",
    );
  });

  it("never matches a soon provider, so a stray profile stays inert", () => {
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("antigravity")),
    ).toBeNull();
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("kiro-cli", ["acp"])),
    ).toBeNull();
  });

  it("returns null for a profile the catalog does not own", () => {
    expect(
      catalogEntryForProfile(PROVIDER_CATALOG, profile("my-agent", ["--acp"])),
    ).toBeNull();
  });
});

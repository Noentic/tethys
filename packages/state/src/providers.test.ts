import type { AgentProfileView } from "@tethys/bindings";
import { beforeEach, describe, expect, it } from "vitest";
import { selectProviderConnections } from "./provider-connections";
import {
  clearProvidersForTesting,
  ingestProviders,
  markProviderChecking,
  providersStore,
  selectAllProviders,
  selectDaemonHealthy,
  selectEnabledProviders,
  upsertProvider,
} from "./providers";

function view(
  id: string,
  health: AgentProfileView["health"],
  enabled = true,
): AgentProfileView {
  return {
    id,
    name: id,
    class: "manual",
    enabled,
    launch_spec: { program: "agent", args: [], cwd: null, env: [] },
    registry_ref: null,
    projection_target: null,
    preferred_protocol: "V1",
    health,
    detail: null,
    protocol: "V1",
    capabilities: null,
    auth_methods: [],
    detected_version: null,
    latency_ms: null,
    last_checked_ms: null,
    recheck: "idle",
  };
}

const state = () => providersStore.state;

beforeEach(() => clearProvidersForTesting());

describe("providersStore", () => {
  it("ingests a list keyed by profile id in stable order", () => {
    ingestProviders([view("z", "healthy"), view("a", "error")]);
    expect(selectAllProviders(state()).map((provider) => provider.id)).toEqual([
      "a",
      "z",
    ]);
  });

  it("upserts without disturbing other rows", () => {
    ingestProviders([view("a", "healthy"), view("b", "healthy")]);
    upsertProvider(view("a", "error"));
    const all = selectAllProviders(state());
    expect(all.find((provider) => provider.id === "a")?.health).toBe("error");
    expect(all.find((provider) => provider.id === "b")?.health).toBe("healthy");
  });

  it("marks one Provider checking and leaves siblings idle", () => {
    ingestProviders([view("a", "healthy"), view("b", "healthy")]);
    markProviderChecking("a");
    const all = selectAllProviders(state());
    expect(all.find((provider) => provider.id === "a")?.recheck).toBe(
      "checking",
    );
    expect(all.find((provider) => provider.id === "b")?.recheck).toBe("idle");
  });

  it("filters disabled Providers for the poller", () => {
    ingestProviders([view("a", "healthy", true), view("b", "error", false)]);
    expect(
      selectEnabledProviders(state()).map((provider) => provider.id),
    ).toEqual(["a"]);
  });
});

describe("selectDaemonHealthy", () => {
  it("is green with one healthy and two failed (aggregate-optimistic)", () => {
    ingestProviders([
      view("a", "healthy"),
      view("b", "error"),
      view("c", "auth-required"),
    ]);
    expect(selectDaemonHealthy(state())).toBe(true);
  });

  it("is danger with zero healthy Providers", () => {
    ingestProviders([view("a", "error"), view("b", "not-found")]);
    expect(selectDaemonHealthy(state())).toBe(false);
  });

  it("ignores a disabled healthy Provider", () => {
    ingestProviders([view("a", "healthy", false)]);
    expect(selectDaemonHealthy(state())).toBe(false);
  });
});

describe("selectProviderConnections (M1.10 swap point)", () => {
  it("maps stored profiles onto the selector shape", () => {
    ingestProviders([
      view("claude", "healthy"),
      view("gemini", "auth-required"),
    ]);
    const rows = selectProviderConnections();
    expect(rows.map((row) => row.profileId)).toEqual(["claude", "gemini"]);
    expect(rows.find((row) => row.id === "gemini")?.status).toBe(
      "auth_required",
    );
  });
});

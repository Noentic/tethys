//! Providers page: the catalog spine, the detection summary, the setup guide
//! under a ready-but-undetected provider, and the inert `soon` rows.

import { render, screen, waitFor } from "@testing-library/react";
import type { AgentProfileView } from "@tethys/bindings";
import { clearProvidersForTesting } from "@tethys/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvidersView } from "./providers-view";
import type { ProvidersClient } from "./types";

function profile(overrides: Partial<AgentProfileView> = {}): AgentProfileView {
  return {
    id: "claude-acp",
    name: "Claude Code",
    class: "registry",
    enabled: true,
    launch_spec: {
      program: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp@0.79.0"],
      cwd: null,
      env: [],
    },
    registry_ref: null,
    projection_target: null,
    preferred_protocol: "V2",
    health: "healthy",
    detail: null,
    protocol: "V2",
    capabilities: null,
    auth_methods: [],
    detected_version: "0.79.0",
    latency_ms: 12,
    last_checked_ms: Date.now(),
    recheck: "idle",
    ...overrides,
  };
}

function client(profiles: AgentProfileView[]): ProvidersClient {
  return {
    agent: {
      profilesList: vi.fn(async () => profiles),
      profilesCreate: vi.fn(async () => profile()),
      profilesUpdate: vi.fn(async () => profile()),
      profilesDelete: vi.fn(async () => {}),
      registryList: vi.fn(async () => []),
      registryInstall: vi.fn(),
      registryUpdate: vi.fn(),
      connectionsRestart: vi.fn(async () => {}),
      login: vi.fn(async () => {}),
      envSecretSet: vi.fn(async () => profile()),
      stderr: vi.fn(async () => ""),
      processSample: vi.fn(async () => []),
      healthIntervalSet: vi.fn(async () => {}),
      recheck: vi.fn(async () => {}),
    },
  } as unknown as ProvidersClient;
}

beforeEach(() => clearProvidersForTesting());

describe("providers view catalog", () => {
  it("renders the five providers in product order, with the soon rows inert", async () => {
    render(<ProvidersView client={client([])} />);
    await waitFor(() =>
      expect(screen.getAllByTestId("provider-row")).toHaveLength(5),
    );
    const rows = screen.getAllByTestId("provider-row");
    expect(rows.map((row) => row.dataset.provider)).toEqual([
      "claude-code",
      "opencode",
      "codex",
      "antigravity",
      "kiro",
    ]);
    expect(screen.getAllByTestId("provider-soon")).toHaveLength(2);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("summarises detection and offers the setup guide under an undetected provider", async () => {
    render(<ProvidersView client={client([])} />);
    await screen.findByTestId("providers-detection");
    expect(screen.getByText("0 of 5 providers detected")).toBeTruthy();
    expect(
      screen.getByText(/Claude Code, opencode and Codex need setup/),
    ).toBeTruthy();
    // Every ready provider is undetected, so every one shows its steps.
    const guides = await screen.findAllByTestId("provider-setup-guide");
    expect(guides).toHaveLength(3);
    expect(screen.getByText("npm install -g @openai/codex")).toBeTruthy();
    expect(screen.getByText("Set up Codex")).toBeTruthy();
  });

  it("counts a healthy profile and hides that provider's setup guide", async () => {
    render(<ProvidersView client={client([profile()])} />);
    await waitFor(() =>
      expect(screen.getByText("1 of 5 providers detected")).toBeTruthy(),
    );
    const guides = screen.queryAllByTestId("provider-setup-guide");
    expect(guides).toHaveLength(2);
    expect(screen.getAllByTestId("provider-row")[0].dataset.health).toBe(
      "healthy",
    );
  });

  it("keeps a profile the catalog does not own as its own row", async () => {
    render(
      <ProvidersView
        client={client([
          profile({
            id: "custom",
            name: "My ACP Server",
            launch_spec: {
              program: "/opt/agent",
              args: ["--acp"],
              cwd: null,
              env: [],
            },
          }),
        ])}
      />,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("provider-row")).toHaveLength(6),
    );
    expect(screen.getByText("My ACP Server")).toBeTruthy();
    expect(screen.getByText("0 of 5 providers detected")).toBeTruthy();
  });
});

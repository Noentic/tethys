//! Providers page: the catalog spine, the detection summary, the setup guide
//! under a ready-but-undetected provider, and the inert `soon` rows.

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  AgentProfileView,
  AgentRegistryEntryView,
} from "@tethys/bindings";
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
    registry_ref: { id: "claude-acp", version: "0.79.0", distribution: "npx" },
    projection_target: null,
    preferred_protocol: "V2",
    health: "healthy",
    auth_state: "ready",
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

function client(
  profiles: AgentProfileView[],
  registry: AgentRegistryEntryView[] = [],
): ProvidersClient {
  return {
    agent: {
      profilesList: vi.fn(async () => profiles),
      profilesCreate: vi.fn(async () => profile()),
      profilesUpdate: vi.fn(async () => profile()),
      profilesDelete: vi.fn(async () => {}),
      registryList: vi.fn(async () => registry),
      registryUseSystem: vi.fn(async () => profile()),
      registryInstall: vi.fn(),
      registryUpdate: vi.fn(),
      connectionsRestart: vi.fn(async () => {}),
      login: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
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
      "codex",
      "opencode",
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
      screen.getByText(/Claude Code, Codex and OpenCode need setup/),
    ).toBeTruthy();
    // Every ready provider is undetected, so every one shows its steps.
    const guides = await screen.findAllByTestId("provider-setup-guide");
    expect(guides).toHaveLength(3);
    expect(
      screen.getByText(/codex CLI is not itself an ACP server/),
    ).toBeTruthy();
    expect(screen.getByText("Set up Codex")).toBeTruthy();
  });

  it("uses an installed Codex ACP executable from the provider row", async () => {
    const registryEntry = {
      id: "codex-acp",
      name: "Codex ACP",
      version: "1.0.0",
      description: null,
      repository: null,
      authors: [],
      license: null,
      license_url: null,
      website: null,
      icon: null,
      preview_version: null,
      distributions: ["npx"],
      selected_distribution: "npx",
      needs_node: false,
      needs_uvx: false,
      selection_reason: null,
      install_block_reason: null,
      installed: false,
      system_available: true,
      setup_note: null,
      pinned_version: null,
      update: null,
      compliance_note: null,
    } satisfies AgentRegistryEntryView;
    const systemClient = client([], [registryEntry]);
    render(<ProvidersView client={systemClient} />);

    await screen.findByText("Set up Codex");
    const guide = screen
      .getAllByTestId("provider-setup-guide")
      .find((element) => element.textContent?.includes("Set up Codex"));
    if (!guide) throw new Error("Codex setup guide was not rendered");
    const useExisting = within(guide).getByRole("button", {
      name: "Use existing",
    });
    expect(screen.getByText(/Tethys found an ACP executable/)).toBeTruthy();
    expect(
      screen.queryByText(/codex CLI is not itself an ACP server/),
    ).toBeNull();
    fireEvent.click(useExisting);
    await waitFor(() =>
      expect(systemClient.agent.registryUseSystem).toHaveBeenCalledWith(
        "codex-acp",
      ),
    );
    expect(
      await screen.findByText(
        /Codex ACP profile added from its ACP executable/,
      ),
    ).toBeTruthy();
  });

  it("reports repairing an existing Codex profile when switching to system ACP", async () => {
    const registryEntry = {
      id: "codex-acp",
      name: "Codex ACP",
      version: "1.0.0",
      description: null,
      repository: null,
      authors: [],
      license: null,
      license_url: null,
      website: null,
      icon: null,
      preview_version: null,
      distributions: ["npx"],
      selected_distribution: "npx",
      needs_node: false,
      needs_uvx: false,
      selection_reason: null,
      install_block_reason: null,
      installed: false,
      system_available: true,
      setup_note: null,
      pinned_version: null,
      update: null,
      compliance_note: null,
    } satisfies AgentRegistryEntryView;
    const staleProfile = profile({
      id: "my-codex",
      name: "My Codex",
      integration_id: "codex-acp",
      class: "manual",
      launch_spec: {
        program: "/old/path/codex-acp",
        args: [],
        cwd: null,
        env: [],
      },
      registry_ref: null,
      health: "not-found",
    });
    const systemClient = client([], [registryEntry]);
    vi.mocked(systemClient.agent.profilesList)
      .mockResolvedValueOnce([])
      .mockResolvedValue([staleProfile]);
    render(<ProvidersView client={systemClient} />);

    const guide = (await screen.findAllByTestId("provider-setup-guide")).find(
      (element) => element.textContent?.includes("Set up Codex"),
    );
    if (!guide) throw new Error("Codex setup guide was not rendered");
    fireEvent.click(
      within(guide).getByRole("button", { name: "Use existing" }),
    );

    expect(
      await screen.findByText(
        /Codex ACP profile updated to use its ACP executable/,
      ),
    ).toBeTruthy();
    expect(systemClient.agent.profilesCreate).not.toHaveBeenCalled();
    expect(systemClient.agent.registryInstall).not.toHaveBeenCalled();
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
            registry_ref: null,
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

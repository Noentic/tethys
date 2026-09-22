import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  AgentProfileView,
  AgentRegistryEntryView,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import {
  cancelPhaseFixtures,
  clearAllSessionStoresForTesting,
  clearProvidersForTesting,
  createInitialSessionState,
  createSessionStore,
  sessionReducer,
} from "@tethys/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileCard } from "./profile-card";
import { HealthIntervalControl } from "./providers-header";
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
      args: ["-y", "@agentclientprotocol/claude-agent-acp@1.2.0"],
      cwd: null,
      env: [],
    },
    registry_ref: {
      id: "claude-acp",
      version: "1.2.0",
      distribution: "npx",
    },
    projection_target: null,
    preferred_protocol: "V1",
    health: "healthy",
    auth_state: "ready",
    detail: null,
    protocol: "V1",
    capabilities: null,
    auth_methods: [],
    detected_version: "1.2.0",
    latency_ms: 5,
    last_checked_ms: Date.now(),
    recheck: "idle",
    ...overrides,
  };
}

function entry(
  overrides: Partial<AgentRegistryEntryView> = {},
): AgentRegistryEntryView {
  return {
    id: "claude-acp",
    name: "Claude Agent",
    version: "1.3.0",
    description: "ACP wrapper",
    repository: null,
    authors: [],
    license: "proprietary",
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
    installed: true,
    pinned_version: "1.2.0",
    update: { kind: "available", latest: "1.3.0" },
    compliance_note: null,
    ...overrides,
  };
}

function fakeClient(
  overrides: Partial<ProvidersClient["agent"]> = {},
): ProvidersClient {
  return {
    agent: {
      profilesList: vi.fn(async () => [profile()]),
      profilesCreate: vi.fn(async () => profile({ id: "custom" })),
      profilesUpdate: vi.fn(async () => profile()),
      profilesDelete: vi.fn(async () => {}),
      registryList: vi.fn(async () => []),
      registryInstall: vi.fn(async () => ({
        profile_id: "claude-acp",
        version: "1.3.0",
        distribution: "npx",
        selection_reason: null,
        launch_spec: { program: "npx", args: [], cwd: null, env: [] },
        warning: null,
        needs_node: false,
        needs_uvx: false,
      })),
      registryUpdate: vi.fn(async () => ({
        profile_id: "claude-acp",
        version: "1.3.0",
        distribution: "npx",
        selection_reason: null,
        launch_spec: { program: "npx", args: [], cwd: null, env: [] },
        warning: null,
        needs_node: false,
        needs_uvx: false,
      })),
      connectionsRestart: vi.fn(async () => {}),
      login: vi.fn(async () => ({ kind: "complete" as const })),
      logout: vi.fn(async () => {}),
      envSecretSet: vi.fn(async () => profile()),
      stderr: vi.fn(async () => ""),
      processSample: vi.fn(async () => []),
      healthIntervalSet: vi.fn(async () => {}),
      recheck: vi.fn(async () => {}),
      ...overrides,
      loginTerminalOutput:
        overrides.loginTerminalOutput ??
        vi.fn(async () => ({
          output: "",
          truncated: false,
          exited: false,
          exit_code: null,
        })),
      loginTerminalWrite: overrides.loginTerminalWrite ?? vi.fn(async () => {}),
      loginTerminalCancel:
        overrides.loginTerminalCancel ?? vi.fn(async () => {}),
    },
  };
}

// A compile-time guard that the real client satisfies the narrow slice.
const _clientCheck: ProvidersClient = createClient();

beforeEach(() => clearProvidersForTesting());

describe("profile-card registry install/pin (M1.12 U10)", () => {
  it("shows the pin and an Update available pill without changing the pin", () => {
    render(<ProfileCard entry={entry()} onUpdate={vi.fn()} />);
    expect(screen.getByTestId("update-available")).toBeTruthy();
    expect(screen.getByText(/Pinned 1\.2\.0/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
  });

  it("shows Install for an entry that is not installed", () => {
    render(
      <ProfileCard
        entry={entry({ installed: false, pinned_version: null, update: null })}
        onInstall={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
  });
});

describe("interval stepper (M1.12 U10)", () => {
  it("reads Manual only at 0 and re-arms from the stepper", () => {
    const onIntervalChange = vi.fn();
    render(
      <HealthIntervalControl
        intervalSeconds={0}
        onIntervalChange={onIntervalChange}
      />,
    );
    expect(screen.getAllByText("Manual only").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Increment" }));
    expect(onIntervalChange).toHaveBeenCalledWith(30);
  });
});

describe("providers view wiring (M1.12 U10)", () => {
  it("pressing ↻ re-checks every enabled Provider", async () => {
    const client = fakeClient();
    render(<ProvidersView client={client} />);
    await screen.findAllByTestId("provider-row");
    fireEvent.click(
      screen.getByRole("button", { name: "Manual health check" }),
    );
    await waitFor(() => expect(client.agent.recheck).toHaveBeenCalled());
  });

  it("re-checks every Provider when the network comes back", async () => {
    const client = fakeClient();
    render(<ProvidersView client={client} />);
    await screen.findAllByTestId("provider-row");
    expect(client.agent.recheck).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(client.agent.recheck).toHaveBeenCalledWith());
  });

  it("setting interval 0 calls healthIntervalSet(0)", async () => {
    const client = fakeClient();
    render(<ProvidersView client={client} />);
    await screen.findAllByTestId("provider-row");
    // 300s default, step 30 -> ten decrements to 0.
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getAllByRole("button", { name: "Decrement" })[0]);
    }
    await waitFor(() =>
      expect(client.agent.healthIntervalSet).toHaveBeenCalledWith(0),
    );
  });

  it("editing the executable path saves through profilesUpdate (recheck trigger)", async () => {
    const client = fakeClient();
    render(<ProvidersView client={client} />);
    await screen.findAllByTestId("provider-row");
    fireEvent.click(screen.getByRole("button", { name: /Toggle details/ }));
    const executable = await screen.findByLabelText("Executable");
    fireEvent.change(executable, { target: { value: "/opt/claude" } });
    fireEvent.click(screen.getByRole("button", { name: "Save launch spec" }));
    await waitFor(() => expect(client.agent.profilesUpdate).toHaveBeenCalled());
    const input = (client.agent.profilesUpdate as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(input.launch_spec.program).toBe("/opt/claude");
  });
});

describe("activity per Provider (M1.13 U11)", () => {
  const sample = (pid: number, leader = true) => ({
    pid,
    cpu: 1,
    rss: 1024,
    uptime_secs: 5,
    state: "sleeping",
    leader,
  });

  beforeEach(() => clearAllSessionStoresForTesting());

  it("restarts the Provider whose table was pressed, not the first one", async () => {
    const client = fakeClient({
      profilesList: vi.fn(async () => [
        profile({ id: "first", name: "First" }),
        profile({ id: "second", name: "Second" }),
      ]),
      processSample: vi.fn(async (id: string) => [
        sample(id === "first" ? 100 : 200),
      ]),
    });
    render(<ProvidersView client={client} />);
    const second = await screen.findByRole("table", {
      name: "Process activity: Second",
    });
    const restart = second.parentElement?.querySelector("button");
    expect(restart?.textContent).toBe("Restart");
    fireEvent.click(restart as HTMLButtonElement);
    await waitFor(() =>
      expect(client.agent.connectionsRestart).toHaveBeenCalledWith("second"),
    );
    expect(client.agent.connectionsRestart).toHaveBeenCalledTimes(1);
  });

  it("takes destructive styling from the real cancel phase of that Provider's thread", async () => {
    const store = createSessionStore(
      createInitialSessionState("t1", "claude-acp", "ws", "Thread"),
    );
    const client = fakeClient({
      processSample: vi.fn(async () => [sample(1), sample(2, false)]),
    });
    render(<ProvidersView client={client} />);
    const table = await screen.findByRole("table", {
      name: "Process activity: Claude Code",
    });
    const childRow = () => table.querySelectorAll("tbody tr")[1];
    const before = childRow().className;

    act(() => {
      store.setState((state) =>
        sessionReducer(state, {
          type: "CancelPhaseChanged",
          body: cancelPhaseFixtures["grace-elapsed"],
        }),
      );
    });
    await waitFor(() => expect(childRow().className).not.toBe(before));
  });
});

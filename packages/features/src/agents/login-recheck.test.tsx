// Closing a login surface by any route re-checks that Provider once (spec
// §5.2's most important re-check trigger), asserted per `authMethods` shape
// through the real Providers view rather than the surface in isolation.

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AgentProfileView, AuthMethodShape } from "@tethys/bindings";
import { clearProvidersForTesting } from "@tethys/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvidersView } from "./providers-view";
import type { ProvidersClient } from "./types";

function authProfile(shape: AuthMethodShape): AgentProfileView {
  return {
    id: "gemini",
    name: "Gemini CLI",
    class: "registry",
    enabled: true,
    launch_spec: { program: "gemini", args: [], cwd: null, env: [] },
    registry_ref: null,
    projection_target: null,
    preferred_protocol: "V1",
    health: "auth-required",
    detail: null,
    protocol: "V1",
    capabilities: null,
    auth_methods: [{ id: "method", name: "Sign in", description: null, shape }],
    detected_version: null,
    latency_ms: null,
    last_checked_ms: null,
    recheck: "idle",
  };
}

function clientFor(profile: AgentProfileView): ProvidersClient {
  return {
    agent: {
      profilesList: vi.fn(async () => [profile]),
      profilesCreate: vi.fn(async () => profile),
      profilesUpdate: vi.fn(async () => profile),
      profilesDelete: vi.fn(async () => {}),
      registryList: vi.fn(async () => []),
      registryInstall: vi.fn(),
      registryUpdate: vi.fn(),
      connectionsRestart: vi.fn(async () => {}),
      login: vi.fn(async () => {}),
      envSecretSet: vi.fn(async () => profile),
      stderr: vi.fn(async () => ""),
      processSample: vi.fn(async () => []),
      healthIntervalSet: vi.fn(async () => {}),
      recheck: vi.fn(async () => {}),
    },
  } as unknown as ProvidersClient;
}

async function openLogin(client: ProvidersClient) {
  render(<ProvidersView client={client} />);
  await screen.findByTestId("provider-row");
  fireEvent.click(screen.getByRole("button", { name: /Toggle details/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
}

function rechecksFor(client: ProvidersClient, id: string): number {
  return (client.agent.recheck as ReturnType<typeof vi.fn>).mock.calls.filter(
    (call) => call[0] === id,
  ).length;
}

beforeEach(() => clearProvidersForTesting());
afterEach(() => vi.useRealTimers());

describe("login-close re-check per authMethods shape (M1.12 U9)", () => {
  it("env-var: saving stores the secret through the host, then re-checks that Provider once", async () => {
    const client = clientFor(authProfile({ shape: "env-var" }));
    let release: () => void = () => {};
    (client.agent.envSecretSet as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(authProfile({ shape: "env-var" }));
        }),
    );
    await openLogin(client);
    fireEvent.change(screen.getByLabelText("Environment variable name"), {
      target: { value: "API_KEY" },
    });
    fireEvent.change(screen.getByLabelText("Environment variable value"), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(client.agent.envSecretSet).toHaveBeenCalledWith(
        "gemini",
        "API_KEY",
        "s3cret",
      ),
    );
    // The check must see the stored secret, so it waits for the write.
    expect(rechecksFor(client, "gemini")).toBe(0);
    release();
    await waitFor(() => expect(rechecksFor(client, "gemini")).toBe(1));
    expect(client.agent.login).toHaveBeenCalledWith("gemini", "method");
  });

  it("url-code: Esc closes the dialog and re-checks that Provider once", async () => {
    const client = clientFor(authProfile({ shape: "url-code" }));
    await openLogin(client);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(rechecksFor(client, "gemini")).toBe(1));
  });

  it("cli-passthrough: the vendor process exiting re-checks that Provider once", async () => {
    const client = clientFor(authProfile({ shape: "cli-passthrough" }));
    await openLogin(client);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(rechecksFor(client, "gemini")).toBe(1));
  });

  it("agent-auth: cancelling re-checks that Provider once", async () => {
    const client = clientFor(authProfile({ shape: "agent-auth" }));
    await openLogin(client);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(rechecksFor(client, "gemini")).toBe(1));
  });

  it("url-code: the code expiring re-checks that Provider once, and typing never resets it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = clientFor(authProfile({ shape: "url-code" }));
    await openLogin(client);

    // Typing re-renders the surface; the deadline must not move.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(290_000);
    });
    fireEvent.change(screen.getByLabelText("Authorization code"), {
      target: { value: "ABCD" },
    });
    expect(rechecksFor(client, "gemini")).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(screen.getByText("Code expired")).toBeTruthy();
    expect(rechecksFor(client, "gemini")).toBe(1);
  });

  it("none: a Provider without authMethods offers no Sign in", async () => {
    const client = clientFor({
      ...authProfile({ shape: "env-var" }),
      auth_methods: [],
    });
    render(<ProvidersView client={client} />);
    await screen.findByTestId("provider-row");
    fireEvent.click(screen.getByRole("button", { name: /Toggle details/ }));
    await screen.findByLabelText("Executable");
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});

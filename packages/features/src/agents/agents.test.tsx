import { fireEvent, render, screen } from "@testing-library/react";
import type { AgentProfileView } from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import { CapabilitiesPanel } from "./capabilities-panel";
import { LaunchSpecEditor } from "./launch-spec-editor";
import { PROVIDER_CATALOG } from "./provider-catalog";
import { ProviderRow } from "./provider-row";
import { StderrViewer } from "./stderr-viewer";

function profile(overrides: Partial<AgentProfileView> = {}): AgentProfileView {
  return {
    id: "claude-acp",
    name: "Claude Code",
    class: "registry",
    enabled: true,
    launch_spec: {
      program: "npx",
      args: ["-y", "pkg@1.0.0"],
      cwd: null,
      env: [{ key: "API_KEY", value: "keychain:profiles/claude-acp/API_KEY" }],
    },
    registry_ref: { id: "claude-acp", version: "1.0.0" },
    projection_target: null,
    preferred_protocol: "V2",
    health: "healthy",
    detail: null,
    protocol: "V2",
    capabilities: {
      load_session: false,
      resume: false,
      mcp: { stdio: true, http: false, sse: false },
      prompt_embedded_context: false,
      elicitation: false,
    },
    auth_methods: [],
    detected_version: "1.0.0",
    latency_ms: 12,
    last_checked_ms: Date.now() - 60_000,
    recheck: "idle",
    ...overrides,
  };
}

function row(overrides: Partial<AgentProfileView> = {}, sessionState?: string) {
  const onToggleExpanded = vi.fn();
  const onToggleEnabled = vi.fn();
  render(
    <ProviderRow
      entry={PROVIDER_CATALOG[0]}
      profile={profile(overrides)}
      expanded={false}
      sessionState={sessionState}
      onToggleExpanded={onToggleExpanded}
      onToggleEnabled={onToggleEnabled}
    />,
  );
  return { onToggleExpanded, onToggleEnabled };
}

describe("provider-row (M1.12 U8)", () => {
  it("renders the shared status dot, the mono subtext and the latency tag", () => {
    row();
    expect(
      screen.getByTestId("provider-row-dot").getAttribute("aria-label"),
    ).toBe("Healthy");
    expect(
      screen.getByText("Healthy — ACP handshake verified (v1.0.0)"),
    ).toBeTruthy();
    expect(screen.getByTestId("provider-latency").textContent).toBe("12ms");
  });

  it("renders auth_required as a filled disc, not a ring (P2 shape rule)", () => {
    row({ health: "auth-required", detail: "auth required" });
    const dot = screen.getByTestId("provider-row-dot");
    expect(dot.getAttribute("aria-label")).toBe("Authentication required");
    expect(dot.getAttribute("style")).toContain("background-color");
    expect(dot.getAttribute("style")).not.toContain("border");
  });

  it("enabled-but-unreachable is a fault; switched off is a choice (P3)", () => {
    const { rerender } = render(
      <ProviderRow
        entry={PROVIDER_CATALOG[0]}
        profile={profile({
          health: "not-found",
          detail: "Not found — npx is not installed or not on PATH",
        })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Not detected — install the CLI to connect"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: /Enable Claude Code/ })
        .getAttribute("aria-checked"),
    ).toBe("true");

    rerender(
      <ProviderRow
        entry={PROVIDER_CATALOG[0]}
        profile={profile({ enabled: false })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    expect(screen.getByText("Disabled in Tethys settings")).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: /Enable Claude Code/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("a live session overrides the health dot (sky)", () => {
    row({}, "running");
    expect(
      screen.getByTestId("provider-row-dot").getAttribute("aria-label"),
    ).toBe("Running");
  });

  it("keeps the chevron and toggle separately focusable; the toggle does not expand", () => {
    const { onToggleExpanded, onToggleEnabled } = row();
    fireEvent.click(screen.getByRole("switch", { name: /Enable Claude Code/ }));
    expect(onToggleEnabled).toHaveBeenCalledWith(false);
    expect(onToggleExpanded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Toggle details/ }));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("renders an integration-soon provider inert: chip, no toggle, no chevron", () => {
    const kiro = PROVIDER_CATALOG.find((entry) => entry.id === "kiro");
    if (!kiro) throw new Error("the catalog no longer carries kiro");
    render(<ProviderRow entry={kiro} profile={null} />);
    expect(screen.getByTestId("provider-soon").textContent).toBe("Soon");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /Toggle details/ })).toBeNull();
    expect(screen.getByText(/Integration soon/)).toBeTruthy();
    expect(screen.queryByTestId("provider-row-dot")).toBeNull();
  });
});

describe("capabilities panel (M1.12 U8)", () => {
  it("renders exactly the negotiated values", () => {
    render(<CapabilitiesPanel profile={profile()} />);
    expect(
      screen.getByText("session.resume").parentElement?.textContent,
    ).toContain("no");
    expect(
      screen.getByText("MCP transports").parentElement?.textContent,
    ).toContain("stdio");
    expect(
      screen.getByText("elicitation").parentElement?.textContent,
    ).toContain("no");
  });

  it("shows resume:true when negotiated", () => {
    render(
      <CapabilitiesPanel
        profile={profile({
          capabilities: {
            load_session: false,
            resume: true,
            mcp: { stdio: true, http: false, sse: false },
            prompt_embedded_context: false,
            elicitation: false,
          },
        })}
      />,
    );
    expect(
      screen.getByText("session.resume").parentElement?.textContent,
    ).toContain("yes");
  });
});

describe("secrets and stderr (M1.12 U8)", () => {
  it("renders keychain refs, never a resolved secret", () => {
    render(<LaunchSpecEditor profile={profile()} />);
    expect(
      screen.getByDisplayValue("keychain:profiles/claude-acp/API_KEY"),
    ).toBeTruthy();
  });

  it("renders stderr text and an empty state, never a crash", () => {
    const { rerender } = render(<StderrViewer text="boom" />);
    expect(screen.getByTestId("stderr-viewer").textContent).toContain("boom");
    rerender(<StderrViewer text="" />);
    expect(screen.getByTestId("stderr-viewer").textContent).toContain(
      "No stderr output",
    );
  });
});

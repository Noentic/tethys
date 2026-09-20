import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgentProfileView, AuthMethodShape } from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import { LoginSurface } from "./login-surface";

function authProfile(
  shapes: AuthMethodShape[],
  overrides: Partial<AgentProfileView> = {},
): AgentProfileView {
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
    auth_methods: shapes.map((shape, index) => ({
      id: shape.shape === "unknown" ? shape.id : `method-${index}`,
      name: "Sign in",
      description: null,
      shape,
    })),
    detected_version: null,
    latency_ms: null,
    last_checked_ms: null,
    recheck: "idle",
    ...overrides,
  };
}

describe("login surfaces per authMethods shape (M1.12 U9)", () => {
  it("env-var hands the typed value up once, masked, and closes once", () => {
    const onClose = vi.fn();
    const onSubmitEnv = vi.fn();
    render(
      <LoginSurface
        profile={authProfile([{ shape: "env-var" }])}
        onClose={onClose}
        onSubmitEnv={onSubmitEnv}
      />,
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Environment variable name"), {
      target: { value: "API_KEY" },
    });
    expect(save.hasAttribute("disabled")).toBe(true); // no value yet
    const value = screen.getByLabelText("Environment variable value");
    expect(value.getAttribute("type")).toBe("password");
    fireEvent.change(value, { target: { value: "secret-value" } });
    fireEvent.click(save);

    expect(onSubmitEnv).toHaveBeenCalledTimes(1);
    expect(onSubmitEnv).toHaveBeenCalledWith([
      { key: "API_KEY", value: "secret-value" },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("success");
  });

  it("env-var refuses a name the host would reject", () => {
    render(
      <LoginSurface
        profile={authProfile([{ shape: "env-var" }])}
        onClose={vi.fn()}
        onSubmitEnv={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Environment variable name"), {
      target: { value: "1-BAD" },
    });
    fireEvent.change(screen.getByLabelText("Environment variable value"), {
      target: { value: "v" },
    });
    expect(
      screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("url-code shows a link, code field and m:ss countdown", () => {
    render(
      <LoginSurface
        profile={authProfile([{ shape: "url-code" }])}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sign in with Gemini CLI/)).toBeTruthy();
    expect(screen.getByLabelText("Authorization code")).toBeTruthy();
    expect(screen.getByTestId("login-countdown").textContent).toMatch(
      /^\d:\d{2}$/,
    );
  });

  it("url-code expiry reads Code expired, offers a new code, and fires onExpiry", async () => {
    const onExpiry = vi.fn();
    render(
      <LoginSurface
        profile={authProfile([{ shape: "url-code" }])}
        onClose={vi.fn()}
        onExpiry={onExpiry}
        codeDeadline={new Date(Date.now() - 1000).toISOString()}
      />,
    );
    await waitFor(() => expect(onExpiry).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Code expired")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Request new code" }),
    ).toBeTruthy();
  });

  it("cli-passthrough opens a sheet titled with the vendor command", () => {
    const onClose = vi.fn();
    render(
      <LoginSurface
        profile={authProfile([{ shape: "cli-passthrough" }])}
        onClose={onClose}
        command="gemini acp --login"
      />,
    );
    expect(screen.getByText("gemini acp --login")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("process-exit");
  });

  it("agent-auth shows a waiting state with no code field and cancels once", () => {
    const onClose = vi.fn();
    render(
      <LoginSurface
        profile={authProfile([{ shape: "agent-auth" }])}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByText(/Waiting for Gemini CLI to finish sign-in/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Authorization code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("cancel");
  });

  it("renders nothing when the Provider declares no authMethods", () => {
    const { container } = render(
      <LoginSurface profile={authProfile([])} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("degrades an unknown method to a disabled row naming the id", () => {
    render(
      <LoginSurface
        profile={authProfile([{ shape: "unknown", id: "future-auth" }])}
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId("login-surface-unknown");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.textContent).toContain("future-auth");
  });

  it("Esc closes the dialog exactly once", () => {
    const onClose = vi.fn();
    render(
      <LoginSurface
        profile={authProfile([{ shape: "agent-auth" }])}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

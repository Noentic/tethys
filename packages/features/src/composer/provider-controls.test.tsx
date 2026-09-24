import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ProviderControl,
  ProviderControlResult,
  ProviderExtensionCapabilities,
  ProviderRoute,
} from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import { ProviderControls } from "./provider-controls";

const route: ProviderRoute = {
  provider_id: "openai",
  supported: ["openai"],
  required: false,
  current: {
    api_type: "openai",
    base_url: "https://old.example/v1",
    metadata: null,
  },
  metadata: null,
};

const capabilities: ProviderExtensionCapabilities = {
  goal_actions: ["set", "pause", "resume", "clear"],
  steering: true,
  provider_routing: true,
};

function response(control: ProviderControl): ProviderControlResult {
  switch (control.kind) {
    case "goal":
      return { kind: "goal-updated" };
    case "steer":
      return { kind: "steering", outcome: "injected" };
    case "list-providers":
      return { kind: "providers", providers: [route] };
    case "set-provider":
      return { kind: "provider-updated" };
    case "disable-provider":
      return { kind: "provider-disabled" };
    case "stop-async-task":
      return { kind: "async-task-stopped", stopped: true };
  }
}

describe("provider session controls", () => {
  it("sends negotiated goal, steering, and upstream routing controls", async () => {
    const send = vi.fn(async (control: ProviderControl) => response(control));
    render(
      <ProviderControls
        sessionId="s-codex"
        goal={null}
        capabilities={capabilities}
        send={send}
      />,
    );

    fireEvent.click(screen.getByText("Session controls"));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ kind: "list-providers" }),
    );

    fireEvent.change(screen.getByLabelText("Session goal"), {
      target: { value: "Ship provider support" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set goal" }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        kind: "goal",
        action: "set",
        objective: "Ship provider support",
      }),
    );

    fireEvent.change(screen.getByLabelText("Steer the current session"), {
      target: { value: "Keep the change focused" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Steer" }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        kind: "steer",
        prompt: [{ Text: "Keep the change focused" }],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Configure" }));
    fireEvent.change(screen.getByLabelText("openai base URL"), {
      target: { value: "https://gateway.example/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add header" }));
    fireEvent.change(screen.getByLabelText("Header 1 name"), {
      target: { value: "Authorization" },
    });
    fireEvent.change(screen.getByLabelText("Header 1 value"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save route" }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        kind: "set-provider",
        provider_id: "openai",
        api_type: "openai",
        base_url: "https://gateway.example/v1",
        headers: [{ name: "Authorization", value: "secret" }],
      }),
    );
  });
});

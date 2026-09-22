import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CreateThread, ThreadBootstrap } from "@tethys/bindings";
import {
  noProviderFixtures,
  providerConnectionFixtures,
  trustedWorkspaceFixtures,
} from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
import type { ComposerClient } from "../composer/popups";
import { PromptCard } from "./prompt-card";
import type { DraftSessionClient } from "./use-prepared-draft";

function client(): ComposerClient {
  return {
    commands: {
      list: vi.fn().mockResolvedValue([]),
      expand: vi.fn().mockResolvedValue({ text: "", references: [] }),
    },
    search: { files: vi.fn().mockResolvedValue([]) },
  };
}

function bootstrapFor(request: CreateThread): ThreadBootstrap {
  return {
    thread: {
      id: "thread-1",
      workspace_id: request.workspace_id,
      agent_profile_id: request.agent_profile_id,
      title: "Untitled",
      workdir: request.workdir,
      state: "Idle" as const,
      session_id: "session-1",
    },
    events: [],
    config_options: [
      {
        id: "mode",
        name: "Mode",
        description: null,
        current_value: "manual",
        values: ["manual", "plan"],
        category: "mode",
        kind: "select" as const,
        value_options: [
          { id: "manual", name: "Manual", description: null },
          { id: "plan", name: "Plan", description: null },
        ],
      },
      {
        id: "model",
        name: "Model",
        description: null,
        current_value: "claude-sonnet-x",
        values: ["claude-sonnet-x", "claude-opus-x"],
        category: "model",
        kind: "select" as const,
        value_options: [],
      },
    ],
    capabilities: null,
    permission_mode: "supervised" as const,
    latest_seq: 0,
  };
}

function session(): DraftSessionClient {
  return {
    thread: {
      prepare: vi.fn(async (request) => bootstrapFor(request)),
      delete: vi.fn(async () => {}),
    },
  };
}

function submitButton() {
  return screen.getByRole("button", { name: "Submit prompt" });
}

async function selectClaude() {
  fireEvent.click(screen.getByRole("combobox"));
  const claude = screen
    .getAllByRole("option")
    .find((option) => option.textContent?.includes("Claude Code"));
  fireEvent.click(claude as HTMLElement);
}

describe("PromptCard", () => {
  it("does not render mode until the provider session is prepared", async () => {
    render(
      <PromptCard
        client={client()}
        session={session()}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Mode, Manual" })).toBeNull();

    await selectClaude();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Mode, Manual" }),
      ).toBeTruthy(),
    );
  });

  it("keeps the selected mode in the first-turn config", async () => {
    const onStart = vi.fn();
    render(
      <PromptCard
        client={client()}
        session={session()}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        queuedCount={1}
        onStart={onStart}
      />,
    );
    await selectClaude();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Mode, Manual" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Mode, Manual" }));
    fireEvent.click(screen.getByRole("option", { name: "Plan" }));
    fireEvent.click(submitButton());
    expect(onStart.mock.calls[0]?.[0].changedConfig).toMatchObject({
      mode: "plan",
    });
  });

  it("keeps submit disabled until a workspace is picked", () => {
    render(
      <PromptCard
        client={client()}
        session={session()}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        onStart={vi.fn()}
      />,
    );
    expect(submitButton().hasAttribute("disabled")).toBe(true);
  });

  it("names the provider fix without locking the composer", () => {
    render(
      <PromptCard
        client={client()}
        session={session()}
        providers={noProviderFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        onStart={vi.fn()}
      />,
    );
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    const editor = document.querySelector(".ProseMirror");
    expect(editor?.getAttribute("contenteditable")).toBe("true");
    expect(editor?.getAttribute("data-placeholder")).toBe(
      "Connect a provider in Settings to send a message",
    );
    // The model pill stays actionable even with no provider.
    expect(screen.getByRole("combobox").textContent).toContain(
      "No provider available",
    );
  });

  it("names the workspace fix first while the folder is unresolved", () => {
    render(
      <PromptCard
        client={client()}
        session={session()}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        onStart={vi.fn()}
      />,
    );
    const editor = document.querySelector(".ProseMirror");
    expect(editor?.getAttribute("data-placeholder")).toBe(
      "Choose a folder to start a thread",
    );
    expect(
      screen.getByRole("button", { name: "Workspace" }).textContent,
    ).toContain("Choose a folder");
    expect(submitButton().hasAttribute("disabled")).toBe(true);
  });

  it("prepares the selected provider and gates send until the draft is ready", async () => {
    const sessionClient = session();
    render(
      <PromptCard
        client={client()}
        session={sessionClient}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        queuedCount={1}
        onStart={vi.fn()}
      />,
    );
    await selectClaude();
    expect(sessionClient.thread.prepare).toHaveBeenCalledWith({
      workspace_id: trustedWorkspaceFixtures[0].id,
      agent_profile_id: "claude-code",
      workdir: trustedWorkspaceFixtures[0].path,
      additional_directories: [],
    });
    await waitFor(() =>
      expect(submitButton().hasAttribute("disabled")).toBe(false),
    );
  });

  it("submits exactly once with the prepared draft when send is clicked", async () => {
    const onStart = vi.fn();
    render(
      <PromptCard
        client={client()}
        session={session()}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        queuedCount={1}
        onStart={onStart}
      />,
    );
    await selectClaude();
    await waitFor(() =>
      expect(submitButton().hasAttribute("disabled")).toBe(false),
    );
    fireEvent.click(submitButton());
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0][0].draft.thread.id).toBe("thread-1");
  });

  it("keeps the selections and re-prepares when submit fails", async () => {
    const sessionClient = session();
    const onStart = vi.fn().mockRejectedValue(new Error("config rejected"));
    render(
      <PromptCard
        client={client()}
        session={sessionClient}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        queuedCount={1}
        onStart={onStart}
      />,
    );
    await selectClaude();
    await waitFor(() =>
      expect(submitButton().hasAttribute("disabled")).toBe(false),
    );
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "config rejected",
      ),
    );
    await waitFor(() =>
      expect(sessionClient.thread.prepare).toHaveBeenCalledTimes(2),
    );
  });

  it("shows the resolved workspace path as a mono tooltip", () => {
    render(
      <PromptCard
        client={client()}
        session={session()}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        onStart={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Workspace" }));
    expect(screen.getByRole("tooltip").textContent).toContain("~/Code/tethys");
  });
});

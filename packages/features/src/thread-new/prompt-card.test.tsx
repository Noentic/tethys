import { fireEvent, render, screen } from "@testing-library/react";
import {
  noProviderFixtures,
  providerConnectionFixtures,
  trustedWorkspaceFixtures,
} from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
import type { ComposerClient } from "../composer/popups";
import { PromptCard } from "./prompt-card";

function client(): ComposerClient {
  return {
    commands: {
      list: vi.fn().mockResolvedValue([]),
      expand: vi.fn().mockResolvedValue({ text: "", references: [] }),
    },
    search: { files: vi.fn().mockResolvedValue([]) },
  };
}

function submitButton() {
  return screen.getByRole("button", { name: "Submit prompt" });
}

describe("PromptCard", () => {
  it("keeps submit disabled until a workspace is picked", () => {
    render(
      <PromptCard
        client={client()}
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

  it("submits exactly once when the send button is clicked", () => {
    const onStart = vi.fn();
    render(
      <PromptCard
        client={client()}
        providers={providerConnectionFixtures}
        workspaces={trustedWorkspaceFixtures}
        initialWorkspace={trustedWorkspaceFixtures[0]}
        queuedCount={1}
        onStart={onStart}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    const claude = screen
      .getAllByRole("option")
      .find((option) => option.textContent?.includes("Claude Code"));
    expect(claude).toBeTruthy();
    fireEvent.click(claude as HTMLElement);
    fireEvent.click(submitButton());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows the resolved workspace path as a mono tooltip", () => {
    render(
      <PromptCard
        client={client()}
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

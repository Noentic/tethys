import { render, screen } from "@testing-library/react";
import {
  clearAllSessionStoresForTesting,
  getOrCreateSessionStore,
  queryClient,
  queryKeys,
  workspaceCapabilityFixtures,
} from "@tethys/state";
import { clearRegistriesForTesting } from "@tethys/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InspectorClient } from "../client-context";
import { InspectorScreen } from "./InspectorScreen";

const baseClient: InspectorClient = {
  permission: {
    respond: vi.fn().mockResolvedValue(undefined),
    elicitationRespond: vi.fn().mockResolvedValue(undefined),
  },
  events: { subscribe: vi.fn().mockResolvedValue(undefined) },
};

// A client that can also prompt, queue, cancel and search: the slice the docked
// composer needs.
const fullClient = {
  ...baseClient,
  commands: {
    list: vi.fn().mockResolvedValue([]),
    expand: vi.fn().mockResolvedValue({ text: "", references: [] }),
  },
  search: { files: vi.fn().mockResolvedValue([]) },
  thread: {
    prompt: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    setConfigOption: vi.fn().mockResolvedValue(undefined),
    queueList: vi.fn().mockResolvedValue([]),
    queueAdd: vi.fn(),
    queueRemove: vi.fn().mockResolvedValue(undefined),
    queueReorder: vi.fn().mockResolvedValue(undefined),
  },
} as unknown as InspectorClient;

describe("the docked composer in the thread view", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
    queryClient.clear();
  });

  it("mounts the docked prompt card when the client can prompt", () => {
    render(<InspectorScreen sessionId="s-docked-mount" client={fullClient} />);
    expect(screen.getByTestId("docked-prompt-card")).toBeDefined();
  });

  it("says a thread it cannot open, instead of an empty transcript", async () => {
    const client = {
      ...baseClient,
      events: {
        subscribe: vi
          .fn()
          .mockRejectedValue(new Error("thread ghost not found")),
      },
    } as unknown as InspectorClient;
    render(<InspectorScreen sessionId="ghost" client={client} />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "This thread could not be opened.",
    );
  });

  it("mounts no composer for a client without the composer slice", () => {
    render(<InspectorScreen sessionId="s-no-composer" client={baseClient} />);
    expect(screen.queryByTestId("docked-prompt-card")).toBeNull();
  });

  it("puts the card below the transcript, not beside it", () => {
    render(<InspectorScreen sessionId="s-order" client={fullClient} />);
    const screenRoot = screen.getByTestId("inspector-screen");
    expect(screenRoot.className).toContain("flex-col");
    expect(screenRoot.lastElementChild).toBe(
      screen.getByTestId("docked-prompt-card").parentElement,
    );
  });

  // The app resolves this from `workspace.list`; the fixture is only a test
  // override, so the live row has to drive the same reading.
  it("reads `no git` from the live workspace row for a session", () => {
    getOrCreateSessionStore(
      "s-live-no-git",
      "codex",
      "plain-folder",
      "Tidy up",
    );
    queryClient.setQueryData(queryKeys.workspaces, [
      {
        id: "plain-folder",
        name: "plain-folder",
        path: "/home/dev/plain",
        capabilities: workspaceCapabilityFixtures["no-git"],
        trust: "trusted",
        sessions: [],
      },
    ]);
    render(<InspectorScreen sessionId="s-live-no-git" client={fullClient} />);
    expect(screen.getByText("no git")).toBeDefined();
  });

  it("offers no git affordance while the workspace is unresolved", () => {
    getOrCreateSessionStore("s-unresolved", "codex", "unknown", "Tidy up");
    render(<InspectorScreen sessionId="s-unresolved" client={fullClient} />);
    expect(screen.queryByText("no git")).toBeNull();
  });

  it("reads `no git` for a workspace with no git", () => {
    render(
      <InspectorScreen
        sessionId="s-no-git"
        client={fullClient}
        capabilityFixture="no-git"
      />,
    );
    expect(screen.getByText("no git")).toBeDefined();
  });
});

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { TurnEventBody } from "@tethys/bindings";
import {
  clearAllSessionStoresForTesting,
  getOrCreateSessionStore,
  queryClient,
  queryKeys,
  sessionReducer,
  workspaceCapabilityFixtures,
} from "@tethys/state";
import { clearRegistriesForTesting } from "@tethys/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApprovalRenderers } from "../approvals/register";
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
    registerApprovalRenderers();
    queryClient.clear();
  });

  it("mounts the docked prompt card when the client can prompt", () => {
    render(<InspectorScreen sessionId="s-docked-mount" client={fullClient} />);
    expect(screen.getByTestId("docked-prompt-card")).toBeDefined();
  });

  it("docks pending permission requests and answers them by number", async () => {
    const sessionId = "s-request-dock";
    const store = getOrCreateSessionStore(sessionId);
    const request: TurnEventBody = {
      type: "PermissionRequested",
      body: {
        req_id: "req-dock",
        title: "Run command",
        description: "Execute cargo check",
        subject: { Command: { command: "cargo check" } },
        options: [
          { option_id: "allow-once", name: "Allow once", kind: "allow" },
          { option_id: "reject", name: "Reject", kind: "reject" },
        ],
      },
    };
    act(() => {
      store.setState((previous) => sessionReducer(previous, request, 1));
    });

    render(<InspectorScreen sessionId={sessionId} client={fullClient} />);
    await waitFor(() =>
      expect(screen.getByTestId("request-dock")).toBeDefined(),
    );
    expect(screen.getAllByText("Waiting for you ↓")).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole("button", { name: "Allow once" }), {
      key: "1",
    });
    await waitFor(() =>
      expect(baseClient.permission.respond).toHaveBeenCalledWith(
        sessionId,
        "req-dock",
        "allow-once",
      ),
    );
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

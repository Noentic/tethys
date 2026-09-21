import { render, screen } from "@testing-library/react";
import { clearAllSessionStoresForTesting } from "@tethys/state";
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
  });

  it("mounts the docked prompt card when the client can prompt", () => {
    render(<InspectorScreen sessionId="s-docked-mount" client={fullClient} />);
    expect(screen.getByTestId("docked-prompt-card")).toBeDefined();
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

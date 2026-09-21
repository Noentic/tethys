import { act, render, screen } from "@testing-library/react";
import {
  clearAllSessionStoresForTesting,
  getOrCreateSessionStore,
  type SessionEntry,
  type TurnMessageEntry,
} from "@tethys/state";
import { clearRegistriesForTesting } from "@tethys/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InspectorClient } from "../client-context";
import { InspectorScreen } from "./InspectorScreen";

const SESSION = "s-a11y";

const client: InspectorClient = {
  permission: {
    respond: vi.fn().mockResolvedValue(undefined),
    elicitationRespond: vi.fn().mockResolvedValue(undefined),
  },
  events: { subscribe: vi.fn().mockResolvedValue(undefined) },
};

function agentChunk(content: string, streaming: boolean): TurnMessageEntry {
  return {
    id: "m-agent",
    kind: "turn_message",
    role: "Agent",
    content,
    streaming,
    timestamp: 1,
  };
}

function seed(entries: SessionEntry[], status = "idle") {
  getOrCreateSessionStore(SESSION).setState((prev) => ({
    ...prev,
    status,
    entries,
    liveEntries: entries,
  }));
}

describe("transcript accessibility (DESIGN.md Accessibility & Keyboard Map)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
  });

  it("is a labelled log region whose live announcements are off", () => {
    render(<InspectorScreen sessionId={SESSION} client={client} />);
    const log = screen.getByRole("log", { name: "Transcript" });
    expect(log.getAttribute("aria-live")).toBe("off");
  });

  it("is busy while a turn runs and settled after it", () => {
    seed([agentChunk("Thinking", true)], "running");
    render(<InspectorScreen sessionId={SESSION} client={client} />);
    expect(screen.getByRole("log").getAttribute("aria-busy")).toBe("true");

    act(() => seed([agentChunk("Done.", false)], "idle"));
    expect(screen.getByRole("log").getAttribute("aria-busy")).toBe("false");
  });

  it("announces no streamed chunk: the polite region stays silent until the turn ends", () => {
    seed([agentChunk("Inspecting", true)], "running");
    render(<InspectorScreen sessionId={SESSION} client={client} />);
    const announcer = screen.getByTestId("transcript-announcer");
    expect(announcer.textContent).toBe("");

    act(() =>
      seed([agentChunk("Inspecting jwt.rs and the tests", true)], "running"),
    );
    expect(announcer.textContent).toBe("");
    // The log itself never becomes a live region while streaming.
    expect(screen.getByRole("log").getAttribute("aria-live")).toBe("off");

    act(() =>
      seed([agentChunk("Inspecting jwt.rs and the tests.", false)], "idle"),
    );
    expect(announcer.textContent).toBe("Turn complete");
  });
});

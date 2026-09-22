import { render } from "@testing-library/react";
import type { ThreadSessionView } from "@tethys/bindings";
import {
  clearAllSessionStoresForTesting,
  clearAllSessionStreamsForTesting,
  hydrateSessionView,
} from "@tethys/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InspectorClient } from "../client-context";
import { InspectorScreen } from "./InspectorScreen";

const SESSION = "s-cold-open";

const view: ThreadSessionView = {
  thread: {
    id: SESSION,
    workspace_id: "w-1",
    agent_profile_id: "p-1",
    title: "Prepared thread",
    workdir: "~/Code/tethys",
    state: "Idle",
    session_id: "acp-1",
  },
  events: [],
  config_options: [],
  capabilities: null,
  permission_mode: "supervised",
  latest_seq: 3,
};

function clientWithGet(get: ReturnType<typeof vi.fn>): InspectorClient {
  return {
    permission: {
      respond: vi.fn().mockResolvedValue(undefined),
      elicitationRespond: vi.fn().mockResolvedValue(undefined),
    },
    thread: { get } as unknown as InspectorClient["thread"],
    events: { subscribe: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("cold-open hydration (M1.17 U5)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearAllSessionStreamsForTesting();
  });

  it("does not refetch when the route loader already hydrated the session", () => {
    hydrateSessionView(view);
    const get = vi.fn().mockResolvedValue(view);

    render(<InspectorScreen sessionId={SESSION} client={clientWithGet(get)} />);

    expect(get).not.toHaveBeenCalled();
  });

  it("falls back to thread.get when mounted without a loader", async () => {
    const get = vi.fn().mockResolvedValue(view);
    render(<InspectorScreen sessionId={SESSION} client={clientWithGet(get)} />);
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith(SESSION));
  });
});

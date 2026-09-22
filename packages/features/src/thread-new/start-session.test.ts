import type { ContentBlock, ThreadBootstrap } from "@tethys/bindings";
import {
  clearAllSessionStreamsForTesting,
  getSessionStore,
} from "@tethys/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type StartSessionClient, startSession } from "./start-session";

function bootstrap(): ThreadBootstrap {
  return {
    thread: {
      id: "thread-7",
      workspace_id: "workspace-1",
      agent_profile_id: "claude-code",
      title: "Untitled",
      workdir: "~/Code/tethys",
      state: "Idle" as const,
      session_id: "session-7",
    },
    events: [],
    config_options: [
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
    latest_seq: 4,
  };
}

function mockClient() {
  const calls: string[] = [];
  const client: StartSessionClient = {
    thread: {
      setConfigOption: vi.fn(async (id, optionId, value) => {
        calls.push(`config:${id}:${optionId}=${value}`);
      }),
      prompt: vi.fn(async (id: string, _blocks: ContentBlock[]) => {
        calls.push(`prompt:${id}`);
      }),
    },
  };
  return { client, calls };
}

beforeEach(() => clearAllSessionStreamsForTesting());

describe("startSession", () => {
  it("applies config, seeds the store, navigates, then starts the first turn", async () => {
    const { client, calls } = mockClient();
    const navigate = vi.fn((path: string) => calls.push(`navigate:${path}`));
    const id = await startSession(
      client,
      {
        draft: bootstrap(),
        promptText: "Review the diff.",
        changedConfig: { model: "claude-opus-x" },
      },
      navigate,
    );

    expect(calls).toEqual([
      "config:thread-7:model=claude-opus-x",
      "navigate:/thread/thread-7",
      "prompt:thread-7",
    ]);
    expect(client.thread.prompt).toHaveBeenCalledWith("thread-7", [
      { Text: "Review the diff." },
    ]);
    expect(navigate).toHaveBeenCalledWith("/thread/thread-7");
    expect(id).toBe("thread-7");
  });

  it("seeds the shared store from the bootstrap without a thread.get round-trip", async () => {
    const { client } = mockClient();
    await startSession(
      client,
      { draft: bootstrap(), promptText: "hi" },
      vi.fn(),
    );
    const store = getSessionStore("thread-7");
    expect(store?.state.seq).toBe(4);
    expect(store?.state.configOptions.map((option) => option.id)).toEqual([
      "model",
    ]);
  });

  it("delivers only a plaintext Text block as the first turn", async () => {
    const { client } = mockClient();
    await startSession(
      client,
      { draft: bootstrap(), promptText: "$commit @src/main.rs" },
      vi.fn(),
    );
    const [, blocks] = (client.thread.prompt as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, ContentBlock[]];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ Text: "$commit @src/main.rs" });
    expect(JSON.stringify(blocks)).not.toContain("SKILL.md");
  });
});

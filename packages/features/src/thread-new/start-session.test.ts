import type { ContentBlock } from "@tethys/bindings";
import {
  providerConnectionFixtures,
  trustedWorkspaceFixtures,
} from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
import { type StartSessionClient, startSession } from "./start-session";

function mockClient() {
  const calls: string[] = [];
  const client: StartSessionClient = {
    thread: {
      create: vi.fn(async (request) => {
        calls.push(`create:${request.workdir}:${request.agent_profile_id}`);
        return { id: "thread-7" };
      }),
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

const workspace = trustedWorkspaceFixtures[0];
const provider = providerConnectionFixtures[0];

describe("startSession", () => {
  it("creates, applies config, prompts the first turn, then navigates", async () => {
    const { client, calls } = mockClient();
    const navigate = vi.fn();
    const id = await startSession(
      client,
      {
        workspace,
        provider,
        promptText: "Review the diff.",
        changedConfig: { thought_level: "high" },
      },
      navigate,
    );

    expect(calls).toEqual([
      "create:~/Code/tethys:claude-code",
      "config:thread-7:thought_level=high",
      "prompt:thread-7",
    ]);
    expect(client.thread.prompt).toHaveBeenCalledWith("thread-7", [
      { Text: "Review the diff." },
    ]);
    expect(navigate).toHaveBeenCalledWith("/thread/thread-7");
    expect(id).toBe("thread-7");
  });

  it("delivers only a plaintext Text block as the first turn", async () => {
    const { client } = mockClient();
    await startSession(
      client,
      { workspace, provider, promptText: "$commit @src/main.rs" },
      vi.fn(),
    );
    const [, blocks] = (client.thread.prompt as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, ContentBlock[]];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ Text: "$commit @src/main.rs" });
    expect(JSON.stringify(blocks)).not.toContain("SKILL.md");
  });

  it("is a no-op when the workspace is unresolved", async () => {
    const { client } = mockClient();
    const navigate = vi.fn();
    const id = await startSession(
      client,
      { workspace: null, provider, promptText: "hi" },
      navigate,
    );
    expect(id).toBeNull();
    expect(client.thread.create).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

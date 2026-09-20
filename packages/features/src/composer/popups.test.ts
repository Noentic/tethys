import type { AgentCommand } from "@tethys/bindings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentCommandItems,
  type ComposerClient,
  commandSource,
  pathSource,
  resetComposerCaches,
  skillSource,
} from "./popups";

function client(): ComposerClient {
  return {
    commands: {
      list: vi
        .fn()
        .mockResolvedValue([
          { name: "deploy", scope: "workspace", path: "/c/deploy.md" },
        ]),
      expand: vi.fn().mockResolvedValue({
        text: "Deploy the app.",
        references: [],
      }),
    },
    search: {
      files: vi.fn().mockResolvedValue([
        { relative_path: "src", score: 1, is_dir: true },
        { relative_path: "src/main.rs", score: 0.5, is_dir: false },
      ]),
    },
  };
}

beforeEach(() => resetComposerCaches());

describe("commandSource", () => {
  it("expands a Tethys command to plaintext and lists it apart from agents", async () => {
    const source = commandSource(client(), "w1");
    const items = await source("deploy");
    const tethys = items.find((item) => item.id === "command:deploy");
    expect(tethys?.group).toBe("Tethys commands");
    expect(tethys?.chip.token).toBe("Deploy the app.");
  });

  it("namespaces a clashing agent command as /agent:deploy", async () => {
    const agents: AgentCommand[] = [
      { name: "deploy", description: "Provider deploy", input: null },
    ];
    const source = commandSource(client(), "w1", agents, "Fixture Agent");
    const items = await source("deploy");
    const agent = items.find((item) => item.id === "agent:deploy");
    expect(agent?.group).toBe("Fixture Agent commands");
    expect(agent?.chip.token).toBe("/agent:deploy");
    expect(items.find((item) => item.id === "command:deploy")).toBeDefined();
  });

  it("omits the provider group when there are no agent commands", async () => {
    const items = await commandSource(client(), "w1")("");
    expect(items.every((item) => item.group === "Tethys commands")).toBe(true);
  });
});

describe("agentCommandItems", () => {
  it("heads the group with the provider name", () => {
    const items = agentCommandItems(
      [{ name: "x", description: null, input: null }],
      "Fixture Agent",
    );
    expect(items[0].group).toBe("Fixture Agent commands");
  });
});

describe("skillSource", () => {
  it("references the skill and never inlines the body", async () => {
    const items = await skillSource()("commit");
    expect(items[0].chip.injectionMethod).toBe("referenced");
    expect(items[0].chip.token).toBe("$commit");
  });
});

describe("pathSource", () => {
  it("distinguishes folders from files", async () => {
    const items = await pathSource(client(), "w1")("src");
    expect(items.find((item) => item.chip.path === "src")?.chip.isDir).toBe(
      true,
    );
    expect(
      items.find((item) => item.chip.path === "src/main.rs")?.chip.isDir,
    ).toBe(false);
  });
});

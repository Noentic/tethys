import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { SkillInfo } from "@tethys/bindings";
import { type SkillsClient, skillInfoFixtures } from "@tethys/state";
import { describe, expect, it, vi } from "vitest";

const scope = { workspaceId: "", workspaces: [], selectWorkspace: () => {} };

vi.mock("@tethys/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tethys/state")>();
  return { ...actual, useMcpWorkspaceScope: () => scope };
});

import { SkillsView } from "./skills-view";

function fakeClient(
  initial: SkillInfo[] = skillInfoFixtures,
  overrides: Partial<SkillsClient["skills"]> = {},
) {
  let current = initial;
  const skills: SkillsClient["skills"] = {
    list: vi.fn(() => Promise.resolve(current)),
    trust: vi.fn((_workspaceId, _scope, name) => {
      current = current.map((skill) =>
        skill.name === name ? { ...skill, trusted: true } : skill,
      );
      return Promise.resolve(
        current.find((skill) => skill.name === name) as SkillInfo,
      );
    }),
    enable: vi.fn((_workspaceId, _scope, name, enabled) => {
      current = current.map((skill) =>
        skill.name === name ? { ...skill, enabled } : skill,
      );
      return Promise.resolve(
        current.find((skill) => skill.name === name) as SkillInfo,
      );
    }),
    import: vi.fn(),
    update_check: vi.fn(),
    update_plan: vi.fn(),
    update_apply: vi.fn(),
    ...overrides,
  };
  return { skills, client: { skills } as unknown as SkillsClient };
}

describe("SkillsView (M1.11 U7)", () => {
  it("renders the Yours library from skills.list", async () => {
    const { client } = fakeClient();
    render(<SkillsView client={client} workspaceId="w1" />);
    expect(await screen.findByTestId("skill-row-find-docs")).toBeTruthy();
    expect(screen.getByTestId("skill-row-audit-code")).toBeTruthy();
    expect(screen.getByText("find-docs")).toBeTruthy();
    expect(screen.getByText("folder")).toBeTruthy();
  });

  it("persists trust and reads it back", async () => {
    const { client, skills } = fakeClient();
    const view = render(<SkillsView client={client} workspaceId="w1" />);
    fireEvent.click(await screen.findByTestId("skill-row-audit-code"));
    const trustSwitch = await screen.findByRole("switch", {
      name: "Trust audit-code",
    });
    expect(trustSwitch.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(trustSwitch);
    await waitFor(() =>
      expect(skills.trust).toHaveBeenCalledWith(
        "w1",
        "workspace",
        "audit-code",
      ),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Trust audit-code" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
    // A fresh read of the list keeps the persisted flag on.
    view.unmount();
    render(<SkillsView client={client} workspaceId="w1" />);
    fireEvent.click(await screen.findByTestId("skill-row-audit-code"));
    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Trust audit-code" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
  });

  it("shows no trust control for a non-script skill", async () => {
    const { client } = fakeClient();
    render(<SkillsView client={client} workspaceId="w1" />);
    fireEvent.click(await screen.findByTestId("skill-row-find-docs"));
    expect(
      screen.queryByRole("switch", { name: "Trust find-docs" }),
    ).toBeNull();
    expect(
      screen.getByRole("switch", { name: "Enable find-docs" }),
    ).toBeTruthy();
  });

  it("groups skills by scope and filters them with the search field", async () => {
    const { client } = fakeClient([
      ...skillInfoFixtures,
      {
        ...skillInfoFixtures[0],
        name: "commit-style",
        scope: "global",
      },
    ]);
    render(<SkillsView client={client} workspaceId="w1" />);
    await screen.findByTestId("skill-row-commit-style");
    expect(screen.getByTestId("skill-group-global").textContent).toBe("Global");
    expect(screen.getByTestId("skill-group-workspace").textContent).toContain(
      "Workspace",
    );

    fireEvent.change(screen.getByLabelText("Search skills"), {
      target: { value: "commit" },
    });
    expect(screen.getByTestId("skill-row-commit-style")).toBeTruthy();
    expect(screen.queryByTestId("skill-row-find-docs")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search skills"), {
      target: { value: "nothing-matches" },
    });
    expect(screen.getByText("No skills match that search.")).toBeTruthy();
  });

  it("clears trust when an update is applied", async () => {
    const trusted: SkillInfo[] = skillInfoFixtures.map((skill) => ({
      ...skill,
      trusted: true,
    }));
    const { client, skills } = fakeClient(trusted, {
      update_check: vi.fn().mockResolvedValue({
        name: "audit-code",
        pinned_sha: "abcdef12",
        upstream_sha: "99999999",
        update_available: true,
        error: null,
      }),
      update_plan: vi.fn().mockResolvedValue({
        name: "audit-code",
        upstream_sha: "99999999",
        changed_files: ["SKILL.md"],
        diff: "+ new rule",
      }),
      update_apply: vi.fn().mockResolvedValue({
        name: "audit-code",
        pinned_sha: "99999999",
        content_hash: "b3-new",
      }),
    });
    render(<SkillsView client={client} workspaceId="w1" />);
    fireEvent.click(await screen.findByTestId("skill-row-audit-code"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Check for updates" }),
    );
    const preview = await screen.findByRole("button", { name: "Preview" });
    fireEvent.click(preview);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Apply update" }),
    );
    await waitFor(() => expect(skills.update_apply).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Trust audit-code" })
          .getAttribute("aria-checked"),
      ).toBe("false"),
    );
  });

  it("submits a pinned GitHub spec as a tarball", async () => {
    const imported = vi.fn().mockResolvedValue(skillInfoFixtures[0]);
    const { client } = fakeClient(skillInfoFixtures, { import: imported });
    render(<SkillsView client={client} workspaceId="w1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "GitHub" }));
    expect(
      within(dialog).getByText(/pinned GitHub release as a tarball/i),
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Import source"), {
      target: { value: "acme/skill@v1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(imported).toHaveBeenCalledWith("w1", "workspace", {
        kind: "git-hub",
        spec: "acme/skill@v1",
      }),
    );
  });

  it("surfaces the engine's error for a non-GitHub URL", async () => {
    const imported = vi
      .fn()
      .mockRejectedValue(new Error("unsupported source: https://gitlab.com/x"));
    const { client } = fakeClient(skillInfoFixtures, { import: imported });
    render(<SkillsView client={client} workspaceId="w1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "GitHub" }));
    fireEvent.change(within(dialog).getByLabelText("Import source"), {
      target: { value: "https://gitlab.com/x" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    expect(await within(dialog).findByRole("alert")).toBeTruthy();
  });

  it("switches to the commands kind and reads a command into the editor", async () => {
    const { client } = fakeClient();
    const write = vi.fn().mockResolvedValue({
      name: "review",
      scope: "workspace",
      path: ".tethys/commands/review.md",
      description: "Review the current diff",
      shadowed: false,
    });
    const commands = {
      list: vi.fn().mockResolvedValue([
        {
          name: "review",
          scope: "workspace",
          path: ".tethys/commands/review.md",
          description: "Review the current diff",
          shadowed: false,
        },
      ]),
      read: vi.fn().mockResolvedValue({
        name: "review",
        scope: "workspace",
        path: ".tethys/commands/review.md",
        body: "Review {{args}} against the plan.",
      }),
      write,
      delete: vi.fn(),
    };
    render(
      <SkillsView
        client={client}
        workspaceId="w1"
        commandsClient={{ commands } as never}
      />,
    );
    fireEvent.click(await screen.findByRole("radio", { name: "Commands" }));
    fireEvent.click(await screen.findByTestId("command-row-review"));
    await waitFor(() =>
      expect(commands.read).toHaveBeenCalledWith("workspace", "review", "w1"),
    );
    expect(
      (screen.getByLabelText("Command body") as HTMLTextAreaElement).value,
    ).toBe("Review {{args}} against the plan.");
    fireEvent.change(screen.getByLabelText("Command body"), {
      target: { value: "Review hard." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        "workspace",
        "review",
        "Review hard.",
        "w1",
      ),
    );
  });

  it("asks for nothing and shows the empty state until a workspace resolves", async () => {
    scope.workspaceId = "";
    const { client, skills } = fakeClient();
    render(<SkillsView client={client} />);
    expect(await screen.findByText("No workspace yet")).toBeTruthy();
    expect(skills.list).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears a previous load error once the next load succeeds", async () => {
    scope.workspaceId = "w1";
    const list = vi.fn((workspaceId?: string) =>
      workspaceId === "w1"
        ? Promise.reject(new Error("workspace not found: "))
        : Promise.resolve(skillInfoFixtures),
    );
    const client = { skills: { list } } as unknown as SkillsClient;

    const view = render(<SkillsView client={client} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "workspace not found: ",
    );

    scope.workspaceId = "w2";
    view.rerender(<SkillsView client={client} />);
    expect(await screen.findByTestId("skill-row-find-docs")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists commands without a workspace instead of sending an empty id", async () => {
    scope.workspaceId = "";
    const list = vi.fn().mockResolvedValue([]);
    const commands = {
      list,
      read: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
    };
    const { client } = fakeClient();
    render(
      <SkillsView client={client} commandsClient={{ commands } as never} />,
    );

    fireEvent.click(await screen.findByRole("radio", { name: "Commands" }));
    await waitFor(() => expect(list).toHaveBeenCalledWith(undefined, true));
    expect(await screen.findByText(/No commands yet/)).toBeTruthy();
  });
});

import { render, waitFor } from "@testing-library/react";
import { McpView, SkillsView, SyncGrid } from "@tethys/features";
import {
  attachmentGridFixtures,
  type McpSyncClient,
  projectionPlanFixture,
  registryEntryFixtures,
  type SkillsClient,
  skillInfoFixtures,
  workspaceOptionFixtures,
} from "@tethys/state";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { SettingsLayout } from "./routes/settings";
import { SettingsGeneralView } from "./routes/settings.general";
import { ThreadView } from "./routes/thread.$id";
import { ThreadNewView } from "./routes/thread.new";
import { WorkspacesView } from "./routes/workspaces";
import { AppShell } from "./shell/AppShell";
import { CommandPalette } from "./shell/CommandPalette";

async function expectAxeClean(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // In testing environments without layout engines, color-contrast may produce false positives
      "color-contrast": { enabled: false },
    },
  });
  expect(results.violations).toEqual([]);
}

const mcpClient: McpSyncClient = {
  mcp: {
    attachments: async () => attachmentGridFixtures.allStates,
    registry_list: async () => registryEntryFixtures,
    projection_plan: async () => projectionPlanFixture,
    projection_apply: async () => ({
      target: "codex",
      path: projectionPlanFixture.path,
      scope: "workspace",
      file_hash: "b3-0123456789abcdef",
      created: false,
    }),
    projection_rollback: async () => undefined,
    projection_verify: async () => "drifted",
    import_scan: async () => ({ candidates: [], failures: [] }),
    import_apply: async () => [],
  },
};

const skillsClient: SkillsClient = {
  skills: {
    list: async () => skillInfoFixtures,
    trust: async () => skillInfoFixtures[1],
    enable: async () => skillInfoFixtures[0],
    import: async () => skillInfoFixtures[0],
    update_check: async () => ({
      name: "audit-code",
      update_available: false,
    }),
    update_plan: async () => ({
      name: "audit-code",
      upstream_sha: "abcdef12",
      changed_files: [],
      diff: "",
    }),
    update_apply: async () => ({
      name: "audit-code",
      pinned_sha: "abcdef12",
      content_hash: "b3-cccc",
    }),
  },
};

describe("Automated A11y / axe clean audit on Desktop routes & shell", () => {
  it("passes axe on AppShell + WorkspacesView", async () => {
    const { container } = render(
      <AppShell activeRoute="/workspaces">
        <WorkspacesView />
      </AppShell>,
    );
    await expectAxeClean(container);
  });

  it("passes axe on ThreadNewView", async () => {
    const { container } = render(<ThreadNewView />);
    await expectAxeClean(container);
  });

  it("passes axe on the /thread/:id route", async () => {
    const { container } = render(<ThreadView sessionId="s-a11y" />);
    await expectAxeClean(container);
  });

  it("passes axe on SettingsLayout + SettingsGeneralView", async () => {
    const { container } = render(
      <SettingsLayout activeSection="general">
        <SettingsGeneralView />
      </SettingsLayout>,
    );
    await expectAxeClean(container);
  });

  it("passes axe on CommandPalette dialog", async () => {
    const { container } = render(
      <CommandPalette open={true} onClose={() => {}} />,
    );
    await expectAxeClean(container);
  });

  it("passes axe on the Settings / MCP sync-grid", async () => {
    const { container } = render(
      <SettingsLayout activeSection="mcp">
        <McpView
          client={mcpClient}
          scope={{
            workspaceId: "tethys",
            workspaces: workspaceOptionFixtures,
            selectWorkspace: () => {},
          }}
        />
      </SettingsLayout>,
    );
    await waitFor(() => {
      expect(container.textContent).toContain("Vendor-file fallback");
    });
    await expectAxeClean(container);
  });

  it("passes axe on the sync-grid empty shapes", async () => {
    const noServers = render(
      <SyncGrid grid={attachmentGridFixtures.noServers} />,
    );
    await expectAxeClean(noServers.container);
    noServers.unmount();

    const noProviders = render(
      <SyncGrid grid={attachmentGridFixtures.noProviders} />,
    );
    await expectAxeClean(noProviders.container);
  });

  it("passes axe on the Settings / Skills library", async () => {
    const { container } = render(
      <SettingsLayout activeSection="skills">
        <SkillsView client={skillsClient} workspaceId="tethys" />
      </SettingsLayout>,
    );
    await waitFor(() => {
      expect(container.textContent).toContain("find-docs");
    });
    await expectAxeClean(container);
  });
});

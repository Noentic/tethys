import { render } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { SettingsLayout } from "./routes/settings";
import { SettingsGeneralView } from "./routes/settings.general";
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
});

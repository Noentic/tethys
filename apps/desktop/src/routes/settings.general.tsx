import {
  Badge,
  Button,
  Card,
  PageHeader,
  Select,
  ToggleSwitch,
} from "@tethys/ui";
import type React from "react";
import { useState } from "react";

interface TrustedFolder {
  id: string;
  path: string;
  sourceKind: string;
  permissionMode: "Supervised" | "Auto-edit" | "YOLO";
  dateTrusted: string;
}

const INITIAL_TRUSTED_FOLDERS: TrustedFolder[] = [
  {
    id: "f-1",
    path: "~/Code/tethys",
    sourceKind: "Git · GitHub",
    permissionMode: "Supervised",
    dateTrusted: "2026-09-17",
  },
];

// Picker label -> CSS font stack. The first entry of each list is the shipped
// default and is applied by removing the override rather than restating it.
const UI_FONTS: Record<string, string> = {
  "Geist Sans": "",
  "System Sans":
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  Inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
};
const CODE_FONTS: Record<string, string> = {
  "Geist Mono": "",
  "JetBrains Mono": '"JetBrains Mono", ui-monospace, monospace',
  "Fira Code": '"Fira Code", ui-monospace, monospace',
};

function applyFontStack(cssVar: "--font-sans" | "--font-mono", stack: string) {
  const root = document.documentElement;
  if (stack) root.style.setProperty(cssVar, stack);
  else root.style.removeProperty(cssVar);
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-lg">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading-md text-(--tethys-text-primary)">
          {title}
        </h2>
        {description && (
          <p className="text-body-sm text-(--tethys-text-muted)">
            {description}
          </p>
        )}
      </div>
      <Card className="divide-y divide-(--tethys-hairline)">{children}</Card>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-xl px-lg py-md">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-sm text-(--tethys-text-primary)">
          {title}
        </span>
        <span className="text-label-md font-normal text-(--tethys-text-muted)">
          {description}
        </span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsGeneralView() {
  const [colorScheme, setColorScheme] = useState<string>("Dark");
  const [theme, setTheme] = useState<string>("Tethys Dark");
  const [uiFont, setUiFont] = useState<string>("Geist Sans");
  const [codeFont, setCodeFont] = useState<string>("Geist Mono");
  const [terminalFont, setTerminalFont] = useState<string>("Geist Mono");
  const [approvalAlerts, setApprovalAlerts] = useState<boolean>(true);
  const [completionAlerts, setCompletionAlerts] = useState<boolean>(true);
  const [trustedFolders, setTrustedFolders] = useState<TrustedFolder[]>(
    INITIAL_TRUSTED_FOLDERS,
  );

  const revokeFolder = (id: string) => {
    setTrustedFolders((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="flex flex-col gap-2xl">
      <PageHeader title="General" />

      <SettingsSection title="Appearance & Typography">
        <SettingRow
          title="Color scheme"
          description="Choose whether Tethys follows the system, light, or dark palette."
        >
          <Select
            aria-label="Color scheme"
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value)}
          >
            <option value="System">System</option>
            <option value="Dark">Dark</option>
            <option value="Light">Light</option>
          </Select>
        </SettingRow>

        <SettingRow
          title="Theme"
          description="Design token manifest hot-swapped across UI surfaces."
        >
          <Select
            aria-label="Theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="Tethys Dark">Tethys Dark (Default)</option>
            <option value="Tethys Light">Tethys Light</option>
            <option value="Midnight Charcoal">Midnight Charcoal</option>
          </Select>
        </SettingRow>

        <SettingRow
          title="UI Font"
          description="Interface typeface for headers, labels, and dialogs."
        >
          <Select
            aria-label="UI Font"
            value={uiFont}
            onChange={(e) => {
              setUiFont(e.target.value);
              applyFontStack("--font-sans", UI_FONTS[e.target.value] ?? "");
            }}
          >
            {Object.keys(UI_FONTS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Code Font"
          description="Monospace font used in git diff views, logs, and tool cards."
        >
          <Select
            aria-label="Code Font"
            value={codeFont}
            onChange={(e) => {
              setCodeFont(e.target.value);
              applyFontStack("--font-mono", CODE_FONTS[e.target.value] ?? "");
            }}
          >
            {Object.keys(CODE_FONTS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Terminal Font"
          description="Monospace font used in isolated PTY sessions and commands."
        >
          {/* No terminal surface exists yet, so there is nothing to apply this to. */}
          <Select
            aria-label="Terminal Font"
            value={terminalFont}
            disabled
            onChange={(e) => setTerminalFont(e.target.value)}
          >
            <option value="Geist Mono">Geist Mono</option>
            <option value="JetBrainsMono Nerd Font">
              JetBrainsMono Nerd Font
            </option>
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="System Notifications">
        <SettingRow
          title="Tool Approvals Required"
          description="Notify when a background agent turn requests permission to execute tools or edit files."
        >
          <ToggleSwitch
            id="approval-notification-switch"
            label="Tool Approvals Required"
            checked={approvalAlerts}
            onCheckedChange={setApprovalAlerts}
          />
        </SettingRow>

        <SettingRow
          title="Turn Completion"
          description="Notify when an agent completes its turn or plan steps."
        >
          <ToggleSwitch
            id="completion-notification-switch"
            label="Turn Completion"
            checked={completionAlerts}
            onCheckedChange={setCompletionAlerts}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Trusted Folders"
        description="Directories granted execution trust via workspace-trust-dialog. Revoking removes the workspace and stops running agent threads."
      >
        {trustedFolders.map((folder) => (
          <div
            key={folder.id}
            className="flex items-center justify-between gap-xl px-lg py-md"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-sm">
                <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
                  {folder.path}
                </span>
                <Badge variant="muted">{folder.sourceKind}</Badge>
              </div>
              <span className="text-label-md font-normal text-(--tethys-text-muted)">
                Policy: {folder.permissionMode} · Trusted {folder.dateTrusted}
              </span>
            </div>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => revokeFolder(folder.id)}
            >
              Revoke Trust
            </Button>
          </div>
        ))}
        {trustedFolders.length === 0 && (
          <div className="px-lg py-xl text-center text-body-sm text-(--tethys-text-muted)">
            No trusted folders.
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

import { Button, ToggleSwitch } from "@tethys/ui";
import { useState } from "react";

interface TrustedFolder {
  id: string;
  path: string;
  sourceKind: string;
  permissionMode: "Supervised" | "Auto-approve reads" | "YOLO";
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
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-(--tethys-text-primary)">
          General
        </h2>
      </div>

      {/* Appearance Section (§5.1) */}
      <div className="flex flex-col gap-5 border-b border-(--tethys-hairline) pb-8">
        <h3 className="text-sm font-semibold text-(--tethys-text-primary)">
          Appearance & Typography
        </h3>

        {/* Color Scheme */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-(--tethys-text-primary)">
              Color scheme
            </span>
            <span className="text-[11px] text-(--tethys-text-muted)">
              Choose whether Tethys follows the system, light, or dark palette.
            </span>
          </div>
          <select
            aria-label="Color scheme"
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value)}
            className="h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-3 text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
          >
            <option value="System">System</option>
            <option value="Dark">Dark</option>
            <option value="Light">Light</option>
          </select>
        </div>

        {/* Theme */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-(--tethys-text-primary)">
              Theme
            </span>
            <span className="text-[11px] text-(--tethys-text-muted)">
              Design token manifest hot-swapped across UI surfaces.
            </span>
          </div>
          <select
            aria-label="Theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-3 text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
          >
            <option value="Tethys Dark">Tethys Dark (Default)</option>
            <option value="Tethys Light">Tethys Light</option>
            <option value="Midnight Charcoal">Midnight Charcoal</option>
          </select>
        </div>

        {/* UI Font */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-(--tethys-text-primary)">
              UI Font
            </span>
            <span className="text-[11px] text-(--tethys-text-muted)">
              Interface typeface for headers, labels, and dialogs.
            </span>
          </div>
          <select
            aria-label="UI Font"
            value={uiFont}
            onChange={(e) => setUiFont(e.target.value)}
            className="h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-3 text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
          >
            <option value="Geist Sans">Geist Sans</option>
            <option value="System Sans">System Sans</option>
            <option value="Inter">Inter</option>
          </select>
        </div>

        {/* Code Font */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-(--tethys-text-primary)">
              Code Font
            </span>
            <span className="text-[11px] text-(--tethys-text-muted)">
              Monospace font used in git diff views, logs, and tool cards.
            </span>
          </div>
          <select
            aria-label="Code Font"
            value={codeFont}
            onChange={(e) => setCodeFont(e.target.value)}
            className="h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-3 text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
          >
            <option value="Geist Mono">Geist Mono</option>
            <option value="JetBrains Mono">JetBrains Mono</option>
            <option value="Fira Code">Fira Code</option>
          </select>
        </div>

        {/* Terminal Font */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-(--tethys-text-primary)">
              Terminal Font
            </span>
            <span className="text-[11px] text-(--tethys-text-muted)">
              Monospace font used in isolated PTY sessions and commands.
            </span>
          </div>
          <select
            aria-label="Terminal Font"
            value={terminalFont}
            onChange={(e) => setTerminalFont(e.target.value)}
            className="h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-3 text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
          >
            <option value="Geist Mono">Geist Mono</option>
            <option value="JetBrainsMono Nerd Font">
              JetBrainsMono Nerd Font
            </option>
          </select>
        </div>
      </div>

      {/* System Notifications Section (§5.1) */}
      <div className="flex flex-col gap-5 border-b border-(--tethys-hairline) pb-8">
        <h3 className="text-sm font-semibold text-(--tethys-text-primary)">
          System Notifications
        </h3>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-(--tethys-text-primary)">
              Tool Approvals Required
            </span>
            <span className="text-[11px] text-(--tethys-text-muted)">
              Notify when a background agent turn requests permission to execute
              tools or edit files.
            </span>
          </div>
          <ToggleSwitch
            id="approval-notification-switch"
            label="Tool Approvals Required"
            checked={approvalAlerts}
            onCheckedChange={setApprovalAlerts}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-(--tethys-text-primary)">
              Turn Completion
            </span>
            <span className="text-[11px] text-(--tethys-text-muted)">
              Notify when an agent completes its turn or plan steps.
            </span>
          </div>
          <ToggleSwitch
            id="completion-notification-switch"
            label="Turn Completion"
            checked={completionAlerts}
            onCheckedChange={setCompletionAlerts}
          />
        </div>
      </div>

      {/* Trusted Folders Manager (§5.1) */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-(--tethys-text-primary)">
            Trusted Folders
          </h3>
          <span className="text-xs text-(--tethys-text-muted)">
            Directories granted execution trust via workspace-trust-dialog.
            Revoking removes the workspace and stops running agent threads.
          </span>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-(--tethys-hairline) bg-(--tethys-surface-panel) p-2">
          {trustedFolders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center justify-between rounded-lg bg-(--tethys-surface-elevated)/50 p-3 text-xs"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-(--tethys-text-primary) truncate">
                    {folder.path}
                  </span>
                  <span className="rounded bg-(--tethys-surface-panel) px-1.5 py-0.5 font-mono text-[10px] text-(--tethys-text-muted) border border-(--tethys-hairline)">
                    {folder.sourceKind}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-(--tethys-text-muted)">
                  <span>Policy: {folder.permissionMode}</span>
                  <span>·</span>
                  <span>Trusted {folder.dateTrusted}</span>
                </div>
              </div>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => revokeFolder(folder.id)}
                className="text-xs text-(--tethys-status-danger) hover:bg-red-500/10 border-red-500/30"
              >
                Revoke Trust
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

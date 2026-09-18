import { KeycapPill } from "@tethys/ui";

export function SettingsKeybindingsView() {
  const bindings = [
    { action: "Open Command Palette", key: "Ctrl+K" },
    { action: "New Thread", key: "Ctrl+T" },
    { action: "Close Tab", key: "Ctrl+W" },
    { action: "Open Settings", key: "Ctrl+," },
    { action: "Switch Tab 1..9", key: "Ctrl+1..9" },
    { action: "Unstack Top Modal / Drawer", key: "Esc" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[var(--tethys-text-primary)]">
          Keyboard Shortcuts
        </h2>
        <p className="text-xs text-[var(--tethys-text-muted)]">
          Global navigation and interaction keybindings.
        </p>
      </div>

      <div className="divide-y divide-[var(--tethys-hairline)] rounded-lg border border-[var(--tethys-hairline)] bg-[var(--tethys-surface-card)]">
        {bindings.map((b) => (
          <div
            key={b.action}
            className="flex items-center justify-between p-3 text-xs"
          >
            <span className="text-[var(--tethys-text-secondary)]">
              {b.action}
            </span>
            <KeycapPill>{b.key}</KeycapPill>
          </div>
        ))}
      </div>
    </div>
  );
}

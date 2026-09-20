import { Card, KeycapPill, PageHeader } from "@tethys/ui";

export function SettingsKeybindingsView() {
  const bindings = [
    { action: "Open Command Palette", key: "Ctrl+K" },
    { action: "Toggle Sessions Sidebar", key: "Ctrl+B" },
    { action: "New Thread", key: "Ctrl+T" },
    { action: "Close Tab", key: "Ctrl+W" },
    { action: "Open Settings", key: "Ctrl+," },
    { action: "Switch Tab 1..9", key: "Ctrl+1..9" },
    { action: "Unstack Top Modal / Drawer", key: "Esc" },
  ];

  return (
    <div className="flex flex-col gap-xl">
      <PageHeader
        title="Keybindings"
        description="Global navigation and interaction keybindings."
      />

      <Card className="divide-y divide-(--tethys-hairline)">
        {bindings.map((b) => (
          <div
            key={b.action}
            className="flex h-9 items-center justify-between px-lg text-body-sm"
          >
            <span className="text-(--tethys-text-secondary)">{b.action}</span>
            <KeycapPill>{b.key}</KeycapPill>
          </div>
        ))}
      </Card>
    </div>
  );
}

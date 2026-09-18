import { Button } from "@tethys/ui";

export function SettingsMcpView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[var(--tethys-text-primary)]">
          MCP Servers
        </h2>
        <p className="text-xs text-[var(--tethys-text-muted)]">
          Manage Model Context Protocol servers attached to sessions (M1.11).
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-[var(--tethys-hairline-strong)] p-8 text-center">
        <div className="text-xs text-[var(--tethys-text-muted)] mb-3">
          No MCP servers configured yet.
        </div>
        <Button size="sm" variant="secondary">
          Add MCP Server
        </Button>
      </div>
    </div>
  );
}

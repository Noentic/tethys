import { Button, EmptyState, PageHeader } from "@tethys/ui";

export function SettingsMcpView() {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader
        title="MCP Servers"
        description="Manage Model Context Protocol servers attached to sessions (M1.11)."
      />

      <div className="rounded-lg border border-dashed border-(--tethys-hairline-strong)">
        <EmptyState
          title="No MCP servers configured yet."
          action={
            <Button size="sm" variant="secondary">
              Add MCP Server
            </Button>
          }
        />
      </div>
    </div>
  );
}

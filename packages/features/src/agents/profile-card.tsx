//! `profile-card` (DESIGN.md): a registry entry with its version pin.

import type { AgentRegistryEntryView } from "@tethys/bindings";
import { Badge, Button, Card } from "@tethys/ui";

export interface ProfileCardProps {
  entry: AgentRegistryEntryView;
  busy?: boolean;
  onInstall?: () => void;
  onUpdate?: () => void;
  className?: string;
}

export function ProfileCard({
  entry,
  busy = false,
  onInstall,
  onUpdate,
  className,
}: ProfileCardProps): React.ReactElement {
  const updateAvailable = entry.update?.kind === "available";
  const action = entry.installed
    ? updateAvailable
      ? { label: "Update", handler: onUpdate }
      : null
    : { label: "Install", handler: onInstall };
  const runtime = entry.needs_node
    ? "Requires Node.js"
    : entry.needs_uvx
      ? "Requires uv"
      : null;

  return (
    <Card
      data-testid="profile-card"
      className={`flex items-center justify-between gap-lg p-lg ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-sm">
          <span className="text-heading-md text-(--tethys-text-primary)">
            {entry.name}
          </span>
          <Badge variant="muted" size="sm">
            {entry.selected_distribution
              ? `${entry.selected_distribution} selected`
              : entry.distributions.join(", ")}
          </Badge>
          {entry.preview_version && (
            <Badge variant="muted" size="sm">
              Preview {entry.preview_version}
            </Badge>
          )}
          {updateAvailable && (
            <Badge variant="warning" size="sm" data-testid="update-available">
              Update available
            </Badge>
          )}
        </div>
        <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
          {entry.pinned_version
            ? `Pinned ${entry.pinned_version} · latest ${entry.version}`
            : (entry.description ?? entry.version)}
        </span>
        {runtime && (
          <span className="text-label-sm text-(--tethys-status-warning)">
            {runtime}
          </span>
        )}
        {entry.install_block_reason && (
          <span className="text-label-sm text-(--tethys-status-danger)">
            {entry.install_block_reason}
          </span>
        )}
        {entry.selection_reason && (
          <span className="text-label-sm text-(--tethys-text-muted)">
            {entry.selection_reason}
          </span>
        )}
        {entry.compliance_note && (
          <span className="mt-1 text-label-md text-(--tethys-status-warning)">
            {entry.compliance_note}
          </span>
        )}
      </div>

      {action && (
        <Button
          variant={entry.installed ? "secondary" : "primary"}
          size="sm"
          loading={busy}
          disabled={!entry.installed && entry.install_block_reason !== null}
          title={entry.install_block_reason ?? undefined}
          onClick={action.handler}
        >
          {action.label}
        </Button>
      )}
    </Card>
  );
}

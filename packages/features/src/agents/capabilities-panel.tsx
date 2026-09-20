//! MVP negotiated-capabilities panel (spec §5.2), read-only over the last
//! `initialize` snapshot. Live re-probe is V1 (spec clause 5).

import type { AgentProfileView } from "@tethys/bindings";
import { EmptyState, SchemaFieldGroup } from "@tethys/ui";

function CapabilityRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-md py-0.5">
      <span className="text-body-sm text-(--tethys-text-secondary)">
        {label}
      </span>
      <span className="font-mono text-mono-code text-(--tethys-text-primary)">
        {value}
      </span>
    </div>
  );
}

export interface CapabilitiesPanelProps {
  profile: AgentProfileView;
  className?: string;
}

export function CapabilitiesPanel({
  profile,
  className,
}: CapabilitiesPanelProps): React.ReactElement {
  const capabilities = profile.capabilities;
  if (!capabilities) {
    return (
      <div className={className} data-testid="capabilities-panel">
        <EmptyState
          title="No capabilities yet"
          description="A successful health check reports the Provider's negotiated capabilities."
        />
      </div>
    );
  }

  const transports = [
    capabilities.mcp.stdio ? "stdio" : null,
    capabilities.mcp.http ? "http" : null,
    capabilities.mcp.sse ? "sse" : null,
  ].filter(Boolean) as string[];

  return (
    <div className={className} data-testid="capabilities-panel">
      <SchemaFieldGroup label="Negotiated capabilities">
        <CapabilityRow
          label="session.resume"
          value={capabilities.resume ? "yes" : "no"}
        />
        <CapabilityRow
          label="MCP transports"
          value={transports.length > 0 ? transports.join(", ") : "none"}
        />
        <CapabilityRow
          label="elicitation"
          value={capabilities.elicitation ? "yes" : "no"}
        />
        <CapabilityRow
          label="load session"
          value={capabilities.load_session ? "yes" : "no"}
        />
        <CapabilityRow
          label="embedded context"
          value={capabilities.prompt_embedded_context ? "yes" : "no"}
        />
      </SchemaFieldGroup>
      <SchemaFieldGroup label="Last check">
        <CapabilityRow
          label="detected version"
          value={profile.detected_version ?? "—"}
        />
        <CapabilityRow
          label="latency"
          value={profile.latency_ms == null ? "—" : `${profile.latency_ms} ms`}
        />
      </SchemaFieldGroup>
    </div>
  );
}

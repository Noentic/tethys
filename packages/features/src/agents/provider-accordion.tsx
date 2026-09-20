//! `provider-accordion` (DESIGN.md): the expanded Provider body.

import type {
  AcpProtocol,
  AgentProfileView,
  LaunchSpecInput,
} from "@tethys/bindings";
import { Button, SchemaFieldGroup } from "@tethys/ui";
import { CapabilitiesPanel } from "./capabilities-panel";
import { LaunchSpecEditor } from "./launch-spec-editor";
import { StderrViewer } from "./stderr-viewer";

export interface ProviderAccordionProps {
  profile: AgentProfileView;
  stderr?: string;
  onSaveLaunchSpec?: (
    input: LaunchSpecInput,
    preferredProtocol: AcpProtocol | null,
  ) => void;
  onLogin?: () => void;
  onRestart?: () => void;
  onViewStderr?: () => void;
  className?: string;
}

export function ProviderAccordion({
  profile,
  stderr = "",
  onSaveLaunchSpec,
  onLogin,
  onRestart,
  onViewStderr,
  className,
}: ProviderAccordionProps): React.ReactElement {
  const hasLogin = profile.auth_methods.length > 0;

  return (
    <div
      data-testid="provider-accordion"
      className={`flex flex-col gap-lg rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-lg ${className ?? ""}`}
    >
      <LaunchSpecEditor profile={profile} onSave={onSaveLaunchSpec} />

      <SchemaFieldGroup label="Connection">
        <div className="flex flex-wrap items-center gap-sm">
          {hasLogin && (
            <Button variant="secondary" size="sm" onClick={onLogin}>
              Sign in
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onRestart}>
            Restart connection
          </Button>
          <Button variant="ghost" size="sm" onClick={onViewStderr}>
            View stderr
          </Button>
        </div>
      </SchemaFieldGroup>

      <CapabilitiesPanel profile={profile} />

      <SchemaFieldGroup label="stderr">
        <StderrViewer text={stderr} />
      </SchemaFieldGroup>

      {/* Reserved for SYN-11 native settings; intentionally empty in MVP. */}
      <SchemaFieldGroup label="Native config (full file)">
        <p className="text-body-sm text-(--tethys-text-muted)">
          Native settings forms arrive with SYN-11.
        </p>
      </SchemaFieldGroup>
    </div>
  );
}

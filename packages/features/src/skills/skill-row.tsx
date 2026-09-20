//! One `skill-row` (DESIGN.md `skill-row`; spec §5.3). Content-bound trust:
//! the trust control appears only for script skills (`requires_trust`), and its
//! on-state reflects the persisted `trusted` flag.

import type { SkillInfo, SkillUpdateCheck } from "@tethys/bindings";
import { Badge, Button, ToggleSwitch } from "@tethys/ui";

export interface SkillRowProps {
  skill: SkillInfo;
  updateCheck?: SkillUpdateCheck | null;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleTrust: () => void;
  onCheckUpdates?: () => void;
  onPreviewUpdate?: () => void;
  onApplyUpdate?: () => void;
}

export function SkillRow({
  skill,
  updateCheck,
  onToggleEnabled,
  onToggleTrust,
  onCheckUpdates,
  onPreviewUpdate,
  onApplyUpdate,
}: SkillRowProps) {
  const origin = skill.source.repo ?? skill.source.origin;
  return (
    <div
      data-testid={`skill-row-${skill.name}`}
      className="flex h-9 items-center justify-between gap-md border-b border-(--tethys-hairline) px-3"
    >
      <div className="flex min-w-0 items-center gap-sm">
        <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
          {skill.name}
        </span>
        <Badge variant="muted" size="sm">
          {skill.source.origin}
        </Badge>
        <span className="truncate text-label-sm text-(--tethys-text-muted)">
          {origin} · {skill.scope}
        </span>
        {updateCheck?.update_available && (
          <Badge variant="warning" size="sm">
            update available
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-md">
        {onCheckUpdates && (
          <Button size="sm" variant="ghost" onClick={onCheckUpdates}>
            Check for updates
          </Button>
        )}
        {updateCheck?.update_available && onPreviewUpdate && (
          <Button size="sm" variant="secondary" onClick={onPreviewUpdate}>
            Preview
          </Button>
        )}
        {updateCheck?.update_available && onApplyUpdate && (
          <Button size="sm" variant="primary" onClick={onApplyUpdate}>
            Apply update
          </Button>
        )}

        {skill.requires_trust && (
          <div className="flex items-center gap-sm">
            <span className="text-label-sm text-(--tethys-text-muted)">
              {skill.trusted ? "Trusted" : "Untrusted"}
            </span>
            <ToggleSwitch
              id={`trust-${skill.name}`}
              label={`Trust ${skill.name}`}
              checked={skill.trusted}
              onCheckedChange={onToggleTrust}
            />
          </div>
        )}

        <ToggleSwitch
          id={`enable-${skill.name}`}
          label={`Enable ${skill.name}`}
          checked={skill.enabled}
          onCheckedChange={onToggleEnabled}
        />
      </div>
    </div>
  );
}

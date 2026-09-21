//! `skill-detail` (pen `OpD5Q`): the right pane of the Skills two-pane. It
//! shows what the wire reports — name and path, scope and provenance badges,
//! the enabled and trust switches for a script skill, and the update actions.
//! The pen's description, `SKILL.md` body and files list have no field behind
//! them, so they are omitted rather than invented (P9).

import type { SkillInfo, SkillUpdateCheck } from "@tethys/bindings";
import { Badge, Button, EmptyState, ToggleSwitch } from "@tethys/ui";

export interface SkillDetailProps {
  skill: SkillInfo | null;
  updateCheck: SkillUpdateCheck | null;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleTrust: () => void;
  onCheckUpdates: () => void;
  onPreviewUpdate: () => void;
}

export function SkillDetail({
  skill,
  updateCheck,
  onToggleEnabled,
  onToggleTrust,
  onCheckUpdates,
  onPreviewUpdate,
}: SkillDetailProps) {
  if (!skill) {
    return (
      <div
        data-testid="skill-detail"
        className="flex h-full items-center justify-center rounded-md border border-(--tethys-hairline)"
      >
        <EmptyState
          title="Nothing selected"
          description="Pick a skill to see its provenance, trust and update state."
        />
      </div>
    );
  }

  const updateAvailable = updateCheck?.update_available === true;

  return (
    <div
      data-testid="skill-detail"
      className="flex h-full flex-col gap-lg overflow-auto rounded-md border border-(--tethys-hairline) p-lg"
    >
      <div className="flex items-start justify-between gap-sm">
        <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
          {skill.name}
        </span>
        <span
          className="ml-2 truncate font-mono text-mono-micro text-(--tethys-text-muted)"
          title={skill.path}
        >
          {skill.path}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted" size="sm">
          {skill.scope}
        </Badge>
        <Badge variant="muted" size="sm">
          {skill.source.repo ?? skill.source.origin}
        </Badge>
        {updateAvailable && (
          <Badge variant="warning" size="sm">
            update available
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-md border-t border-(--tethys-hairline) pt-lg">
        <div className="flex items-center justify-between gap-md">
          <span className="text-label-md text-(--tethys-text-primary)">
            Enabled
          </span>
          <ToggleSwitch
            label={`Enable ${skill.name}`}
            checked={skill.enabled}
            onCheckedChange={onToggleEnabled}
          />
        </div>

        {skill.requires_trust && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-md">
              <span className="text-label-md text-(--tethys-text-primary)">
                Trust scripts
              </span>
              <ToggleSwitch
                label={`Trust ${skill.name}`}
                checked={skill.trusted}
                onCheckedChange={onToggleTrust}
              />
            </div>
            <span className="text-label-sm text-(--tethys-text-muted)">
              Untrusted script skills are excluded from YOLO threads.
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-sm border-t border-(--tethys-hairline) pt-lg">
        <div className="flex flex-wrap items-center gap-sm">
          <Button size="sm" variant="secondary" onClick={onCheckUpdates}>
            Check for updates
          </Button>
          {updateAvailable && (
            <Button size="sm" variant="primary" onClick={onPreviewUpdate}>
              Preview
            </Button>
          )}
        </div>
        {updateCheck?.error && (
          <span
            role="alert"
            className="text-label-sm text-(--tethys-status-danger)"
          >
            {updateCheck.error}
          </span>
        )}
        {updateCheck && !updateCheck.update_available && !updateCheck.error && (
          <span className="text-label-sm text-(--tethys-text-muted)">
            Up to date at {updateCheck.pinned_sha ?? "the pinned revision"}.
          </span>
        )}
      </div>
    </div>
  );
}

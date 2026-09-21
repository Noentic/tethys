//! One `skill-row` (DESIGN.md `skill-row`; pen `lWM8Z`): 44px, selectable, with
//! the glyph, slug, scope, provenance and — only for script skills — the trust
//! badge. Selection drives the detail pane, so the row itself is a button.

import { FileText, ShieldCheck, ShieldOff } from "@nebutra/icons";
import type { SkillInfo } from "@tethys/bindings";
import { Badge, cn } from "@tethys/ui";

export interface SkillRowProps {
  skill: SkillInfo;
  selected: boolean;
  onSelect: () => void;
}

export function SkillRow({ skill, selected, onSelect }: SkillRowProps) {
  const provenance = skill.source.repo ?? skill.source.origin;
  return (
    <button
      type="button"
      data-testid={`skill-row-${skill.name}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "focus-ring flex h-11 w-full items-center gap-3 px-3 text-left",
        "hover:bg-(--tethys-surface-hover)",
        selected && "bg-(--tethys-surface-active)",
      )}
    >
      <FileText
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-(--tethys-text-muted)"
      />
      <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
        {skill.name}
      </span>
      <Badge variant="muted" size="sm">
        {skill.scope}
      </Badge>
      <span className="truncate text-label-sm text-(--tethys-text-muted)">
        {provenance}
      </span>
      <span className="ml-auto shrink-0">
        {skill.requires_trust &&
          (skill.trusted ? (
            <span
              data-testid={`skill-trust-${skill.name}`}
              className="flex items-center gap-1 text-label-sm text-(--tethys-status-success)"
            >
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Trusted
            </span>
          ) : (
            <span
              data-testid={`skill-trust-${skill.name}`}
              className="flex items-center gap-1 text-label-sm text-(--tethys-status-warning)"
            >
              <ShieldOff aria-hidden="true" className="h-4 w-4" />
              Needs trust
            </span>
          ))}
      </span>
    </button>
  );
}

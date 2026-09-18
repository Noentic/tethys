export function SettingsSkillsView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[var(--tethys-text-primary)]">
          Skills & Commands
        </h2>
        <p className="text-xs text-[var(--tethys-text-muted)]">
          Registered slash commands, agent skills, and prompt templates (M1.11).
        </p>
      </div>

      <div className="rounded-lg border border-[var(--tethys-hairline)] bg-[var(--tethys-surface-card)] p-4">
        <div className="text-xs text-[var(--tethys-text-muted)]">
          Skill catalogue and slash command editor will be configured here.
        </div>
      </div>
    </div>
  );
}

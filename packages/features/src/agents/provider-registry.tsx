import type { AgentRegistryEntryView } from "@tethys/bindings";
import { ProfileCard } from "./profile-card";

export function ProviderRegistry({
  entries,
  notice,
  busyEntryId,
  onInstall,
  onUseSystem,
  onUpdate,
}: {
  entries: AgentRegistryEntryView[];
  notice: string | null;
  busyEntryId: string | null;
  onInstall: (entry: AgentRegistryEntryView) => void;
  onUseSystem: (entry: AgentRegistryEntryView) => void;
  onUpdate: (entry: AgentRegistryEntryView) => void;
}): React.ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-heading-md text-(--tethys-text-primary)">
        ACP Registry
      </h2>
      {notice && (
        <p
          className="rounded-md bg-(--tethys-status-warning-soft) px-3 py-2 text-body-sm text-(--tethys-text-primary)"
          role="status"
        >
          {notice}
        </p>
      )}
      {entries.map((entry) => (
        <ProfileCard
          key={entry.id}
          entry={entry}
          busy={busyEntryId === entry.id}
          onInstall={() => onInstall(entry)}
          onUseSystem={() => onUseSystem(entry)}
          onUpdate={() => onUpdate(entry)}
        />
      ))}
    </section>
  );
}

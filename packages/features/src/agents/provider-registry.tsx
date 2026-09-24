import type { AgentRegistryEntryView } from "@tethys/bindings";
import { ProfileCard } from "./profile-card";

export function ProviderRegistry({
  entries,
}: {
  entries: AgentRegistryEntryView[];
}): React.ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-heading-md text-(--tethys-text-primary)">
        Other ACP agents
      </h2>
      <p className="text-body-sm text-(--tethys-text-muted)">
        Browse agents listed in the ACP Registry. Tethys setup becomes available
        after an integration is supported.
      </p>
      {entries.map((entry) => (
        <ProfileCard key={entry.id} entry={entry} />
      ))}
    </section>
  );
}

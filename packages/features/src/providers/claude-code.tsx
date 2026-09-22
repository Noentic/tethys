import type { GenericEntry } from "@tethys/state";
import { registerEntryRenderer, UnknownEntryRenderer } from "@tethys/ui";

interface SessionFailure {
  id?: string;
  revision?: number;
  category?: string;
  severity?: string;
  title?: string;
  details?: string;
  actions?: string[];
}

interface ProviderExtensionData {
  provider_id?: string;
  method?: string;
  params?: string;
}

function sessionFailure(entry: GenericEntry): SessionFailure | null {
  const data = entry.data as ProviderExtensionData | undefined;
  if (
    data?.provider_id !== "claude-acp" ||
    data.method !== "_meta.jetbrains.air.sessionFailure" ||
    typeof data.params !== "string"
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(data.params);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as SessionFailure)
      : null;
  } catch {
    return null;
  }
}

export function ClaudeProviderExtensionEntry({
  entry,
}: {
  entry: GenericEntry;
}) {
  const failure = sessionFailure(entry);
  if (!failure?.title) return <UnknownEntryRenderer entry={entry} />;

  const warning = failure.severity === "warning";
  return (
    <section
      data-entry-kind="provider_extension"
      data-failure-id={failure.id}
      data-failure-revision={failure.revision}
      role={warning ? "status" : "alert"}
      className={`rounded-md border border-(--tethys-hairline) border-l-2 p-md text-body-sm text-(--tethys-text-secondary) ${
        warning
          ? "border-l-(--tethys-status-warning)"
          : "border-l-(--tethys-status-danger)"
      }`}
    >
      <div className="flex items-start gap-sm">
        <span aria-hidden="true">{warning ? "⚠" : "!"}</span>
        <div className="flex-1">
          <p>{failure.title}</p>
          {failure.details && (
            <p className="mt-xs text-(--tethys-text-muted)">
              {failure.details}
            </p>
          )}
          {failure.actions && failure.actions.length > 0 && (
            <p className="mt-xs text-label-sm text-(--tethys-text-muted)">
              Suggested: {failure.actions.join(", ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** UI registration for the metadata carried by the Claude ACP adapter. */
export function registerClaudeCodeProviderUi(): void {
  registerEntryRenderer("provider_extension", ClaudeProviderExtensionEntry);
}

import type { BaseSessionEntry } from "@tethys/state";
import { cn } from "@tethys/ui";
import { useId, useState } from "react";
import { ProviderCapabilityNotice } from "./capability-notice";

export type ProviderArtifactKind = "text" | "image" | (string & {});

/** A non-diff, non-tool-output Provider artifact (DESIGN.md `provider-artifact`). */
export interface ProviderArtifact {
  title: string;
  kind: ProviderArtifactKind;
  text?: string | null;
  url?: string | null;
  alt?: string | null;
  size?: number | null;
  dimensions?: string | null;
}

export interface ProviderArtifactEntry extends BaseSessionEntry {
  kind: "provider_artifact";
  providerId: string;
  artifact: ProviderArtifact;
}

function sizeLabel(artifact: ProviderArtifact): string {
  if (artifact.dimensions) {
    return artifact.dimensions;
  }
  if (typeof artifact.size === "number") {
    return `${artifact.size} B`;
  }
  return "";
}

const KIND_GLYPH: Record<string, string> = {
  text: "¶",
  image: "▣",
};

/**
 * A Provider-emitted artifact rendered as a stage entry through
 * `registerEntryRenderer`, so it sits in the transcript where it was emitted.
 * Expanding never changes the entry's position.
 */
export function ProviderArtifactRenderer({
  entry,
  className,
}: {
  entry: ProviderArtifactEntry;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const { artifact } = entry;
  const size = sizeLabel(artifact);
  const supported = artifact.kind === "text" || artifact.kind === "image";

  return (
    <div
      data-entry-kind="provider_artifact"
      className={cn(
        "rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) p-lg",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-sm text-left"
      >
        <span aria-hidden="true">{KIND_GLYPH[artifact.kind] ?? "◆"}</span>
        <span className="flex-1 truncate text-label-md text-(--tethys-text-primary)">
          {artifact.title}
        </span>
        {size && (
          <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
            {size}
          </span>
        )}
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div id={regionId} className="mt-sm">
          {artifact.kind === "text" && (
            <pre className="overflow-x-auto rounded-sm bg-(--tethys-surface-sunken) p-sm font-mono text-mono-code text-(--tethys-text-on-sunken-secondary)">
              {artifact.text ?? ""}
            </pre>
          )}
          {artifact.kind === "image" && (
            <img
              src={artifact.url ?? ""}
              alt={artifact.alt ?? artifact.title}
              className="max-w-[stage-measure] rounded-sm"
            />
          )}
          {!supported && (
            <ProviderCapabilityNotice
              provider={entry.providerId}
              capability={`render ${artifact.kind} artifacts`}
            />
          )}
        </div>
      )}
    </div>
  );
}

import type { TurnMessageEntry } from "@tethys/state";
import { cn } from "@tethys/ui";
import { useId, useState } from "react";
import { useRenderedMarkdown } from "./turn-message";

/**
 * A collapsible thought block. Collapsed by default so a streaming turn does
 * not push the transcript around; the user's toggle wins over streaming.
 */
export function ThoughtBlockRenderer({
  entry,
  className,
}: {
  entry: TurnMessageEntry;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const html = useRenderedMarkdown(expanded ? entry.content : "");
  const preview = entry.content.replace(/\s+/g, " ").trim().slice(0, 80);

  return (
    <div
      data-entry-kind="thought_block"
      className={cn(
        "rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-panel)",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-sm px-md py-sm text-left text-label-sm text-(--tethys-text-muted) transition-colors hover:text-(--tethys-text-secondary)"
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span>{expanded ? "Thought" : `Thought · ${preview}`}</span>
      </button>
      {expanded && (
        <div
          id={regionId}
          className="border-t border-(--tethys-hairline) px-md py-sm text-body-sm text-(--tethys-text-secondary)"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by @tethys/markdown
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

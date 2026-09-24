import type { TurnMessageEntry } from "@tethys/state";
import { cn } from "@tethys/ui";
import { useEffect, useId, useRef, useState } from "react";
import { formatElapsed, useNow } from "../use-now";
import { DisclosureChevron } from "./tool-kind-icon";
import { useRenderedMarkdown } from "./turn-message";

/**
 * The agent's reasoning (DESIGN.md `thought-block`). While it streams, a
 * shimmering `Thinking… 4s` heads a short window that follows the newest
 * reasoning behind a soft fade; once the agent moves on it folds to
 * `Thought for 14s`, one click from the full text. Opening or closing is the
 * user's: after they toggle it, streaming never changes it back.
 */
export function ThoughtBlockRenderer({
  entry,
  className,
}: {
  entry: TurnMessageEntry;
  className?: string;
}) {
  const streaming = Boolean(entry.streaming);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const expanded = userOpen ?? streaming;
  const regionId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const html = useRenderedMarkdown(entry.content);
  const now = useNow(streaming);
  // A thought recorded before its end was tracked has no duration to show.
  const elapsed = streaming
    ? now - entry.timestamp
    : entry.endedAt !== undefined
      ? entry.endedAt - entry.timestamp
      : null;

  // Follow the newest reasoning while it streams, unless the user opened the
  // block to read it: then the viewport is theirs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `html` is the trigger — each new chunk re-pins the viewport
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && streaming && userOpen === null) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [html, streaming, userOpen]);

  return (
    <div
      data-entry-kind="thought_block"
      className={cn("flex flex-col motion-safe:animate-fade-in", className)}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setUserOpen(!expanded)}
        className="focus-ring flex min-h-7 items-center gap-1.5 self-start rounded-sm pr-1 text-left text-label-md text-(--tethys-text-muted) transition-colors hover:text-(--tethys-text-secondary)"
      >
        {streaming ? (
          <span className="text-shimmer motion-safe:animate-shimmer motion-loop">
            Thinking…
          </span>
        ) : (
          <span>
            <span className="text-(--tethys-text-secondary)">Thought</span>
            {elapsed !== null && ` for ${formatElapsed(elapsed)}`}
          </span>
        )}
        {streaming && elapsed !== null && (
          <span className="font-mono text-mono-micro tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        )}
        <DisclosureChevron expanded={expanded} className="shrink-0" />
      </button>
      <div
        id={regionId}
        aria-hidden={!expanded}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          expanded
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            ref={viewportRef}
            aria-busy={streaming || undefined}
            className={cn(
              "markdown-content mt-1 overflow-y-auto border-l-2 border-(--tethys-hairline-strong) pl-md text-body-sm text-(--tethys-text-muted)",
              streaming && userOpen === null
                ? "max-h-44 [mask-image:linear-gradient(to_bottom,transparent,black_24px,black)]"
                : "max-h-80",
            )}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by @tethys/markdown
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

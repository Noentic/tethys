import type { TurnMessageEntry } from "@tethys/state";
import { cn, IconButton, Tooltip } from "@tethys/ui";
import { useState } from "react";

/**
 * The in-flow message toolbar (DESIGN.md `message-actions`): `Copy` on any
 * message, `Fork from here` where fork is allowed, `Retry` on the last agent
 * message only. Hidden entirely while the message is still streaming.
 */
export function MessageActions({
  entry,
  canFork,
  forkTooltip,
  showRetry,
  onCopy,
  onFork,
  onRetry,
  className,
}: {
  entry: TurnMessageEntry;
  canFork?: boolean;
  forkTooltip?: string;
  showRetry?: boolean;
  onCopy?: (text: string) => void;
  onFork?: () => void;
  onRetry?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (entry.streaming) {
    return null;
  }

  const copy = () => {
    onCopy?.(entry.content);
    try {
      void globalThis.navigator?.clipboard?.writeText(entry.content);
    } catch {
      // Clipboard unavailable (jsdom, insecure context): the callback still ran.
    }
    setCopied(true);
  };

  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className={cn(
        "flex h-7 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
        className,
      )}
    >
      <IconButton
        size="compact"
        label={copied ? "Copied" : "Copy"}
        onClick={copy}
      >
        ⧉
      </IconButton>
      {canFork && (
        <Tooltip content={forkTooltip ?? "Fork from here"}>
          <IconButton size="compact" label="Fork from here" onClick={onFork}>
            ⑂
          </IconButton>
        </Tooltip>
      )}
      {showRetry && (
        <IconButton size="compact" label="Retry" onClick={onRetry}>
          ↻
        </IconButton>
      )}
    </div>
  );
}

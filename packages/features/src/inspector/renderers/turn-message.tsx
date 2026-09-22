import type { ContentBlock } from "@tethys/bindings";
import { createMarkdownRenderer, directTransport } from "@tethys/markdown";
import type { TurnMessageEntry } from "@tethys/state";
import { cn } from "@tethys/ui";
import { useEffect, useState } from "react";
import { AttachmentChip } from "./attachment-chip";
import { MessageActions } from "./message-actions";

/**
 * One renderer for the whole feature package. The production transport is
 * `createWorkerTransport()`; the direct transport keeps tests deterministic
 * (D9). The swap point is this singleton.
 */
export const markdownRenderer = createMarkdownRenderer({
  transport: directTransport,
});

/** Renders streamed markdown into sanitized HTML, re-rendering as it grows. */
export function useRenderedMarkdown(source: string): string {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let cancelled = false;
    markdownRenderer.render("entry", source).then((value) => {
      if (!cancelled) {
        setHtml(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
  return html;
}

/** Delegated code-block controls (`Copy`, `Show all`) for sanitized HTML. */
export function handleCodeBlockClick(
  event: React.MouseEvent<HTMLElement>,
): void {
  const target = event.target as HTMLElement;
  const copyButton = target.closest("[data-copy-code]");
  if (copyButton) {
    const block = copyButton.closest("[data-code-block]");
    const code = block?.querySelector("code")?.textContent ?? "";
    try {
      void globalThis.navigator?.clipboard?.writeText(code);
    } catch {
      // Clipboard unavailable (jsdom, insecure context): the label still flips.
    }
    copyButton.textContent = "Copied";
    return;
  }
  const showAll = target.closest("[data-show-all]");
  if (showAll) {
    const block = showAll.closest("[data-code-block]") as HTMLElement | null;
    if (block) {
      block.dataset.expanded = "true";
    }
    showAll.remove();
  }
}

/** A stable key for an attachment block, without an array index. */
function attachmentKey(block: ContentBlock): string {
  if ("ResourceLink" in block && block.ResourceLink) {
    return block.ResourceLink.uri;
  }
  if ("Image" in block && block.Image) {
    return `img:${block.Image.data.slice(0, 24)}`;
  }
  if ("Audio" in block && block.Audio) {
    return `audio:${block.Audio.data.slice(0, 24)}`;
  }
  if ("Resource" in block && block.Resource) {
    return `resource:${block.Resource.uri}`;
  }
  if ("TextWithMetadata" in block && block.TextWithMetadata) {
    return `text:${block.TextWithMetadata.text.slice(0, 24)}`;
  }
  if ("Text" in block && typeof block.Text === "string") {
    return `text:${block.Text.slice(0, 24)}`;
  }
  return `unknown:${(block as { Unknown?: string }).Unknown?.slice(0, 24) ?? ""}`;
}

export function TurnMessageRenderer({
  entry,
  className,
  canFork,
  showRetry,
  onCopy,
  onFork,
  onRetry,
}: {
  entry: TurnMessageEntry;
  className?: string;
  canFork?: boolean;
  showRetry?: boolean;
  onCopy?: (text: string) => void;
  onFork?: () => void;
  onRetry?: () => void;
}) {
  const html = useRenderedMarkdown(entry.content);
  const isUser = entry.role === "User";
  const isThought = entry.role === "Thought";
  const attachments = entry.attachments ?? [];

  return (
    <div
      data-entry-kind="turn_message"
      data-role={entry.role}
      className={cn(
        "group relative w-full text-body-md text-(--tethys-text-primary)",
        isUser &&
          "ml-auto max-w-[540px] rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-lg py-md",
        isThought && "text-(--tethys-text-muted)",
        className,
      )}
    >
      <div className={cn("relative", isUser && "pr-10")}>
        <div
          className={cn(
            "absolute right-sm",
            isUser ? "top-1/2 -translate-y-1/2" : "top-0",
          )}
        >
          <MessageActions
            entry={entry}
            canFork={canFork}
            showRetry={showRetry}
            onCopy={onCopy}
            onFork={onFork}
            onRetry={onRetry}
          />
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: delegated controls live inside sanitized HTML */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the injected Copy/Show-all controls are real buttons with keyboard handling */}
        <div
          onClick={handleCodeBlockClick}
          aria-busy={entry.streaming || undefined}
          className="markdown-content"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by @tethys/markdown
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      {attachments.length > 0 && (
        <div className="mt-sm flex flex-wrap gap-sm">
          {attachments.map((block) => (
            <AttachmentChip key={attachmentKey(block)} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}

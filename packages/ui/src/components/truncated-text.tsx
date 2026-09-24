import { cn } from "../lib/utils";

export interface TruncatedTextProps {
  text: string;
  /**
   * `end` clips the tail. `path` keeps the last segment whole and clips the
   * directories in front of it, so `…/nebeng-api/README.md` stays recognisable.
   */
  mode?: "end" | "path";
  className?: string;
}

/**
 * A single-line label that never overflows its row: it clips with an ellipsis
 * and carries the full value as its native tooltip (DESIGN.md `truncated-text`).
 * It needs a flex or grid parent that lets it shrink, which `min-w-0` asks for.
 */
export function TruncatedText({
  text,
  mode = "end",
  className,
}: TruncatedTextProps) {
  if (mode === "path") {
    const cut = text.lastIndexOf("/", text.length - 2);
    if (cut > 0) {
      return (
        <span title={text} className={cn("flex min-w-0", className)}>
          <span className="min-w-0 truncate">{text.slice(0, cut + 1)}</span>
          <span className="shrink-0">{text.slice(cut + 1)}</span>
        </span>
      );
    }
  }
  return (
    <span title={text} className={cn("block min-w-0 truncate", className)}>
      {text}
    </span>
  );
}

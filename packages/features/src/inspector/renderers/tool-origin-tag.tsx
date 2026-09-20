import type { ToolOrigin } from "@tethys/bindings";
import { cn } from "@tethys/ui";

const MAX_NAME = 16;

function truncate(name: string): string {
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME)}…` : name;
}

/**
 * Says where a tool call came from when ACP alone cannot (DESIGN.md
 * `tool-origin-tag`). A built-in call carries no tag — origin is never guessed
 * from the title in the webview.
 */
export function ToolOriginTag({
  origin,
  depth,
  className,
}: {
  origin?: ToolOrigin | null;
  depth?: number;
  className?: string;
}) {
  if (!origin || origin.kind === "builtin") {
    return null;
  }

  let text: string;
  let aria: string;
  let full: string;
  if (origin.kind === "mcp") {
    text = `mcp · ${truncate(origin.server)}`;
    aria = `From MCP server ${origin.server}`;
    full = origin.server;
  } else if (origin.kind === "skill") {
    text = `skill · ${truncate(origin.name)}`;
    aria = `Skill ${origin.name}`;
    full = origin.name;
  } else {
    text = "subagent";
    aria = "From subagent";
    full = "subagent";
  }

  return (
    <span
      data-testid="tool-origin-tag"
      role="img"
      aria-label={aria}
      title={full}
      className={cn(
        "rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 font-mono text-mono-micro text-(--tethys-text-muted)",
        className,
      )}
    >
      {text}
      {depth && depth > 1 ? ` · depth ${depth}` : ""}
    </span>
  );
}

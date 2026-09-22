import type { FileWriteEntry, ToolCallEntry } from "@tethys/state";
import { cn } from "@tethys/ui";

type DiffLineKind = "context" | "added" | "removed" | "meta";

interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

export interface InlineDiff {
  path: string | null;
  lines: DiffLine[];
}

function linesOf(value: string): string[] {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function textDiff(
  path: string | null,
  before: string | null,
  after: string,
): InlineDiff | null {
  if (before !== null && before === after) {
    return null;
  }

  if (before === null) {
    return {
      path,
      lines: linesOf(after).map((text) => ({ kind: "added", text })),
    };
  }

  const oldLines = linesOf(before);
  const newLines = linesOf(after);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] ===
      newLines[newLines.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const contextBefore = oldLines.slice(Math.max(0, prefix - 2), prefix);
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const contextAfter = newLines.slice(
    newLines.length - suffix,
    Math.min(newLines.length, newLines.length - suffix + 2),
  );

  return {
    path,
    lines: [
      ...contextBefore.map((text) => ({ kind: "context" as const, text })),
      ...removed.map((text) => ({ kind: "removed" as const, text })),
      ...added.map((text) => ({ kind: "added" as const, text })),
      ...contextAfter.map((text) => ({ kind: "context" as const, text })),
    ],
  };
}

function parsedInput(input: string | null | undefined): {
  path: string | null;
  before: string;
  after: string;
} | null {
  if (!input) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(input);
    if (!value || typeof value !== "object") {
      return null;
    }
    const record = value as Record<string, unknown>;
    const before = record.old_string ?? record.oldText ?? record.before;
    const after = record.new_string ?? record.newText ?? record.after;
    if (typeof before !== "string" || typeof after !== "string") {
      return null;
    }
    const path = record.file_path ?? record.path;
    return {
      path: typeof path === "string" ? path : null,
      before,
      after,
    };
  } catch {
    return null;
  }
}

function outputDiff(entry: ToolCallEntry): InlineDiff | null {
  const output = entry.output?.trim();
  if (!output || !/(^|\n)(diff --git |--- |\+\+\+ |@@ )/.test(output)) {
    return null;
  }
  return {
    path: entry.locations[0]?.path ?? null,
    lines: output.split("\n").map((text) => ({
      kind:
        text.startsWith("+") && !text.startsWith("+++")
          ? "added"
          : text.startsWith("-") && !text.startsWith("---")
            ? "removed"
            : text.startsWith("@@") ||
                text.startsWith("diff --git") ||
                text.startsWith("---") ||
                text.startsWith("+++")
              ? "meta"
              : "context",
      text,
    })),
  };
}

export function diffForTool(entry: ToolCallEntry): InlineDiff | null {
  if (
    entry.toolKind !== "edit" &&
    entry.toolKind !== "delete" &&
    entry.toolKind !== "move"
  ) {
    return null;
  }
  const parsed = parsedInput(entry.input);
  if (parsed) {
    return textDiff(
      parsed.path ?? entry.locations[0]?.path ?? null,
      parsed.before,
      parsed.after,
    );
  }
  return outputDiff(entry);
}

export function diffForFileWrite(entry: FileWriteEntry): InlineDiff | null {
  return textDiff(entry.path, entry.before, entry.after);
}

export function InlineFileDiff({
  diff,
  className,
  showPath = true,
}: {
  diff: InlineDiff | null;
  className?: string;
  showPath?: boolean;
}) {
  if (!diff) {
    return null;
  }

  const seen = new Map<string, number>();
  const keyedLines = diff.lines.map((line) => {
    const base = `${line.kind}:${line.text}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { ...line, key: `${base}:${occurrence}` };
  });

  return (
    <div
      data-testid="file-diff"
      className={cn(
        "overflow-hidden rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-sunken)",
        className,
      )}
    >
      {showPath && diff.path && (
        <div className="border-b border-(--tethys-hairline) px-sm py-1 font-mono text-mono-micro text-(--tethys-text-muted)">
          {diff.path}
        </div>
      )}
      <div className="max-h-72 overflow-auto p-sm font-mono text-mono-code leading-relaxed">
        {keyedLines.map((line) => (
          <div
            key={line.key}
            className={cn(
              "whitespace-pre-wrap break-words px-1",
              line.kind === "added" &&
                "bg-(--tethys-diff-added)/16 text-(--tethys-diff-added)",
              line.kind === "removed" &&
                "bg-(--tethys-diff-removed)/16 text-(--tethys-diff-removed)",
              line.kind === "meta" && "text-(--tethys-text-muted)",
              line.kind === "context" &&
                "text-(--tethys-text-on-sunken-secondary)",
            )}
          >
            <span aria-hidden="true">
              {line.kind === "added"
                ? "+"
                : line.kind === "removed"
                  ? "-"
                  : line.kind === "meta"
                    ? " "
                    : " "}
            </span>{" "}
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

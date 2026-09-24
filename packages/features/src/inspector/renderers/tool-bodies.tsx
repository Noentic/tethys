//! The body of a tool-call card, one shape per kind of work (DESIGN.md
//! `tool-accordion.content`, P20): a file edit is its diff, a shell command is
//! the command and the tail of what it printed, a read or search is its
//! result, and anything else (an MCP tool, a Provider's own tool) is its
//! arguments and result as formatted data. The raw payload stays one
//! disclosure away on every card, never the default view.

import type { DiffFileDetail } from "@tethys/bindings";
import { FileDiffCard } from "@tethys/diff";
import type { ToolCallEntry } from "@tethys/state";
import { cn } from "@tethys/ui";
import type React from "react";
import { useState } from "react";
import {
  prettyPayload,
  toolCommand,
  toolExitCode,
  toolOutputText,
} from "../tool-view";

/** Lines of output shown before `Show all`. */
const TAIL_LINES = 12;

const WELL_CLASS =
  "overflow-x-auto rounded-sm border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) font-mono text-mono-code text-(--tethys-text-on-sunken-secondary)";

/**
 * Output in a sunken well. A long output shows its last lines — where a
 * command's result and errors are — and the whole text on request.
 */
export function OutputWell({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const lines = text.replace(/\n+$/, "").split("\n");
  const hidden = all ? 0 : Math.max(0, lines.length - TAIL_LINES);
  if (text.trim().length === 0) return null;
  return (
    <section aria-label={label} className={cn("flex flex-col", className)}>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="focus-ring self-start rounded-xs px-1 pb-1 text-label-sm text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
        >
          Show all {lines.length} lines
        </button>
      )}
      <pre className={cn(WELL_CLASS, "max-h-80 overflow-y-auto px-sm py-1.5")}>
        {lines.slice(hidden).join("\n")}
      </pre>
    </section>
  );
}

function EditBody({
  entry,
  diffs,
  onOpenChanges,
}: {
  entry: ToolCallEntry;
  diffs: DiffFileDetail[];
  onOpenChanges?: () => void;
}) {
  if (diffs.length === 0) {
    return <OutputWell text={toolOutputText(entry)} label="Tool output" />;
  }
  return (
    <div className="flex flex-col gap-sm">
      {diffs.map((detail) => (
        <FileDiffCard
          key={detail.path}
          detail={detail}
          onOpen={onOpenChanges}
        />
      ))}
    </div>
  );
}

function ShellBody({ entry }: { entry: ToolCallEntry }) {
  const command = toolCommand(entry);
  const exitCode = toolExitCode(entry);
  const output = toolOutputText(entry);
  return (
    <div className="flex flex-col gap-1.5">
      {command && (
        <div className={cn(WELL_CLASS, "flex items-start gap-sm px-sm py-1.5")}>
          <span
            aria-hidden="true"
            className="shrink-0 select-none text-(--tethys-text-on-sunken-muted)"
          >
            $
          </span>
          <code className="min-w-0 flex-1 break-all whitespace-pre-wrap text-(--tethys-text-on-sunken)">
            {command}
          </code>
          {exitCode !== null && (
            <span
              className={cn(
                "shrink-0 font-mono text-mono-micro",
                exitCode === 0
                  ? "text-(--tethys-text-on-sunken-muted)"
                  : "text-(--tethys-status-danger)",
              )}
            >
              exit {exitCode}
            </span>
          )}
        </div>
      )}
      <OutputWell text={output} label="Command output" />
    </div>
  );
}

function PayloadBody({ entry }: { entry: ToolCallEntry }) {
  const input = prettyPayload(entry.input);
  const output = prettyPayload(entry.output);
  return (
    <div className="flex flex-col gap-sm">
      {input && (
        <section className="flex flex-col gap-1">
          <h4 className="text-label-sm text-(--tethys-text-muted)">
            Arguments
          </h4>
          <pre
            className={cn(WELL_CLASS, "max-h-56 overflow-y-auto px-sm py-1.5")}
          >
            {input}
          </pre>
        </section>
      )}
      {output && (
        <section className="flex flex-col gap-1">
          <h4 className="text-label-sm text-(--tethys-text-muted)">Result</h4>
          <OutputWell text={output} label="Tool result" />
        </section>
      )}
    </div>
  );
}

/** The payload as the Provider sent it, for when the formatted view is not enough. */
export function RawPayload({ entry }: { entry: ToolCallEntry }) {
  if (!entry.input && !entry.output && !entry.metadata) return null;
  return (
    <details className="group rounded-sm border border-(--tethys-hairline) px-sm py-1">
      <summary className="cursor-pointer text-label-sm text-(--tethys-text-muted) select-none hover:text-(--tethys-text-primary)">
        Raw
      </summary>
      <div className="mt-1 flex flex-col gap-1">
        {entry.input && (
          <pre className="max-h-48 overflow-auto font-mono text-mono-micro whitespace-pre-wrap break-all text-(--tethys-text-muted)">
            {prettyPayload(entry.input)}
          </pre>
        )}
        {entry.output && (
          <pre className="max-h-48 overflow-auto font-mono text-mono-micro whitespace-pre-wrap break-all text-(--tethys-text-muted)">
            {prettyPayload(entry.output)}
          </pre>
        )}
        {entry.metadata && (
          <pre className="max-h-48 overflow-auto font-mono text-mono-micro whitespace-pre-wrap break-all text-(--tethys-text-muted)">
            {prettyPayload(entry.metadata)}
          </pre>
        )}
      </div>
    </details>
  );
}

/** Whether a call's body shows its payload itself, so `Raw` would repeat it. */
function showsPayload(entry: ToolCallEntry): boolean {
  return ![
    "read",
    "edit",
    "delete",
    "move",
    "search",
    "execute",
    "fetch",
  ].includes(entry.toolKind ?? "");
}

export function ToolBody({
  entry,
  diffs,
  onOpenChanges,
}: {
  entry: ToolCallEntry;
  /** The call's file changes (`toolDiffs`), read once by the card. */
  diffs: DiffFileDetail[];
  onOpenChanges?: () => void;
}) {
  let body: React.ReactNode;
  switch (entry.toolKind) {
    case "edit":
    case "delete":
    case "move":
      body = (
        <EditBody entry={entry} diffs={diffs} onOpenChanges={onOpenChanges} />
      );
      break;
    case "execute":
      body = <ShellBody entry={entry} />;
      break;
    case "read":
    case "search":
    case "fetch":
      body = <OutputWell text={toolOutputText(entry)} label="Tool output" />;
      break;
    default:
      body = <PayloadBody entry={entry} />;
  }
  return (
    <div className="flex flex-col gap-sm">
      {body}
      {!showsPayload(entry) && <RawPayload entry={entry} />}
    </div>
  );
}

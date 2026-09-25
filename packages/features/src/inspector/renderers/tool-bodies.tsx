//! The bodies a tool-call card can show (DESIGN.md `tool-accordion.content`,
//! P20): a file edit is its diff, a shell command is the command and the tail
//! of what it printed, an MCP call is its arguments and result, and anything
//! else is its payload as formatted data. `tool-surfaces.tsx` picks one per
//! surface; the raw payload stays one disclosure away, never the default view.

import type { DiffFileDetail } from "@tethys/bindings";
import { FileDiffCard } from "@tethys/diff";
import type { ToolCallEntry } from "@tethys/state";
import { cn, TruncatedText } from "@tethys/ui";
import { useState } from "react";
import {
  prettyPayload,
  toolArguments,
  toolCommand,
  toolExitCode,
  toolOutputText,
  toolQuestions,
  toolTodos,
} from "../tool-view";
import { TaskList } from "./plan-panel";

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

export function EditBody({
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

export function ShellBody({ entry }: { entry: ToolCallEntry }) {
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

export function PayloadBody({ entry }: { entry: ToolCallEntry }) {
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
    <details className="group">
      <summary className="focus-ring w-fit cursor-pointer rounded-xs text-label-sm text-(--tethys-text-muted) select-none hover:text-(--tethys-text-primary)">
        Raw
      </summary>
      <div className="mt-1 flex flex-col gap-1">
        {[entry.input, entry.output, entry.metadata]
          .filter((payload): payload is string => Boolean(payload))
          .map((payload, index) => (
            <pre
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots
              key={index}
              className={cn(
                WELL_CLASS,
                "max-h-48 overflow-auto px-sm py-1.5 text-mono-micro whitespace-pre-wrap break-all",
              )}
            >
              {prettyPayload(payload)}
            </pre>
          ))}
      </div>
    </details>
  );
}

/** The call's result text in a well; a search lists the files it matched. */
export function OutputBody({
  entry,
  onOpenLocation,
}: {
  entry: ToolCallEntry;
  onOpenLocation?: (path: string, line: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-sm">
      {entry.locations.length > 1 && (
        <ul aria-label="Matched files" className="flex flex-col">
          {entry.locations.map((location) => (
            <li key={`${location.path}:${location.line ?? ""}`}>
              <button
                type="button"
                onClick={() => onOpenLocation?.(location.path, location.line)}
                className="focus-ring flex max-w-full rounded-xs px-1 font-mono text-mono-micro text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
              >
                <TruncatedText
                  mode="path"
                  text={
                    location.line === null
                      ? location.path
                      : `${location.path}:${location.line}`
                  }
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <OutputWell text={toolOutputText(entry)} label="Tool output" />
    </div>
  );
}

/** An MCP call: its arguments as named values, then what the server returned. */
export function McpBody({ entry }: { entry: ToolCallEntry }) {
  const args = toolArguments(entry);
  return (
    <div className="flex flex-col gap-sm">
      {args.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-md gap-y-0.5 text-body-sm">
          {args.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-(--tethys-text-muted)">{name}</dt>
              <dd className="min-w-0 truncate font-mono text-mono-code text-(--tethys-text-secondary)">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <OutputWell text={toolOutputText(entry)} label="Tool result" />
    </div>
  );
}

/**
 * A question tool's record when the Provider did not ask it through a form:
 * what it asked and the answer it got back, read-only.
 */
export function QuestionBody({ entry }: { entry: ToolCallEntry }) {
  const questions = toolQuestions(entry);
  const answer = toolOutputText(entry).trim();
  return (
    <div className="flex flex-col gap-1 text-body-sm">
      {questions.map((question) => (
        <p key={question} className="text-(--tethys-text-primary)">
          {question}
        </p>
      ))}
      {answer && <p className="text-(--tethys-text-secondary)">→ {answer}</p>}
    </div>
  );
}

/** A todo write whose Provider sent no plan: the list it wrote. */
export function TodoBody({ entry }: { entry: ToolCallEntry }) {
  const steps = toolTodos(entry);
  return steps.length > 0 ? (
    <TaskList steps={steps} />
  ) : (
    <PayloadBody entry={entry} />
  );
}

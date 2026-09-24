import { Pencil, ShieldCheck, Terminal } from "@nebutra/icons";
import { FileDiffCard } from "@tethys/diff";
import type {
  PermissionRequestEntry,
  PermissionRequestItem,
  SessionEntry,
  ToolCallEntry,
} from "@tethys/state";
import { Button, cn, StatusDot } from "@tethys/ui";
import type React from "react";
import { useMemo, useState } from "react";
import { useInspectorClient } from "../client-context";
import { toolDiffs, toolPath } from "../inspector/tool-view";
import { useSessionState } from "../inspector/use-session-state";

const FILE_KINDS = ["edit", "delete", "move"];

/**
 * The edit a file permission asks about. ACP's request names the file but not
 * its tool call, so the card reads the call that is waiting on this file.
 * Nothing is shown when no waiting call matches: a guessed diff would be worse
 * than none.
 */
export function pendingEditFor(
  request: PermissionRequestItem,
  entries: SessionEntry[],
): ToolCallEntry | null {
  const path = request.subject?.File?.path;
  if (!path) return null;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind !== "tool_call") continue;
    const call = entry as ToolCallEntry;
    if (
      call.status !== "Pending" ||
      !FILE_KINDS.includes(call.toolKind ?? "")
    ) {
      continue;
    }
    const callPath = toolPath(call);
    if (callPath === path || (callPath && path.endsWith(`/${callPath}`))) {
      return call;
    }
  }
  return null;
}

function rejects(kind: string | null | undefined): boolean {
  return kind?.startsWith("reject") ?? false;
}

/** Button variant per ACP option kind: allow once leads, a reject reads as a
 * quiet destructive, anything else is secondary. */
export function optionVariant(
  kind: string | null | undefined,
): "primary" | "secondary" | "destructive" {
  if (kind === "allow_once") return "primary";
  if (rejects(kind)) return "destructive";
  return "secondary";
}

/** What the request touches: an icon for its tile, and the file or command. */
function requestSubject(request: PermissionRequestItem): {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  detail: string | null;
} {
  const subject = request.subject;
  if (subject?.File) return { Icon: Pencil, detail: subject.File.path };
  if (subject?.Command) {
    return { Icon: Terminal, detail: subject.Command.command };
  }
  if (/^(edit|write|create|delete|move)\b/i.test(request.title)) {
    return { Icon: Pencil, detail: null };
  }
  if (/^(run|bash|exec)/i.test(request.title)) {
    return { Icon: Terminal, detail: null };
  }
  return { Icon: ShieldCheck, detail: null };
}

function defaultsToNo(metadata?: string | null): boolean {
  if (!metadata) return false;
  try {
    const value: unknown = JSON.parse(metadata);
    return (
      typeof value === "object" &&
      value !== null &&
      "defaultToNo" in value &&
      (value as { defaultToNo: unknown }).defaultToNo === true
    );
  } catch {
    return false;
  }
}

/** The diff a file permission would allow, when its waiting call has one. */
function PendingEditPreview({ request }: { request: PermissionRequestItem }) {
  const context = useInspectorClient();
  const session = useSessionState(context?.threadId ?? "");
  const diffs = useMemo(() => {
    const call = pendingEditFor(request, session.entries);
    return call ? toolDiffs(call) : [];
  }, [request, session.entries]);
  if (diffs.length === 0) return null;
  return (
    <div className="flex flex-col gap-sm">
      {diffs.map((detail) => (
        <FileDiffCard key={detail.path} detail={detail} />
      ))}
    </div>
  );
}

/**
 * The inline permission card (PRM-01..04). Renders the Provider's own
 * `options` array in the Provider's order — never a hardcoded approve/reject
 * pair — and is never focus-trapped (DESIGN a11y).
 */
export function PermissionRequestCard({
  entry,
  className,
  compact = false,
}: {
  entry: PermissionRequestEntry;
  className?: string;
  compact?: boolean;
}) {
  const context = useInspectorClient();
  const { request } = entry;
  const resolution = request.resolution;
  const [pendingOption, setPendingOption] = useState<string | null>(null);

  const respond = async (optionId: string) => {
    if (!context) {
      return;
    }
    setPendingOption(optionId);
    try {
      await context.client.permission.respond(
        context.threadId,
        request.reqId,
        optionId,
      );
    } finally {
      setPendingOption(null);
    }
  };

  if (resolution) {
    const chosen = request.options.find(
      (option) => option.option_id === resolution.optionId,
    );
    const label = chosen?.name ?? resolution.outcome;
    const command = request.subject?.Command?.command ?? null;
    if (compact) {
      return (
        <div
          data-entry-kind="permission_request"
          data-resolved="true"
          className="flex items-center gap-sm text-label-sm text-(--tethys-text-muted)"
        >
          <StatusDot
            status={resolution.autoPicked ? "healthy" : "idle"}
            inline
          />
          <span>
            {label === "Allow once" ? "Allowed once" : label}
            {command ? ` · ${command}` : ""}
          </span>
        </div>
      );
    }
    return (
      <section
        data-entry-kind="permission_request"
        data-resolved="true"
        aria-label={`Resolved permission: ${request.title}`}
        className={cn(
          "rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md",
          className,
        )}
      >
        <header className="flex items-center gap-sm">
          <StatusDot
            status={resolution.autoPicked ? "healthy" : "idle"}
            inline
          />
          <h3 className="text-label-md text-(--tethys-text-secondary)">
            {request.title}
          </h3>
        </header>
        <p className="mt-1 text-body-sm text-(--tethys-text-muted)">
          {resolution.autoPicked
            ? `Auto-approved by policy: ${label}`
            : `Resolved: ${label}`}
        </p>
      </section>
    );
  }

  if (compact) {
    return (
      <div
        data-entry-kind="permission_request"
        data-pending="true"
        className="flex items-center gap-sm text-label-sm text-(--tethys-status-warning)"
      >
        <StatusDot status="awaiting_approval" inline />
        <span>Waiting for you ↓</span>
      </div>
    );
  }

  const { Icon, detail } = requestSubject(request);
  const isCommand = Boolean(request.subject?.Command);

  return (
    <section
      data-entry-kind="permission_request"
      data-pending="true"
      aria-label={`Permission requested: ${request.title}`}
      onKeyDown={(event) => {
        const index = Number.parseInt(event.key, 10);
        if (Number.isNaN(index) || index < 1 || index > 9) return;
        const option = request.options[index - 1];
        if (option) {
          event.preventDefault();
          void respond(option.option_id);
        }
      }}
      className={cn(
        "edge-lit flex flex-col gap-md rounded-lg border border-(--tethys-hairline) border-l-2 border-l-(--tethys-status-warning) bg-(--tethys-surface-nested) p-md",
        className,
      )}
    >
      <header className="flex min-w-0 items-start gap-md">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-(--tethys-status-warning-soft) text-(--tethys-status-warning)"
        >
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-label-md text-(--tethys-text-primary)">
            {request.title}
          </h3>
          {detail &&
            (isCommand ? (
              <code className="flex max-h-32 items-start gap-sm overflow-auto rounded-sm border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) px-sm py-1.5 font-mono text-mono-code whitespace-pre-wrap break-all text-(--tethys-text-on-sunken)">
                <span
                  aria-hidden="true"
                  className="select-none text-(--tethys-text-on-sunken-muted)"
                >
                  $
                </span>
                {detail}
              </code>
            ) : (
              <code
                title={detail}
                className="max-w-full self-start truncate rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 font-mono text-mono-micro text-(--tethys-text-secondary)"
              >
                {detail}
              </code>
            ))}
          {request.description && (
            <p className="text-body-sm text-(--tethys-text-secondary)">
              {request.description}
            </p>
          )}
          {defaultsToNo(request.metadata) && (
            <p className="text-label-sm text-(--tethys-text-muted)">
              Claude recommends denying this request by default.
            </p>
          )}
        </div>
      </header>
      <PendingEditPreview request={request} />
      <div className="flex flex-wrap gap-sm">
        {request.options.map((option, index) => (
          <div
            key={option.option_id}
            className="flex max-w-full flex-col gap-1"
          >
            <Button
              size="sm"
              variant={optionVariant(option.kind)}
              aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
              aria-describedby={
                option.description
                  ? `permission-option-${option.option_id}`
                  : undefined
              }
              disabled={pendingOption !== null}
              onClick={() => respond(option.option_id)}
            >
              {option.name}
              {index < 9 && (
                <span
                  aria-hidden="true"
                  className="ml-1 rounded-xs border border-current/25 px-1 font-mono text-mono-micro opacity-70"
                >
                  {index + 1}
                </span>
              )}
            </Button>
            {option.description && (
              <span
                id={`permission-option-${option.option_id}`}
                className="max-w-64 text-body-sm text-(--tethys-text-muted)"
              >
                {option.description}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

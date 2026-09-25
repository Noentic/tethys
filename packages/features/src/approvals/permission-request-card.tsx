import { DiffStat, FileDiffCard } from "@tethys/diff";
import type {
  PermissionRequestEntry,
  PermissionRequestItem,
  SessionEntry,
  ToolCallEntry,
} from "@tethys/state";
import { cn, StatusDot } from "@tethys/ui";
import { useMemo, useState } from "react";
import { useInspectorClient } from "../client-context";
import { toolDiffs, toolPath } from "../inspector/tool-view";
import { useSessionState } from "../inspector/use-session-state";
import { ChoiceList } from "./choice-list";

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

/** The diffs a file permission would allow, when its waiting call has them. */
function usePendingDiffs(request: PermissionRequestItem) {
  const context = useInspectorClient();
  const session = useSessionState(context?.threadId ?? "");
  return useMemo(() => {
    const call = pendingEditFor(request, session.entries);
    return call ? toolDiffs(call) : [];
  }, [request, session.entries]);
}

/**
 * The permission card (PRM-01..04, DESIGN.md `permission-request-card`): the
 * pending treatment — hairline, warning wash, breathing dot
 * — around one line naming the request, what it would run or change, and the
 * Provider's own `options` as a numbered choice list in the Provider's order.
 * Never focus-trapped (DESIGN a11y).
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
  const session = useSessionState(context?.threadId ?? "");
  const { request } = entry;
  const resolution = request.resolution;
  const [pendingOption, setPendingOption] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const respond = async (optionId: string) => {
    if (!context) {
      return;
    }
    setPendingOption(optionId);
    setErrorMessage(null);
    try {
      await context.client.permission.respond(
        context.threadId,
        request.reqId,
        optionId,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
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

  if (session.status === "interrupted" || session.status === "error") {
    if (compact) {
      return (
        <div
          data-entry-kind="permission_request"
          data-resolved="true"
          className="flex items-center gap-sm text-label-sm text-(--tethys-text-muted)"
        >
          <StatusDot status="interrupted" inline />
          <span>Request expired (session {session.status})</span>
        </div>
      );
    }
    return (
      <section
        data-entry-kind="permission_request"
        data-resolved="true"
        aria-label={`Expired permission: ${request.title}`}
        className={cn(
          "rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md",
          className,
        )}
      >
        <header className="flex items-center gap-sm">
          <StatusDot status="interrupted" inline />
          <h3 className="text-label-md text-(--tethys-text-secondary)">
            {request.title}
          </h3>
        </header>
        <p className="mt-1 text-body-sm text-(--tethys-text-muted)">
          Request expired: session was {session.status}.
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

  return (
    <PendingPermission
      request={request}
      busy={pendingOption !== null}
      selectedOption={pendingOption}
      errorMessage={errorMessage}
      onChoose={(optionId) => void respond(optionId)}
      className={className}
    />
  );
}

function PendingPermission({
  request,
  busy,
  selectedOption,
  errorMessage,
  onChoose,
  className,
}: {
  request: PermissionRequestItem;
  busy: boolean;
  selectedOption?: string | null;
  errorMessage?: string | null;
  onChoose: (optionId: string) => void;
  className?: string;
}) {
  const diffs = usePendingDiffs(request);
  const command = request.subject?.Command?.command ?? null;
  const stat = diffs.reduce(
    (sum, diff) => ({
      additions: sum.additions + diff.additions,
      deletions: sum.deletions + diff.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

  return (
    <section
      data-entry-kind="permission_request"
      data-pending="true"
      aria-label={`Permission requested: ${request.title}`}
      className={cn(
        "wash-warning flex flex-col gap-sm rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md",
        className,
      )}
    >
      <header className="flex min-w-0 items-center gap-sm">
        <StatusDot status="awaiting_approval" inline />
        <h3 className="min-w-0 flex-1 truncate text-label-md text-(--tethys-text-primary)">
          {request.title}
        </h3>
        {diffs.length > 0 && (
          <span
            role="img"
            aria-label={`${stat.additions} lines added, ${stat.deletions} lines removed`}
          >
            <DiffStat additions={stat.additions} deletions={stat.deletions} />
          </span>
        )}
      </header>
      {request.description && (
        <p className="text-body-sm text-(--tethys-text-secondary)">
          {request.description}
        </p>
      )}
      {command && (
        <code className="flex max-h-32 items-start gap-sm overflow-auto rounded-sm border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) px-sm py-1.5 font-mono text-mono-code whitespace-pre-wrap break-all text-(--tethys-text-on-sunken)">
          <span
            aria-hidden="true"
            className="select-none text-(--tethys-text-on-sunken-muted)"
          >
            $
          </span>
          {command}
        </code>
      )}
      {diffs.map((detail) => (
        <FileDiffCard key={detail.path} detail={detail} previewRows={6} />
      ))}
      {defaultsToNo(request.metadata) && (
        <p className="text-label-sm text-(--tethys-text-muted)">
          Claude recommends denying this request by default.
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="rounded-xs border border-(--tethys-status-danger) bg-(--tethys-surface-nested) px-sm py-1 text-label-sm text-(--tethys-status-danger)"
        >
          {errorMessage}
        </p>
      )}
      <ChoiceList
        label={request.title}
        disabled={busy}
        selected={selectedOption ? [selectedOption] : []}
        choices={request.options.map((option) => ({
          id: option.option_id,
          label: option.name,
          description: option.description,
          refuses: rejects(option.kind),
        }))}
        onChoose={onChoose}
        className="-mx-sm"
      />
    </section>
  );
}

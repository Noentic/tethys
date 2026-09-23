import { Pencil, ShieldCheck, Terminal } from "@nebutra/icons";
import type {
  PermissionRequestEntry,
  PermissionRequestItem,
} from "@tethys/state";
import { Button, cn, StatusDot } from "@tethys/ui";
import type React from "react";
import { useState } from "react";
import { useInspectorClient } from "../client-context";

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
          {detail && (
            <code
              title={detail}
              className="self-start truncate rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 font-mono text-mono-micro text-(--tethys-text-secondary)"
              style={{ maxWidth: "100%" }}
            >
              {detail}
            </code>
          )}
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
      <div className="flex flex-wrap gap-sm">
        {request.options.map((option, index) => (
          <Button
            key={option.option_id}
            size="sm"
            variant={optionVariant(option.kind)}
            aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
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
        ))}
      </div>
    </section>
  );
}

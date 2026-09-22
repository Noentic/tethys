import type { PermissionRequestEntry } from "@tethys/state";
import { Button, cn, StatusDot } from "@tethys/ui";
import { useState } from "react";
import { useInspectorClient } from "../client-context";

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

/**
 * The inline permission card (PRM-01..04). Renders the Provider's own
 * `options` array in the Provider's order — never a hardcoded approve/reject
 * pair — and is never focus-trapped (DESIGN a11y).
 */
export function PermissionRequestCard({
  entry,
  className,
}: {
  entry: PermissionRequestEntry;
  className?: string;
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

  return (
    <section
      data-entry-kind="permission_request"
      data-pending="true"
      aria-label={`Permission requested: ${request.title}`}
      className={cn(
        "rounded-md border border-(--tethys-hairline) border-l-2 border-l-(--tethys-status-warning) bg-(--tethys-status-warning-soft) p-md",
        className,
      )}
    >
      <header className="flex items-center gap-sm">
        <StatusDot status="awaiting_approval" inline />
        <h3 className="text-label-md text-(--tethys-text-primary)">
          {request.title}
        </h3>
      </header>
      {request.description && (
        <p className="mt-1 text-body-sm text-(--tethys-text-secondary)">
          {request.description}
        </p>
      )}
      {defaultsToNo(request.metadata) && (
        <p className="mt-1 text-label-sm text-(--tethys-text-muted)">
          Claude recommends denying this request by default.
        </p>
      )}
      <div className="mt-sm flex flex-wrap gap-sm">
        {request.options.map((option) => (
          <Button
            key={option.option_id}
            size="sm"
            variant={rejects(option.kind) ? "destructive" : "secondary"}
            disabled={pendingOption !== null}
            onClick={() => respond(option.option_id)}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </section>
  );
}

import type { ElicitationValue } from "@tethys/bindings";
import type { ElicitationEntry } from "@tethys/state";
import {
  Button,
  cn,
  Input,
  SchemaFieldGroup,
  Select,
  StatusDot,
} from "@tethys/ui";
import { useMemo, useState } from "react";
import { useInspectorClient } from "../client-context";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Only http/https URLs are rendered as links (SEC-08). */
function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : null;
  } catch {
    return null;
  }
}

/**
 * The inline elicitation card (UI-04 U9): a schema-driven form rendered through
 * `SchemaFieldGroup`. Never focus-trapped; the three outcomes are `accept`
 * (Submit), `decline` (Skip) and `cancel` (Dismiss).
 */
export function ElicitationCard({
  entry,
  className,
  compact = false,
}: {
  entry: ElicitationEntry;
  className?: string;
  compact?: boolean;
}) {
  const context = useInspectorClient();
  const { request } = entry;
  const [values, setValues] = useState<Record<string, ElicitationValue>>(() => {
    const initial: Record<string, ElicitationValue> = {};
    for (const field of request.fields) {
      if (field.kind.kind === "boolean" && field.kind.default !== null) {
        initial[field.key] = { type: "boolean", value: field.kind.default };
      }
    }
    return initial;
  });
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const fields = request.fields;
  const paged = fields.length > 1;
  const visible = paged ? [fields[page]] : fields;
  const isLastPage = !paged || page === fields.length - 1;

  const setValue = (key: string, value: ElicitationValue) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async (outcome: "accepted" | "declined" | "cancelled") => {
    if (!context) {
      return;
    }
    setBusy(true);
    try {
      await context.client.permission.elicitationRespond(context.threadId, {
        req_id: request.req_id,
        outcome,
        values: outcome === "accepted" ? values : {},
      });
    } finally {
      setBusy(false);
    }
  };

  const selectEnumByIndex = (fieldKey: string, index: number) => {
    const field = fields.find((candidate) => candidate.key === fieldKey);
    if (field?.kind.kind !== "enum") {
      return;
    }
    const option = field.kind.options[index];
    if (option) {
      setValue(fieldKey, { type: "text", value: option.value });
    }
  };

  const host = useMemo(
    () => (request.url ? hostOf(request.url) : null),
    [request.url],
  );
  const externalUrl = useMemo(
    () => safeExternalUrl(request.url),
    [request.url],
  );

  if (entry.resolution) {
    if (compact) {
      return (
        <div
          data-entry-kind="elicitation"
          data-resolved="true"
          className="flex items-center gap-sm text-label-sm text-(--tethys-text-muted)"
        >
          <StatusDot status="idle" inline />
          <span>Answered · {request.title}</span>
        </div>
      );
    }
    return (
      <section
        data-entry-kind="elicitation"
        data-resolved="true"
        aria-label={`Resolved elicitation: ${request.title}`}
        className={cn(
          "rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md",
          className,
        )}
      >
        <header className="flex items-center gap-sm">
          <StatusDot status="idle" inline />
          <h3 className="text-label-md text-(--tethys-text-secondary)">
            {request.title}
          </h3>
        </header>
        <p className="mt-1 text-body-sm text-(--tethys-text-muted)">
          {entry.resolution.outcome}
        </p>
      </section>
    );
  }

  if (compact) {
    return (
      <div
        data-entry-kind="elicitation"
        data-pending="true"
        className="flex items-center gap-sm text-label-sm text-(--tethys-status-warning)"
      >
        <StatusDot status="awaiting_approval" inline />
        <span>Waiting for you ↓</span>
      </div>
    );
  }

  return (
    <section
      data-entry-kind="elicitation"
      data-pending="true"
      aria-label={`Elicitation: ${request.title}`}
      className={cn(
        "rounded-md border border-(--tethys-hairline) border-l-2 border-l-(--tethys-status-warning) bg-(--tethys-status-warning-soft) p-md",
        className,
      )}
      onKeyDown={(event) => {
        const index = Number.parseInt(event.key, 10);
        if (Number.isNaN(index) || index < 1 || index > 9) {
          return;
        }
        const current = visible[0];
        if (current) {
          selectEnumByIndex(current.key, index - 1);
        }
      }}
    >
      <header className="flex items-center gap-sm">
        <StatusDot status="awaiting_approval" inline />
        <h3 className="text-label-md text-(--tethys-text-primary)">
          {request.title}
        </h3>
        {paged && (
          <span className="ml-auto font-mono text-mono-micro text-(--tethys-text-muted)">
            {page + 1} of {fields.length}
          </span>
        )}
      </header>
      {request.description && (
        <p className="mt-1 text-body-sm text-(--tethys-text-secondary)">
          {request.description}
        </p>
      )}

      {host && (
        <div className="mt-sm flex items-center gap-sm">
          <span className="font-mono text-mono-code text-(--tethys-text-secondary)">
            {host}
          </span>
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-label-sm text-(--tethys-primary) underline"
            >
              Open in browser
            </a>
          )}
        </div>
      )}

      {visible.map((field) => (
        <SchemaFieldGroup key={field.key} label={field.label}>
          {field.kind.kind === "text" && (
            <Input
              aria-label={field.label}
              type={
                field.kind.format === "email"
                  ? "email"
                  : field.kind.format === "uri"
                    ? "url"
                    : field.kind.format === "date"
                      ? "date"
                      : "text"
              }
              defaultValue={field.kind.default ?? ""}
              onChange={(event) =>
                setValue(field.key, {
                  type: "text",
                  value: event.target.value,
                })
              }
            />
          )}
          {field.kind.kind === "number" && (
            <Input
              aria-label={field.label}
              type="number"
              defaultValue={field.kind.default ?? ""}
              onChange={(event) =>
                setValue(field.key, {
                  type: "number",
                  value:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          )}
          {field.kind.kind === "boolean" && (
            <input
              aria-label={field.label}
              type="checkbox"
              checked={
                (values[field.key] as { value?: boolean } | undefined)?.value ??
                false
              }
              onChange={(event) =>
                setValue(field.key, {
                  type: "boolean",
                  value: event.target.checked,
                })
              }
            />
          )}
          {field.kind.kind === "enum" && (
            <Select
              aria-label={field.label}
              defaultValue={field.kind.default ?? ""}
              onChange={(event) =>
                setValue(field.key, {
                  type: "text",
                  value: event.target.value,
                })
              }
            >
              {field.kind.options.map((option, index) => (
                <option key={option.value} value={option.value}>
                  {index + 1}. {option.label}
                </option>
              ))}
            </Select>
          )}
        </SchemaFieldGroup>
      ))}

      <div className="mt-sm flex items-center gap-sm">
        {paged && page > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            Back
          </Button>
        )}
        {paged && !isLastPage && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        )}
        {isLastPage && (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => submit("accepted")}
          >
            Submit
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => submit("declined")}
        >
          Skip
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => submit("cancelled")}
        >
          Dismiss
        </Button>
      </div>
    </section>
  );
}

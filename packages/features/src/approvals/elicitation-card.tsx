import { ChevronLeft, ChevronRight } from "@nebutra/icons";
import type {
  ElicitationField,
  ElicitationRequest,
  ElicitationValue,
} from "@tethys/bindings";
import type { ElicitationEntry } from "@tethys/state";
import { Button, cn, Input, SchemaFieldGroup, StatusDot } from "@tethys/ui";
import { useMemo, useState } from "react";
import { useInspectorClient } from "../client-context";
import { useSessionState } from "../inspector/use-session-state";
import { ChoiceList } from "./choice-list";

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

/** One page of the card: a field, with the free-text "Other" that answers it. */
export interface QuestionStep {
  field: ElicitationField;
  other: ElicitationField | null;
}

/**
 * The request's fields as pages. A field the Provider marked as another
 * field's "Other" (`custom_for`) joins that field's page instead of taking
 * one of its own.
 */
export function questionSteps(fields: ElicitationField[]): QuestionStep[] {
  const keys = new Set(fields.map((field) => field.key));
  const paired = (field: ElicitationField) =>
    Boolean(field.custom_for && keys.has(field.custom_for));
  return fields
    .filter((field) => !paired(field))
    .map((field) => ({
      field,
      other:
        fields.find(
          (candidate) =>
            paired(candidate) && candidate.custom_for === field.key,
        ) ?? null,
    }));
}

/** What a step asks: its own text when the form has several, else the request's. */
function stepPrompt(
  request: ElicitationRequest,
  step: QuestionStep,
  count: number,
): string {
  return (count > 1 ? step.field.description : null) ?? request.title;
}

function answerText(
  field: ElicitationField,
  value: ElicitationValue | undefined,
): string | null {
  if (!value) return null;
  const labelOf = (raw: string) =>
    field.kind.kind === "enum" || field.kind.kind === "multi-enum"
      ? (field.kind.options.find((option) => option.value === raw)?.label ??
        raw)
      : raw;
  switch (value.type) {
    case "text":
      return value.value ? labelOf(value.value) : null;
    case "text-list":
      return value.value.length > 0
        ? value.value.map(labelOf).join(", ")
        : null;
    case "number":
      return value.value === null ? null : String(value.value);
    case "boolean":
      return value.value ? "Yes" : "No";
  }
}

/** The answers, one per step, as the transcript records them: `Postgres; Auth, Billing`. */
export function answerSummary(
  fields: ElicitationField[],
  values: Record<string, ElicitationValue>,
): string {
  return questionSteps(fields)
    .map((step) =>
      [
        answerText(step.field, values[step.field.key]),
        step.other ? answerText(step.other, values[step.other.key]) : null,
      ]
        .filter(Boolean)
        .join(" — "),
    )
    .filter(Boolean)
    .join("; ");
}

/**
 * A question from the agent (UI-04 U9, DESIGN.md `elicitation-card`): one
 * page per question with a `‹ 1 of N ›` pager, the options as a numbered
 * choice list, and the Provider's "Other" as a text row inside the choice it
 * answers. Picking a single choice answers that page; `Skip` sends a decline
 * (P7). Answered, it folds to one line: what was asked and what was chosen.
 * Never focus-trapped.
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
  const session = useSessionState(context?.threadId ?? "");
  const { request } = entry;
  const steps = useMemo(() => questionSteps(request.fields), [request.fields]);
  const [values, setValues] = useState<Record<string, ElicitationValue>>(() => {
    const initial: Record<string, ElicitationValue> = {};
    for (const field of request.fields) {
      if (field.kind.kind === "boolean" && field.kind.default !== null) {
        initial[field.key] = { type: "boolean", value: field.kind.default };
      }
      if (field.kind.kind === "multi-enum" && field.kind.default) {
        initial[field.key] = { type: "text-list", value: field.kind.default };
      }
    }
    return initial;
  });
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const step = steps[Math.min(page, Math.max(0, steps.length - 1))];
  const isLastPage = page >= steps.length - 1;

  const submit = async (
    outcome: "accepted" | "declined" | "cancelled",
    answers: Record<string, ElicitationValue> = values,
  ) => {
    if (!context) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await context.client.permission.elicitationRespond(context.threadId, {
        req_id: request.req_id,
        outcome,
        values: outcome === "accepted" ? answers : {},
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const advance = (answers: Record<string, ElicitationValue> = values) => {
    if (isLastPage) void submit("accepted", answers);
    else setPage(page + 1);
  };

  const setValue = (key: string, value: ElicitationValue) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const host = useMemo(
    () => (request.url ? hostOf(request.url) : null),
    [request.url],
  );
  const externalUrl = useMemo(
    () => safeExternalUrl(request.url),
    [request.url],
  );

  if (entry.resolution) {
    const answered = entry.resolution.outcome === "accepted";
    const summary = answered
      ? answerSummary(request.fields, entry.resolution.values)
      : "";
    if (compact) {
      return (
        <div
          data-entry-kind="elicitation"
          data-resolved="true"
          className="flex min-w-0 items-center gap-sm text-label-sm text-(--tethys-text-muted)"
        >
          <StatusDot status="idle" inline />
          <span className="min-w-0 truncate">
            {answered ? "Asked" : "Skipped"} · {request.title}
            {summary && (
              <span className="text-(--tethys-text-secondary)">
                {" "}
                → {summary}
              </span>
            )}
          </span>
        </div>
      );
    }
    return (
      <section
        data-entry-kind="elicitation"
        data-resolved="true"
        aria-label={`Resolved question: ${request.title}`}
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
          {summary || entry.resolution.outcome}
        </p>
      </section>
    );
  }

  if (session.status === "interrupted" || session.status === "error") {
    if (compact) {
      return (
        <div
          data-entry-kind="elicitation"
          data-resolved="true"
          className="flex min-w-0 items-center gap-sm text-label-sm text-(--tethys-text-muted)"
        >
          <StatusDot status="interrupted" inline />
          <span className="min-w-0 truncate">
            Question expired · {request.title}
          </span>
        </div>
      );
    }
    return (
      <section
        data-entry-kind="elicitation"
        data-resolved="true"
        aria-label={`Expired question: ${request.title}`}
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
          Question expired: session was {session.status}.
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

  const prompt = step ? stepPrompt(request, step, steps.length) : request.title;
  const field = step?.field;
  const current = field ? values[field.key] : undefined;
  const other = step?.other ?? null;
  const otherValue = other ? values[other.key] : undefined;

  return (
    <section
      data-entry-kind="elicitation"
      data-pending="true"
      aria-label={`Question: ${prompt}`}
      className={cn(
        "wash-warning flex flex-col gap-sm rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md",
        className,
      )}
    >
      {errorMessage && (
        <p
          role="alert"
          className="rounded-xs border border-(--tethys-status-danger) bg-(--tethys-surface-nested) px-sm py-1 text-label-sm text-(--tethys-status-danger)"
        >
          {errorMessage}
        </p>
      )}
      <header className="flex min-w-0 items-center gap-sm">
        <StatusDot status="awaiting_approval" inline />
        <span className="text-label-sm text-(--tethys-text-muted)">
          Question
        </span>
        {field && steps.length > 1 && field.label !== prompt && (
          <span className="truncate rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 text-label-sm text-(--tethys-text-secondary)">
            {field.label}
          </span>
        )}
        {steps.length > 1 && (
          <nav
            aria-label="Questions"
            className="ml-auto flex items-center gap-xs text-(--tethys-text-secondary)"
          >
            <button
              type="button"
              aria-label="Previous question"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="focus-ring flex size-6 items-center justify-center rounded-sm hover:bg-(--tethys-surface-hover) disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="size-3.5" />
            </button>
            <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
              {page + 1} of {steps.length}
            </span>
            <button
              type="button"
              aria-label="Next question"
              disabled={isLastPage}
              onClick={() => setPage(page + 1)}
              className="focus-ring flex size-6 items-center justify-center rounded-sm hover:bg-(--tethys-surface-hover) disabled:opacity-40"
            >
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </button>
          </nav>
        )}
      </header>
      <h3 className="text-label-md text-(--tethys-text-primary)">{prompt}</h3>
      {steps.length <= 1 && request.description && (
        <p className="text-body-sm text-(--tethys-text-secondary)">
          {request.description}
        </p>
      )}

      {host && (
        <div className="flex items-center gap-sm">
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

      {field &&
        (field.kind.kind === "enum" || field.kind.kind === "multi-enum") && (
          <ChoiceList
            label={prompt}
            multiple={field.kind.kind === "multi-enum"}
            disabled={busy}
            selected={
              current?.type === "text"
                ? [current.value]
                : current?.type === "text-list"
                  ? current.value
                  : []
            }
            choices={field.kind.options.map((option) => ({
              id: option.value,
              label: option.label,
              description: option.description,
            }))}
            onChoose={(value) => {
              if (field.kind.kind === "multi-enum") {
                const picked =
                  current?.type === "text-list" ? current.value : [];
                setValue(field.key, {
                  type: "text-list",
                  value: picked.includes(value)
                    ? picked.filter((item) => item !== value)
                    : [...picked, value],
                });
                return;
              }
              const answers: Record<string, ElicitationValue> = {
                ...values,
                [field.key]: { type: "text", value },
              };
              setValues(answers);
              advance(answers);
            }}
            footer={
              other && (
                <Input
                  aria-label={other.label}
                  placeholder={
                    field.kind.kind === "multi-enum"
                      ? "Other — add your own answer"
                      : "Other — type your own answer or a note"
                  }
                  value={otherValue?.type === "text" ? otherValue.value : ""}
                  onChange={(event) =>
                    setValue(other.key, {
                      type: "text",
                      value: event.target.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      advance();
                    }
                  }}
                  className="mx-sm"
                />
              )
            }
            className="-mx-sm"
          />
        )}

      {field && field.kind.kind === "text" && (
        <SchemaFieldGroup label={field.label}>
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
              setValue(field.key, { type: "text", value: event.target.value })
            }
          />
        </SchemaFieldGroup>
      )}
      {field && field.kind.kind === "number" && (
        <SchemaFieldGroup label={field.label}>
          <Input
            aria-label={field.label}
            type="number"
            defaultValue={field.kind.default ?? ""}
            onChange={(event) =>
              setValue(field.key, {
                type: "number",
                value:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </SchemaFieldGroup>
      )}
      {field && field.kind.kind === "boolean" && (
        <SchemaFieldGroup label={field.label}>
          <input
            aria-label={field.label}
            type="checkbox"
            checked={current?.type === "boolean" ? current.value : false}
            onChange={(event) =>
              setValue(field.key, {
                type: "boolean",
                value: event.target.checked,
              })
            }
          />
        </SchemaFieldGroup>
      )}

      <div className="flex items-center gap-sm">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void submit("declined")}
        >
          Skip
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => advance()}
          className="ml-auto"
        >
          {isLastPage ? "Submit" : "Next"}
        </Button>
      </div>
    </section>
  );
}

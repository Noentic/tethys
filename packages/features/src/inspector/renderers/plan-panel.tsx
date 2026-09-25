import { Check } from "@nebutra/icons";
import type { PlanEntry, PlanStep, SessionEntry } from "@tethys/state";
import { ActivityOrb, cn, TruncatedText } from "@tethys/ui";
import { useId, useState } from "react";
import { useSessionState } from "../use-session-state";
import { DisclosureChevron } from "./disclosure-chevron";

const STATUS_LABEL: Record<PlanStep["status"], string> = {
  Pending: "Pending",
  InProgress: "In progress",
  Completed: "Complete",
};

function StepMarker({ status }: { status: PlanStep["status"] }) {
  if (status === "Completed") {
    return (
      <Check
        aria-hidden="true"
        className="size-3.5 text-(--tethys-status-success)"
      />
    );
  }
  if (status === "InProgress") {
    return <ActivityOrb size={14} className="text-(--tethys-agent-active)" />;
  }
  return (
    <span
      aria-hidden="true"
      className="size-3 rounded-full border-[1.5px] border-(--tethys-border-control)"
    />
  );
}

/**
 * The agent's plan as task rows (DESIGN.md `task-row`): a done step folds to a
 * muted check and its title, the step in progress keeps full weight beside the
 * activity orb, and each row names its status in words for assistive tech.
 */
export function TaskList({
  id,
  steps,
  className,
}: {
  id?: string;
  steps: PlanStep[];
  className?: string;
}) {
  return (
    <ol id={id} className={cn("flex flex-col gap-0.5", className)}>
      {steps.map((step) => (
        <li
          key={step.content}
          aria-current={step.status === "InProgress" ? "step" : undefined}
          className={cn(
            "flex min-h-6 items-start gap-sm text-body-sm",
            step.status === "Completed" && "text-(--tethys-text-muted)",
            step.status === "InProgress" &&
              "font-medium text-(--tethys-text-primary)",
            step.status === "Pending" && "text-(--tethys-text-secondary)",
          )}
        >
          <span className="flex size-5 shrink-0 items-center justify-center">
            <StepMarker status={step.status} />
          </span>
          <span className="sr-only">{STATUS_LABEL[step.status]}:</span>
          <span
            className={cn(
              "min-w-0 pt-px",
              step.status === "Completed" && "line-through",
            )}
          >
            {step.content}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** `3/5` as a thin bar under the plan's heading. */
function PlanProgress({ done, total }: { done: number; total: number }) {
  return (
    <span
      aria-hidden="true"
      className="h-1 w-16 overflow-hidden rounded-full bg-(--tethys-surface-active)"
    >
      <span
        className="block h-full rounded-full bg-(--tethys-text-muted) transition-[width] duration-200"
        style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
      />
    </span>
  );
}

/**
 * The agent's todo list where it arose in the transcript, updated in place as
 * the agent works (DESIGN.md `plan-panel`). A finished list folds to its count;
 * the pin above the composer carries the live one.
 */
export function PlanCardRenderer({
  entry,
  className,
}: {
  entry: PlanEntry;
  className?: string;
}) {
  const done = entry.steps.filter((step) => step.status === "Completed").length;
  const finished = done === entry.steps.length;
  const [expanded, setExpanded] = useState(!finished);
  const regionId = useId();
  if (entry.steps.length === 0) return null;
  return (
    <section
      data-entry-kind="plan"
      aria-label="Todos"
      className={cn(
        "flex flex-col rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested)",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
        className="focus-ring-inset flex min-h-8 items-center gap-sm rounded-md px-md text-left text-label-sm text-(--tethys-text-muted) hover:bg-(--tethys-surface-hover)"
      >
        <DisclosureChevron expanded={expanded} />
        <span>
          Todos · {done}/{entry.steps.length}
          {finished ? " done" : ""}
        </span>
        <PlanProgress done={done} total={entry.steps.length} />
      </button>
      {expanded && (
        <TaskList id={regionId} steps={entry.steps} className="px-md pb-sm" />
      )}
    </section>
  );
}

/** The session's todo list: the latest plan the agent wrote, if any. */
export function latestPlan(entries: SessionEntry[]): PlanEntry | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind === "plan") return entry as PlanEntry;
  }
  return null;
}

/**
 * The live todo list pinned above the composer: `3/7` and the step in
 * progress on one line, the whole list on click. Gone once every step is done,
 * so it never outlives the work it tracks.
 */
export function TodoPin({ entries }: { entries: SessionEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const plan = latestPlan(entries);
  if (!plan || plan.steps.length === 0) return null;
  const done = plan.steps.filter((step) => step.status === "Completed").length;
  if (done === plan.steps.length) return null;
  const current =
    plan.steps.find((step) => step.status === "InProgress") ??
    plan.steps.find((step) => step.status === "Pending");
  return (
    <section
      data-testid="todo-pin"
      aria-label="Todos"
      className="rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested)"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
        className="focus-ring-inset flex min-h-8 w-full min-w-0 items-center gap-sm rounded-md px-md text-left hover:bg-(--tethys-surface-hover)"
      >
        {current && (
          <span className="flex size-4 shrink-0 items-center justify-center">
            <StepMarker status={current.status} />
          </span>
        )}
        <span className="shrink-0 font-mono text-mono-micro text-(--tethys-text-muted)">
          {done}/{plan.steps.length}
        </span>
        {current && (
          <TruncatedText
            text={current.content}
            className="text-body-sm text-(--tethys-text-primary)"
          />
        )}
        <DisclosureChevron
          expanded={expanded}
          className="ml-auto text-(--tethys-text-muted)"
        />
      </button>
      {expanded && (
        <TaskList
          id={regionId}
          steps={plan.steps}
          className="max-h-60 overflow-y-auto px-md pb-sm"
        />
      )}
    </section>
  );
}

/**
 * The live plan panel. Mounted through `registerInspectorSlot`, which hands it
 * only a `sessionId`: it reads the plan from that session's store. Explicit
 * `data` (the steps) overrides the store, for callers that already hold them.
 */
export function PlanPanel({
  sessionId,
  data,
  className,
}: {
  sessionId?: string;
  data?: unknown;
  className?: string;
}) {
  const state = useSessionState(sessionId ?? "");
  const livePlan = state.liveEntries.find(
    (entry): entry is PlanEntry => entry.kind === "plan",
  );
  const goal = state.goal;
  const fileChangeReport = state.fileChangeReport;
  const steps: PlanStep[] = Array.isArray(data)
    ? (data as PlanStep[])
    : (livePlan?.steps ?? []);
  if (steps.length === 0 && !goal && !fileChangeReport) {
    return null;
  }
  const complete = steps.filter((step) => step.status === "Completed").length;

  return (
    <section
      data-inspector-slot="plan"
      aria-label="Plan"
      className={cn(
        "w-full rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-3 py-2",
        className,
      )}
    >
      {goal && (
        <div data-testid="session-goal" className="mb-md">
          <header className="mb-xs text-label-sm text-(--tethys-text-muted)">
            Goal · {goal.status}
            {goal.iterations === null ? "" : ` · ${goal.iterations} iterations`}
          </header>
          <p className="text-body-sm text-(--tethys-text-primary)">
            {goal.objective}
          </p>
          {goal.last_reason && (
            <p className="mt-xs text-body-sm text-(--tethys-text-muted)">
              {goal.last_reason}
            </p>
          )}
        </div>
      )}
      {fileChangeReport && (
        <div data-testid="file-change-report" className="mb-md">
          <header className="mb-xs text-label-sm text-(--tethys-text-muted)">
            Files reported · {fileChangeReport.paths.length}
          </header>
          <ul className="flex flex-col gap-1 text-body-sm text-(--tethys-text-secondary)">
            {fileChangeReport.paths.map((path) => (
              <li key={path} className="break-all font-mono text-mono-micro">
                {path}
              </li>
            ))}
          </ul>
          {(!fileChangeReport.declared_complete ||
            fileChangeReport.truncated) && (
            <p className="mt-xs text-body-sm text-(--tethys-text-muted)">
              This report may be incomplete.
              {fileChangeReport.uncertainty
                ? ` ${fileChangeReport.uncertainty}`
                : ""}
            </p>
          )}
        </div>
      )}
      {steps.length > 0 && (
        <>
          <header className="mb-sm flex items-center gap-sm text-label-sm text-(--tethys-text-muted)">
            <span>
              Plan · {complete}/{steps.length} complete
            </span>
            <PlanProgress done={complete} total={steps.length} />
          </header>
          <TaskList steps={steps} />
        </>
      )}
    </section>
  );
}

import type { PlanEntry, PlanStep } from "@tethys/state";
import { cn } from "@tethys/ui";
import { useSessionState } from "../use-session-state";

const STATUS_LABEL: Record<PlanStep["status"], string> = {
  Pending: "Pending",
  InProgress: "In progress",
  Completed: "Complete",
};

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
          <header className="mb-sm text-label-sm text-(--tethys-text-muted)">
            Plan · {complete}/{steps.length} complete
          </header>
          <ul className="flex flex-col gap-1">
            {steps.map((step) => (
              <li
                key={step.content}
                aria-current={step.status === "InProgress" ? "step" : undefined}
                className={cn(
                  "flex items-start gap-sm text-body-sm",
                  step.status === "Completed" &&
                    "text-(--tethys-text-muted) line-through",
                  step.status === "InProgress" &&
                    "font-medium text-(--tethys-text-primary)",
                  step.status === "Pending" && "text-(--tethys-text-secondary)",
                )}
              >
                <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
                  {STATUS_LABEL[step.status]}
                </span>
                <span>{step.content}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

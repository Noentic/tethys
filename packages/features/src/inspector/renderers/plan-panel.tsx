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
  const steps: PlanStep[] = Array.isArray(data)
    ? (data as PlanStep[])
    : (livePlan?.steps ?? []);
  if (steps.length === 0) {
    return (
      <p
        className={cn(
          "px-md py-sm text-body-sm text-(--tethys-text-muted)",
          className,
        )}
      >
        No plan yet
      </p>
    );
  }
  const complete = steps.filter((step) => step.status === "Completed").length;

  return (
    <section
      data-inspector-slot="plan"
      aria-label="Plan"
      className={cn("px-md py-sm", className)}
    >
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
    </section>
  );
}

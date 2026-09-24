import type {
  ProviderControl,
  ProviderExtensionCapabilities,
  SessionGoal,
} from "@tethys/bindings";
import { Button, Input } from "@tethys/ui";
import { useEffect, useState } from "react";
import { ProviderRoutes, type SendControl } from "./provider-routes";

export function ProviderControls({
  sessionId,
  goal,
  capabilities,
  send,
}: {
  sessionId: string;
  goal: SessionGoal | null;
  capabilities: ProviderExtensionCapabilities | null | undefined;
  send: SendControl;
}) {
  const goalActions = capabilities?.goal_actions ?? [];
  const goalObjective = goal?.objective;
  const [objective, setObjective] = useState(goal?.objective ?? "");
  const [steeringPrompt, setSteeringPrompt] = useState("");
  const [controlError, setControlError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (goalObjective !== undefined) setObjective(goalObjective);
  }, [goalObjective]);

  const run = async (control: ProviderControl) => {
    setBusy(true);
    setControlError(null);
    try {
      await send(control);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const hasControls =
    goalActions.length > 0 ||
    capabilities?.steering === true ||
    capabilities?.provider_routing === true;
  if (!hasControls) return null;

  return (
    <details
      data-testid="provider-controls"
      className="rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-md py-sm"
    >
      <summary className="cursor-pointer text-label-sm text-(--tethys-text-secondary)">
        Session controls
      </summary>
      <div className="mt-sm flex flex-col gap-md">
        {goalActions.length > 0 && (
          <section
            aria-label="Session goal controls"
            className="flex flex-wrap items-center gap-sm"
          >
            {goalActions.includes("set") && (
              <>
                <Input
                  aria-label="Session goal"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  placeholder="Set a session goal"
                  className="min-w-48 flex-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || objective.trim().length === 0}
                  onClick={() =>
                    void run({
                      kind: "goal",
                      action: "set",
                      objective: objective.trim(),
                    })
                  }
                >
                  Set goal
                </Button>
              </>
            )}
            {goal &&
              goalActions
                .filter((action) => action !== "set")
                .map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        kind: "goal",
                        action: action as "pause" | "resume" | "clear",
                        objective: null,
                      })
                    }
                  >
                    {action[0]?.toUpperCase()}
                    {action.slice(1)} goal
                  </Button>
                ))}
          </section>
        )}
        {capabilities?.steering && (
          <form
            aria-label="Session steering"
            className="flex flex-wrap items-center gap-sm"
            onSubmit={(event) => {
              event.preventDefault();
              const prompt = steeringPrompt.trim();
              if (!prompt || busy) return;
              void run({ kind: "steer", prompt: [{ Text: prompt }] });
              setSteeringPrompt("");
            }}
          >
            <Input
              aria-label="Steer the current session"
              value={steeringPrompt}
              onChange={(event) => setSteeringPrompt(event.target.value)}
              placeholder="Add direction to this session"
              className="min-w-48 flex-1"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={busy || steeringPrompt.trim().length === 0}
            >
              Steer
            </Button>
          </form>
        )}
        {capabilities?.provider_routing === true && (
          <ProviderRoutes
            key={sessionId}
            capabilities={capabilities}
            send={send}
            busy={busy}
            setBusy={setBusy}
          />
        )}
        {controlError && (
          <p
            role="alert"
            className="text-body-sm text-(--tethys-status-danger)"
          >
            {controlError}
          </p>
        )}
      </div>
    </details>
  );
}

import type { RestoreTarget } from "@tethys/bindings";
import { DiffStat } from "@tethys/diff";
import { Button, cn, TruncatedText, useInspectorControl } from "@tethys/ui";
import { useMemo, useState } from "react";
import { useReviewClient } from "../review/client-context";
import { useDiffRevision, useDiffSummary } from "../review/use-review-diff";

export function TurnReceipt({
  sessionId,
  turn,
  canRestore,
  canReview,
}: {
  sessionId: string;
  turn: number;
  canRestore: boolean;
  canReview: boolean;
}) {
  const client = useReviewClient();
  const { openChanges } = useInspectorControl();
  const [showAll, setShowAll] = useState(false);
  const [undo, setUndo] = useState<RestoreTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const source = useMemo(
    () => ({ TurnStartEnd: { thread_id: sessionId, turn } }),
    [sessionId, turn],
  );
  const revision = useDiffRevision(sessionId);
  const { summary } = useDiffSummary(canReview ? source : null, revision);

  if (!canReview || !summary || summary.files.length === 0) return null;

  const restore = async () => {
    setBusy(true);
    setError(false);
    try {
      if (undo) {
        await client.git.checkpointRestore(undo, "Force");
        setUndo(null);
      } else {
        const outcome = await client.git.checkpointRestore(
          { Checkpoint: { thread_id: sessionId, turn, phase: "Start" } },
          "Force",
        );
        setUndo({
          Trees: {
            thread_id: sessionId,
            worktree_tree: outcome.undo.worktree_tree,
            index_tree: outcome.undo.index_tree,
          },
        });
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const files = showAll ? summary.files : summary.files.slice(0, 3);
  const remaining = summary.files.length - files.length;

  return (
    <section
      data-testid="turn-receipt"
      aria-label={`Turn ${turn} changes`}
      className="flex w-full flex-col gap-sm rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md"
    >
      <p className="flex flex-wrap items-center gap-x-sm text-label-md text-(--tethys-text-primary)">
        {undo ? (
          "Reverted ·"
        ) : (
          <>
            <span>
              Changed {summary.files.length} file
              {summary.files.length === 1 ? "" : "s"}
            </span>
            <DiffStat
              additions={summary.additions}
              deletions={summary.deletions}
            />
          </>
        )}
      </p>
      <ul className="flex flex-col">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              title={`Open ${file.path} in Changes`}
              onClick={() => openChanges?.(turn)}
              className={cn(
                "focus-ring -mx-1.5 flex w-[calc(100%+12px)] min-w-0 items-center justify-between gap-sm rounded-sm px-1.5 py-0.5 text-left font-mono text-mono-code hover:bg-(--tethys-surface-hover)",
                undo
                  ? "line-through text-(--tethys-text-muted)"
                  : "text-(--tethys-text-secondary)",
              )}
            >
              <TruncatedText mode="path" text={file.path} />
              <DiffStat additions={file.additions} deletions={file.deletions} />
            </button>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
          Show {remaining} more
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-sm">
        <Button size="sm" variant="ghost" onClick={() => openChanges?.(turn)}>
          View changes
        </Button>
        {canRestore && (
          <Button
            size="sm"
            variant="ghost"
            className={undo ? undefined : "text-(--tethys-status-danger)"}
            loading={busy}
            disabled={busy}
            onClick={() => void restore()}
          >
            {undo ? "Undo" : "Revert turn"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-label-sm text-(--tethys-status-danger)">
          The turn could not be restored.
        </p>
      )}
    </section>
  );
}

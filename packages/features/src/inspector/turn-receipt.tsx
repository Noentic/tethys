import type { RestoreTarget } from "@tethys/bindings";
import { Button, useInspectorControl } from "@tethys/ui";
import { useMemo, useState } from "react";
import { useReviewClient } from "../review/client-context";
import { useDiffSummary } from "../review/use-review-diff";

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
  const { summary } = useDiffSummary(canReview ? source : null);

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
      <p className="text-label-md text-(--tethys-text-primary)">
        {undo ? (
          "Reverted ·"
        ) : (
          <>
            Changed {summary.files.length} file
            {summary.files.length === 1 ? "" : "s"}{" "}
            <span className="text-diff-added">+{summary.additions}</span>{" "}
            <span className="text-diff-removed">−{summary.deletions}</span>
          </>
        )}
      </p>
      <ul className="flex flex-col gap-1">
        {files.map((file) => (
          <li
            key={file.path}
            className={`flex justify-between gap-sm font-mono text-mono-code ${undo ? "line-through text-(--tethys-text-muted)" : "text-(--tethys-text-secondary)"}`}
          >
            <span className="truncate">{file.path}</span>
            <span className="shrink-0 text-mono-micro">
              <span className="text-diff-added">+{file.additions}</span>{" "}
              <span className="text-diff-removed">−{file.deletions}</span>
            </span>
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
            variant={undo ? "ghost" : "destructive"}
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

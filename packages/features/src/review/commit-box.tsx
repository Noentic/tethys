import { Button, Textarea } from "@tethys/ui";
import { useCallback, useEffect, useState } from "react";

export interface CommitBoxProps {
  /** Expands the draft command and returns the suggested message. */
  onDraft: () => Promise<string>;
  onCommit: (message: string) => Promise<void>;
  fileCount?: number;
  draftOnMount?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Commit message editor used only by the branch bar's commit popover.
 */
export function CommitBox({
  onDraft,
  onCommit,
  fileCount,
  draftOnMount = false,
  disabled = false,
  className,
}: CommitBoxProps) {
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState(false);

  const draft = useCallback(async () => {
    setDrafting(true);
    try {
      setMessage(await onDraft());
    } catch {
      setMessage("");
    } finally {
      setDrafting(false);
    }
  }, [onDraft]);

  useEffect(() => {
    if (draftOnMount) void draft();
  }, [draftOnMount, draft]);

  const commit = async () => {
    setCommitting(true);
    setCommitError(false);
    try {
      await onCommit(message);
    } catch {
      // Keep the message in the editor so the user can retry.
      setCommitError(true);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div
      data-testid="commit-box"
      className={`flex flex-col gap-2 ${className ?? ""}`}
    >
      {fileCount !== undefined && (
        <p className="text-label-sm text-(--tethys-text-muted)">
          {fileCount} changed file{fileCount === 1 ? "" : "s"}
        </p>
      )}
      {commitError && (
        <p role="alert" className="text-label-sm text-(--tethys-status-danger)">
          Commit failed. Your message is still here; try again.
        </p>
      )}
      <Textarea
        aria-label="Commit message"
        placeholder="Describe this change…"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          loading={drafting}
          disabled={disabled}
          onClick={() => void draft()}
        >
          Draft with agent
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={committing}
          disabled={disabled || message.trim() === ""}
          onClick={() => void commit()}
        >
          Commit
        </Button>
      </div>
    </div>
  );
}

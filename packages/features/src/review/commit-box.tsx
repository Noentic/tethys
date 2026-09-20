import { Button, Textarea } from "@tethys/ui";
import { useState } from "react";

export interface CommitBoxProps {
  /** Expands the draft command and returns the suggested message. */
  onDraft: () => Promise<string>;
  onCommit: (message: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

/**
 * The commit box (M1.9 U7). `Draft with agent` expands a Tethys command over
 * the diff summary (no new endpoint); the user edits the result and
 * `Approve & Commit` writes it through `git.commit`.
 */
export function CommitBox({
  onDraft,
  onCommit,
  disabled = false,
  className,
}: CommitBoxProps) {
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [committing, setCommitting] = useState(false);

  const draft = async () => {
    setDrafting(true);
    try {
      setMessage(await onDraft());
    } finally {
      setDrafting(false);
    }
  };

  const commit = async () => {
    setCommitting(true);
    try {
      await onCommit(message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div
      data-testid="commit-box"
      className={`flex flex-col gap-2 ${className ?? ""}`}
    >
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
          Approve &amp; Commit
        </Button>
      </div>
    </div>
  );
}
